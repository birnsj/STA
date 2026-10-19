import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.90). Prototype: catalogue item; specialized action not wired yet.
export class DualiticInverter extends EngineeringTool {
  static itemId = 'dualiticInverter'

  capabilities() {
    return ["engineering","plasma"]
  }

  toolTags() {
    return ["engineering","plasma","repair"]
  }
}
