// Technical Manual catalogue items (plan 2026-10-18 / batch-2): defs, behavior classes, art paths, combat link, drop/pickup.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, beforeEach } from 'node:test'
import { getWeaponForItem } from '../src/combat/weaponSystem.js'
import { Autosuture } from '../src/items/Autosuture.js'
import { CorticalInhibitor } from '../src/items/CorticalInhibitor.js'
import { CorticalStimulator } from '../src/items/CorticalStimulator.js'
import { CytoplasmicStimulator } from '../src/items/CytoplasmicStimulator.js'
import { DermalStimulator } from '../src/items/DermalStimulator.js'
import { DetronalScanner } from '../src/items/DetronalScanner.js'
import { DisruptorPistol } from '../src/items/DisruptorPistol.js'
import { DkTahg } from '../src/items/DkTahg.js'
import { DualiticInverter } from '../src/items/DualiticInverter.js'
import { FluxCoupler } from '../src/items/FluxCoupler.js'
import { FocalAdjustmentSpanner } from '../src/items/FocalAdjustmentSpanner.js'
import { Gintak } from '../src/items/Gintak.js'
import { GraviticCaliper } from '../src/items/GraviticCaliper.js'
import { Hypospray } from '../src/items/Hypospray.js'
import { Hyperspanner } from '../src/items/Hyperspanner.js'
import { IonicFlowRegulator } from '../src/items/IonicFlowRegulator.js'
import { IsolinearOpticalChip } from '../src/items/IsolinearOpticalChip.js'
import { KlingonBatleth } from '../src/items/KlingonBatleth.js'
import { Kurleth } from '../src/items/Kurleth.js'
import { Kutluch } from '../src/items/Kutluch.js'
import { LaserPistol2250 } from '../src/items/LaserPistol2250.js'
import { MagneticProbe } from '../src/items/MagneticProbe.js'
import { MedicalShotgun } from '../src/items/MedicalShotgun.js'
import { Mekleth } from '../src/items/Mekleth.js'
import { MicroResonator } from '../src/items/MicroResonator.js'
import { NeuralCalipers } from '../src/items/NeuralCalipers.js'
import { NeuralStimulator } from '../src/items/NeuralStimulator.js'
import { NeuralTransducer } from '../src/items/NeuralTransducer.js'
import { OdnRecoupler } from '../src/items/OdnRecoupler.js'
import { OsteogenicStimulator } from '../src/items/OsteogenicStimulator.js'
import { ParametricScanner } from '../src/items/ParametricScanner.js'
import { PhaseModulator } from '../src/items/PhaseModulator.js'
import { PhaserRifle2255 } from '../src/items/PhaserRifle2255.js'
import { PhaserRifle2264 } from '../src/items/PhaserRifle2264.js'
import { PlasmaTorch } from '../src/items/PlasmaTorch.js'
import { SelfSealingStemBolt } from '../src/items/SelfSealingStemBolt.js'
import { SonicSeparator } from '../src/items/SonicSeparator.js'
import { StarfleetPadd } from '../src/items/StarfleetPadd.js'
import { TridentScanner } from '../src/items/TridentScanner.js'
import { Ushaantor } from '../src/items/Ushaantor.js'
import { VascularRegenerator } from '../src/items/VascularRegenerator.js'
import { VulcanLirpa } from '../src/items/VulcanLirpa.js'
import { TECHNICAL_MANUAL_ITEM_IDS, itemBehaviorFor } from '../src/items/registry.js'
import { getItemBehavior, getItemById } from '../src/rules/equipment.js'
import { dropItem, pickupItem, resetInstanceIds, seedPartyInventory } from '../src/rules/inventory.js'
import { makeCharacter } from './support/characters.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicPath = (urlPath) => path.join(ROOT, 'public', urlPath.replace(/^\//, '').replace(/\//g, path.sep))

