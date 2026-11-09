import { Weapon } from './Weapon.js';
/** Hold FIRE to draw, release to loose an arrow. Longer draw = faster, harder, flatter. */
export class Bow extends Weapon {
  constructor() {
    super({
      name: 'BOW', kind: 'bow', damage: 90, headMult: 2, rpm: 60, mag: 20, reserve: 40, reloadTime: 1.2,
      drawTime: 0.9, speed: 62, range: 140, auto: true, blockDamage: 0.5, adsFov: 58, moveMult: 0.95, color: 0x6a4a2a, length: 0.7, sound: 'bow',
    });
  }
}
