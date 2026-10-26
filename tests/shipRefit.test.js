import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  addRefit,
  clearServiceRecord,
  createEmptyShip,
  departmentScore,
  getExampleClasses,
  getSpaceframeById,
  pickRefits,
  refitBudget,
  refitCount,
  refitSummary,
  selectMissionProfile,
  selectMissionProfileTalent,
  selectServiceRecord,
  selectSpaceframe,
  selectTimeframe,
  systemScore,
} from '../src/ships/shipModel.js'
import { loadShip, saveShip } from '../src/ships/persistence.js'

const stored = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: (key) => stored.delete(key),
  },
})

const shipOf = (era, frame) => selectSpaceframe(selectTimeframe(createEmptyShip(), era), frame)

const battlecruiser = (ship) => selectMissionProfileTalent(selectMissionProfile(ship, 'battlecruiser'), 'ablative-armor')

describe('starship refits', () => {
  beforeEach(() => stored.clear())

  it('counts one refit for every 10 full years, and Prototype adds 2', () => {
    assert.equal(refitBudget(shipOf('tos', 'constitution')), 3)
    assert.equal(refitBudget(shipOf('tos', 'nx')), 12)
    assert.equal(refitBudget(shipOf('voy', 'intrepid')), 0)
    assert.equal(refitBudget(selectServiceRecord(shipOf('tos', 'constitution'), 'prototype')), 5)
    assert.equal(refitBudget(createEmptyShip()), 0)
  })

  it('raises one system by 1, refuses a third, and leaves the class record and departments alone', () => {
    const frame = getSpaceframeById('constitution')
    let ship = battlecruiser(shipOf('tos', 'constitution'))
    assert.equal(systemScore(ship, 'weapons'), 8)
    ship = addRefit(ship, 'weapons')
    assert.equal(systemScore(ship, 'weapons'), 9)
    assert.equal(frame.systems.weapons, 7)
    assert.equal(getSpaceframeById('constitution').systems.weapons, 7)
    ship = addRefit(ship, 'weapons')
    assert.equal(refitCount(ship, 'weapons'), 2)
    assert.equal(systemScore(ship, 'weapons'), 10)
    assert.equal(addRefit(ship, 'weapons'), ship)
    assert.equal(departmentScore(ship, 'security'), 4)
    assert.equal(refitSummary(ship), 'Weapons 2')
  })

  it('refuses an Engines refit when Pathfinder has already brought Intrepid Engines to 12', () => {
    let ship = selectMissionProfileTalent(selectMissionProfile(shipOf('voy', 'intrepid'), 'pathfinder'), 'improved-warp-drive')
    ship = selectServiceRecord(ship, 'prototype')
    assert.equal(refitBudget(ship), 2)
    assert.equal(systemScore(ship, 'engines'), 12)
    assert.equal(addRefit(ship, 'engines'), ship)
    const next = addRefit(ship, 'computers')
    assert.notEqual(next, ship)
    assert.deepEqual(next.refits, ['computers'])
  })

  it('drops entries that no longer fit when Prototype is removed or the era budget shrinks', () => {
    let ship = selectServiceRecord(battlecruiser(shipOf('tos', 'constitution')), 'prototype')
    for (const system of ['weapons', 'weapons', 'comms', 'comms', 'engines']) ship = addRefit(ship, system)
    assert.equal(ship.refits.length, 5)
    const withoutPrototype = clearServiceRecord(ship)
    assert.deepEqual(withoutPrototype.refits, ['weapons', 'weapons', 'comms'])
    let later = battlecruiser(shipOf('tmp', 'constitution'))
    for (const system of ['sensors', 'sensors', 'structure', 'structure']) later = addRefit(later, system)
    assert.equal(refitBudget(later), 4)
    const earlier = selectTimeframe(later, 'tos')
    assert.deepEqual(earlier.refits, ['sensors', 'sensors', 'structure'])
  })

  it('saves the refit list and loads an old save as an empty list', () => {
    const ship = addRefit(battlecruiser(shipOf('tos', 'constitution')), 'structure')
    saveShip(ship)
    assert.deepEqual(loadShip().refits, ['structure'])
    stored.set('st-adventures.ship', JSON.stringify({ version: 1, timeframeId: 'tos', spaceframeId: 'constitution' }))
    assert.deepEqual(loadShip().refits, [])
    saveShip({ ...ship, refits: ['weapons', 'no-such-system', 'weapons', 'weapons'] })
    assert.deepEqual(loadShip().refits, ['weapons', 'weapons'])
  })

  it('assigns Communications on a roll of 1 and does not assign a slot on 19', () => {
    const ship = battlecruiser(shipOf('tos', 'tliss'))
    assert.equal(refitBudget(ship), 1)
    assert.deepEqual(pickRefits(ship, () => 0).refits, ['comms'])
    assert.deepEqual(pickRefits(ship, () => 0.9).refits, [])
  })

  it('leaves the example class list unchanged', () => {
    assert.deepEqual(getExampleClasses().map((entry) => entry.id), ['constitution', 'miranda', 'excelsior-early', 'intrepid', 'new-orleans'])
  })
})
