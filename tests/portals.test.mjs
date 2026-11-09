import assert from 'node:assert/strict';
import { B, BLOCKS } from '../src/blocks/BlockTypes.js';
import { findFrame, findFramesNear, PortalManager } from '../src/blocks/Portals.js';
import { getPrefab, transform, portalFrame } from '../src/blocks/Prefabs.js';
import { World } from '../src/blocks/World.js';
import { SKY_BASE } from '../src/core/Constants.js';

const mapWorld = (blocks) => { const m = new Map(); for (const [x, y, z, id] of blocks) m.set(x + ',' + y + ',' + z, id); return (x, y, z) => m.get(x + ',' + y + ',' + z) ?? (y < 0 ? B.STONE : B.AIR); };

// frame detection, both orientations, every keystone
for (const [prefab, kind] of [['portal-sky', 'sky'], ['portal-under', 'under']]) {
  for (const facing of [{ x: 0, z: 1 }, { x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 }]) {
    const get = mapWorld(transform(getPrefab(prefab).blocks, 10, 0, 10, facing));
    const cells = findFramesNear(get, 10 + facing.x * 1, 2, 10 + facing.z * 1);
    assert.equal(cells.length, 1, prefab + ' found');
    assert.equal(cells[0].kind, kind); assert.equal(cells[0].w, 3); assert.equal(cells[0].h, 3); assert.equal(cells[0].cells.length, 9);
    assert.equal(findFrame(get, cells[0].cells[4][0], cells[0].cells[4][1], cells[0].cells[4][2]).kind, kind);
  }
}
// no keystone -> frame found but inactive; broken obsidian -> no frame
{
  const bl = transform(portalFrame(B.OBSIDIAN), 0, 0, 0, { x: 0, z: 1 });
  const f = findFramesNear(mapWorld(bl), 0, 2, 1); assert.equal(f.length, 1); assert.equal(f[0].kind, null);
  const broken = transform(portalFrame(B.CRYSTAL), 0, 0, 0, { x: 0, z: 1 }).filter(([x, y]) => !(x === 2 && y === 2));
  assert.equal(findFramesNear(mapWorld(broken), 0, 2, 1).length, 0);
}
// even-width frame (opening 2x3) with the keystone in either middle block
for (const kx of [0, 1]) {
  const bl = [];
  for (let x = -1; x <= 2; x++) { bl.push([x, 0, 5, B.OBSIDIAN]); bl.push([x, 4, 5, x === kx ? B.CRYSTAL : B.OBSIDIAN]); }
  for (let y = 1; y <= 3; y++) { bl.push([-1, y, 5, B.OBSIDIAN]); bl.push([2, y, 5, B.OBSIDIAN]); }
  const f = findFramesNear(mapWorld(bl), 0, 2, 5); assert.equal(f.length, 1); assert.equal(f[0].w, 2); assert.equal(f[0].kind, 'sky');
}

// PortalManager against a real world with minimal stubs
const world = new World(1234);
const edits = [];
const blocks = {
  placeMany(list) { let n = 0; for (const [x, y, z, id] of list) { const cur = world.getBlock(x, y, z); if (cur !== id && world.setBlock(x, y, z, id)) { n++; this.onAnyEdit?.(x, y, z, id, cur); } } edits.push(list.length); return n; },
  initialLoad() {},
};
let toasts = [];
const game = { world, blocks, hud: { toast: (t) => toasts.push(t), portalFlash() {}, setPortal() {} }, audio: { play() {} } };
const pm = new PortalManager(game);
blocks.onAnyEdit = (x, y, z, id, old) => pm.onEdit(x, y, z, id, old);
const player = { alive: true, yaw: 0, pitch: 0, body: { x: 0.5, y: 0, z: 0.5, vx: 0, vy: 0, vz: 0 } };
const ensure = (x, y, z, r = 1) => { for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) world.ensureChunk((x >> 4) + a, (y >> 4) + b, (z >> 4) + c); };
const ox = 40, oz = 40, gy = world.heightAt(ox, oz) + 1;
ensure(ox, world.heightAt(ox, oz), oz, 2); ensure(ox + 20, world.heightAt(ox, oz), oz, 2);
for (let x = ox - 5; x <= ox + 5; x++) for (let z = oz - 5; z <= oz + 5; z++) for (let y = world.heightAt(ox, oz); y < gy + 12; y++) world.setBlock(x, y, z, y === world.heightAt(ox, oz) ? B.STONE : B.AIR);
const stamp = (blocksList) => { for (const [x, y, z, id] of blocksList) world.setBlock(x, y, z, id); };

