import { EquippableWeapon } from './InventoryItem.js'

// Book: STA 2e Technical Manual p.94; Core weapons table (Bat'leth). Combat stats in weapons.json.
export class KlingonBatleth extends EquippableWeapon {
  static itemId = 'klingonBatleth'

  capabilities() {
    return ['weapon', 'meleeWeapon']
  }

  toolTags() {
    return ['weapon', 'melee', 'klingon', 'blade']
  }

  combatWeaponId() {
    return 'klingonBatleth'
  }
}
