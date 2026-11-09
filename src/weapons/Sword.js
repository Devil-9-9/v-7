import { Weapon } from './Weapon.js';
/** Melee: tap to slash whatever is in reach (also chops blocks). No ammo. */
export class Sword extends Weapon {
  constructor() {
    super({
      name: 'SWORD', kind: 'melee', infinite: true, damage: 60, headMult: 1, rpm: 100, mag: 1, reserve: 0, reloadTime: 0,
      range: 3.4, auto: false, blockDamage: 2, adsFov: 75, moveMult: 1.15, color: 0xc8d2e0, length: 0.7, sound: 'swing',
    });
  }
  startReload() { return false; }
  refill() { this.ammo = 1; this.cooldown = 0; }
}
