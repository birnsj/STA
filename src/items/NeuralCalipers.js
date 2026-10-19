import { MedicalTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.73). Prototype: catalogue item; specialized action not wired yet.
export class NeuralCalipers extends MedicalTool {
  static itemId = 'neuralCalipers'

  capabilities() {
    return ["medical","neural"]
  }

  toolTags() {
    return ["medical","neural","anesthesia"]
  }
}
