import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual p.90. Prototype: bag engineering tool; no magnetic-field action yet.
export class MagneticProbe extends EngineeringTool {
  static itemId = 'magneticProbe'

  capabilities() {
    return ['engineering', 'magneticField']
  }

  toolTags() {
    return ['engineering', 'magnetic', 'probe']
  }
}
