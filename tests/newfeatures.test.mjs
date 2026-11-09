import { register } from 'node:module'; register('./three-loader.mjs', import.meta.url);
import assert from 'node:assert/strict';
const { World } = await import('../src/blocks/World.js');
const { B } = await import('../src/blocks/BlockTypes.js');
const { Player } = await import('../src/player/Player.js');
const { InputState } = await import('../src/controls/InputState.js');
const { VehicleManager } = await import('../src/vehicles/Vehicles.js');
const { WeaponManager } = await import('../src/weapons/WeaponManager.js');
const { Projectiles } = await import('../src/weapons/Projectiles.js');

const DT = 0.016;
const world = new World(77);
const ensure = (x, y, z, r = 1) => { for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) world.ensureChunk((x >> 4) + a, (y >> 4) + b, (z >> 4) + c); };
/** flat stone arena [-half..half]^2, ground top at y = h (solid up to h), air above */
function arena(h, half = 40) {
  for (let x = -half - 16; x <= half + 16; x += 16) for (let z = -half - 16; z <= half + 16; z += 16) for (let y = h - 16; y <= h + 32; y += 16) ensure(x, y, z, 0);
  for (let x = -half; x <= half; x++) for (let z = -half; z <= half; z++) { for (let y = h - 3; y <= h; y++) world.setBlock(x, y, z, B.STONE); for (let y = h + 1; y <= h + 24; y++) world.setBlock(x, y, z, B.AIR); }
}
const mkPlayer = (x, h, z) => new Player(world, { x, y: h + 1, z });
const step = (p, input, secs, extra) => { for (let t = 0; t < secs; t += DT) { p.update(DT, input); extra?.(DT); } };
const tap = (p, input) => { input.jump = true; step(p, input, DT); input.jump = false; step(p, input, DT * 3); };

// ---------- FLY: sky realm and underworld, double-tap, hover, no fall damage ----------
for (const h of [300, -120]) {
  arena(h);
  const p = mkPlayer(0.5, h, 0.5), input = new InputState();
  step(p, input, 0.5);
  assert.ok(p.body.onGround && !p.flying, 'standing at y=' + h);
  tap(p, input); tap(p, input);
  assert.ok(p.flying, 'double tap JUMP starts flying (y=' + h + ')');
  const y0 = p.body.y;
  input.jump = true; step(p, input, 1.0); input.jump = false;
  assert.ok(p.body.y > y0 + 6, 'JUMP climbs while flying: ' + (p.body.y - y0));
  step(p, input, 0.8); const hy = p.body.y; step(p, input, 1.0);
  assert.ok(Math.abs(p.body.y - hy) < 0.3, 'hovers with no input');
  input.moveZ = 1; const z0 = p.body.z; step(p, input, 1.0); input.moveZ = 0;
  assert.ok(z0 - p.body.z > 6, 'flies forward');
  input.sprint = true; input.crouch = true; step(p, input, 4); input.sprint = false;     // dive fast: must not hurt
  assert.equal(p.hp, 100, 'no fall damage while flying');
  assert.ok(!p.flying, 'touching down ends flight');
  input.crouch = false;
  p.setFlying(true); input.jump = true; step(p, input, 1.5); input.jump = false; p.setFlying(false);
  step(p, input, 4);
  assert.ok(p.hp < 100, 'falling normally after flight ends hurts');
  // very high (fly infinitely): climb 2000 blocks while the world streams around us
  const q = mkPlayer(0.5, h, 0.5), qi = new InputState(); q.setFlying(true); qi.jump = true; qi.sprint = true;
  for (let t = 0; t < 12; t += DT) { ensure(Math.floor(q.body.x), Math.floor(q.body.y), Math.floor(q.body.z)); q.update(DT, qi); }
  assert.ok(q.body.y > h + 150, 'can keep climbing: ' + q.body.y);
}

