import { MedicalTool } from './InventoryItem.js'

// Book: TM cover / medical art; administration mentioned p.73. Prototype: bag medical tool; no treatment action yet.
export class Hypospray extends MedicalTool {
  static itemId = 'hypospray'

  capabilities() {
    return ['medical', 'administer']
  }

  toolTags() {
    return ['medical', 'inject', 'treatment']
  }
}