const EXPECTED = [
  { id: 'starfleetPadd', Class: StarfleetPadd, category: 'utility', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'hypospray', Class: Hypospray, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'hyperspanner', Class: Hyperspanner, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'plasmaTorch', Class: PlasmaTorch, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'tridentScanner', Class: TridentScanner, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'magneticProbe', Class: MagneticProbe, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'odnRecoupler', Class: OdnRecoupler, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'fluxCoupler', Class: FluxCoupler, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'autosuture', Class: Autosuture, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'osteogenicStimulator', Class: OsteogenicStimulator, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'phaserRifle', Class: PhaserRifle2264, category: 'weapon', equipSlot: 'sidearm', faction: 'starfleet', era: 'tos' },
  { id: 'klingonBatleth', Class: KlingonBatleth, category: 'weapon', equipSlot: 'sidearm', faction: 'klingonEmpire', era: 'tos' },
  { id: 'corticalInhibitor', Class: CorticalInhibitor, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'corticalStimulator', Class: CorticalStimulator, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'cytoplasmicStimulator', Class: CytoplasmicStimulator, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'dermalStimulator', Class: DermalStimulator, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'detronalScanner', Class: DetronalScanner, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'neuralCalipers', Class: NeuralCalipers, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'neuralStimulator', Class: NeuralStimulator, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'neuralTransducer', Class: NeuralTransducer, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'sonicSeparator', Class: SonicSeparator, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'vascularRegenerator', Class: VascularRegenerator, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'medicalShotgun', Class: MedicalShotgun, category: 'medical', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'dualiticInverter', Class: DualiticInverter, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'focalAdjustmentSpanner', Class: FocalAdjustmentSpanner, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'graviticCaliper', Class: GraviticCaliper, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'ionicFlowRegulator', Class: IonicFlowRegulator, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'microResonator', Class: MicroResonator, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'parametricScanner', Class: ParametricScanner, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'phaseModulator', Class: PhaseModulator, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'selfSealingStemBolt', Class: SelfSealingStemBolt, category: 'engineering', equipSlot: null, faction: 'starfleet', era: 'tos' },
  { id: 'laserPistol2250', Class: LaserPistol2250, category: 'weapon', equipSlot: 'sidearm', faction: 'starfleet', era: 'tos' },
  { id: 'gintak', Class: Gintak, category: 'weapon', equipSlot: 'sidearm', faction: 'klingonEmpire', era: 'tos' },
  { id: 'kurleth', Class: Kurleth, category: 'weapon', equipSlot: 'sidearm', faction: 'klingonEmpire', era: 'tos' },
  { id: 'kutluch', Class: Kutluch, category: 'weapon', equipSlot: 'sidearm', faction: 'klingonEmpire', era: 'tos' },
  { id: 'mekleth', Class: Mekleth, category: 'weapon', equipSlot: 'sidearm', faction: 'klingonEmpire', era: 'tos' },
  { id: 'ushaantor', Class: Ushaantor, category: 'weapon', equipSlot: 'sidearm', faction: 'andorian', era: 'tos' },
  { id: 'vulcanLirpa', Class: VulcanLirpa, category: 'weapon', equipSlot: 'sidearm', faction: 'vulcan', era: 'tos' },
  { id: 'phaserRifle2255', Class: PhaserRifle2255, category: 'weapon', equipSlot: 'sidearm', faction: 'starfleet', era: 'tos' },
  { id: 'isolinearOpticalChip', Class: IsolinearOpticalChip, category: 'utility', equipSlot: null, faction: 'starfleet', era: 'tng' },
  { id: 'disruptorPistol', Class: DisruptorPistol, category: 'weapon', equipSlot: 'sidearm', faction: 'klingonEmpire', era: null },
  { id: 'dkTahg', Class: DkTahg, category: 'weapon', equipSlot: null, faction: 'klingonEmpire', era: null },
]

function partyState(characters, map = { width: 8, height: 8, tiles: Array.from({ length: 8 }, () => Array(8).fill('floor')) }) {
  const members = {}
  const memberIds = characters.map((character, index) => {
    const id = character.id ?? `m${index}`
    members[id] = {
      id,
      character: { ...character, id, equipment: [...(character.equipment ?? [])] },
      position: { x: index, y: 0 },
    }
    return id
  })
  return seedPartyInventory({
    party: { map, memberIds, members, leaderId: memberIds[0], selectedIds: [...memberIds] },
    itemInstances: {},
    groundItems: {},
  })
}

beforeEach(() => resetInstanceIds(1))

describe('Technical Manual catalogue definitions', () => {
  it('loads all catalogue items with unique ids and art on disk', () => {
    assert.equal(TECHNICAL_MANUAL_ITEM_IDS.length, EXPECTED.length)
    assert.equal(new Set(TECHNICAL_MANUAL_ITEM_IDS).size, EXPECTED.length)
    for (const row of EXPECTED) {
      const item = getItemById(row.id)
      assert.ok(item, `missing item ${row.id}`)
      assert.equal(item.category, row.category)
      assert.equal(item.equipSlot, row.equipSlot)
      if (row.era) assert.ok(item.era.includes(row.era), `${row.id} era`)
      assert.ok(item.faction.includes(row.faction), `${row.id} faction`)
      assert.ok(item.icon, `${row.id} icon`)
      assert.ok(item.worldImage, `${row.id} worldImage`)
      assert.ok(fs.existsSync(publicPath(item.icon)), `missing icon file ${item.icon}`)
      assert.ok(fs.existsSync(publicPath(item.worldImage)), `missing worldImage ${item.worldImage}`)
    }
  })
})

