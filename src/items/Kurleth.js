import { EquippableWeapon } from './InventoryItem.js'

// Book: TM p.94; Core Blade. Combat stats in weapons.json.
export class Kurleth extends EquippableWeapon {
  static itemId = 'kurleth'

  capabilities() {
    return ['weapon', 'meleeWeapon']
  }

  toolTags() {
    return ["weapon","melee","klingon","blade"]
  }

  combatWeaponId() {
    return 'kurleth'
  }
}
