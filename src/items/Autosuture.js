import { MedicalTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual p.72. Prototype: bag medical tool; no wound-closure action yet.
export class Autosuture extends MedicalTool {
  static itemId = 'autosuture'

  capabilities() {
    return ['medical', 'woundClosure']
  }

  toolTags() {
    return ['medical', 'suture', 'trauma']
  }
}
