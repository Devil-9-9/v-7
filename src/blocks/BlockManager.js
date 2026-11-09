import * as THREE from 'three';
import { CHUNK } from '../core/Constants.js';
import { B, BLOCKS } from './BlockTypes.js';
import { meshChunk } from './ChunkMesher.js';
import { FallingBlocks } from '../core/Physics.js';

const ck = (cx, cy, cz) => cx + ',' + cy + ',' + cz;
const parse = (k) => k.split(',').map(Number);
const NEIGH = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * Owns the rendered 16^3 chunk meshes and streams them around the player in all three axes, so you can
 * walk, dig or build upward forever. Also the single place where blocks get hit / broken / placed.
 */
export class BlockManager {
  constructor({ scene, world, atlasTexture, physics, effects, renderDist = 5, vertDist = 2 }) {
    this.scene = scene; this.world = world; this.effects = effects;
    this.R = renderDist; this.RV = vertDist;
    this.meshes = new Map(); // key -> { opaque, glass }
    this.onEdit = null;      // (x,y,z,id) => network broadcast
    this.onSound = null;     // (name) => void
    this.onEdits = null;     // (list of [x,y,z,id]) => network broadcast of a whole build set
    this.onAnyEdit = null;   // (x,y,z,id,old) every change, local or remote (portals listen here)
    this.opaqueMat = new THREE.MeshLambertMaterial({ map: atlasTexture, vertexColors: true, alphaTest: 0.5 });
    this.glassMat = new THREE.MeshLambertMaterial({ map: atlasTexture, vertexColors: true, transparent: true, depthWrite: false });
    this.falling = new FallingBlocks(scene, world, physics, (x, y, z, id) => this.onEdit?.(x, y, z, id));
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  /** Generate + mesh the area around a start point before the first frame. */
  initialLoad(px, py, pz, radius = 2) {
    const pcx = Math.floor(px / CHUNK), pcy = Math.floor(py / CHUNK), pcz = Math.floor(pz / CHUNK);
    for (let dx = -radius - 1; dx <= radius + 1; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -radius - 1; dz <= radius + 1; dz++) this.world.ensureChunk(pcx + dx, pcy + dy, pcz + dz);
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -radius; dz <= radius; dz++) this.buildMesh(pcx + dx, pcy + dy, pcz + dz);
    this.world.dirty.clear();
  }

  update(px, py, pz, dt) {
    const { R, RV, world } = this;
    const pcx = Math.floor(px / CHUNK), pcy = Math.floor(py / CHUNK), pcz = Math.floor(pz / CHUNK);

    // 0) chunks touching the player must always exist: collision relies on them, even when falling fast
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) world.ensureChunk(pcx + dx, pcy + dy, pcz + dz);

    // 1) re-mesh dirty chunks first (edits must feel instant)
    let budget = 4;
    for (const k of world.dirty) {
      world.dirty.delete(k);
      const [cx, cy, cz] = parse(k);
      if (world.hasChunk(cx, cy, cz) && Math.abs(cx - pcx) <= R && Math.abs(cy - pcy) <= RV && Math.abs(cz - pcz) <= R) {
        this.buildMesh(cx, cy, cz);
        if (--budget <= 0) break;
      }
    }

    // 2) stream new chunks nearest-first under a small time budget (empty chunks are nearly free)
    const t0 = performance.now();
    const want = [];
    for (let dx = -R; dx <= R; dx++) for (let dy = -RV; dy <= RV; dy++) for (let dz = -R; dz <= R; dz++) {
      const cx = pcx + dx, cy = pcy + dy, cz = pcz + dz;
      if (!this.meshes.has(ck(cx, cy, cz))) want.push([dx * dx + dy * dy * 4 + dz * dz, cx, cy, cz]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cy, cz] of want) {
      this.buildMesh(cx, cy, cz);
      if (performance.now() - t0 > 7) break;
    }

    // 3) drop far meshes + data (player edits are remembered per chunk and re-applied if regenerated)
    for (const k of [...this.meshes.keys()]) {
      const [cx, cy, cz] = parse(k);
      if (Math.abs(cx - pcx) > R + 1 || Math.abs(cy - pcy) > RV + 1 || Math.abs(cz - pcz) > R + 1) this.disposeMesh(k);
    }
    if (world.chunks.size > 1400) {
      for (const k of [...world.chunks.keys()]) {
        const [cx, cy, cz] = parse(k);
        if (Math.abs(cx - pcx) > R + 3 || Math.abs(cy - pcy) > RV + 3 || Math.abs(cz - pcz) > R + 3) world.unloadChunk(k);
      }
    }

