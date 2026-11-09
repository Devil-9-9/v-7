// Block registry. `top/side/bottom` are tile indices into the procedural texture atlas (see TextureAtlas.js).
export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD: 5, LEAVES: 6,
  BRICK: 7, GLASS: 8, PLANKS: 9, BEDROCK: 10, METAL: 11,
  WATER: 12, LAVA: 13, CLOUD: 14, CRYSTAL: 15,
  CONCRETE: 16, DARK: 17, RED: 18, BLUE: 19, YELLOW: 20, GREEN: 21, ORANGE: 22, PURPLE: 23,
  COBBLE: 24, SNOW: 25, ICE: 26, GLOW: 27, TILE: 28, OBSIDIAN: 29, PORTAL: 30, SANDSTONE: 31, ROOF: 32,
};

export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD_SIDE: 5, WOOD_TOP: 6,
  LEAVES: 7, BRICK: 8, GLASS: 9, PLANKS: 10, BEDROCK: 11, METAL: 12,
  WATER: 13, LAVA: 14, CLOUD: 15, CRYSTAL: 16,
  CONCRETE: 17, DARK: 18, RED: 19, BLUE: 20, YELLOW: 21, GREEN: 22, ORANGE: 23, PURPLE: 24,
  COBBLE: 25, SNOW: 26, ICE: 27, GLOW: 28, TILE: 29, OBSIDIAN: 30, PORTAL: 31, SANDSTONE: 32, ROOF: 33,
};

