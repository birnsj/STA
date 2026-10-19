import { EquippableWeapon } from './InventoryItem.js'

// Book: TM p.97; Core Type-3. Combat stats in weapons.json.
export class PhaserRifle2255 extends EquippableWeapon {
  static itemId = 'phaserRifle2255'

  capabilities() {
    return ['weapon', 'rangedWeapon']
  }

  toolTags() {
    return ["weapon","phaser","rifle","ranged"]
  }

  combatWeaponId() {
    return 'phaserRifle2255'
  }
}
