import * as THREE from 'three';
import { VoxelBody } from '../player/VoxelBody.js';
import { B } from '../blocks/BlockTypes.js';

export const VEHICLE_TYPES = {
  jeep:   { name: 'Jeep',   help: 'W/S gas and reverse, A/D steer, SPACE handbrake. USE (V) to get out.' },
  boat:   { name: 'Boat',   help: 'Stays on water. W/S speed, A/D steer. USE (V) to get out.' },
  glider: { name: 'Glider', help: 'Look to steer, W speeds up, S slows down. Works anywhere, any height. USE (V) to get out.' },
};
const MAX = 4;                       // spawned vehicles kept at once (oldest disappears)

const box = (g, sx, sy, sz, x, y, z, color, extra = {}) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshLambertMaterial({ color, ...extra }));
  m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
};

function buildMesh(type) {
  const g = new THREE.Group();
  if (type === 'jeep') {
    box(g, 1.7, 0.5, 3.2, 0, 0.75, 0, 0x3f6b3a);                 // body
    box(g, 1.5, 0.5, 1.3, 0, 1.25, 0.35, 0x3f6b3a);              // cabin
    box(g, 1.4, 0.42, 0.06, 0, 1.28, -0.31, 0x9fd8f0, { transparent: true, opacity: 0.6 });   // windscreen
    box(g, 1.6, 0.08, 1.2, 0, 1.52, 0.45, 0x2a3a28);             // roof
    for (const [x, z] of [[-0.95, -1.0], [0.95, -1.0], [-0.95, 1.0], [0.95, 1.0]]) box(g, 0.3, 0.7, 0.7, x, 0.4, z, 0x1a1a1a);
    box(g, 0.3, 0.2, 0.08, -0.5, 0.85, -1.62, 0xfff2b0, { emissive: 0xffe080 }); box(g, 0.3, 0.2, 0.08, 0.5, 0.85, -1.62, 0xfff2b0, { emissive: 0xffe080 });
    box(g, 0.4, 0.2, 0.08, 0, 0.9, 1.62, 0xb02020);
  } else if (type === 'boat') {
    box(g, 1.5, 0.5, 3.2, 0, 0.1, 0.1, 0x8a5a30);                // hull
    box(g, 1.0, 0.5, 0.9, 0, 0.1, -1.8, 0x8a5a30).rotation.y = Math.PI / 4;   // bow
    box(g, 1.3, 0.12, 2.8, 0, 0.38, 0.1, 0xb98a54);              // deck
    box(g, 0.9, 0.5, 0.1, 0, 0.7, -0.5, 0x9fd8f0, { transparent: true, opacity: 0.6 });
    box(g, 0.5, 0.3, 0.3, 0, 0.35, 1.7, 0x222222);               // motor
  } else {
    box(g, 0.5, 0.45, 3.0, 0, 0.5, 0, 0xd8d8d0);                 // fuselage
    box(g, 7.0, 0.07, 1.3, 0, 0.78, -0.2, 0xe0452c);             // wing
    box(g, 2.4, 0.06, 0.8, 0, 0.55, 1.3, 0xe0452c);              // tail plane
    box(g, 0.06, 0.8, 0.8, 0, 0.9, 1.35, 0xd8d8d0);              // fin
    box(g, 0.4, 0.3, 0.7, 0, 0.74, -0.6, 0x9fd8f0, { transparent: true, opacity: 0.6 });   // canopy
    box(g, 0.1, 0.9, 0.06, 0, 0.5, -1.6, 0x333333);              // propeller
  }
  return g;
}

/** Jeep (drives over blocks, hops one-block steps), boat (stays on water), glider (flies anywhere). Local only: friends do not see them. */
export class VehicleManager {
  constructor(game) { this.g = game; this.list = []; this.hit = new Map(); }

  dispose() { for (const v of this.list) this.g.scene.remove(v.mesh); this.list = []; }

  get(player) { return player.vehicle || null; }

