import * as THREE from 'three';
import { REACH } from '../core/Constants.js';
import { HOTBAR } from './BlockTypes.js';
import { getPrefab, facingFromYaw, transform } from './Prefabs.js';

/** Minecraft side: aim highlight, punch/break, place against the targeted face, hotbar. */
export class BuildTool {
  constructor(game) {
    this.game = game;
    this.slot = 0;
    this.breakCd = 0;
    this.target = null;
    this.onChange = null;
    const geo = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    this.outline.visible = false;
    game.scene.add(this.outline);
    this.prefab = null;                      // selected build set (house, hotel, ...) or null
    this.preview = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x5cf0a0 }));
    this.preview.visible = false;
    game.scene.add(this.preview);
  }

  setPrefab(id) {
    this.prefab = id ? getPrefab(id) : null;
    this.game.hud.toast(this.prefab ? this.prefab.name.toUpperCase() + ' SELECTED: aim, then BUILD SET' : 'BUILD SET CLEARED', 1600);
  }

  /** Where the set would stand: one block in front of the aimed face, turned to face the way you look. */
  prefabSpot(player) {
    const t = this.target, f = player.forward();
    const o = t ? { x: t.x + t.nx, y: t.y + t.ny, z: t.z + t.nz } : { x: Math.floor(player.body.x + f.x * 4), y: Math.floor(player.body.y), z: Math.floor(player.body.z + f.z * 4) };
    return { o, facing: facingFromYaw(player.yaw) };
  }

  placePrefab(player) {
    if (!this.prefab) { this.game.hud.toast('Open BAG > BUILD SETS and pick a set first', 1800); return; }
    const { o, facing } = this.prefabSpot(player);
    const n = this.game.blocks.placeMany(transform(this.prefab.blocks, o.x, o.y, o.z, facing));
    this.game.hud.toast(this.prefab.name.toUpperCase() + ' BUILT (' + n + ' blocks)', 1600);
  }

  updatePreview(player, show) {
    const p = this.prefab;
    if (!p || !show) { this.preview.visible = false; return; }
    if (!p._lb) {                                           // cache the solid bounds in local space
      let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
      for (const [x, y, z, id] of p.blocks) if (id) { a = [Math.min(a[0], x), Math.min(a[1], y), Math.min(a[2], z)]; b = [Math.max(b[0], x), Math.max(b[1], y), Math.max(b[2], z)]; }
      p._lb = { a, b };
    }
    const { o, facing } = this.prefabSpot(player), { a, b } = p._lb;
    const cs = transform([[a[0], a[1], a[2], 1], [b[0], b[1], b[2], 1]], o.x, o.y, o.z, facing);
    const lo = [Math.min(cs[0][0], cs[1][0]), Math.min(cs[0][1], cs[1][1]), Math.min(cs[0][2], cs[1][2])];
    const hi = [Math.max(cs[0][0], cs[1][0]) + 1, Math.max(cs[0][1], cs[1][1]) + 1, Math.max(cs[0][2], cs[1][2]) + 1];
    this.preview.position.set((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
    this.preview.scale.set(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    this.preview.visible = true;
  }

  get blockId() { return HOTBAR[this.slot]; }

  select(i) { this.slot = ((i % HOTBAR.length) + HOTBAR.length) % HOTBAR.length; this.onChange?.(this.slot); }

  update(dt, input, player, combatMode) {
    const g = this.game;
    this.breakCd -= dt;
    if (!player.alive) { this.outline.visible = false; this.preview.visible = false; return; }

    if (input.consume('nextBlock')) this.select(this.slot + 1);
    if (input.consume('prevBlock')) this.select(this.slot - 1);
    for (let i = 0; i < HOTBAR.length; i++) if (input.consume('slot' + i)) this.select(i);

    const o = player.eyePos, f = player.forward();
    this.target = g.world.raycast(o.x, o.y, o.z, f.x, f.y, f.z, REACH);
    const t = this.target;
    this.outline.visible = !!t;
    if (t) this.outline.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);

    if (input.consume('prefab')) this.placePrefab(player);
    this.updatePreview(player, !combatMode);

    // break: X key / BREAK press anywhere; held fire while in BUILD mode
    const wantBreak = input.consume('breakBlock') || (!combatMode && input.fire);
    if (wantBreak && t && this.breakCd <= 0) {
      g.blocks.hit(t.x, t.y, t.z, 1);
      g.viewModel.kickShot(0.5);
      this.breakCd = 0.18;
    }

    // place on the face we're looking at (works in either mode so you can build mid-fight)
    if (input.consume('place') && t) {
      const px = t.x + t.nx, py = t.y + t.ny, pz = t.z + t.nz;
      const b = player.body, r = b.radius;
      const overlapsMe = px + 1 > b.x - r && px < b.x + r && pz + 1 > b.z - r && pz < b.z + r && py + 1 > b.y && py < b.y + b.height;
      if (!overlapsMe) g.blocks.place(px, py, pz, this.blockId);
    }
  }
}
