import { MedicalTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.72). Prototype: catalogue item; specialized action not wired yet.
export class CorticalStimulator extends MedicalTool {
  static itemId = 'corticalStimulator'

  capabilities() {
    return ["medical","neural"]
  }

  toolTags() {
    return ["medical","neural"]
  }
}
