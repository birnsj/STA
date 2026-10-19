import { MedicalTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.72). Prototype: catalogue item; specialized action not wired yet.
export class CytoplasmicStimulator extends MedicalTool {
  static itemId = 'cytoplasmicStimulator'

  capabilities() {
    return ["medical","cellular"]
  }

  toolTags() {
    return ["medical","cellular"]
  }
}
