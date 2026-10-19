import { HandheldComputer } from './InventoryItem.js'

// Book: STA 2e Technical Manual (TM pp.57, 88). Prototype: catalogue item; specialized action not wired yet.
export class IsolinearOpticalChip extends HandheldComputer {
  static itemId = 'isolinearOpticalChip'

  capabilities() {
    return ["dataAccess","storage"]
  }

  toolTags() {
    return ["computer","data","storage"]
  }
}
