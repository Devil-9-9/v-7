// Minecraft-style portals. Build an OBSIDIAN frame (opening 2-5 wide, 3-5 tall) and put a KEYSTONE block into the middle of the top row:
//   CRYSTAL -> sky portal (up to a floating hub in the sky realms)     GLOW lamp -> underworld portal (down into a deep hub)
//   PURPLE  -> home portal (back to where you came from)
// The opening fills with purple portal blocks by itself; break any frame block and it switches off. Walk in and wait a moment.
import { B } from './BlockTypes.js';
import { SKY_BASE } from '../core/Constants.js';
import { PREFABS, portalFrame, transform } from './Prefabs.js';

export const KEYSTONES = { [B.CRYSTAL]: 'sky', [B.GLOW]: 'under', [B.PURPLE]: 'home' };
const RELEVANT = new Set([B.OBSIDIAN, B.CRYSTAL, B.GLOW, B.PURPLE, B.PORTAL]);
const open = (id) => id === B.AIR || id === B.PORTAL;

function tryAxis(get, x, y, z, ax) {
  const dx = ax === 0 ? 1 : 0, dz = ax === 0 ? 0 : 1;
  if (!open(get(x, y, z))) return null;
  let y0 = y; while (open(get(x, y0 - 1, z)) && y - y0 < 8) y0--;
  if (get(x, y0 - 1, z) !== B.OBSIDIAN) return null;
  let l = 0, r = 0;
  while (l < 8 && open(get(x - dx * (l + 1), y0, z - dz * (l + 1)))) l++;
  while (r < 8 && open(get(x + dx * (r + 1), y0, z + dz * (r + 1)))) r++;
  const w = l + r + 1;
  if (w < 2 || w > 5) return null;
  const sx = x - dx * l, sz = z - dz * l;
  let h = 0; while (h < 8 && open(get(sx, y0 + h, sz))) h++;
  if (h < 3 || h > 5) return null;
  const cells = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
    const px = sx + dx * i, py = y0 + j, pz = sz + dz * i;
    if (!open(get(px, py, pz))) return null;
    cells.push([px, py, pz]);
  }
  for (let i = 0; i < w; i++) if (get(sx + dx * i, y0 - 1, sz + dz * i) !== B.OBSIDIAN) return null;
  for (let j = 0; j < h; j++) {
    if (get(sx - dx, y0 + j, sz - dz) !== B.OBSIDIAN) return null;
    if (get(sx + dx * w, y0 + j, sz + dz * w) !== B.OBSIDIAN) return null;
  }
  const mids = w % 2 ? [(w - 1) / 2] : [w / 2 - 1, w / 2];
  let kind = null;
  for (let i = 0; i < w; i++) {
    const id = get(sx + dx * i, y0 + h, sz + dz * i);
    if (id !== B.OBSIDIAN && !(mids.includes(i) && KEYSTONES[id])) return null;
    if (mids.includes(i) && KEYSTONES[id]) kind = KEYSTONES[id];
  }
  return { axis: ax, sx, sz, y0, w, h, dx, dz, cells, kind, key: ax + ':' + sx + ',' + y0 + ',' + sz + ',' + w + 'x' + h };
}

/** Frame containing / around the open cell (x,y,z), or null. Tries both orientations. */
export function findFrame(get, x, y, z) { return tryAxis(get, x, y, z, 0) || tryAxis(get, x, y, z, 1); }

/** Every complete frame within `radius` of a block (used after an edit). */
export function findFramesNear(get, x, y, z, radius = 6) {
  const out = new Map();
  for (let a = -radius; a <= radius; a++) for (let b = -radius; b <= radius; b++) {
    const f1 = tryAxis(get, x + a, y + b, z, 0); if (f1) out.set(f1.key, f1);
    const f2 = tryAxis(get, x, y + b, z + a, 1); if (f2) out.set(f2.key, f2);
  }
  return [...out.values()];
}

