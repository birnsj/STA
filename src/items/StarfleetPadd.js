import { HandheldComputer } from './InventoryItem.js'

// Book: STA 2e Technical Manual p.34 (PADDs). Prototype: bag utility; no mission-data UI yet.
export class StarfleetPadd extends HandheldComputer {
  static itemId = 'starfleetPadd'

  capabilities() {
    return ['dataAccess', 'missionInfo']
  }

  toolTags() {
    return ['computer', 'data', 'records', 'padd']
  }
}
