// Technical Manual catalogue items (plan 2026-10-18): defs, behavior classes, art paths, combat link, drop/pickup.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, beforeEach } from 'node:test'
import { getWeaponForItem } from '../src/combat/weaponSystem.js'
import { Autosuture } from '../src/items/Autosuture.js'
import { FluxCoupler } from '../src/items/FluxCoupler.js'
import { Hypospray } from '../src/items/Hypospray.js'
import { Hyperspanner } from '../src/items/Hyperspanner.js'
import { KlingonBatleth } from '../src/items/KlingonBatleth.js'
import { MagneticProbe } from '../src/items/MagneticProbe.js'
import { OdnRecoupler } from '../src/items/OdnRecoupler.js'
import { OsteogenicStimulator } from '../src/items/OsteogenicStimulator.js'
import { PhaserRifle2264 } from '../src/items/PhaserRifle2264.js'
import { PlasmaTorch } from '../src/items/PlasmaTorch.js'
import { StarfleetPadd } from '../src/items/StarfleetPadd.js'
import { TridentScanner } from '../src/items/TridentScanner.js'
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
  it('loads all 12 items with unique ids and art on disk', () => {
    assert.equal(TECHNICAL_MANUAL_ITEM_IDS.length, 12)
    assert.equal(new Set(TECHNICAL_MANUAL_ITEM_IDS).size, 12)
    for (const row of EXPECTED) {
      const item = getItemById(row.id)
      assert.ok(item, `missing item ${row.id}`)
      assert.equal(item.category, row.category)
      assert.equal(item.equipSlot, row.equipSlot)
      assert.ok(item.era.includes(row.era))
      assert.ok(item.faction.includes(row.faction))
      assert.ok(item.icon, `${row.id} icon`)
      assert.ok(item.worldImage, `${row.id} worldImage`)
      assert.ok(fs.existsSync(publicPath(item.icon)), `missing icon file ${item.icon}`)
      assert.ok(fs.existsSync(publicPath(item.worldImage)), `missing worldImage ${item.worldImage}`)
    }
  })
})

describe('itemBehaviorFor', () => {
  it('returns the concrete class for each Technical Manual id', () => {
    for (const row of EXPECTED) {
      const behavior = itemBehaviorFor(row.id)
      assert.ok(behavior, row.id)
      assert.ok(behavior instanceof row.Class)
      assert.equal(behavior.constructor.itemId, row.id)
      assert.ok(Array.isArray(behavior.capabilities()) && behavior.capabilities().length > 0)
      assert.equal(getItemBehavior(row.id)?.constructor.itemId, row.id)
    }
    assert.equal(itemBehaviorFor('medkit'), null)
    assert.equal(getItemBehavior('phaserType1'), null)
  })

  it('links weapons to combatWeaponId', () => {
    assert.equal(itemBehaviorFor('phaserRifle').combatWeaponId(), 'phaserRifle')
    assert.equal(itemBehaviorFor('klingonBatleth').combatWeaponId(), 'klingonBatleth')
    assert.equal(itemBehaviorFor('hypospray').combatWeaponId(), null)
  })
})

describe('combat weapon resolution', () => {
  it('resolves phaserRifle and klingonBatleth without conflicting Type-1/2', () => {
    const rifle = getWeaponForItem('phaserRifle')
    assert.ok(rifle)
    assert.equal(rifle.id, 'phaserRifle')
    assert.equal(rifle.severity, 5)
    assert.equal(rifle.type, 'ranged')

    const batleth = getWeaponForItem('klingonBatleth')
    assert.ok(batleth)
    assert.equal(batleth.id, 'klingonBatleth')
    assert.equal(batleth.severity, 3)
    assert.equal(batleth.hands, 2)
    assert.equal(batleth.type, 'melee')

    assert.equal(getWeaponForItem('phaserType1')?.id, 'phaserType1')
    assert.equal(getWeaponForItem('phaserType2')?.id, 'phaserType2')
    assert.notEqual(getWeaponForItem('phaserType1').id, rifle.id)
  })
})

describe('drop and pickup round-trip', () => {
  it('preserves itemId for each Technical Manual item', () => {
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
