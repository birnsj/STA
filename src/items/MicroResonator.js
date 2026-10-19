import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.91). Prototype: catalogue item; specialized action not wired yet.
export class MicroResonator extends EngineeringTool {
  static itemId = 'microResonator'

  capabilities() {
    return ["engineering","magnetic"]
  }

  toolTags() {
    return ["engineering","magnetic","stealth"]
  }
}