// ---------- VEHICLES ----------
{
  const H = 400; arena(H);
  const scene = { add() {}, remove() {} };
  const toasts = [];
  const game = { world, scene, hud: { toast: (t) => toasts.push(t), hitmarker() {} }, audio: { play() {} }, getTargets: () => [] };
  const p = mkPlayer(0.5, H, 30.5), input = new InputState(); game.player = p;
  const vm = new VehicleManager(game);
  step(p, input, 0.3);
  // jeep: drive forward, hop a 1-block step, stop at a 2-block wall
  for (let x = -6; x <= 6; x++) { world.setBlock(x, H + 1, 10, B.STONE); for (let y = H + 1; y <= H + 2; y++) world.setBlock(x, y, -12, B.STONE); }
  const jeep = vm.spawn('jeep', p); assert.ok(jeep, 'jeep spawned');
  assert.ok(Math.abs(jeep.y - (H + 1)) < 0.6, 'jeep on the ground');
  p.body.x = jeep.x + 2; p.body.z = jeep.z; input.pressed.add('useVehicle'); vm.update(DT, input, p);
  assert.ok(p.vehicle === jeep, 'entered the jeep');
  input.moveZ = 1;
  for (let t = 0; t < 6; t += DT) { p.update(DT, input); vm.update(DT, input, p); }
  assert.ok(jeep.z < 8, 'jeep climbed over the 1-block step: z=' + jeep.z);
  assert.ok(jeep.z > -12, 'jeep stopped by the 2-block wall: z=' + jeep.z);
  assert.ok(Math.abs(p.body.x - jeep.x) < 0.01 && Math.abs(p.body.z - jeep.z) < 0.01, 'player rides along');
  input.moveZ = 0; input.pressed.add('useVehicle'); p.update(DT, input); vm.update(DT, input, p);
  assert.ok(!p.vehicle, 'exited the jeep');
  assert.ok(Math.hypot(p.body.x - jeep.x, p.body.z - jeep.z) > 1.5 && !p.body.hits(p.body.x, p.body.y, p.body.z), 'player stands beside it, not inside');

  // boat: needs water, stays inside the pool
  const q = mkPlayer(0.5, H, 24.5), qi = new InputState(); game.player = q; step(q, qi, 0.3);
  assert.equal(vm.spawn('boat', q), null, 'no water, no boat');
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) { world.setBlock(x, H, z, B.WATER); world.setBlock(x, H - 1, z, B.WATER); world.setBlock(x, H + 1, z, B.AIR); world.setBlock(x, H + 2, z, B.AIR); world.setBlock(x, H - 2, z, B.STONE); }
  q.body.z = 17.5; step(q, qi, 0.3);
  const boat = vm.spawn('boat', q); assert.ok(boat, 'boat spawned on water');
  q.body.x = boat.x + 1.5; q.body.z = boat.z; qi.pressed.add('useVehicle'); vm.update(DT, qi, q);
  assert.ok(q.vehicle === boat);
  qi.moveZ = 1;
  for (let t = 0; t < 8; t += DT) { q.update(DT, qi); vm.update(DT, qi, q); }
  assert.ok(boat.z < 5 && boat.z > -13.2, 'boat sails and stops at the shore: z=' + boat.z);
  assert.ok(Math.abs(boat.y - (H + 0.9)) < 0.5, 'boat floats on the surface: y=' + boat.y);
  qi.pressed.add('useVehicle'); q.update(DT, qi); vm.update(DT, qi, q);

  // glider: climbs when you look up, crashes into a wall without killing you outright at moderate speed
  const r = mkPlayer(0.5, H, 34.5), ri = new InputState(); game.player = r; step(r, ri, 0.3);
  for (let x = -8; x <= 8; x++) for (let y = H + 1; y <= H + 24; y++) world.setBlock(x, y, -30, B.STONE);
  const gl = vm.spawn('glider', r); assert.ok(gl);
  r.body.x = gl.x + 1.5; r.body.z = gl.z; ri.pressed.add('useVehicle'); vm.update(DT, ri, r);
  assert.ok(r.vehicle === gl);
  r.pitch = 0.35; ri.moveZ = 1; const gy = gl.y;
  for (let t = 0; t < 1.5; t += DT) { r.update(DT, ri); vm.update(DT, ri, r); }
  assert.ok(gl.y > gy + 5, 'glider climbs: ' + (gl.y - gy));
  r.pitch = 0;
  for (let t = 0; t < 6; t += DT) { r.update(DT, ri); vm.update(DT, ri, r); }
  assert.ok(gl.z > -31.5, 'glider cannot pass through the wall: z=' + gl.z);
  assert.ok(r.hp < 100, 'crash hurts');
}

