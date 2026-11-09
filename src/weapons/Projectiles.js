import * as THREE from 'three';
import { resolveShot, falloff } from './Ballistics.js';
import { B, BLOCKS, isSolid } from '../blocks/BlockTypes.js';

/** Arrows and rockets: they fly with gravity, hit blocks and living things along their path (swept test, so they never tunnel). */
export class Projectiles {
  constructor(game) {
    this.g = game; this.list = []; this.stuck = []; this.flashes = [];
    this.arrowGeo = new THREE.BoxGeometry(0.035, 0.035, 0.75);
    this.arrowMat = new THREE.MeshLambertMaterial({ color: 0xcaa060 });
    this.rocketGeo = new THREE.BoxGeometry(0.16, 0.16, 0.6);
    this.rocketMat = new THREE.MeshLambertMaterial({ color: 0x555d4a });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffa030, fog: false });
  }

  dispose() { for (const q of [...this.list, ...this.stuck]) this.g.scene.remove(q.m); for (const f of this.flashes) this.g.scene.remove(f.m); this.list = []; this.stuck = []; this.flashes = []; }

  arrow(o, d, speed, damage, w) {
    const m = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    this.g.scene.add(m);
    this.list.push({ kind: 'arrow', m, p: { ...o }, v: { x: d.x * speed, y: d.y * speed, z: d.z * speed }, g: 9.81 * 0.6, damage, w, life: 6, start: { ...o } });
  }

  rocket(o, d, w) {
    const m = new THREE.Mesh(this.rocketGeo, this.rocketMat);
    const flame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.25), this.glowMat); flame.position.z = 0.4; m.add(flame);
    this.g.scene.add(m);
    this.list.push({ kind: 'rocket', m, p: { ...o }, v: { x: d.x * w.speed, y: d.y * w.speed, z: d.z * w.speed }, g: 1.2, w, life: 7, start: { ...o }, smoke: 0 });
  }

  update(dt) {
    const g = this.g, targets = g.getTargets(), player = g.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const q = this.list[i];
      q.life -= dt;
      const sp = Math.hypot(q.v.x, q.v.y, q.v.z), len = sp * dt;
      const d = { x: q.v.x / sp, y: q.v.y / sp, z: q.v.z / sp };
      const res = resolveShot(g.world, q.p, d, len, targets, player);
      let done = false;
      if (res.kind === 'entity') {
        if (q.kind === 'arrow') {
          const dmg = q.damage * (res.headshot ? q.w.headMult : 1);
          const dead = res.target.takeDamage(dmg, player, res.headshot);
          g.hud.hitmarker(!!dead); g.audio.play(dead ? 'kill' : 'hit');
          g.effects.blockDebris(res.point.x - 0.5, res.point.y - 0.5, res.point.z - 0.5, 7, 2, 2.2);
        } else this.explode(res.point, q.w);
        g.net?.sendShot(q.start, res.point, g.weapons.cur);
        done = true;
      } else if (res.kind === 'block') {
        if (q.kind === 'arrow') {
          g.blocks.hit(res.block.x, res.block.y, res.block.z, q.w.blockDamage);
          g.effects.impact(res.point.x, res.point.y, res.point.z, res.block.id);
          q.p = { ...res.point }; this.orient(q, d);
          this.stuck.push({ m: q.m, life: 8 }); this.list.splice(i, 1);
          g.net?.sendShot(q.start, res.point, g.weapons.cur);
          continue;
        }
        this.explode(res.point, q.w); g.net?.sendShot(q.start, res.point, g.weapons.cur); done = true;
      }
      if (done || q.life <= 0 || !Number.isFinite(sp)) {
        if (!done && q.kind === 'rocket') this.explode(q.p, q.w);
        g.scene.remove(q.m); this.list.splice(i, 1); continue;
      }
      q.p.x += q.v.x * dt; q.p.y += q.v.y * dt; q.p.z += q.v.z * dt;
      q.v.y -= q.g * dt;
      this.orient(q, d);
      if (q.kind === 'rocket') {
        q.smoke -= dt;
        if (q.smoke <= 0) { q.smoke = 0.04; g.effects.blockDebris(q.p.x - 0.5, q.p.y - 0.5, q.p.z - 0.5, B.CLOUD, 1, 0.6); }
      }
    }
    for (let i = this.stuck.length - 1; i >= 0; i--) { this.stuck[i].life -= dt; if (this.stuck[i].life <= 0) { g.scene.remove(this.stuck[i].m); this.stuck.splice(i, 1); } }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]; f.t += dt / 0.4;
      f.m.scale.setScalar(0.5 + f.t * f.r * 1.1); f.m.material.opacity = Math.max(0, 0.9 - f.t);
      if (f.t >= 1) { g.scene.remove(f.m); f.m.material.dispose(); this.flashes.splice(i, 1); }
    }
  }

  orient(q, d) { q.m.position.set(q.p.x, q.p.y, q.p.z); q.m.lookAt(q.p.x + d.x, q.p.y + d.y, q.p.z + d.z); }

  /** Blast: damage everything within radius (you take a third), shove the player, delete weak blocks in a sphere. */
  explode(p, w) {
    const g = this.g, R = w.radius, player = g.player;
    g.audio.play('boom');
    const targets = g.getTargets().concat([player]);
    let hit = false, killed = false;
    for (const t of targets) {
      if (!t.alive) continue;
      const h = t.height ?? 1.8, c = { x: t.pos.x, y: t.pos.y + h / 2, z: t.pos.z };
      const dist = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z);
      if (dist > R + 0.6) continue;
      const f = Math.max(0, 1 - dist / R);
      if (f <= 0) continue;
      if (t === player) {
        player.takeDamage(w.damage * f * 0.35, { name: 'ROCKET', id: 'self' });
        const k = 16 * f / Math.max(0.5, dist);
        player.body.vx += (c.x - p.x) * k; player.body.vy += Math.max(3, (c.y - p.y) * k + 4 * f); player.body.vz += (c.z - p.z) * k;
      } else { const dead = t.takeDamage(w.damage * f, player, false); hit = true; killed = killed || !!dead; }
    }
    if (hit) { g.hud.hitmarker(killed); g.audio.play(killed ? 'kill' : 'hit'); }
    // blocks
    const r = 3.3, cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z), out = [];
    for (let x = cx - 4; x <= cx + 4; x++) for (let y = cy - 4; y <= cy + 4; y++) for (let z = cz - 4; z <= cz + 4; z++) {
      const dd = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y, z + 0.5 - p.z);
      if (dd > r) continue;
      const id = g.world.getBlock(x, y, z);
      if (!isSolid(id)) continue;
      const hp = BLOCKS[id].hp;
      if (hp === Infinity || hp > w.blockDamage * (1 - dd / r * 0.55)) continue;
      out.push([x, y, z, B.AIR]);
    }
    if (out.length) {
      g.blocks.placeMany(out);
      for (let i = 0; i < out.length; i += 3) { const b = out[i]; g.effects.blockDebris(b[0], b[1], b[2], g.world.getBlock(b[0], b[1] - 1, b[2]) || B.STONE, 1, 5); }
      const step = Math.max(1, Math.floor(out.length / 8));
      for (let i = 0; i < out.length; i += step) g.blocks.detachFloating(out[i][0], out[i][1], out[i][2]);   // unsupported chunks of building fall
    }
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
    m.position.set(p.x, p.y, p.z); g.scene.add(m);
    this.flashes.push({ m, t: 0, r: R });
    g.effects.muzzle(new THREE.Vector3(p.x, p.y, p.z));
  }
}
