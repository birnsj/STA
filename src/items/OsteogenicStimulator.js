import { MedicalTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual pp.72–73. Prototype: bag medical tool; no bone-repair action yet.
export class OsteogenicStimulator extends MedicalTool {
  static itemId = 'osteogenicStimulator'

  capabilities() {
    return ['medical', 'boneRepair']
  }

  toolTags() {
    return ['medical', 'bone', 'stimulator']
  }
}
