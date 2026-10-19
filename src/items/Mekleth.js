import { EquippableWeapon } from './InventoryItem.js'

// Book: TM p.95; Core Blade. Combat stats in weapons.json.
export class Mekleth extends EquippableWeapon {
  static itemId = 'mekleth'

  capabilities() {
    return ['weapon', 'meleeWeapon']
  }

  toolTags() {
    return ["weapon","melee","klingon","blade"]
  }

  combatWeaponId() {
    return 'mekleth'
  }
}