// hp: damage needed to break (punch = 1, bullet = weapon.blockDamage)
// fluid: not solid (you swim / sink through it), bullets pass through. emissive: drawn bright even in the dark.
export const BLOCKS = {
  [B.GRASS]:   { name: 'Grass',   top: T.GRASS_TOP, side: T.GRASS_SIDE, bottom: T.DIRT, hp: 2 },
  [B.DIRT]:    { name: 'Dirt',    top: T.DIRT, side: T.DIRT, bottom: T.DIRT, hp: 2 },
  [B.STONE]:   { name: 'Stone',   top: T.STONE, side: T.STONE, bottom: T.STONE, hp: 6 },
  [B.SAND]:    { name: 'Sand',    top: T.SAND, side: T.SAND, bottom: T.SAND, hp: 1 },
  [B.WOOD]:    { name: 'Log',     top: T.WOOD_TOP, side: T.WOOD_SIDE, bottom: T.WOOD_TOP, hp: 4 },
  [B.LEAVES]:  { name: 'Leaves',  top: T.LEAVES, side: T.LEAVES, bottom: T.LEAVES, hp: 1, cutout: true },
  [B.BRICK]:   { name: 'Brick',   top: T.BRICK, side: T.BRICK, bottom: T.BRICK, hp: 8 },
  [B.GLASS]:   { name: 'Glass',   top: T.GLASS, side: T.GLASS, bottom: T.GLASS, hp: 1, glass: true },
  [B.PLANKS]:  { name: 'Planks',  top: T.PLANKS, side: T.PLANKS, bottom: T.PLANKS, hp: 3 },
  [B.BEDROCK]: { name: 'Bedrock', top: T.BEDROCK, side: T.BEDROCK, bottom: T.BEDROCK, hp: Infinity },
  [B.METAL]:   { name: 'Metal',   top: T.METAL, side: T.METAL, bottom: T.METAL, hp: 14 },
  [B.WATER]:   { name: 'Water',   top: T.WATER, side: T.WATER, bottom: T.WATER, hp: Infinity, glass: true, fluid: true },
  [B.LAVA]:    { name: 'Lava',    top: T.LAVA, side: T.LAVA, bottom: T.LAVA, hp: Infinity, fluid: true, emissive: true },
  [B.CLOUD]:   { name: 'Cloud',   top: T.CLOUD, side: T.CLOUD, bottom: T.CLOUD, hp: 1 },
  [B.CRYSTAL]: { name: 'Crystal', top: T.CRYSTAL, side: T.CRYSTAL, bottom: T.CRYSTAL, hp: 5, emissive: true },
  [B.CONCRETE]: { name: 'White wall', top: T.CONCRETE, side: T.CONCRETE, bottom: T.CONCRETE, hp: 6 },
  [B.DARK]:     { name: 'Dark wall',  top: T.DARK, side: T.DARK, bottom: T.DARK, hp: 6 },
  [B.RED]:      { name: 'Red',        top: T.RED, side: T.RED, bottom: T.RED, hp: 4 },
  [B.BLUE]:     { name: 'Blue',       top: T.BLUE, side: T.BLUE, bottom: T.BLUE, hp: 4 },
  [B.YELLOW]:   { name: 'Yellow',     top: T.YELLOW, side: T.YELLOW, bottom: T.YELLOW, hp: 4 },
  [B.GREEN]:    { name: 'Green',      top: T.GREEN, side: T.GREEN, bottom: T.GREEN, hp: 4 },
  [B.ORANGE]:   { name: 'Orange',     top: T.ORANGE, side: T.ORANGE, bottom: T.ORANGE, hp: 4 },
  [B.PURPLE]:   { name: 'Purple',     top: T.PURPLE, side: T.PURPLE, bottom: T.PURPLE, hp: 4 },
  [B.COBBLE]:   { name: 'Cobble',     top: T.COBBLE, side: T.COBBLE, bottom: T.COBBLE, hp: 6 },
  [B.SNOW]:     { name: 'Snow',       top: T.SNOW, side: T.SNOW, bottom: T.SNOW, hp: 1 },
  [B.ICE]:      { name: 'Ice',        top: T.ICE, side: T.ICE, bottom: T.ICE, hp: 2, glass: true },
  [B.GLOW]:     { name: 'Lamp',       top: T.GLOW, side: T.GLOW, bottom: T.GLOW, hp: 2, emissive: true },
  [B.TILE]:     { name: 'Floor tile', top: T.TILE, side: T.TILE, bottom: T.TILE, hp: 5 },
  [B.OBSIDIAN]: { name: 'Obsidian',   top: T.OBSIDIAN, side: T.OBSIDIAN, bottom: T.OBSIDIAN, hp: 30 },
  [B.PORTAL]:   { name: 'Portal',     top: T.PORTAL, side: T.PORTAL, bottom: T.PORTAL, hp: Infinity, glass: true, fluid: true, emissive: true },
  [B.SANDSTONE]:{ name: 'Sandstone',  top: T.SANDSTONE, side: T.SANDSTONE, bottom: T.SANDSTONE, hp: 5 },
  [B.ROOF]:     { name: 'Roof tile',  top: T.ROOF, side: T.ROOF, bottom: T.ROOF, hp: 4 },
};

// Hotbar order for BUILD mode
export const HOTBAR_DEFAULT = [B.PLANKS, B.BRICK, B.STONE, B.METAL, B.WOOD, B.GLASS, B.DIRT, B.SAND];
export const HOTBAR = HOTBAR_DEFAULT.slice();   // live array: the inventory rewrites its entries in place

/** Everything the player may carry in the BAG (not water/lava/portal/bedrock). */
export const INVENTORY_BLOCKS = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.SAND, B.SANDSTONE, B.SNOW, B.ICE, B.CLOUD,
  B.WOOD, B.PLANKS, B.LEAVES, B.BRICK, B.ROOF, B.TILE, B.METAL, B.OBSIDIAN,
  B.GLASS, B.CRYSTAL, B.GLOW, B.CONCRETE, B.DARK,
  B.RED, B.ORANGE, B.YELLOW, B.GREEN, B.BLUE, B.PURPLE,
];

export const isFluid = (id) => id !== B.AIR && !!BLOCKS[id]?.fluid;
export const isSolid = (id) => id !== B.AIR && !BLOCKS[id]?.fluid;
export const isOpaque = (id) => id !== B.AIR && !BLOCKS[id]?.glass && !BLOCKS[id]?.cutout;