  /** Spawn in front of the player. Returns the vehicle or null (with a toast saying why). */
  spawn(type, player) {
    const g = this.g, w = g.world, b = player.body, f = player.forward();
    const fx = f.x, fz = f.z, fl = Math.hypot(fx, fz) || 1;
    const x = b.x + (fx / fl) * 5, z = b.z + (fz / fl) * 5;
    let y;
    if (type === 'boat') {
      let wy = null;
      for (let yy = Math.floor(b.y) + 4; yy > Math.floor(b.y) - 12; yy--) if (w.getBlock(x, yy, z) === B.WATER && w.getBlock(x, yy + 1, z) !== B.WATER) { wy = yy + 1; break; }
      if (wy === null) { g.hud.toast('Stand near the water and look at it: the boat needs water', 2200); return null; }
      y = wy;
    } else {
      const r = w.raycast(x, b.y + 4, z, 0, -1, 0, 14);
      y = r ? r.y + 1 : b.y;
      if (type === 'glider') y += 1.2;
    }
    if (this.list.length >= MAX) { const o = this.list.shift(); g.scene.remove(o.mesh); if (player.vehicle === o) this.exit(player); }
    const mesh = buildMesh(type);
    g.scene.add(mesh);
    const v = { type, mesh, x, y, z, heading: player.yaw, speed: 0, vy: 0, body: type === 'jeep' ? new VoxelBody(w, x, y, z, 0.8, 1.3) : null, driver: false, t: 0 };
    this.list.push(v);
    this.place(v);
    g.hud.toast(VEHICLE_TYPES[type].name.toUpperCase() + ' READY: press USE (V) near it', 2200);
    return v;
  }

  nearest(player, maxD = 7) {
    let best = null, bd = maxD;
    for (const v of this.list) {
      const d = Math.hypot(v.x - player.body.x, v.z - player.body.z);
      if (d < bd && Math.abs(v.y - player.body.y) < 4) { best = v; bd = d; }
    }
    return best;
  }

  enter(v, player) {
    if (player.vehicle || !player.alive) return;
    player.setFlying(false);
    player.vehicle = v; v.driver = true; player.camYaw = 0;
    v.heading = player.yaw; player.crouching = false; player.body.height = 1.8;
    this.g.hud.toast(VEHICLE_TYPES[v.type].help, 3500);
  }

  exit(player) {
    const v = player.vehicle; if (!v) return;
    player.vehicle = null; v.driver = false; v.speed = 0;
    const b = player.body, rx = Math.cos(v.heading), rz = -Math.sin(v.heading), bx = Math.sin(v.heading), bz = Math.cos(v.heading);
    for (const [side, back, up] of [[2.4, 0, 0], [-2.4, 0, 0], [0, 2.8, 0], [0, -2.8, 0], [0, 0, 2.5], [0, 0, 4]]) {
      const nx = v.x + rx * side + bx * back, nz = v.z + rz * side + bz * back, ny = v.y + up + 0.2;
      if (!b.hits(nx, ny, nz)) { Object.assign(b, { x: nx, y: ny, z: nz, vx: 0, vy: 0, vz: 0 }); break; }
    }
    if (v.type === 'glider' && !this.g.world.raycast(b.x, b.y, b.z, 0, -1, 0, 4)) player.setFlying(true);   // bail out in mid-air: you hover instead of falling
    player.yaw = v.heading; player.camYaw = 0;
  }

  place(v) { v.mesh.position.set(v.x, v.y, v.z); v.mesh.rotation.y = v.heading; }

  /** Surface level of the water column near y, or null when there is no water there. */
  waterTop(x, y, z) {
    const w = this.g.world;
    for (let yy = Math.floor(y) + 2; yy > Math.floor(y) - 4; yy--) if (w.getBlock(x, yy, z) === B.WATER && w.getBlock(x, yy + 1, z) !== B.WATER) return yy + 1 - 0.1;
    return null;
  }

