import { MedicalTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.72). Prototype: catalogue item; specialized action not wired yet.
export class DermalStimulator extends MedicalTool {
  static itemId = 'dermalStimulator'

  capabilities() {
    return ["medical","dermal"]
  }

  toolTags() {
    return ["medical","dermal"]
  }
}
