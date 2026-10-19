import { EquippableWeapon } from './InventoryItem.js'

// Book: Core p.243 / p.355. Combat stats in weapons.json.
export class DisruptorPistol extends EquippableWeapon {
  static itemId = 'disruptorPistol'

  capabilities() {
    return ['weapon', 'rangedWeapon']
  }

  toolTags() {
    return ["weapon","disruptor","ranged"]
  }

  combatWeaponId() {
    return 'disruptorPistol'
  }
}
