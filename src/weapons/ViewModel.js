import * as THREE from 'three';

/** First-person gun made of boxes, parented to the camera. Handles ADS slide, recoil kick, reload dip, walk bob. */
export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    camera.add(this.root);
    this.gun = new THREE.Group();
    this.root.add(this.gun);
    this.kick = 0; this.ads = 0; this.bob = 0; this.reload = 0; this.swingT = 0; this.bowString = this.bowArrow = null;
    this.mat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    this.dark = new THREE.MeshLambertMaterial({ color: 0x151515 });
    this.hand = new THREE.MeshLambertMaterial({ color: 0xe0b48a });
    this.parts = [];
  }

  setWeapon(w) {
    for (const p of this.parts) { this.gun.remove(p); p.geometry.dispose(); }
    this.parts = [];
    const add = (sx, sy, sz, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(x, y, z); this.gun.add(m); this.parts.push(m); return m;
    };
    const body = new THREE.MeshLambertMaterial({ color: w.color });
    const L = w.length;
    this.bowString = this.bowArrow = null;
    if (w.kind === 'melee') {                                  // sword: long flat blade, guard, grip
      const steel = new THREE.MeshLambertMaterial({ color: w.color });
      add(0.012, 0.075, 0.62, 0, 0.03, -0.42, steel);          // blade
      add(0.02, 0.02, 0.62, 0, 0.0, -0.42, this.dark);        // spine
      add(0.03, 0.2, 0.035, 0, 0.0, -0.1, this.dark);         // cross guard
      add(0.04, 0.045, 0.2, 0, -0.01, 0.02, this.mat);        // grip
      add(0.07, 0.07, 0.1, 0.0, -0.03, 0.06, this.hand);
    } else if (w.kind === 'bow') {                             // bow: two limbs, a grip, a string and a nocked arrow
      const wood = new THREE.MeshLambertMaterial({ color: w.color });
      const limbU = add(0.025, 0.34, 0.025, 0, 0.2, -0.36, wood); limbU.rotation.x = -0.35;
      const limbL = add(0.025, 0.34, 0.025, 0, -0.2, -0.36, wood); limbL.rotation.x = 0.35;
      add(0.04, 0.16, 0.04, 0, 0, -0.3, this.dark);
      this.bowString = add(0.006, 0.7, 0.006, 0, 0, -0.3, this.hand);
      this.bowArrow = add(0.012, 0.012, 0.62, 0, 0.0, -0.45, new THREE.MeshLambertMaterial({ color: 0xcaa060 }));
      add(0.07, 0.07, 0.1, 0, -0.02, -0.28, this.hand);
    } else if (w.kind === 'rocket') {                          // launcher tube
      const olive = new THREE.MeshLambertMaterial({ color: w.color });
      add(0.14, 0.14, L + 0.2, 0, 0.02, -L / 2 - 0.02, olive);
      add(0.18, 0.18, 0.12, 0, 0.02, 0.1, this.dark);          // rear flare
      add(0.18, 0.18, 0.08, 0, 0.02, -L - 0.05, this.dark);   // muzzle ring
      add(0.05, 0.14, 0.07, 0, -0.14, -L * 0.3, this.dark);   // grip
      add(0.03, 0.06, 0.1, 0, 0.12, -L * 0.45, this.dark);    // sight
      add(0.07, 0.07, 0.12, 0.02, -0.05, 0.0, this.hand);
    } else {
      add(0.07, 0.1, L, 0, 0, -L / 2, body);                 // receiver / barrel
      add(0.04, 0.04, L * 0.45, 0, 0.02, -L - L * 0.2, this.dark); // barrel extension
      add(0.06, 0.16, 0.08, 0, -0.12, -L * 0.15, this.dark); // grip
      if (w.scope) add(0.05, 0.05, 0.28, 0, 0.09, -L * 0.45, this.dark);
      else add(0.015, 0.03, 0.015, 0, 0.065, -L * 0.9, this.dark); // front sight
      if (w.mag > 6) add(0.05, 0.2, 0.08, 0, -0.14, -L * 0.5, this.dark); // magazine
      add(0.07, 0.07, 0.14, 0.02, -0.04, 0.02, this.hand);   // hand
    }
    this.root.visible = true;
  }

  swing() { this.swingT = 1; }

  kickShot(amount = 1) { this.kick = Math.min(1.5, this.kick + amount); }

  update(dt, { ads, reloading, moving, sprinting, visible, draw = 0 }) {
    this.root.visible = visible;
    this.ads += ((ads ? 1 : 0) - this.ads) * Math.min(1, dt * 14);
    this.reload += ((reloading ? 1 : 0) - this.reload) * Math.min(1, dt * 8);
    this.kick *= Math.max(0, 1 - dt * 16);
    this.bob += dt * (sprinting ? 12 : 8) * (moving ? 1 : 0.2);
    const bobAmt = moving ? (sprinting ? 0.02 : 0.01) * (1 - this.ads) : 0.002;
    const hip = { x: 0.24, y: -0.22, z: -0.45 };
    const adsP = { x: 0.0, y: -0.115, z: -0.35 };
    const lerp = (a, b) => a + (b - a) * this.ads;
    this.root.position.set(
      lerp(hip.x, adsP.x) + Math.sin(this.bob) * bobAmt,
      lerp(hip.y, adsP.y) + Math.abs(Math.cos(this.bob)) * bobAmt - this.reload * 0.18,
      lerp(hip.z, adsP.z) + this.kick * 0.07,
    );
    this.root.rotation.set(this.kick * 0.08 + this.reload * 0.6 + (sprinting ? 0.35 : 0), sprinting ? 0.4 : 0, this.reload * -0.3);
    if (this.swingT > 0) {                                      // sword slash: sweeps across the screen and back
      this.swingT = Math.max(0, this.swingT - dt / 0.32);
      const a = Math.sin((1 - this.swingT) * Math.PI);
      this.root.position.x -= a * 0.28; this.root.position.y += a * 0.06;
      this.root.rotation.x += a * 0.7; this.root.rotation.y -= a * 0.9; this.root.rotation.z += a * 0.9;
    }
    if (this.bowString) {                                       // string and arrow slide back while drawing
      this.bowString.position.z = -0.3 + draw * 0.28;
      this.bowArrow.position.z = -0.45 + draw * 0.28;
      this.root.position.x -= draw * 0.05;
    }
  }
}
