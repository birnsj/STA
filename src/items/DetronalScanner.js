import { MedicalTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.72). Prototype: catalogue item; specialized action not wired yet.
export class DetronalScanner extends MedicalTool {
  static itemId = 'detronalScanner'

  capabilities() {
    return ["medical","scan"]
  }

  toolTags() {
    return ["medical","scan","dna"]
  }
}
