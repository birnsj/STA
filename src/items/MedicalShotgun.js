import { MedicalTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.73; combat deferred). Prototype: catalogue item; specialized action not wired yet.
export class MedicalShotgun extends MedicalTool {
  static itemId = 'medicalShotgun'

  capabilities() {
    return ["medical","rangedTreatment"]
  }

  toolTags() {
    return ["medical","ranged","treatment"]
  }
}
