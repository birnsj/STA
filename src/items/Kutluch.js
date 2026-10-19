import { EquippableWeapon } from './InventoryItem.js'

// Book: TM p.94; Knife/Dagger. Combat stats in weapons.json.
export class Kutluch extends EquippableWeapon {
  static itemId = 'kutluch'

  capabilities() {
    return ['weapon', 'meleeWeapon']
  }

  toolTags() {
    return ["weapon","melee","klingon","blade"]
  }

  combatWeaponId() {
    return 'kutluch'
  }
}
