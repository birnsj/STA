// Maps items.json ids to behavior classes (plan 2026-10-18). Unknown ids return null.
import { Autosuture } from './Autosuture.js'
import { FluxCoupler } from './FluxCoupler.js'
import { Hypospray } from './Hypospray.js'
import { Hyperspanner } from './Hyperspanner.js'
import { KlingonBatleth } from './KlingonBatleth.js'
import { MagneticProbe } from './MagneticProbe.js'
import { OdnRecoupler } from './OdnRecoupler.js'
import { OsteogenicStimulator } from './OsteogenicStimulator.js'
import { PhaserRifle2264 } from './PhaserRifle2264.js'
import { PlasmaTorch } from './PlasmaTorch.js'
import { StarfleetPadd } from './StarfleetPadd.js'
import { TridentScanner } from './TridentScanner.js'

const CLASSES = [
  StarfleetPadd,
  Hypospray,
  Hyperspanner,
  PlasmaTorch,
  TridentScanner,
  MagneticProbe,
  OdnRecoupler,
  FluxCoupler,
  Autosuture,
  OsteogenicStimulator,
  PhaserRifle2264,
  KlingonBatleth,
]

const BY_ID = new Map(CLASSES.map((Type) => [Type.itemId, Type]))

export const TECHNICAL_MANUAL_ITEM_IDS = CLASSES.map((Type) => Type.itemId)

export function itemBehaviorClass(itemId) {
  return BY_ID.get(itemId) ?? null
}

export function itemBehaviorFor(itemId) {
  const Type = itemBehaviorClass(itemId)
  return Type ? new Type() : null
}
