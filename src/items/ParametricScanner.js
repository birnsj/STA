import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.91). Prototype: catalogue item; specialized action not wired yet.
export class ParametricScanner extends EngineeringTool {
  static itemId = 'parametricScanner'

  capabilities() {
    return ["engineering","scan"]
  }

  toolTags() {
    return ["engineering","scan"]
  }
}