  update(dt, input, player) {
    for (const v of this.list) if (!v.driver) this.idle(v, dt);
    const v = player.vehicle;
    if (input.consume('useVehicle')) {
      if (v) this.exit(player);
      else { const n = this.nearest(player); if (n) this.enter(n, player); else this.g.hud.toast('No vehicle nearby. Open BAG > VEHICLES to spawn one', 1800); }
    }
    const d = player.vehicle;
    if (!d) return;
    if (!player.alive) { this.exit(player); return; }
    // free-look offset springs back to behind the vehicle
    player.camYaw = (player.camYaw || 0);
    if (d.type === 'jeep') this.driveJeep(d, dt, input, player);
    else if (d.type === 'boat') this.driveBoat(d, dt, input, player);
    else this.fly(d, dt, input, player);
    this.place(d);
    const b = player.body;                                         // the player rides along (seat)
    b.x = d.x; b.y = d.y + (d.type === 'boat' ? 0.4 : 0.9); b.z = d.z; b.vx = b.vy = b.vz = 0; b.landedSpeed = 0;
    player.yaw = d.heading + player.camYaw;
  }

  /** Parked vehicles still obey gravity / buoyancy so they do not hang in the air after you jump out. */
  idle(v, dt) {
    if (v.type === 'jeep') { v.body.vx = v.body.vz = 0; v.body.step(dt); v.x = v.body.x; v.y = v.body.y; v.z = v.body.z; }
    else if (v.type === 'boat') { const wt = this.waterTop(v.x, v.y, v.z); if (wt !== null) v.y += (wt - v.y) * Math.min(1, dt * 4); }
    else if (!this.g.world.boxSolid(v.x - 1, v.y - 0.1, v.z - 1, v.x + 1, v.y, v.z + 1) && this.g.world.isLoaded(v.x, v.y - 1, v.z)) { v.vy = Math.max(-12, v.vy - 9.81 * dt); v.y += v.vy * dt; } else v.vy = 0;
    this.place(v);
  }

  look(d, dt, player, follow) {
    // mouse / touch look moves the camera around the vehicle; it eases back so you can always see where you drive
    player.camYaw *= Math.max(0, 1 - dt * (follow ? 2.5 : 0.8));
  }

  driveJeep(d, dt, input, player) {
    const b = d.body;
    const target = input.moveZ * (input.moveZ > 0 ? (input.sprint ? 24 : 17) : 6);
    d.speed += (target - d.speed) * Math.min(1, 1.7 * dt);
    if (input.jump) d.speed *= Math.max(0, 1 - 4 * dt);              // handbrake
    const steer = -input.moveX * 1.9 * Math.min(1, Math.abs(d.speed) / 4) * Math.sign(d.speed || 1);
    d.heading += steer * dt;
    const ax = -Math.sin(d.heading), az = -Math.cos(d.heading);
    const k = b.onGround ? 1 : 0.15;
    b.vx += (ax * d.speed - b.vx) * Math.min(1, 8 * dt * k); b.vz += (az * d.speed - b.vz) * Math.min(1, 8 * dt * k);
    const wasSpeed = d.speed;
    b.step(dt);
    if ((b.blockedX || b.blockedZ) && Math.abs(wasSpeed) > 1.5) {
      if (b.onGround && !b.hits(b.x + ax * 0.5, b.y + 1.1, b.z + az * 0.5)) b.vy = 5.4;      // hop a one-block step
      else d.speed *= 0.4;
    }
    d.x = b.x; d.y = b.y; d.z = b.z;
    this.look(d, dt, player, false);
    this.ram(d, dt, player);
  }

  /** Running things over hurts them. */
  ram(d, dt, player) {
    if (Math.abs(d.speed) < 7) return;
    for (const t of this.g.getTargets()) {
      if (!t.alive || t === player) continue;
      const p = t.pos; if (!p) continue;
      if (Math.abs(p.y - d.y) > 2 || Math.hypot(p.x - d.x, p.z - d.z) > 1.8) continue;
      const last = this.hit.get(t) || 0, now = performance.now();
      if (now - last < 700) continue;
      this.hit.set(t, now);
      const dead = t.takeDamage(Math.abs(d.speed) * 4, player, false);
      this.g.hud.hitmarker(!!dead); this.g.audio.play(dead ? 'kill' : 'hit');
    }
  }

