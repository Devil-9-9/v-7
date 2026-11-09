import { AK47 } from './AK47.js';
import { Sniper } from './Sniper.js';
import { Pistol } from './Pistol.js';
import { Shotgun } from './Shotgun.js';
import { SMG } from './SMG.js';
import { Sword } from './Sword.js';
import { Bow } from './Bow.js';
import { RocketLauncher } from './RocketLauncher.js';
import { resolveShot, falloff } from './Ballistics.js';

/**
 * Player-owned weapons: ammo, reload, recoil, ADS, spread and shot resolution.
 * `game` provides: world, blocks, effects, audio, hud, getTargets(), net, camera.
 */
export class WeaponManager {
  constructor(game) {
    this.game = game;
    this.weapons = [new AK47(), new Sniper(), new Pistol(), new Shotgun(), new SMG(), new Sword(), new Bow(), new RocketLauncher()];
    this.draw = 0;                    // bow draw 0..1
    this.cur = 0;
    this.recoilAccum = 0;
    this.wasFire = false;
    this.swapT = 0;
    this.onChange = null;
  }

  get weapon() { return this.weapons[this.cur]; }

  select(i) {
    if (i === this.cur || i < 0 || i >= this.weapons.length) return;
    this.weapon.cancelReload();
    this.cur = i; this.draw = 0;
    this.swapT = 0.35;
    this.recoilAccum = 0;
    this.onChange?.(this.weapon);
  }

  next() { this.select((this.cur + 1) % this.weapons.length); }
  prev() { this.select((this.cur + this.weapons.length - 1) % this.weapons.length); }

  refillAll() { for (const w of this.weapons) w.refill(); }

  /** Called every frame while in COMBAT mode (or always, to tick cooldowns). */
  update(dt, input, player, combatMode) {
    const w = this.weapon;
    for (const x of this.weapons) x.tick(dt);
    if (this.swapT > 0) this.swapT -= dt;

    // recoil recovery: pull the view back down toward where it started
    if (this.recoilAccum > 0) {
      const rec = Math.min(this.recoilAccum, this.recoilAccum * w.recoilRecover * dt + 0.0004);
      player.pitch -= rec; this.recoilAccum -= rec;
    }

    player.ads = combatMode && player.alive && input.aim && !w.reloading && this.swapT <= 0;
    player.speedMult = w.moveMult;
    player.lookMult = player.ads ? (w.scope ? 0.25 : 0.6) : 1;

    if (!combatMode || !player.alive) { this.wasFire = input.fire; this.draw = 0; return; }

    if (input.consume('reload') && w.startReload()) this.game.audio.play('reload');

    if (w.kind === 'bow') { this.updateBow(dt, input, player, w); this.wasFire = input.fire; return; }
    const trigger = input.fire && (w.auto || !this.wasFire);
    this.wasFire = input.fire;
    if (!trigger || this.swapT > 0 || w.reloading) return;
    if (w.kind === 'melee') { if (w.cooldown <= 0) this.swing(player, w); return; }
    if (w.ammo <= 0) {
      if (!this.wasEmptyClick) this.game.audio.play('empty');
      this.wasEmptyClick = true;
      if (w.startReload()) this.game.audio.play('reload');
      return;
    }
    this.wasEmptyClick = false;
    if (!w.canFire()) return;
    this.fire(player, w);
  }

  /** Hold to draw, release to shoot. Releasing too early just relaxes the string. */
  updateBow(dt, input, player, w) {
    const ok = this.swapT <= 0 && !w.reloading && w.ammo > 0;
    if (input.fire && ok) this.draw = Math.min(1, this.draw + dt / w.drawTime);
    else if (this.draw > 0) {
      if (!input.fire && ok && this.draw > 0.15) this.loose(player, w, this.draw);
      this.draw = 0;
    }
    if (input.fire && !this.wasFire && w.ammo <= 0) { this.game.audio.play('empty'); if (w.startReload()) this.game.audio.play('reload'); }
  }

  loose(player, w, power) {
    const g = this.game;
    w.ammo--; w.cooldown = 0.25;
    const o = player.eyePos, f = player.forward(), r = player.right();
    const p = 0.25 + 0.75 * power;                                  // power scales speed and damage
    const start = { x: o.x + f.x * 0.6 + r.x * 0.12, y: o.y + f.y * 0.6 - 0.1, z: o.z + f.z * 0.6 + r.z * 0.12 };
    const wob = (1 - power) * 0.02;                                 // a half-drawn bow is less accurate
    let d = { x: f.x + (Math.random() - 0.5) * wob, y: f.y + (Math.random() - 0.5) * wob, z: f.z + (Math.random() - 0.5) * wob };
    const len = Math.hypot(d.x, d.y, d.z); d = { x: d.x / len, y: d.y / len, z: d.z / len };
    g.projectiles.arrow(start, d, w.speed * p, w.damage * p, w);
    g.audio.play('bow'); g.viewModel.kickShot(0.5);
  }

