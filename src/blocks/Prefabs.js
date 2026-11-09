// Ready-made build sets (house, hotel, tower, ...). Pure data: no rendering, no world access, so they are unit-testable.
// Local coordinates: x = to your right, y = up, z = forward (away from you). The set is stamped starting one block in front of
// the aimed spot and rotated to face the way you look. AIR entries carve out the inside, so a build-set also works on a hillside.
import { B } from './BlockTypes.js';

class Plan {
  constructor() { this.m = new Map(); }
  set(x, y, z, id) { this.m.set(x + ',' + y + ',' + z, [x, y, z, id]); }
  box(x0, y0, z0, x1, y1, z1, id) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, id);
  }
  /** Four walls (no floor/ceiling) of a rectangle. */
  walls(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) { this.set(x, y, z0, id); this.set(x, y, z1, id); }
      for (let z = z0; z <= z1; z++) { this.set(x0, y, z, id); this.set(x1, y, z, id); }
    }
  }
  list() { return [...this.m.values()]; }
}

function house() {
  const p = new Plan();
  p.box(-4, 0, 0, 4, 6, 8, B.AIR);                                 // clear the plot
  p.box(-3, -1, 1, 3, -1, 7, B.TILE);                              // floor
  p.walls(-3, 0, 1, 3, 3, 7, B.PLANKS);
  p.box(-3, 0, 1, -3, 0, 1, B.WOOD); p.box(3, 0, 1, 3, 3, 1, B.WOOD); p.box(-3, 0, 7, -3, 3, 7, B.WOOD); p.box(3, 0, 7, 3, 3, 7, B.WOOD); p.box(-3, 0, 1, -3, 3, 1, B.WOOD);
  p.box(0, 0, 1, 0, 1, 1, B.AIR);                                  // door (2 high)
  p.box(-3, 1, 3, -3, 2, 5, B.GLASS); p.box(3, 1, 3, 3, 2, 5, B.GLASS);   // side windows
  p.box(-2, 1, 7, -1, 2, 7, B.GLASS);                              // back window
  p.box(-3, 4, 1, 3, 4, 7, B.ROOF); p.box(-2, 5, 2, 2, 5, 6, B.ROOF); p.box(-1, 6, 3, 1, 6, 5, B.ROOF);   // pitched-ish roof
  p.set(0, 3, 4, B.GLOW);                                          // ceiling lamp
  return p.list();
}

const HOTEL_FLOORS = 4;
function hotel() {
  const p = new Plan();
  const H = 4, top = HOTEL_FLOORS * H;                              // floor f: feet at y = 4f, slab at y = 4f - 1
  p.box(-8, 0, 0, 8, top + 3, 11, B.AIR);                          // clear the plot
  p.box(-7, -1, 1, 7, -1, 9, B.TILE);                              // ground slab
  for (let f = 0; f < HOTEL_FLOORS; f++) {
    const y0 = f * H;
    p.walls(-7, y0, 1, 7, y0 + 2, 9, B.CONCRETE);
    p.box(-7, y0 + 3, 1, 7, y0 + 3, 9, B.TILE);                     // ceiling / next floor slab
    for (const x of [-7, -4, -1, 2, 5, 7]) p.box(x, y0, 1, x, y0 + 2, 1, B.DARK);   // front pillars
    p.box(-6, y0 + 1, 1, 6, y0 + 2, 1, B.GLASS);                    // window band
    for (const x of [-7, -4, -1, 2, 5, 7]) p.box(x, y0, 1, x, y0 + 2, 1, B.DARK);
    p.box(-7, y0 + 1, 4, -7, y0 + 2, 6, B.GLASS); p.box(7, y0 + 1, 4, 7, y0 + 2, 6, B.GLASS);   // side windows
    p.box(-5, y0 + 1, 9, 5, y0 + 2, 9, B.GLASS);                    // back windows
    if (f > 0) {                                                    // room dividers with a doorway each
      for (const x of [-2, 2]) { p.box(x, y0, 4, x, y0 + 2, 8, B.PLANKS); p.box(x, y0, 4, x, y0 + 1, 4, B.AIR); }
    }
    for (const x of [-3, 0, 4]) p.set(x, y0 + 2, 6, B.GLOW);        // ceiling lamps
    {                                                               // flight of stairs up to the next level (the top one leads to the roof)
      const x = f % 2 === 0 ? -6 : -3;                              // alternate shafts; walk along x=-4 / -5 to reach the next one
      for (let i = 0; i < 4; i++) p.box(x, y0, 2 + i, x, y0 + i, 2 + i, B.PLANKS);
      for (let z = 2; z <= 4; z++) p.set(x, y0 + 3, z, B.AIR);      // head-room hole in the slab above
    }
  }
  // lobby entrance, 3 wide and 3 tall, with a canopy and lamps above it
  p.box(-1, 0, 1, 1, 2, 1, B.AIR);
  p.box(-2, 3, 0, 2, 3, 0, B.GLOW); p.box(-3, 3, 0, 3, 3, 0, B.GLOW);
  // parapet and a rooftop sign of lamps
  p.walls(-7, top, 1, 7, top, 9, B.CONCRETE);
  for (let x = -6; x <= 6; x += 2) p.set(x, top + 1, 1, B.GLOW);
  return p.list();
}

