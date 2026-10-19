import { MedicalTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.73). Prototype: catalogue item; specialized action not wired yet.
export class NeuralTransducer extends MedicalTool {
  static itemId = 'neuralTransducer'

  capabilities() {
    return ["medical","neural"]
  }

  toolTags() {
    return ["medical","neural","prosthetic"]
  }
}
