import { EngineeringTool } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM p.90). Prototype: catalogue item; specialized action not wired yet.
export class IonicFlowRegulator extends EngineeringTool {
  static itemId = 'ionicFlowRegulator'

  capabilities() {
    return ["engineering","ions"]
  }

  toolTags() {
    return ["engineering","ions","repair"]
  }
}