function tower() {
  const p = new Plan();
  p.box(-4, 0, 0, 4, 22, 8, B.AIR);
  p.box(-3, -1, 1, 3, -1, 7, B.COBBLE);
  p.walls(-3, 0, 1, 3, 15, 7, B.COBBLE);
  p.box(0, 0, 1, 0, 1, 1, B.AIR);                                  // door
  for (let y = 4; y <= 12; y += 4) { p.box(-3, y, 4, -3, y + 1, 4, B.GLASS); p.box(3, y, 4, 3, y + 1, 4, B.GLASS); p.box(0, y, 7, 0, y + 1, 7, B.GLASS); }
  // spiral staircase around the inside wall: 16 cells, one step up per cell
  const ring = [];
  for (let x = -2; x <= 2; x++) ring.push([x, 2]);
  for (let z = 3; z <= 6; z++) ring.push([2, z]);
  for (let x = 1; x >= -2; x--) ring.push([x, 6]);
  for (let z = 5; z >= 3; z--) ring.push([-2, z]);
  // ring has 5 + 4 + 4 + 3 = 16 cells; start at the door side
  for (let k = 0; k < 16; k++) p.set(ring[k][0], k, ring[k][1], B.PLANKS);
  // deck at y = 15: everywhere inside except the head-room holes above steps 12, 13 and 14
  for (let x = -2; x <= 2; x++) for (let z = 2; z <= 6; z++) p.set(x, 15, z, B.PLANKS);
  for (const k of [12, 13, 14]) p.set(ring[k][0], 15, ring[k][1], B.AIR);
  p.set(ring[15][0], 15, ring[15][1], B.PLANKS);
  // battlements
  for (let x = -3; x <= 3; x++) for (const z of [1, 7]) { p.set(x, 16, z, B.COBBLE); if ((x + 3) % 2 === 0) p.set(x, 17, z, B.COBBLE); }
  for (let z = 2; z <= 6; z++) for (const x of [-3, 3]) { p.set(x, 16, z, B.COBBLE); if ((z + 1) % 2 === 0) p.set(x, 17, z, B.COBBLE); }
  p.set(0, 1, 6, B.GLOW); p.set(0, 9, 6, B.GLOW);
  return p.list();
}

function bridge() {
  const p = new Plan();
  const L = 24;
  p.box(-2, 0, 1, 2, 6, L, B.AIR);
  p.box(-1, -1, 1, 1, -1, L, B.PLANKS);
  for (let z = 1; z <= L; z++) { p.set(-2, 0, z, B.WOOD); p.set(2, 0, z, B.WOOD); }
  p.box(-1, -1, 1, -1, -1, L, B.PLANKS);
  for (let z = 2; z <= L; z += 4) { p.set(-2, 1, z, B.WOOD); p.set(2, 1, z, B.WOOD); p.set(-2, 2, z, B.GLOW); p.set(2, 2, z, B.GLOW); }
  for (let z = 3; z <= L; z += 8) for (const x of [-1, 1]) p.box(x, -12, z, x, -2, z, B.COBBLE);   // pillars
  return p.list();
}

