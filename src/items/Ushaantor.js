import { EquippableWeapon } from './InventoryItem.js'

// Book: TM p.95; Core Blade. Combat stats in weapons.json.
export class Ushaantor extends EquippableWeapon {
  static itemId = 'ushaantor'

  capabilities() {
    return ['weapon', 'meleeWeapon']
  }

  toolTags() {
    return ["weapon","melee","andorian","blade"]
  }

  combatWeaponId() {
    return 'ushaantor'
  }
}