  swing(player, w) {
    const g = this.game;
    w.cooldown = w.interval;
    g.viewModel.swing(); g.audio.play('swing');
    const o = player.eyePos, f = player.forward(), r = player.right();
    const targets = g.getTargets();
    let best = null, blockHit = null;
    for (const off of [0, -0.4, 0.4]) {                              // a short fan so a slash is forgiving
      let d = { x: f.x + r.x * off, y: f.y, z: f.z + r.z * off }; const len = Math.hypot(d.x, d.y, d.z); d = { x: d.x / len, y: d.y / len, z: d.z / len };
      const res = resolveShot(g.world, o, d, w.range, targets, player);
      if (res.kind === 'entity' && (!best || res.t < best.t)) best = res;
      else if (res.kind === 'block' && off === 0) blockHit = res;
    }
    if (best) {
      const dead = best.target.takeDamage(w.damage, player, false);
      g.hud.hitmarker(!!dead); g.audio.play(dead ? 'kill' : 'hit');
      g.effects.blockDebris(best.point.x - 0.5, best.point.y - 0.5, best.point.z - 0.5, 7, 2, 2.2);
    } else if (blockHit) {
      g.blocks.hit(blockHit.block.x, blockHit.block.y, blockHit.block.z, w.blockDamage);
    }
  }

  fire(player, w) {
    const g = this.game;
    w.consumeShot();
    if (w.kind === 'rocket') {
      const o = player.eyePos, f = player.forward(), r = player.right();
      g.projectiles.rocket({ x: o.x + f.x * 0.9 + r.x * 0.2, y: o.y + f.y * 0.9 - 0.15, z: o.z + f.z * 0.9 + r.z * 0.2 }, f, w);
      g.audio.play(w.sound); g.viewModel.kickShot(1.5);
      player.pitch = Math.min(1.5, player.pitch + w.recoilPitch); this.recoilAccum += w.recoilPitch * 0.85;
      return;
    }
    g.audio.play(w.sound);
    g.viewModel.kickShot(w.pellets > 1 ? 1.2 : 0.7);

    // spread: tighter when aiming / crouched, wider when moving or airborne
    const b = player.body;
    const moving = Math.hypot(b.vx, b.vz) > 1.5;
    let spread = w.spread * (player.ads ? w.adsSpreadMult : 1) * (moving ? 1.5 : 1) * (player.crouching ? 0.7 : 1) * (b.onGround ? 1 : 2.2);

    const o = player.eyePos;
    const f = player.forward(), r = player.right();
    const up = { x: -Math.sin(player.pitch) * Math.sin(player.yaw), y: Math.cos(player.pitch), z: -Math.sin(player.pitch) * Math.cos(player.yaw) };
    const muzzle = { x: o.x + f.x * 0.7 + r.x * 0.18, y: o.y + f.y * 0.7 - 0.12, z: o.z + f.z * 0.7 + r.z * 0.18 };
    g.effects.muzzle(g.v3(muzzle));

    const targets = g.getTargets();
    let hitAny = false, killed = false;
    for (let p = 0; p < w.pellets; p++) {
      const sx = (Math.random() - 0.5) * 2 * spread, sy = (Math.random() - 0.5) * 2 * spread;
      let d = { x: f.x + r.x * sx + up.x * sy, y: f.y + up.y * sy, z: f.z + r.z * sx + up.z * sy + 0 };
      const len = Math.hypot(d.x, d.y, d.z); d = { x: d.x / len, y: d.y / len, z: d.z / len };
      const res = resolveShot(g.world, o, d, w.range, targets, player);
      g.effects.tracer(g.v3(muzzle), g.v3(res.point));
      g.net?.sendShot(muzzle, res.point, this.cur);

      if (res.kind === 'entity') {
        const dmg = w.damage * falloff(res.t, w.range) * (res.headshot ? w.headMult : 1);
        const dead = res.target.takeDamage(dmg, player, res.headshot);
        hitAny = true; killed = killed || !!dead;
        g.effects.blockDebris(res.point.x - 0.5, res.point.y - 0.5, res.point.z - 0.5, 7, 2, 2.2); // blood-ish sparks
      } else if (res.kind === 'block') {
        const bl = res.block;
        g.blocks.hit(bl.x, bl.y, bl.z, w.blockDamage);
        g.effects.impact(res.point.x, res.point.y, res.point.z, bl.id);
      }
    }
    if (hitAny) g.hud.hitmarker(killed);
    if (hitAny) g.audio.play(killed ? 'kill' : 'hit');

    // recoil: pitch kicks up (recovers later), yaw wobbles
    const kick = w.recoilPitch * (player.ads ? 0.7 : 1) * (0.85 + Math.random() * 0.3);
    player.pitch = Math.min(1.5, player.pitch + kick);
    this.recoilAccum += kick * 0.85;
    player.yaw += (Math.random() - 0.5) * 2 * w.recoilYaw;
  }
}