describe('itemBehaviorFor', () => {
  it('returns the concrete class for each catalogue id', () => {
    for (const row of EXPECTED) {
      const behavior = itemBehaviorFor(row.id)
      assert.ok(behavior, row.id)
      assert.ok(behavior instanceof row.Class)
      assert.equal(behavior.constructor.itemId, row.id)
      assert.ok(Array.isArray(behavior.capabilities()) && behavior.capabilities().length > 0)
      assert.equal(getItemBehavior(row.id)?.constructor.itemId, row.id)
    }
    assert.equal(itemBehaviorFor('medkit'), null)
    assert.equal(itemBehaviorFor('phaserType1'), null)
  })

  it('links equippable weapons to combatWeaponId; medical shotgun stays non-combat', () => {
    assert.equal(itemBehaviorFor('phaserRifle').combatWeaponId(), 'phaserRifle')
    assert.equal(itemBehaviorFor('phaserRifle2255').combatWeaponId(), 'phaserRifle2255')
    assert.equal(itemBehaviorFor('klingonBatleth').combatWeaponId(), 'klingonBatleth')
    assert.equal(itemBehaviorFor('disruptorPistol').combatWeaponId(), 'disruptorPistol')
    assert.equal(itemBehaviorFor('dkTahg').combatWeaponId(), 'dkTahg')
    assert.equal(itemBehaviorFor('mekleth').combatWeaponId(), 'mekleth')
    assert.equal(itemBehaviorFor('hypospray').combatWeaponId(), null)
    assert.equal(itemBehaviorFor('medicalShotgun').combatWeaponId(), null)
  })
})

describe('combat weapon resolution', () => {
  it('resolves batch weapons without conflicting Type-1/2 or 2264 rifle', () => {
    const rifle2264 = getWeaponForItem('phaserRifle')
    assert.ok(rifle2264)
    assert.equal(rifle2264.severity, 5)

    const rifle2255 = getWeaponForItem('phaserRifle2255')
    assert.ok(rifle2255)
    assert.equal(rifle2255.id, 'phaserRifle2255')
    assert.equal(rifle2255.severity, 5)
    assert.notEqual(rifle2255.id, rifle2264.id)

    const laser = getWeaponForItem('laserPistol2250')
    assert.ok(laser)
    assert.equal(laser.severity, 3)
    assert.deepEqual(laser.injuryModes, ['stun', 'deadly'])

    assert.equal(getWeaponForItem('mekleth')?.severity, 3)
    assert.equal(getWeaponForItem('kutluch')?.severity, 2)
    assert.equal(getWeaponForItem('vulcanLirpa')?.hands, 2)
    assert.equal(getWeaponForItem('disruptorPistol')?.severity, 4)
    assert.equal(getWeaponForItem('dkTahg')?.severity, 2)

    assert.equal(getWeaponForItem('medicalShotgun'), null)
    assert.equal(getWeaponForItem('phaserType1')?.id, 'phaserType1')
  })
})

describe('drop and pickup round-trip', () => {
  it('preserves itemId for each catalogue item', () => {
    for (const row of EXPECTED) {
      resetInstanceIds(1)
      let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: row.id }] })])
      const instanceId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === row.id)
      assert.ok(instanceId, row.id)
      state = dropItem(state, { instanceId, position: { x: 2, y: 2 } })
      assert.ok(state.groundItems[instanceId])
      assert.equal(state.itemInstances[instanceId].itemId, row.id)
      state = pickupItem(state, { instanceId, memberId: 'a' })
      assert.ok(!state.groundItems[instanceId])
      assert.equal(state.itemInstances[instanceId].itemId, row.id)
      const bag = state.party.members.a.character.inventory.bag
      const slots = state.party.members.a.character.inventory.slots
      const held = bag.includes(instanceId) || Object.values(slots).includes(instanceId)
      assert.ok(held, `${row.id} returned to inventory`)
    }
  })
})