export class PortalManager {
  constructor(game) {
    this.g = game; this.queue = new Map(); this.cool = 0; this.armed = true; this.stay = 0;
    this.origins = {};     // { sky: {x,y,z,yaw}, under: {...} }: where you stood before going up / down
    this.msg = null;
  }

  get get() { const w = this.g.world; return (x, y, z) => w.getBlock(x, y, z); }

  /** Called for every block change (yours, a friend's, a prefab). */
  onEdit(x, y, z, id, old) {
    if (RELEVANT.has(id) || RELEVANT.has(old)) this.queue.set(x + ',' + y + ',' + z, [x, y, z]);
  }

  /** Re-check frames around queued edits: switch complete ones on, broken ones off. */
  process(limit = 6) {
    const get = this.get, blocks = this.g.blocks;
    let n = 0;
    for (const [k, [x, y, z]] of this.queue) {
      this.queue.delete(k);
      for (const f of findFramesNear(get, x, y, z)) {
        if (f.kind && f.cells.some(([a, b, c]) => get(a, b, c) === B.AIR)) {
          blocks.placeMany(f.cells.map(([a, b, c]) => [a, b, c, B.PORTAL]), { sync: false });
          this.g.hud.toast(f.kind === 'sky' ? 'SKY PORTAL ON' : f.kind === 'under' ? 'UNDERWORLD PORTAL ON' : 'HOME PORTAL ON', 1500);
        }
      }
      // switch off portal blocks whose frame is no longer valid
      const seen = new Set();
      for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) for (let c = -6; c <= 6; c++) {
        const px = x + a, py = y + b, pz = z + c;
        if (get(px, py, pz) !== B.PORTAL || seen.has(px + ',' + py + ',' + pz)) continue;
        const f = findFrame(get, px, py, pz);
        const group = f ? f.cells : this.flood(get, px, py, pz);
        for (const [gx, gy, gz] of group) seen.add(gx + ',' + gy + ',' + gz);
        if (!f || !f.kind) blocks.placeMany(group.map(([gx, gy, gz]) => [gx, gy, gz, B.AIR]), { sync: false });
      }
      if (++n >= limit) break;
    }
  }

  flood(get, x, y, z) {
    const out = [], seen = new Set([x + ',' + y + ',' + z]), q = [[x, y, z]];
    while (q.length && out.length < 80) {
      const p = q.pop(); out.push(p);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nx = p[0] + dx, ny = p[1] + dy, nz = p[2] + dz, k = nx + ',' + ny + ',' + nz;
        if (!seen.has(k) && get(nx, ny, nz) === B.PORTAL) { seen.add(k); q.push([nx, ny, nz]); }
      }
    }
    return out;
  }

  update(dt, player) {
    if (this.queue.size) this.process();
    this.cool -= dt;
    if (!player.alive) return;
    const b = player.body, get = this.get;
    const cx = Math.floor(b.x), cy = Math.floor(b.y + 0.9), cz = Math.floor(b.z);
    const inside = get(cx, cy, cz) === B.PORTAL || get(cx, Math.floor(b.y + 0.2), cz) === B.PORTAL;
    this.g.hud.setPortal?.(inside);
    if (!inside) { this.armed = true; this.stay = 0; return; }
    if (!this.armed || this.cool > 0) return;
    this.stay += dt;
    if (this.stay < 0.8) return;
    const py = get(cx, cy, cz) === B.PORTAL ? cy : Math.floor(b.y + 0.2);
    const f = findFrame(get, cx, py, cz);
    this.stay = 0;
    if (f && f.kind) this.travel(f, player);
  }

  /** Where to arrive, building the hub if it does not exist yet. */
  travel(f, player) {
    const g = this.g, w = g.world, b = player.body;
    g.vehicles?.exit(player);
    const cxw = f.sx + f.dx * (f.w - 1) / 2 + 0.5, czw = f.sz + f.dz * (f.w - 1) / 2 + 0.5;
    // which side of the frame did we come from? stand 2 blocks out on that side when coming back
    const sideSign = f.axis === 0 ? Math.sign(b.z - czw) || 1 : Math.sign(b.x - cxw) || 1;
    const out = { x: cxw + (f.axis === 1 ? sideSign * 2.2 : 0), y: f.y0, z: czw + (f.axis === 0 ? sideSign * 2.2 : 0), yaw: player.yaw + Math.PI };
    let dest, label;
    if (f.kind === 'sky' || f.kind === 'under') {
      this.origins[f.kind] = out;
      const hx = Math.round(cxw / 64) * 64, hz = Math.round(czw / 64) * 64;
      const hy = f.kind === 'sky' ? SKY_BASE + 40 : -48;
      dest = this.buildHub(f.kind, hx, hy, hz);
      label = f.kind === 'sky' ? 'SKY REALM' : 'UNDERWORLD';
    } else {
      const from = b.y >= SKY_BASE - 10 ? 'sky' : b.y < 0 ? 'under' : null;
      const o = from && this.origins[from];
      if (o) dest = o; else { const s = w.findLandSpawn(b.x, b.z, 300); dest = { x: s.x, y: s.y, z: s.z, yaw: player.yaw }; }
      label = 'BACK HOME';
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) w.ensureChunk((Math.floor(dest.x) >> 4) + dx, (Math.floor(dest.y) >> 4) + dy, (Math.floor(dest.z) >> 4) + dz);
    g.blocks.initialLoad(dest.x, dest.y, dest.z, 1);
    Object.assign(b, { x: dest.x, y: dest.y, z: dest.z, vx: 0, vy: 0, vz: 0 });
    player.yaw = dest.yaw ?? 0; player.pitch = 0;
    this.armed = false; this.cool = 2.5;
    g.hud.portalFlash?.();
    g.hud.toast(label, 1600);
    g.audio.play('collapse');
  }

  /** Floating platform (sky) or carved chamber (underworld) with a PURPLE-keystone portal that leads back. Built once, shared with friends. */
  buildHub(kind, hx, hy, hz) {
    const g = this.g, w = g.world;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) w.ensureChunk((hx >> 4) + dx, (hy >> 4) + dy, (hz >> 4) + dz);
    const dest = { x: hx + 0.5, y: hy, z: hz + 2.5, yaw: 0 };
    if (w.getBlock(hx, hy - 1, hz) === B.TILE) return dest;           // already built
    const list = [];
    const box = (x0, y0, z0, x1, y1, z1, id) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) list.push([hx + x, hy + y, hz + z, id]); };
    if (kind === 'sky') {
      box(-5, -3, -5, 5, -2, 5, B.CLOUD);                             // soft cloud underside
      box(-4, -1, -4, 4, -1, 4, B.TILE);
      box(-5, 0, -5, 5, 6, 5, B.AIR);
      for (const x of [-4, 4]) for (const z of [-4, 4]) { box(x, 0, z, x, 2, z, B.CONCRETE); list.push([hx + x, hy + 3, hz + z, B.GLOW]); }
    } else {
      box(-7, -2, -7, 7, 8, 7, B.DARK);                               // shell, so cave water / lava cannot flood the room
      box(-6, -1, -6, 6, -1, 6, B.TILE);
      box(-6, 0, -6, 6, 6, 6, B.AIR);
      for (const x of [-5, 5]) for (const z of [-5, 5]) { box(x, 0, z, x, 1, z, B.CONCRETE); list.push([hx + x, hy + 2, hz + z, B.GLOW]); }
      for (const x of [-2, 2]) for (const z of [-2, 2]) list.push([hx + x, hy + 6, hz + z, B.GLOW]);
    }
    list.push(...transform(portalFrame(B.PURPLE), hx, hy, hz - 2, { x: 0, z: -1 }));   // frame 3 blocks behind the arrival spot; opening faces +z
    g.blocks.placeMany(list, { sync: true });
    return dest;
  }
}

export { PREFABS };
