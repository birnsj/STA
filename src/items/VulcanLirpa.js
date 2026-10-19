import { EquippableWeapon } from './InventoryItem.js'

// Book: TM p.95; Heavy Blade. Combat stats in weapons.json.
export class VulcanLirpa extends EquippableWeapon {
  static itemId = 'vulcanLirpa'

  capabilities() {
    return ['weapon', 'meleeWeapon']
  }

  toolTags() {
    return ["weapon","melee","vulcan","blade"]
  }

  combatWeaponId() {
    return 'vulcanLirpa'
  }
}
