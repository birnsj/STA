import { EquippableWeapon } from './InventoryItem.js'

// Book: STA 2e Technical Manual p.97 (Phaser Rifle circa 2264); combat numbers from Core weapons table via weapons.json.
export class PhaserRifle2264 extends EquippableWeapon {
  static itemId = 'phaserRifle'

  capabilities() {
    return ['weapon', 'rangedWeapon']
  }

  toolTags() {
    return ['weapon', 'phaser', 'rifle', 'ranged']
  }

  combatWeaponId() {
    return 'phaserRifle'
  }
}