// ---------- WEAPONS: sword, bow, rocket launcher ----------
{
  const H = 400; arena(H);
  const calls = { hit: [], placeMany: 0 };
  const targets = [];
  const mkTarget = (x, y, z) => { const t = { alive: true, hp: 100, pos: { x, y, z }, radius: 0.3, height: 1.8, takeDamage(a) { this.hp -= a; if (this.hp <= 0) this.alive = false; return !this.alive; } }; targets.push(t); return t; };
  const scene = { add() {}, remove() {} };
  const game = {
    world, scene, getTargets: () => targets, touch: false,
    hud: { toast() {}, hitmarker() {}, setAmmo() {}, setWeapon() {} }, audio: { play() {} },
    viewModel: { kickShot() {}, swing() { calls.swing = (calls.swing || 0) + 1; } },
    effects: { muzzle() {}, tracer() {}, blockDebris() {}, impact() {} },
    blocks: { hit: (x, y, z, d) => { calls.hit.push([x, y, z, d]); }, detachFloating() {}, placeMany(list) { let n = 0; for (const [x, y, z, id] of list) if (world.getBlock(x, y, z) !== id) { world.setBlock(x, y, z, id); n++; } calls.placeMany += n; return n; } },
    net: null,
  };
  const p = mkPlayer(0.5, H, 12.5), input = new InputState(); game.player = p;
  game.weapons = new WeaponManager(game); game.projectiles = new Projectiles(game);
  step(p, input, 0.3);
  const wm = game.weapons;
  assert.equal(wm.weapons.length, 8);
  const tick = (secs) => { for (let t = 0; t < secs; t += DT) { p.update(DT, input); wm.update(DT, input, p, true); game.projectiles.update(DT); } };

  // sword
  wm.select(5); tick(0.5);
  const dummy = mkTarget(0.5, H + 1, 10.0);                         // 2.5 blocks ahead (yaw 0 looks toward -z)
  p.pitch = 0;
  input.fire = true; tick(0.1); input.fire = false;
  assert.ok(dummy.hp <= 45, 'sword hit for 60: hp=' + dummy.hp);
  assert.equal(wm.weapon.ammo, 1, 'sword never runs out');
  assert.ok(calls.swing >= 1);
  const far = mkTarget(0.5, H + 1, 2.0); tick(0.7); input.fire = true; tick(0.1); input.fire = false;
  assert.equal(far.hp, 100, 'sword has short reach');
  targets.length = 0;

  // bow: full draw = fast, hard arrow; a tap does nothing
  wm.select(6); tick(0.5);
  const mark = mkTarget(0.5, H + 1.62 - 0.9, -8.0);
  input.fire = true; tick(0.08); input.fire = false; tick(0.1);
  assert.equal(game.projectiles.list.length, 0, 'a tap does not loose an arrow');
  const arrows = wm.weapon.ammo;
  input.fire = true; tick(1.0); assert.ok(wm.draw > 0.95, 'drawn fully'); input.fire = false; tick(0.02);
  assert.equal(wm.weapon.ammo, arrows - 1, 'arrow used');
  assert.equal(game.projectiles.list.length, 1, 'arrow in flight');
  tick(0.8);
  assert.ok(mark.hp <= 20, 'full draw arrow hit hard: hp=' + mark.hp);
  mark.alive = false; targets.length = 0;

  // rocket: blows a hole in a wall and hurts what is next to it, but not you 20 blocks away
  for (let x = -4; x <= 4; x++) for (let y = H + 1; y <= H + 5; y++) world.setBlock(x, y, -8, B.STONE);
  world.setBlock(0, H + 2, -8, B.OBSIDIAN);
  const guy = mkTarget(1.0, H + 1, -10.0);
  wm.select(7); tick(0.5); p.pitch = -0.045;                        // eye is 1.62 above feet: aim at the middle of the wall
  const hp0 = p.hp;
  input.fire = true; tick(0.1); input.fire = false; tick(1.0);
  assert.ok(world.getBlock(0, H + 3, -8) === B.AIR || world.getBlock(0, H + 2, -8) === B.AIR || world.getBlock(1, H + 3, -8) === B.AIR, 'rocket opened the wall');
  assert.ok(calls.placeMany > 5, 'many blocks removed: ' + calls.placeMany);
  assert.equal(world.getBlock(0, H + 2, -8), B.OBSIDIAN, 'obsidian survives');
  assert.ok(guy.hp < 100, 'blast hurt the person behind the wall: hp=' + guy.hp);
  assert.equal(p.hp, hp0, 'shooter far away is safe');
  // point blank: you hurt yourself too (a third of the damage) and get thrown back
  const hpBefore = p.hp, vy0 = p.body.vy;
  game.projectiles.explode({ x: p.body.x, y: p.body.y + 0.5, z: p.body.z + 1.2 }, wm.weapons[7]);
  assert.ok(p.hp < hpBefore - 10 && p.hp > 0, 'self blast damage: ' + (hpBefore - p.hp));
  assert.ok(p.body.vy > vy0 + 2, 'knocked up');
}

