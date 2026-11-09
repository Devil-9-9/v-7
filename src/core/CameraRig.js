import { makeHumanoid, animateHumanoid } from '../player/Humanoid.js';
import { modelReady, loadModel, gfx } from '../player/Model.js';

export const VIEWS = ['first', 'back', 'front'];
const LABEL = { first: 'FIRST PERSON (your eyes)', back: 'THIRD PERSON (behind you)', front: 'FRONT VIEW (look at yourself)' };
const KEY = 'blockops.view.v1';

/** Camera views: first person, third person behind the shoulder, and a front view that looks back at your character.
 *  In third person the crosshair still shoots where it points: the aim direction is re-aimed from your eyes to what the crosshair sees. */
export class CameraRig {
  constructor(game) {
    this.g = game; this.avatar = null; this.avatarKey = ''; this.d = 3.4; this.aimed = false;
    this.pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    let v = 'first'; try { const s = localStorage.getItem(KEY); if (VIEWS.includes(s)) v = s; } catch (_) { /* storage blocked */ }
    this.view = v;
    this.prevPos = null;
  }

  cycle() {
    this.view = VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length];
    try { localStorage.setItem(KEY, this.view); } catch (_) { /* ignore */ }
    this.d = 1; this.g.hud.toast('CAMERA: ' + LABEL[this.view], 1500);
  }

  dispose() { if (this.avatar) this.g.scene.remove(this.avatar); this.avatar = null; this.avatarKey = ''; }

  /** Your own character, shown in the third-person views. Rebuilt when the model finishes downloading. */
  ensureAvatar() {
    const look = this.g.getLook?.() || null;
    const want = look && look.model && look.model !== 'blocky' && gfx.models && modelReady(look.model) ? look.model : 'blocky';
    if (look && look.model && look.model !== 'blocky' && gfx.models && !modelReady(look.model)) loadModel(look.model);
    const key = want + JSON.stringify(look || {});
    if (this.avatar && key === this.avatarKey) return;
    if (this.avatar) this.g.scene.remove(this.avatar);
    this.avatar = makeHumanoid(0x2f7fd0, true, look || undefined);
    this.avatarKey = key;
    this.g.scene.add(this.avatar);
  }

  /** Work out the camera for this frame (and the aim direction). Call after the player moved, before weapons. */
  update(dt) {
    const g = this.g, p = g.player, e = p.eyePos, w = g.world;
    const pose = this.pose;
    p.aimDir = null; this.aimed = false;
    let view = this.view;
    if (p.vehicle) view = 'vehicle';
    else if (p.ads && g.weapons.weapon.scope) view = 'first';            // scopes always look through the scope
    if (!p.alive && view !== 'first') view = 'back';

    const cp = Math.cos(p.pitch), f = { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
    pose.yaw = p.yaw; pose.pitch = p.pitch;
    if (view === 'first') { pose.x = e.x; pose.y = e.y; pose.z = e.z; }
    else if (view === 'vehicle') { const c = g.vehicles.cameraPos(p); pose.x = c.x; pose.y = c.y; pose.z = c.z; }
    else {
      const sign = view === 'back' ? -1 : 1, want = view === 'back' ? 3.4 : 3.2;
      const o = { x: e.x, y: e.y + 0.15, z: e.z };
      const hit = w.raycast(o.x, o.y, o.z, sign * f.x, sign * f.y, sign * f.z, want + 0.4);
      let tgt = hit ? Math.max(0.5, hit.dist - 0.35) : want;
      this.d = tgt < this.d ? tgt : this.d + (tgt - this.d) * Math.min(1, dt * 6);   // snap in when a wall is behind you, ease back out
      pose.x = o.x + sign * f.x * this.d; pose.y = o.y + sign * f.y * this.d; pose.z = o.z + sign * f.z * this.d;
      if (view === 'front') { pose.yaw = p.yaw + Math.PI; pose.pitch = -p.pitch; }
      else {                                                                           // shoot where the crosshair points, not where the eyes point
        const t = w.raycast(pose.x, pose.y, pose.z, f.x, f.y, f.z, 150);
        const far = t ? t.dist : 150;
        const T = { x: pose.x + f.x * far, y: pose.y + f.y * far, z: pose.z + f.z * far };
        const d = { x: T.x - e.x, y: T.y - e.y, z: T.z - e.z }, len = Math.hypot(d.x, d.y, d.z);
        if (len > 2 && (d.x * f.x + d.y * f.y + d.z * f.z) / len > 0.5) { p.aimDir = { x: d.x / len, y: d.y / len, z: d.z / len }; this.aimed = true; }
      }
    }
    this.shown = view === 'back' || view === 'front' ? true : false;

    // avatar
    if (this.shown) {
      this.ensureAvatar();
      const a = this.avatar, b = p.body;
      a.visible = p.alive;
      a.position.set(b.x, b.y, b.z); a.rotation.y = p.yaw + Math.PI;
      const prev = this.prevPos || b, sp = Math.hypot(b.x - prev.x, b.z - prev.z) / Math.max(dt, 1e-3);
      animateHumanoid(a, dt, p.flying ? 0 : Math.min(sp, 9));
    } else if (this.avatar) this.avatar.visible = false;
    this.prevPos = { x: p.body.x, z: p.body.z };
  }
}
