import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual p.91. Prototype: bag engineering tool; no cutting / map-edit action yet.
export class PlasmaTorch extends EngineeringTool {
  static itemId = 'plasmaTorch'

  capabilities() {
    return ['engineering', 'cut']
  }

  toolTags() {
    return ['engineering', 'cut', 'plasma', 'breach']
  }
}
