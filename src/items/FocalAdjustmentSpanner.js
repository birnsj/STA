import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.90). Prototype: catalogue item; specialized action not wired yet.
export class FocalAdjustmentSpanner extends EngineeringTool {
  static itemId = 'focalAdjustmentSpanner'

  capabilities() {
    return ["engineering","optics"]
  }

  toolTags() {
    return ["engineering","optics","repair"]
  }
}
