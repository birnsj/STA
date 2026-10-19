// Behavior facade for inventory item *types* (plan 2026-10-18): static definitions stay in items.json;
// each concrete subclass declares capabilities / challenge hints without owning drop-pickup state.
// Runtime placement remains world/GroundItem.js + rules/inventory.js.

export class InventoryItem {
  static itemId = null

  constructor(itemId = this.constructor.itemId) {
    this.itemId = itemId
  }

  // Stable capability tags for UI / future challenge matching. Not combat or healing mechanics.
  capabilities() {
    return []
  }

  // Soft tags a challenge approach *could* match later (no auto-solve).
  toolTags() {
    return []
  }

  challengeHints() {
    return this.toolTags()
  }

  // Combat weapons.json id when this item is an equippable weapon; null otherwise.
  combatWeaponId() {
    return null
  }
}

export class HandheldComputer extends InventoryItem {
  capabilities() {
    return ['dataAccess']
  }

  toolTags() {
    return ['computer', 'data', 'records']
  }
}

export class MedicalTool extends InventoryItem {
  capabilities() {
    return ['medical']
  }

  toolTags() {
    return ['medical']
  }
}

export class EngineeringTool extends InventoryItem {
  capabilities() {
    return ['engineering']
  }

  toolTags() {
    return ['engineering', 'repair']
  }
}

export class EquippableWeapon extends InventoryItem {
  capabilities() {
    return ['weapon']
  }

  combatWeaponId() {
    return this.itemId
  }
}
