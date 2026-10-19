import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual p.90. Prototype: bag engineering tool; no bypass action yet.
export class Hyperspanner extends EngineeringTool {
  static itemId = 'hyperspanner'

  capabilities() {
    return ['engineering', 'bypassElectronics']
  }

  toolTags() {
    return ['engineering', 'repair', 'bypass', 'electronics']
  }
}
