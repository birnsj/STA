import { EquippableWeapon } from './InventoryItem.js'

// Book: TM p.96; Phase Pistol analogue. Combat stats in weapons.json.
export class LaserPistol2250 extends EquippableWeapon {
  static itemId = 'laserPistol2250'

  capabilities() {
    return ['weapon', 'rangedWeapon']
  }

  toolTags() {
    return ["weapon","laser","ranged"]
  }

  combatWeaponId() {
    return 'laserPistol2250'
  }
}
