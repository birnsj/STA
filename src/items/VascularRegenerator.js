import { MedicalTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.73). Prototype: catalogue item; specialized action not wired yet.
export class VascularRegenerator extends MedicalTool {
  static itemId = 'vascularRegenerator'

  capabilities() {
    return ["medical","trauma"]
  }

  toolTags() {
    return ["medical","trauma","vascular"]
  }
}
