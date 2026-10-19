import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual p.90. Prototype: bag engineering tool; no flux-bridge action yet.
export class FluxCoupler extends EngineeringTool {
  static itemId = 'fluxCoupler'

  capabilities() {
    return ['engineering', 'fluxBridge']
  }

  toolTags() {
    return ['engineering', 'flux', 'bridge', 'power']
  }
}