// build a sky portal, notify, and it lights up
const frame = transform(getPrefab('portal-sky').blocks, ox, gy, oz, { x: 0, z: -1 });
stamp(frame);
pm.onEdit(ox, gy + 4, oz - 1, B.CRYSTAL, B.AIR);
pm.update(0.016, { ...player, alive: false });
let portalCells = 0; for (let x = ox - 4; x <= ox + 4; x++) for (let y = gy; y < gy + 6; y++) for (let z = oz - 4; z <= oz + 4; z++) if (world.getBlock(x, y, z) === B.PORTAL) portalCells++;
assert.equal(portalCells, 9, 'portal lit');
assert.ok(toasts.some((t) => /SKY PORTAL ON/.test(t)));

// walk in: teleports to the sky hub after the delay, builds the hub with a return portal
player.body = { x: ox + 0.5, y: gy + 1, z: oz - 1 + 0.5, vx: 0, vy: 0, vz: 0 };
for (let i = 0; i < 70; i++) pm.update(0.016, player);
assert.ok(player.body.y >= SKY_BASE + 39, 'arrived in the sky: y=' + player.body.y);
const hx = Math.round((ox + 0.5) / 64) * 64, hz = Math.round((oz - 0.5) / 64) * 64;
assert.equal(world.getBlock(hx, SKY_BASE + 39, hz), B.TILE, 'hub floor');
let hubPortal = 0; for (let x = hx - 3; x <= hx + 3; x++) for (let y = SKY_BASE + 40; y < SKY_BASE + 46; y++) for (let z = hz - 5; z <= hz; z++) if (world.getBlock(x, y, z) === B.PORTAL) hubPortal++;
for (let i = 0; i < 10; i++) pm.update(0.016, player);            // let the queue light the return portal
hubPortal = 0; for (let x = hx - 3; x <= hx + 3; x++) for (let y = SKY_BASE + 40; y < SKY_BASE + 46; y++) for (let z = hz - 5; z <= hz; z++) if (world.getBlock(x, y, z) === B.PORTAL) hubPortal++;
assert.equal(hubPortal, 9, 'return portal lit');

// step into the return portal: back to the original spot, 2 blocks in front of the frame
player.body.x = hx + 0.5; player.body.z = hz - 3 + 0.5; player.body.y = SKY_BASE + 41;
for (let i = 0; i < 200; i++) pm.update(0.016, player);
assert.ok(player.body.y < 60, 'back on the ground y=' + player.body.y);
assert.ok(Math.hypot(player.body.x - (ox + 0.5), player.body.z - (oz - 0.5)) < 4, 'back near the frame');
assert.notEqual(world.getBlock(Math.floor(player.body.x), Math.floor(player.body.y + 0.9), Math.floor(player.body.z)), B.PORTAL, 'not standing in the portal');

// breaking the frame switches the portal off
world.setBlock(ox - 2, gy + 1, oz - 1, B.AIR);
pm.onEdit(ox - 2, gy + 1, oz - 1, B.AIR, B.OBSIDIAN);
pm.update(0.016, { ...player, alive: false });
portalCells = 0; for (let x = ox - 4; x <= ox + 4; x++) for (let y = gy; y < gy + 6; y++) for (let z = oz - 4; z <= oz + 4; z++) if (world.getBlock(x, y, z) === B.PORTAL) portalCells++;
assert.equal(portalCells, 0, 'portal off after the frame broke');

// underworld hub
{
  const uf = transform(getPrefab('portal-under').blocks, ox + 20, gy, oz, { x: 0, z: -1 }); stamp(uf);
  pm.onEdit(ox + 20, gy + 4, oz - 1, B.GLOW, B.AIR); pm.update(0.016, { ...player, alive: false });
  player.body = { x: ox + 20.5, y: gy + 1, z: oz - 0.5, vx: 0, vy: 0, vz: 0 }; pm.armed = true; pm.cool = 0;
  for (let i = 0; i < 70; i++) pm.update(0.016, player);
  assert.ok(player.body.y < -40, 'arrived underground y=' + player.body.y);
  const hx2 = Math.round((ox + 20.5) / 64) * 64, hz2 = Math.round((oz - 0.5) / 64) * 64;
  assert.equal(world.getBlock(Math.floor(player.body.x), Math.floor(player.body.y), Math.floor(player.body.z)), B.AIR, 'room is open');
  assert.equal(world.getBlock(Math.floor(player.body.x), Math.floor(player.body.y) - 1, Math.floor(player.body.z)), B.TILE, 'floor under you');
  assert.ok(hx2 !== undefined);
}
console.log('portals ok');
