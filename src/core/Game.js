import * as THREE from 'three';
import { World } from '../blocks/World.js';
import { BlockManager } from '../blocks/BlockManager.js';
import { BuildTool } from '../blocks/BuildTool.js';
import { buildAtlas } from '../blocks/TextureAtlas.js';
import { PhysicsWorld } from './Physics.js';
import { DayNight } from './DayNight.js';
import { Effects } from './Effects.js';
import { Player } from '../player/Player.js';
import { WeaponManager } from '../weapons/WeaponManager.js';
import { ViewModel } from '../weapons/ViewModel.js';
import { Bot } from '../ai/Bot.js';
import { Wildlife } from '../ai/Wildlife.js';
import { GameAudio } from '../audio/Audio.js';
import { HUD } from '../ui/HUD.js';
import { InputState } from '../controls/InputState.js';
import { SKY_BASE, SKY_BAND, MAX_SURFACE } from './Constants.js';
import { B } from '../blocks/BlockTypes.js';
import { Projectiles } from '../weapons/Projectiles.js';
import { CameraRig } from './CameraRig.js';
import { VehicleManager } from '../vehicles/Vehicles.js';
import { PortalManager } from '../blocks/Portals.js';
import { Inventory } from '../ui/Inventory.js';

const BOT_NAMES = ['VIPER', 'GHOST', 'RAZOR', 'HAWK', 'WOLF'];
const BASE_FOV = 75;

export class Game {
  constructor({ canvas, net, myId, touch }) {
    this.net = net; this.myId = myId; this.touch = touch;
    this.mode = 'combat';
    this.running = false; this.paused = false; this.last = 0; this.bots = [];
    this.input = new InputState();
    this.audio = new GameAudio();
    this.hud = new HUD();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 250);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.atlas = buildAtlas();
    this.physics = new PhysicsWorld();
    this.daynight = new DayNight(this.scene, this.renderer, touch ? 30 : 45);
    this.lamp = new THREE.PointLight(0xffd9a0, 0, 26);
    this.camera.add(this.lamp);
    this.daynight.lamp = this.lamp;
    this.viewModel = new ViewModel(this.camera);
    this.hud.buildHotbar(this.atlas.canvas, (i) => this.build.select(i));
    if (net) net.game = this;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  v3(p) { return new THREE.Vector3(p.x, p.y, p.z); }

  getTargets() {
    const t = this.bots.slice();
    if (this.wildlife) t.push(...this.wildlife.getTargets());   // animals, fish and villagers can all be shot
    if (this.net) t.push(...this.net.getTargets());
    return t;
  }

