import { MedicalTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.73). Prototype: catalogue item; specialized action not wired yet.
export class NeuralStimulator extends MedicalTool {
  static itemId = 'neuralStimulator'

  capabilities() {
    return ["medical","neural"]
  }

  toolTags() {
    return ["medical","neural"]
  }
}
