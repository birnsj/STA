import { MedicalTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.73). Prototype: catalogue item; specialized action not wired yet.
export class SonicSeparator extends MedicalTool {
  static itemId = 'sonicSeparator'

  capabilities() {
    return ["medical","surgery"]
  }

  toolTags() {
    return ["medical","surgery","sonic"]
  }
}
