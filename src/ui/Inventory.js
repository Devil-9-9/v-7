import { BLOCKS, HOTBAR, HOTBAR_DEFAULT, INVENTORY_BLOCKS } from '../blocks/BlockTypes.js';
import { drawBlockIcon } from '../blocks/TextureAtlas.js';
import { PREFABS } from '../blocks/Prefabs.js';
import { VEHICLE_TYPES } from '../vehicles/Vehicles.js';

const $ = (id) => document.getElementById(id);
const KEY = 'blockops.hotbar.v1';

/** BAG: every block type, assign any of them to the 8 hotbar slots, and pick a build set (house, hotel, tower, ...) to stamp down. */
export class Inventory {
  constructor(game) {
    this.g = game; this.isOpen = false; this.tab = 'blocks'; this.slot = 0;
    this.el = $('inventory');
    this.load();
    this.bind();
  }

  load() {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (Array.isArray(a) && a.length === HOTBAR.length && a.every((id) => INVENTORY_BLOCKS.includes(id))) a.forEach((id, i) => { HOTBAR[i] = id; });
    } catch (_) { /* storage blocked or corrupt: keep defaults */ }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(HOTBAR)); } catch (_) { /* ignore */ } }

  bind() {
    $('inv-close').addEventListener('click', () => this.hide());
    for (const b of this.el.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { this.tab = b.dataset.tab; this.render(); });
    $('inv-reset').addEventListener('click', () => { HOTBAR_DEFAULT.forEach((id, i) => { HOTBAR[i] = id; }); this.save(); this.refreshHotbar(); this.render(); });
    for (const ev of ['touchstart', 'touchmove']) this.el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  }

  toggle() { this.isOpen ? this.hide() : this.show(); }
  show() {
    this.isOpen = true; this.slot = this.g.build.slot;
    this.el.classList.remove('hidden');
    this.g.input.reset();
    document.exitPointerLock?.();
    this.render();
  }
  hide() {
    if (!this.isOpen) return;
    this.isOpen = false; this.el.classList.add('hidden');
    this.g.input.reset();
    if (!this.g.touch && !this.g.paused) $('game').requestPointerLock?.();
  }

  refreshHotbar() { this.g.hud.buildHotbar(this.g.atlas.canvas, (i) => this.g.build.select(i)); this.g.hud.selectSlot(this.g.build.slot); }

  icon(id, size = 40) {
    const c = document.createElement('canvas'); drawBlockIcon(c, this.g.atlas.canvas, id);
    c.style.width = c.style.height = size + 'px';
    return c;
  }

  render() {
    for (const b of this.el.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === this.tab);
    const bar = $('inv-hotbar'); bar.textContent = '';
    HOTBAR.forEach((id, i) => {
      const s = document.createElement('button'); s.className = 'inv-slot' + (i === this.slot ? ' sel' : '');
      s.appendChild(this.icon(id, 34)); s.title = BLOCKS[id].name;
      s.addEventListener('click', () => { this.slot = i; this.g.build.select(i); this.render(); });
      bar.appendChild(s);
    });
    const grid = $('inv-grid'); grid.textContent = '';
    if (this.tab === 'blocks') {
      $('inv-hint').textContent = 'Pick a slot above, then tap a block to put it there. Blocks are unlimited.';
      for (const id of INVENTORY_BLOCKS) {
        const b = document.createElement('button'); b.className = 'inv-block';
        b.appendChild(this.icon(id)); const n = document.createElement('span'); n.textContent = BLOCKS[id].name; b.appendChild(n);
        b.addEventListener('click', () => { HOTBAR[this.slot] = id; this.save(); this.refreshHotbar(); this.render(); });
        grid.appendChild(b);
      }
    } else if (this.tab === 'vehicles') {
      $('inv-hint').textContent = 'Spawns in front of you. Walk up and press USE (V) to drive. Vehicles are only on your screen (friends do not see them).';
      for (const [id, t] of Object.entries(VEHICLE_TYPES)) {
        const b = document.createElement('button'); b.className = 'inv-set';
        b.innerHTML = '<b></b><small></small><i></i>';
        b.children[0].textContent = t.name; b.children[1].textContent = t.help; b.children[2].textContent = 'TAP TO SPAWN';
        b.addEventListener('click', () => { if (this.g.vehicles.spawn(id, this.g.player)) this.hide(); });
        grid.appendChild(b);
      }
    } else {
      $('inv-hint').textContent = 'Pick a set, close the bag, aim at the ground and press BUILD SET (P on keyboard). Portals: see the help text below.';
      const cur = this.g.build.prefab?.id;
      for (const p of PREFABS) {
        const b = document.createElement('button'); b.className = 'inv-set' + (p.id === cur ? ' sel' : '');
        b.innerHTML = '<b></b><small></small><i></i>';
        b.children[0].textContent = p.name; b.children[1].textContent = p.desc; b.children[2].textContent = p.blocks.length + ' blocks';
        b.addEventListener('click', () => { this.g.build.setPrefab(p.id === cur ? null : p.id); if (p.id !== cur) this.g.setMode('build'); this.hide(); });
        grid.appendChild(b);
      }
      const help = document.createElement('div'); help.className = 'inv-help';
      help.textContent = 'Own portal: obsidian frame (opening 3 wide, 3 tall) and a CRYSTAL block in the middle of the top row = sky; a LAMP block there = underworld; a PURPLE block = back home. The opening lights up by itself. Walk in and wait a second.';
      grid.appendChild(help);
    }
  }
}
