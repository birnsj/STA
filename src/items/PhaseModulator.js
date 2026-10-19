import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.91). Prototype: catalogue item; specialized action not wired yet.
export class PhaseModulator extends EngineeringTool {
  static itemId = 'phaseModulator'

  capabilities() {
    return ["engineering","odn"]
  }

  toolTags() {
    return ["engineering","odn","optics"]
  }
}