  driveBoat(d, dt, input, player) {
    const target = input.moveZ * (input.moveZ > 0 ? (input.sprint ? 17 : 12) : 4);
    d.speed += (target - d.speed) * Math.min(1, 1.2 * dt);
    d.heading += -input.moveX * 1.4 * Math.min(1, Math.abs(d.speed) / 3) * Math.sign(d.speed || 1) * dt;
    const ax = -Math.sin(d.heading), az = -Math.cos(d.heading), w = this.g.world;
    const tryMove = (nx, nz) => {
      if (!w.isLoaded(nx, d.y, nz)) return false;
      const top = this.waterTop(nx, d.y, nz);
      if (top === null || Math.abs(top - d.y) > 1.4) return false;
      if (w.boxSolid(nx - 0.8, top + 0.2, nz - 0.8, nx + 0.8, top + 1.1, nz + 0.8)) return false;
      d.x = nx; d.z = nz; d.y += (top - d.y) * Math.min(1, dt * 6); return true;
    };
    const nx = d.x + ax * d.speed * dt, nz = d.z + az * d.speed * dt;
    if (!tryMove(nx, nz) && !tryMove(nx, d.z) && !tryMove(d.x, nz)) d.speed *= 0.5;
    d.bob = (d.bob || 0) + dt * 2.2;
    d.mesh.rotation.z = Math.sin(d.bob) * 0.03;
    this.look(d, dt, player, false);
  }

  fly(d, dt, input, player) {
    const g = this.g, w = g.world;
    const target = input.moveZ > 0 ? (input.sprint ? 55 : 42) : input.moveZ < 0 ? 7 : 22;
    d.speed += (target - d.speed) * Math.min(1, 1.3 * dt);
    // the glider turns toward where you look: steering is just looking around
    const turn = Math.min(1, dt * 2.5);
    d.heading += player.camYaw * turn; player.camYaw *= (1 - turn);
    const targetPitch = player.pitch;
    d.pitch = (d.pitch || 0) + (targetPitch - (d.pitch || 0)) * Math.min(1, dt * 3);
    const cp = Math.cos(d.pitch), fx = -Math.sin(d.heading) * cp, fy = Math.sin(d.pitch), fz = -Math.cos(d.heading) * cp;
    const nx = d.x + fx * d.speed * dt, ny = d.y + fy * d.speed * dt - (d.speed < 12 ? (12 - d.speed) * 0.3 * dt : 0), nz = d.z + fz * d.speed * dt;
    if (!w.isLoaded(nx, ny, nz)) return;
    if (w.boxSolid(nx - 1.2, ny - 0.1, nz - 1.2, nx + 1.2, ny + 0.9, nz + 1.2)) {
      if (d.speed > 16) { player.takeDamage((d.speed - 14) * 1.4, { name: 'CRASH', id: 'crash' }); g.audio.play('collapse'); }
      d.speed = Math.min(d.speed, 6);
    } else { d.x = nx; d.y = ny; d.z = nz; }
    d.mesh.rotation.z = -player.camYaw * 0.5;
    d.mesh.rotation.x = d.pitch * 0.6;
    d.mesh.rotation.order = 'YXZ';
  }

  /** Third-person camera position for the chase view, pulled in when a wall is behind. */
  cameraPos(player) {
    const v = player.vehicle, g = this.g;
    const t = { x: v.x, y: v.y + (v.type === 'glider' ? 1.2 : 1.8), z: v.z };
    const cp = Math.cos(player.pitch), f = { x: -Math.sin(player.yaw) * cp, y: Math.sin(player.pitch), z: -Math.cos(player.yaw) * cp };
    let dist = v.type === 'glider' ? 9 : 6.5;
    const hit = g.world.raycast(t.x, t.y, t.z, -f.x, -f.y, -f.z, dist);
    if (hit) dist = Math.max(1.2, hit.dist - 0.4);
    return { x: t.x - f.x * dist, y: t.y - f.y * dist + 0.8, z: t.z - f.z * dist };
  }
}
