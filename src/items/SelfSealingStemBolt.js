import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.91). Prototype: catalogue item; specialized action not wired yet.
export class SelfSealingStemBolt extends EngineeringTool {
  static itemId = 'selfSealingStemBolt'

  capabilities() {
    return ["engineering","parts"]
  }

  toolTags() {
    return ["engineering","fastener","parts"]
  }
}