function wall() {
  const p = new Plan();
  const L = 15;
  p.box(-1, 0, 0, 1, 8, L, B.AIR);
  p.box(-1, 0, 1, 0, 3, L, B.COBBLE);                              // 2 thick, 4 tall
  for (let z = 1; z <= L; z++) if (z % 2) { p.set(-1, 4, z, B.COBBLE); p.set(0, 4, z, B.COBBLE); }  // battlements
  for (let z = 1; z <= L; z += 7) { p.box(-2, 0, z, 1, 5, z + 1, B.COBBLE); p.set(-2, 6, z, B.GLOW); }   // buttresses with a torch lamp
  return p.list();
}

function platform() {
  const p = new Plan();
  p.box(-5, 0, 0, 5, 3, 11, B.AIR);
  p.box(-5, -1, 1, 5, -1, 11, B.TILE);
  for (const x of [-5, 5]) for (const z of [1, 11]) { p.box(x, 0, z, x, 2, z, B.CONCRETE); p.set(x, 3, z, B.GLOW); }
  return p.list();
}

/** Obsidian frame, 3x3 opening. keystone: CRYSTAL = sky portal, GLOW = underworld portal, PURPLE = home portal. */
export function portalFrame(keystone) {
  const p = new Plan();
  p.box(-3, 0, 0, 3, 6, 2, B.AIR);
  p.box(-2, 0, 1, 2, 0, 1, B.OBSIDIAN);          // bottom
  p.box(-2, 4, 1, 2, 4, 1, B.OBSIDIAN);          // top
  p.box(-2, 1, 1, -2, 3, 1, B.OBSIDIAN);         // sides
  p.box(2, 1, 1, 2, 3, 1, B.OBSIDIAN);
  p.set(0, 4, 1, keystone);
  return p.list();
}

export const PREFABS = [
  { id: 'house', name: 'House', desc: 'Small home with door, windows, lamp', build: house },
  { id: 'hotel', name: 'Hotel', desc: '4 floors, lobby, stairs, rooms, lamps', build: hotel },
  { id: 'tower', name: 'Tower', desc: 'Stone tower, spiral stairs, battlements', build: tower },
  { id: 'bridge', name: 'Bridge', desc: '24 long, lamps and pillars', build: bridge },
  { id: 'wall', name: 'Castle wall', desc: '15 long with battlements', build: wall },
  { id: 'platform', name: 'Platform', desc: '11x11 floor with lamp posts', build: platform },
  { id: 'portal-sky', name: 'Sky portal', desc: 'Obsidian frame, crystal top: goes UP to the sky realm', build: () => portalFrame(B.CRYSTAL) },
  { id: 'portal-under', name: 'Underworld portal', desc: 'Obsidian frame, lamp top: goes DOWN to the underworld', build: () => portalFrame(B.GLOW) },
].map((d) => {
  let cache = null;
  return Object.assign(d, { get blocks() { return (cache ||= d.build()); } });
});

export const getPrefab = (id) => PREFABS.find((p) => p.id === id) || null;

/** Axis the player is facing (unit vector on x or z) from yaw. */
export function facingFromYaw(yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  return Math.abs(fx) > Math.abs(fz) ? { x: Math.sign(fx), z: 0 } : { x: 0, z: Math.sign(fz) };
}

/** Local -> world. right = (-fz, fx), matching Player.right() for yaw 0 (facing -z => right = +x). */
export function transform(blocks, ox, oy, oz, facing) {
  const rx = -facing.z, rz = facing.x;
  return blocks.map(([lx, ly, lz, id]) => [ox + rx * lx + facing.x * lz, oy + ly, oz + rz * lx + facing.z * lz, id]);
}

/** Axis-aligned bounds of the solid (non-air) part, in world space, for the placement preview. */
export function bounds(world) {
  let a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
  for (const [x, y, z, id] of world) {
    if (id === B.AIR) continue;
    a = [Math.min(a[0], x), Math.min(a[1], y), Math.min(a[2], z)];
    b = [Math.max(b[0], x), Math.max(b[1], y), Math.max(b[2], z)];
  }
  return { min: a, max: b };
}
