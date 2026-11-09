import { Weapon } from './Weapon.js';
export class SMG extends Weapon {
  constructor() {
    super({
      name: 'SMG', damage: 15, headMult: 1.8, rpm: 850, mag: 32, reserve: 128, reloadTime: 1.9,
      spread: 0.028, adsSpreadMult: 0.45, recoilPitch: 0.008, recoilYaw: 0.006, recoilRecover: 9,
      range: 55, auto: true, blockDamage: 0.8, adsFov: 62, moveMult: 1.05, color: 0x2a2e36, length: 0.5, sound: 'smg',
    });
  }
}
