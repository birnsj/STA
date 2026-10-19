import { EquippableWeapon } from './InventoryItem.js'

// Book: Core p.355; TM p.94. Combat stats in weapons.json.
export class DkTahg extends EquippableWeapon {
  static itemId = 'dkTahg'

  capabilities() {
    return ['weapon', 'meleeWeapon']
  }

  toolTags() {
    return ["weapon","melee","klingon","blade"]
  }

  combatWeaponId() {
    return 'dkTahg'
  }
}
