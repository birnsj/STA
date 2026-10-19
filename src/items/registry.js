// Maps items.json ids to behavior classes (plan 2026-10-18 / batch-2). Unknown ids return null.
import { Autosuture } from './Autosuture.js'
import { CorticalInhibitor } from './CorticalInhibitor.js'
import { CorticalStimulator } from './CorticalStimulator.js'
import { CytoplasmicStimulator } from './CytoplasmicStimulator.js'
import { DermalStimulator } from './DermalStimulator.js'
import { DetronalScanner } from './DetronalScanner.js'
import { DisruptorPistol } from './DisruptorPistol.js'
import { DkTahg } from './DkTahg.js'
import { DualiticInverter } from './DualiticInverter.js'
import { FluxCoupler } from './FluxCoupler.js'
import { FocalAdjustmentSpanner } from './FocalAdjustmentSpanner.js'
import { Gintak } from './Gintak.js'
import { GraviticCaliper } from './GraviticCaliper.js'
import { Hypospray } from './Hypospray.js'
import { Hyperspanner } from './Hyperspanner.js'
import { IonicFlowRegulator } from './IonicFlowRegulator.js'
import { IsolinearOpticalChip } from './IsolinearOpticalChip.js'
import { KlingonBatleth } from './KlingonBatleth.js'
import { Kurleth } from './Kurleth.js'
import { Kutluch } from './Kutluch.js'
import { LaserPistol2250 } from './LaserPistol2250.js'
import { MagneticProbe } from './MagneticProbe.js'
import { MedicalShotgun } from './MedicalShotgun.js'
import { Mekleth } from './Mekleth.js'
import { MicroResonator } from './MicroResonator.js'
import { NeuralCalipers } from './NeuralCalipers.js'
import { NeuralStimulator } from './NeuralStimulator.js'
import { NeuralTransducer } from './NeuralTransducer.js'
import { OdnRecoupler } from './OdnRecoupler.js'
import { OsteogenicStimulator } from './OsteogenicStimulator.js'
import { ParametricScanner } from './ParametricScanner.js'
import { PhaseModulator } from './PhaseModulator.js'
import { PhaserRifle2255 } from './PhaserRifle2255.js'
import { PhaserRifle2264 } from './PhaserRifle2264.js'
import { PlasmaTorch } from './PlasmaTorch.js'
import { SelfSealingStemBolt } from './SelfSealingStemBolt.js'
import { SonicSeparator } from './SonicSeparator.js'
import { StarfleetPadd } from './StarfleetPadd.js'
import { TridentScanner } from './TridentScanner.js'
import { Ushaantor } from './Ushaantor.js'
import { VascularRegenerator } from './VascularRegenerator.js'
import { VulcanLirpa } from './VulcanLirpa.js'

const CLASSES = [
  // Batch 1
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
  // Batch 2 medical
  CorticalInhibitor,
  CorticalStimulator,
  CytoplasmicStimulator,
  DermalStimulator,
  DetronalScanner,
  NeuralCalipers,
  NeuralStimulator,
  NeuralTransducer,
  SonicSeparator,
  VascularRegenerator,
  MedicalShotgun,
  // Batch 2 engineering
  DualiticInverter,
  FocalAdjustmentSpanner,
  GraviticCaliper,
  IonicFlowRegulator,
  MicroResonator,
  ParametricScanner,
  PhaseModulator,
  SelfSealingStemBolt,
  // Batch 2 weapons / data
  LaserPistol2250,
  Gintak,
  Kurleth,
  Kutluch,
  Mekleth,
  Ushaantor,
  VulcanLirpa,
  PhaserRifle2255,
  IsolinearOpticalChip,
  // Existing Klingon catalogue weapons (art completion)
  DisruptorPistol,
  DkTahg,
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
