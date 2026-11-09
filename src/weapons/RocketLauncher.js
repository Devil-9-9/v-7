import { Weapon } from './Weapon.js';
/** Slow rocket, big blast: hurts everything nearby and blows holes in blocks. Stay out of your own blast. */
export class RocketLauncher extends Weapon {
  constructor() {
    super({
      name: 'ROCKET', kind: 'rocket', damage: 120, headMult: 1, rpm: 50, mag: 1, reserve: 6, reloadTime: 2.6,
      speed: 30, radius: 4.5, spread: 0.004, recoilPitch: 0.05, recoilYaw: 0.01, recoilRecover: 5,
      range: 160, auto: false, blockDamage: 14, adsFov: 62, moveMult: 0.85, color: 0x4a5a30, length: 0.9, sound: 'rocket',
    });
  }
}