  /** (Re)build the world. Called at start and when a host's seed arrives. */
  loadWorld(seed, edits = [], withBots = true) {
    this.seed = seed;
    // tear down any previous world
    if (this.blocks) { for (const k of [...this.blocks.meshes.keys()]) this.blocks.disposeMesh(k); this.scene.remove(this.blocks.group); }
    for (const b of this.bots) this.scene.remove(b.mesh);
    this.bots = [];
    this.wildlife?.dispose();
    this.wildlife = new Wildlife(this);

    this.world = new World(seed);
    for (const [x, y, z, id] of edits) this.world.edits.set(`${x},${y},${z}`, id);
    this.effects = this.effects || new Effects(this.scene, this.world);
    this.effects.world = this.world;
    this.blocks = new BlockManager({ scene: this.scene, world: this.world, atlasTexture: this.atlas.texture, physics: this.physics, effects: this.effects, renderDist: this.touch ? 4 : 6, vertDist: this.touch ? 1 : 2 });
    this.blocks.onEdit = (x, y, z, id) => this.net?.sendEdit(x, y, z, id);
    this.blocks.onEdits = (list) => this.net?.sendEdits(list);
    this.portals = new PortalManager(this);
    this.projectiles?.dispose?.();
    this.projectiles = new Projectiles(this);
    this.vehicles?.dispose();
    this.vehicles = new VehicleManager(this);
    this.rig?.dispose();
    this.rig = new CameraRig(this);
    this.blocks.onAnyEdit = (x, y, z, id, old) => this.portals.onEdit(x, y, z, id, old);
    this.blocks.onSound = (n) => this.audio.play(n);

    // oceans can cover the origin, so search outward for dry land; each peer starts at a different spot on it
    const a = Math.random() * 6.28, r = Math.random() * 30;
    const spawn = this.world.findLandSpawn(Math.cos(a) * r, Math.sin(a) * r);
    this.blocks.initialLoad(spawn.x, spawn.y, spawn.z, 2);

    if (!this.player) {
      this.player = new Player(this.world, spawn);
      this.weapons = new WeaponManager(this);
      this.build = new BuildTool(this);
      this.wirePlayer();
    } else {
      this.player.world = this.world; this.player.body.world = this.world;
      Object.assign(this.player.body, { x: spawn.x, y: spawn.y, z: spawn.z, vx: 0, vy: 0, vz: 0 });
    }
    // respawn on dry land near where you fell (also rescues you from the sky, deep caves or the sea)
    this.player.spawnFn = () => {
      const p = this.player.body;
      return this.world.findLandSpawn(p.x + (Math.random() - 0.5) * 20, p.z + (Math.random() - 0.5) * 20, 300);
    };
    this.build.game = this;
    this.hud.setHp(this.player.hp);
    this.hud.setKills(this.player.kills);
    this.hud.setWeapon(this.weapons.weapon);
    this.viewModel.setWeapon(this.weapons.weapon);
    this.inventory = this.inventory || new Inventory(this);
    this.inventory.refreshHotbar();
    this.build.select(this.build.slot);
    this.setMode('combat');

    if (withBots) for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * 6.28 + 0.7;
      this.bots.push(new Bot(this, BOT_NAMES[i], spawn.x + Math.cos(ang) * 26, spawn.z + Math.sin(ang) * 26));
    }
  }

  wirePlayer() {
    const p = this.player;
    p.onSound = (n) => this.audio.play(n);
    p.onHurt = (amt) => { this.hud.setHp(p.hp); this.hud.damageFlash(); this.audio.play('hurt'); };
    p.onDeath = (attacker) => {
      const by = attacker?.name || attacker?.id || 'the ground';
      this.hud.killfeed(`${by} ▸ YOU`);
      this.hud.toast('ELIMINATED', 2600);
      this.net?.sendDead(by, this.myId);
      this.input.fire = false;
    };
    p.onFly = (v) => this.hud.toast(v ? 'FLY ON  (JUMP up / DUCK down)' : 'FLY OFF', 1300);
    p.onRespawn = () => { this.weapons.refillAll(); this.hud.setHp(p.hp); this.hud.setWeapon(this.weapons.weapon); this.hud.toast('DEPLOYED'); };
    this.weapons.onChange = (w) => { this.hud.setWeapon(w); this.viewModel.setWeapon(w); };
    this.build.onChange = (i) => this.hud.selectSlot(i);
  }

  onKill(attacker, victim, headshot) {
    const by = attacker === this.player ? 'YOU' : (attacker?.name || '?');
    this.hud.killfeed(`${by} ▸ ${victim.name}${headshot ? ' ◎' : ''}`);
    if (attacker !== this.player) return;
    if (victim.kind === 'villager') this.hud.toast('A VILLAGER FELL...', 2200);
    else if (victim.kind) {                                   // hunting: farm animals and fish heal you
      this.player.hp = Math.min(100, this.player.hp + 10);
      this.hud.setHp(this.player.hp);
      this.hud.toast('+10 HP', 900);
    } else { this.player.kills++; this.hud.setKills(this.player.kills); }
  }

  setMode(m) {
    this.mode = m;
    this.hud.setMode(m);
    this.viewModel.root.visible = m === 'combat';
    this.hud.toast(m === 'build' ? 'BUILD MODE' : 'COMBAT MODE', 900);
  }

  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
      if (this.paused) { this.renderer.render(this.scene, this.camera); return; }
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  frame(dt) {
    const { input, player, weapons, build } = this;
    if (input.consume('inventory')) this.inventory.toggle();
    if (this.inventory.isOpen) { input.reset(); }

    // one-shot actions
    if (input.consume('toggleBuild')) this.setMode(this.mode === 'build' ? 'combat' : 'build');
    if (input.consume('swap')) weapons.next();
    if (input.consume('swapBack')) weapons.prev();
    for (let i = 0; i < 4; i++) if (input.consume('weapon' + i)) { weapons.select(i); this.setMode('combat'); }

    const combat = this.mode === 'combat';
    player.update(dt, input);
    this.vehicles.update(dt, input, player);
    if (input.consume('cycleView')) this.rig.cycle();
    this.rig.update(dt);
    weapons.update(dt, input, player, combat);
    build.update(dt, input, player, combat);
    this.portals.update(dt, player);
    this.projectiles.update(dt);

    for (const b of this.bots) b.update(dt, player);
    this.blocks.update(player.body.x, player.body.y, player.body.z, dt);
    this.effects.update(dt);
    const env = this.environment();
    this.daynight.update(dt, player.body, env);
    this.hud.setRealm(env.realm, player.body.y);
    this.hud.setUnderwater(env.water);
    this.wildlife.update(dt, player, this.daynight.time);
    this.net?.update(dt, player, weapons.cur);

    this.syncCamera(dt);
    const w = weapons.weapon;
    this.viewModel.update(dt, {
      ads: player.ads, reloading: w.reloading, sprinting: player.sprinting,
      draw: weapons.draw, moving: Math.hypot(player.body.vx, player.body.vz) > 1, visible: combat && player.alive && !player.vehicle && !this.rig.shown && !(player.ads && w.scope),
    });
    this.hud.setAmmo(w);
    this.hud.setAds(player.ads, w.scope);
    this.hud.setTime(this.daynight.clock);
    this.renderer.render(this.scene, this.camera);
  }

  /** Where is the player? Drives fog, light, headlamp and the realm label. */
  environment() {
    const b = this.player.body, y = b.y;
    const surface = this.world.heightAt(b.x, b.z);
    const under = y < MAX_SURFACE ? Math.max(0, Math.min(1, (surface - y - 5) / 12)) : 0;
    const high = Math.max(0, Math.min(1, (y - (SKY_BASE - 20)) / 80));
    const e = this.camera.position;
    const water = this.world.fluidAt(e.x, e.y, e.z) === B.WATER;
    let realm = 'OVERWORLD';
    if (y >= SKY_BASE) realm = 'SKY REALM ' + (Math.floor((y - SKY_BASE) / SKY_BAND) + 1);
    else if (y >= MAX_SURFACE) realm = 'OPEN SKY';
    else if (y < surface - 5) realm = y < 0 ? 'UNDERWORLD' : 'CAVES';
    else if (b.inWater) realm = 'SWIMMING';
    return { under, high, water, realm };
  }

  syncCamera(dt) {
    const p = this.player, c = this.camera, e = p.eyePos;
    const pose = this.rig.pose;
    c.position.set(pose.x, pose.y, pose.z);
    c.rotation.y = pose.yaw; c.rotation.x = pose.pitch;
    c.rotation.z += ((p.alive ? 0 : 0.9) - c.rotation.z) * Math.min(1, dt * 4); // topple when dead
    if (!p.alive) c.position.y -= 0.9;
    const target = p.ads ? this.weapons.weapon.adsFov : (p.sprinting ? BASE_FOV + 6 : BASE_FOV);
    if (Math.abs(c.fov - target) > 0.05) { c.fov += (target - c.fov) * Math.min(1, dt * 12); c.updateProjectionMatrix(); }
  }
}
