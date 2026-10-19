import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual p.91. Prototype: bag engineering tool; no ODN repair challenge hook yet.
export class OdnRecoupler extends EngineeringTool {
  static itemId = 'odnRecoupler'

  capabilities() {
    return ['engineering', 'odnRepair']
  }

  toolTags() {
    return ['engineering', 'odn', 'fiber', 'network']
  }
}
