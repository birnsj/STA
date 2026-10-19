import { EquippableWeapon } from './InventoryItem.js'

// Book: TM p.94; Blade adaptation. Combat stats in weapons.json.
export class Gintak extends EquippableWeapon {
  static itemId = 'gintak'

  capabilities() {
    return ['weapon', 'meleeWeapon']
  }

  toolTags() {
    return ["weapon","melee","klingon","spear"]
  }

  combatWeaponId() {
    return 'gintak'
  }
}