// ---------- CAMERA VIEWS ----------
{
  const { CameraRig } = await import('../src/core/CameraRig.js');
  const H = 400; arena(H);
  const added = [];
  const p = mkPlayer(0.5, H, 0.5), input = new InputState(); step(p, input, 0.3);
  const game = { world, player: p, scene: { add: (o) => added.push(o), remove() {} }, hud: { toast() {} }, weapons: { weapon: { scope: false } }, vehicles: null, getLook: () => null };
  const rig = new CameraRig(game); rig.view = 'first';
  rig.update(DT); const e = p.eyePos;
  assert.deepEqual([rig.pose.x, rig.pose.y, rig.pose.z], [e.x, e.y, e.z], 'first person camera sits at the eyes');
  assert.equal(rig.shown, false); assert.equal(p.aimDir, null);
  rig.cycle(); assert.equal(rig.view, 'back'); rig.d = 3.4;
  p.yaw = 0; p.pitch = 0; rig.update(DT);
  assert.ok(Math.abs(rig.pose.z - (e.z + 3.4)) < 0.05 && Math.abs(rig.pose.x - e.x) < 0.01, 'third person: camera 3.4 behind: z=' + rig.pose.z);
  assert.equal(rig.shown, true); assert.ok(added.length === 1 && added[0].visible, 'own character is shown');
  // wall right behind you pulls the camera in
  for (let y = H + 1; y <= H + 6; y++) for (let x = -3; x <= 3; x++) world.setBlock(x, y, 3, B.STONE);
  rig.update(DT); assert.ok(rig.pose.z < e.z + 2.6, 'camera does not go through a wall: z=' + rig.pose.z);
  for (let y = H + 1; y <= H + 6; y++) for (let x = -3; x <= 3; x++) world.setBlock(x, y, 3, B.AIR);
  // crosshair accuracy: a wall 20 blocks ahead; the shot from the eyes must hit the same point the crosshair sees
  for (let y = H + 1; y <= H + 8; y++) for (let x = -5; x <= 5; x++) world.setBlock(x, y, -20, B.STONE);
  rig.d = 3.4; rig.update(DT);
  assert.ok(p.aimDir, 'aim direction set in third person');
  const hit = world.raycast(e.x, e.y, e.z, p.aimDir.x, p.aimDir.y, p.aimDir.z, 60);
  assert.ok(hit && hit.z === -20 && Math.abs(hit.x - 0) <= 1 && Math.abs(hit.y - (H + 1 + 1.62)) < 1.5, 'shot lands at the crosshair: ' + JSON.stringify(hit));
  rig.cycle(); assert.equal(rig.view, 'front'); rig.d = 3.2; rig.update(DT);
  assert.ok(rig.pose.z < e.z - 2.5 && Math.abs(Math.abs(rig.pose.yaw - p.yaw) - Math.PI) < 1e-6, 'front view: camera ahead, looking back at you');
  rig.cycle(); assert.equal(rig.view, 'first'); rig.update(DT); assert.equal(added[0].visible, false, 'avatar hidden in first person');
}
console.log('new features ok');