    this.falling.update(dt);
  }

  buildMesh(cx, cy, cz) {
    const k = ck(cx, cy, cz);
    this.disposeMesh(k);
    this.world.ensureChunk(cx, cy, cz);
    for (const [a, b, c] of NEIGH) this.world.ensureChunk(cx + a, cy + b, cz + c); // so border faces cull correctly
    const { opaque, glass } = meshChunk(this.world, cx, cy, cz);
    const entry = {};
    if (opaque) {
      entry.opaque = new THREE.Mesh(opaque, this.opaqueMat);
      entry.opaque.castShadow = entry.opaque.receiveShadow = true;
      this.group.add(entry.opaque);
    }
    if (glass) {
      entry.glass = new THREE.Mesh(glass, this.glassMat);
      entry.glass.renderOrder = 2;
      this.group.add(entry.glass);
    }
    this.meshes.set(k, entry);
  }

  disposeMesh(k) {
    const e = this.meshes.get(k);
    if (!e) return;
    for (const m of [e.opaque, e.glass]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    this.meshes.delete(k);
  }

  /* ---------- editing ---------- */
  /** Damage a block (punch = 1, bullet = weapon blockDamage). Returns 'broken' | 'damaged' | null. */
  hit(x, y, z, damage, { remote = false } = {}) {
    const id = this.world.getBlock(x, y, z);
    const res = this.world.damageBlock(x, y, z, damage);
    if (res === 'broken') {
      this.effects.blockDebris(x, y, z, id, 12, 3.2);
      if (!remote) this.onEdit?.(x, y, z, B.AIR);
      this.onAnyEdit?.(x, y, z, B.AIR, id);
      this.detachFloating(x, y, z);
      this.onSound?.('break');
    } else if (res === 'damaged') {
      this.effects.blockDebris(x, y, z, id, 3, 2);
    }
    return res;
  }

  detachFloating(x, y, z) {
    const groups = this.world.findFloating(x, y, z);
    for (const g of groups) {
      for (const b of g) this.world.setBlock(b.x, b.y, b.z, B.AIR);
      this.falling.spawn(g);
    }
    if (groups.length) this.onSound?.('collapse');
  }

  /** Place into air or water (you can build bridges and pillars in the sea). */
  place(x, y, z, id, { remote = false } = {}) {
    const cur = this.world.getBlock(x, y, z);
    if (cur !== B.AIR && cur !== B.WATER && cur !== B.LAVA) return false;
    const ok = this.world.setBlock(x, y, z, id);
    if (ok) { if (!remote) this.onEdit?.(x, y, z, id); this.onAnyEdit?.(x, y, z, id, cur); this.onSound?.('place'); }
    return ok;
  }

  /** Stamp many blocks at once (build sets, portal fills, hubs). Skips blocks that are already right. Bedrock is never replaced. */
  placeMany(list, { sync = true } = {}) {
    const done = [];
    for (const [x, y, z, id] of list) {
      const cur = this.world.getBlock(x, y, z);
      if (cur === id || cur === B.BEDROCK) continue;
      if (this.world.setBlock(x, y, z, id)) done.push([x, y, z, id, cur]);
    }
    if (!done.length) return 0;
    if (sync) this.onEdits?.(done.map((d) => d.slice(0, 4)));
    for (const [x, y, z, id, old] of done) this.onAnyEdit?.(x, y, z, id, old);
    this.onSound?.('place');
    return done.length;
  }

  /** Edit coming from a peer. */
  applyRemote(x, y, z, id, { quiet = false } = {}) {
    if (id !== B.AIR && !BLOCKS[id]) return;           // never trust a peer with an unknown block id
    if (id === B.AIR) {
      const old = this.world.getBlock(x, y, z);
      if (old === B.AIR) return;
      if (!quiet) this.effects.blockDebris(x, y, z, old, 8, 3);
      this.world.setBlock(x, y, z, B.AIR);
      this.onAnyEdit?.(x, y, z, B.AIR, old);
      if (!quiet) this.detachFloating(x, y, z);
    } else {
      const old = this.world.getBlock(x, y, z);
      this.world.setBlock(x, y, z, id);
      this.onAnyEdit?.(x, y, z, id, old);
    }
  }
}
