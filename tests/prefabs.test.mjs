import assert from 'node:assert/strict';
import { PREFABS, getPrefab, transform, facingFromYaw, bounds } from '../src/blocks/Prefabs.js';
import { B, isSolid, INVENTORY_BLOCKS, BLOCKS, HOTBAR } from '../src/blocks/BlockTypes.js';
import { T } from '../src/blocks/BlockTypes.js';

// every block type has a definition and a tile inside the 6x6 atlas
for (const id of Object.values(B)) if (id) assert.ok(BLOCKS[id], 'block def ' + id);
for (const id of Object.keys(BLOCKS)) for (const f of ['top', 'side', 'bottom']) assert.ok(BLOCKS[id][f] < 36, 'tile ' + id);
assert.ok(Math.max(...Object.values(T)) < 36);
for (const id of INVENTORY_BLOCKS) assert.ok(BLOCKS[id] && !BLOCKS[id].fluid, 'inventory block ' + id);
assert.equal(HOTBAR.length, 8);

// build a tiny sparse world out of a prefab placed on flat ground (ground top = y 0, i.e. solid at y < 0)
function grid(prefab, facing = { x: 0, z: 1 }) {
  const m = new Map();
  const get = (x, y, z) => m.get(x + ',' + y + ',' + z) ?? (y < 0 ? B.STONE : B.AIR);
  for (const [x, y, z, id] of transform(prefab.blocks, 0, 0, 0, facing)) m.set(x + ',' + y + ',' + z, id);
  return { get, m };
}
const solid = (g, x, y, z) => isSolid(g.get(x, y, z));
const stand = (g, x, y, z) => solid(g, x, y - 1, z) && !solid(g, x, y, z) && !solid(g, x, y + 1, z);
function reach(g, start, limit = 60) {
  const seen = new Set([start.join()]), q = [start];
  let best = start[1];
  while (q.length) {
    const [x, y, z] = q.shift(); best = Math.max(best, y);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const dy of [1, 0, -1, -2, -3]) {                                   // jump up 1, drop up to 3
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (Math.abs(nx) > limit || Math.abs(nz) > limit || ny < 0 || seen.has([nx, ny, nz].join())) continue;
        if (!stand(g, nx, ny, nz)) continue;
        if (dy === 1 && solid(g, x, y + 2, z)) continue;                       // no head room to jump
        if (dy < 0 && (solid(g, nx, y + 1, nz) || solid(g, nx, y, nz))) continue;
        seen.add([nx, ny, nz].join()); q.push([nx, ny, nz]);
      }
    }
  }
  return { seen, best };
}

for (const p of PREFABS) {
  assert.ok(p.blocks.length > 5, p.id);
  for (const [, , , id] of p.blocks) assert.ok(id === B.AIR || BLOCKS[id], p.id + ' block');
}

// hotel: walk in through the lobby (door at x 0, z 1) and reach the roof (feet y = 16)
{
  const g = grid(getPrefab('hotel'));
  const r = reach(g, [0, 0, -1]);
  assert.ok(r.seen.has('0,0,3'), 'hotel lobby reachable');
  assert.ok(r.best >= 16, 'hotel roof reachable by walking, got ' + r.best);
}
// tower: through the door to the deck at y = 16
{
  const g = grid(getPrefab('tower'));
  const r = reach(g, [0, 0, -1]);
  assert.ok(r.best >= 16, 'tower top reachable, got ' + r.best);
}
// house: door opens, inside is air
{
  const g = grid(getPrefab('house'));
  const r = reach(g, [0, 0, 0]);
  assert.ok(r.seen.has('0,0,4'), 'house interior reachable');
}
// bridge is walkable end to end
{
  const g = grid(getPrefab('bridge'));
  const r = reach(g, [0, 0, 1]);
  assert.ok(r.seen.has('0,0,24'), 'bridge crossable');
}
// rotation: facing east maps local forward to +x and local right to +z
assert.deepEqual(facingFromYaw(0), { x: 0, z: -1 });
assert.deepEqual(facingFromYaw(-Math.PI / 2), { x: 1, z: 0 });
assert.deepEqual(transform([[1, 2, 3, 5]], 10, 10, 10, { x: 0, z: -1 }), [[11, 12, 7, 5]]);   // yaw 0: right = +x, forward = -z
assert.deepEqual(transform([[1, 2, 3, 5]], 0, 0, 0, { x: 1, z: 0 }), [[3, 2, 1, 5]]);
const bb = bounds(transform(getPrefab('hotel').blocks, 0, 0, 0, { x: 0, z: 1 }));
assert.ok(bb.max[1] >= 17);
console.log('prefabs ok');
