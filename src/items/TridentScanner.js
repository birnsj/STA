import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual p.91. Prototype: bag engineering tool; no circuit-diagnose challenge hook yet.
export class TridentScanner extends EngineeringTool {
  static itemId = 'tridentScanner'

  capabilities() {
    return ['engineering', 'diagnoseCircuits']
  }

  toolTags() {
    return ['engineering', 'scan', 'circuits', 'powerRelay']
  }
}
