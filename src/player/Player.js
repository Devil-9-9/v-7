import {
  MAX_HP, PLAYER_HEIGHT, PLAYER_EYE, PLAYER_CROUCH_HEIGHT, PLAYER_CROUCH_EYE, PLAYER_RADIUS,
  WALK_SPEED, SPRINT_SPEED, CROUCH_SPEED, JUMP_SPEED, FLY_SPEED, FLY_SPRINT, FLY_VERT,
} from '../core/Constants.js';
import { VoxelBody } from './VoxelBody.js';

const LOOK_SENS = 0.0022;

export class Player {
  constructor(world, spawn) {
    this.world = world;
    this.body = new VoxelBody(world, spawn.x, spawn.y, spawn.z, PLAYER_RADIUS, PLAYER_HEIGHT);
    this.yaw = 0; this.pitch = 0;
    this.hp = MAX_HP; this.alive = true; this.respawnT = 0;
    this.kills = 0; this.deaths = 0;
    this.crouching = false; this.sprinting = false; this.ads = false;
    this.eye = PLAYER_EYE;
    this.speedMult = 1; this.lookMult = 1; this.sens = 1;
    this.stepT = 0;
    this.flying = false; this._jumpPrev = false; this._tapT = 0; this.onFly = null;
    this.vehicle = null;                       // set by VehicleManager while driving
    this.aimDir = null; this.camYaw = 0;                           // free-look offset while driving
    this.onHurt = null; this.onDeath = null; this.onRespawn = null; this.onSound = null;
    this.spawnFn = () => spawn;
    this.id = 'me';
  }

  /* target interface used by Ballistics */
  get pos() { return this.body; }
  get radius() { return PLAYER_RADIUS; }
  get height() { return this.body.height; }
  get eyePos() { return { x: this.body.x, y: this.body.y + this.eye, z: this.body.z }; }

  forward() {
    if (this.aimDir) return this.aimDir;        // third person: aimed from the eyes at what the crosshair sees
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }
  right() { return { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) }; }

  takeDamage(amount, attacker = null, headshot = false) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.onHurt?.(amount, attacker, headshot);
    if (this.hp <= 0) {
      this.alive = false; this.deaths++; this.respawnT = 3;
      this.onDeath?.(attacker, headshot);
      return true;
    }
    return false;
  }

  setFlying(v) {
    if (v === this.flying) return;
    this.flying = v; this.body.flying = v;
    if (v) { this.crouching = false; this.body.height = PLAYER_HEIGHT; this.body.vy = 0; }
    this.onFly?.(v);
  }

  respawn() {
    const s = this.spawnFn();
    Object.assign(this.body, { x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0 });
    this.hp = MAX_HP; this.alive = true; this.crouching = false; this.setFlying(false);
    this.onRespawn?.();
  }

  update(dt, input) {
    if (!this.alive) {
      this.respawnT -= dt;
      this.body.vx = this.body.vz = 0;
      this.body.step(dt);
      if (this.respawnT <= 0) this.respawn();
      return;
    }
    const b = this.body;
    if (this.vehicle) {                                         // driving: only the look is ours, VehicleManager moves everything else
      const [vx, vy] = input.consumeLook();
      const k = LOOK_SENS * this.lookMult * this.sens;
      this.camYaw -= vx * k; this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - vy * k));
      this._jumpPrev = input.jump; input.flying = false; input.consume('toggleFly');
      return;
    }

    // look (scaled down when aiming so scopes stay controllable)
    const [dx, dy] = input.consumeLook();
    const s = LOOK_SENS * this.lookMult * this.sens;
    this.yaw -= dx * s;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * s));

    // fly toggle: double-tap JUMP (SPACE) or the FLY button / Z key
    const jumpEdge = input.jump && !this._jumpPrev; this._jumpPrev = input.jump;
    this._tapT -= dt;
    if (jumpEdge) { if (this._tapT > 0) { this.setFlying(!this.flying); this._tapT = 0; input.crouch = false; } else this._tapT = 0.32; }
    if (input.consume('toggleFly')) { this.setFlying(!this.flying); input.crouch = false; }
    input.flying = this.flying;

    // stance (while flying DUCK means "go down", it does not shrink you)
    const wantCrouch = input.crouch && !this.flying;
    if (wantCrouch && !this.crouching) { this.crouching = true; b.height = PLAYER_CROUCH_HEIGHT; }
    else if (!wantCrouch && this.crouching && b.canStand(PLAYER_HEIGHT)) { this.crouching = false; b.height = PLAYER_HEIGHT; }
    const eyeTarget = this.crouching ? PLAYER_CROUCH_EYE : PLAYER_EYE;
    this.eye += (eyeTarget - this.eye) * Math.min(1, dt * 14);

    // movement
    const fwd = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const rgt = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    let mx = input.moveX, mz = input.moveZ;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }
    this.sprinting = input.sprint && mz > 0.3 && !this.crouching && !this.ads;
    const base = this.crouching ? CROUCH_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED;
    const flySpeed = this.sprinting || input.sprint ? FLY_SPRINT : FLY_SPEED;
    const speed = this.flying ? flySpeed : base * this.speedMult * (this.ads ? 0.6 : 1) * (b.inWater ? 0.65 : b.inLava ? 0.35 : 1);
    const tx = (fwd.x * mz + rgt.x * mx) * speed;
    const tz = (fwd.z * mz + rgt.z * mx) * speed;
    const accel = this.flying ? 6 : b.onGround ? 14 : 3;
    const k = Math.min(1, accel * dt);
    b.vx += (tx - b.vx) * k;
    b.vz += (tz - b.vz) * k;

    if (this.flying) {
      // fly: JUMP = up, DUCK = down, otherwise hover. Works at any height, in the sky realms and in the underworld.
      const want = (input.jump ? 1 : 0) - (input.crouch ? 1 : 0);
      const vt = want * (input.sprint ? FLY_VERT * 2 : FLY_VERT);
      b.vy += (vt - b.vy) * Math.min(1, 8 * dt);
      if (input.crouch && b.onGround) { this.setFlying(false); input.crouch = false; }   // touch down = walk again
    } else if (b.inWater || b.inLava) {
      // swim: hold JUMP to rise (or climb out onto a ledge), DUCK to dive
      if (input.jump) { if (b.blockedX || b.blockedZ) b.vy = JUMP_SPEED; else b.vy = Math.min(3.6, b.vy + 22 * dt); }
      else if (input.crouch) b.vy = Math.max(-3.6, b.vy - 18 * dt);
    } else if (input.jump && b.onGround && !this.crouching) { b.vy = JUMP_SPEED; this.onSound?.('jump'); }
    b.step(dt);

    // lava burns hard, in ticks so the damage flash/sound don't fire every frame
    if (b.inLava && !this.flying) {
      this.lavaAcc = (this.lavaAcc || 0) + 40 * dt;
      if (this.lavaAcc >= 6) { this.lavaAcc -= 6; this.takeDamage(6, { name: 'LAVA', id: 'LAVA' }); }
    } else this.lavaAcc = 0;

    // fall damage (g = 9.81: a 4-block drop lands at ~8.9 m/s, safe; 8 blocks ~12.5 m/s, hurts)
    if (b.landedSpeed > 11) this.takeDamage((b.landedSpeed - 11) * 9, null);
    // footsteps
    const hs = Math.hypot(b.vx, b.vz);
    if (b.onGround && hs > 1.5) {
      this.stepT -= dt * hs;
      if (this.stepT <= 0) { this.stepT = 2.4; this.onSound?.('step'); }
    }
  }
}
