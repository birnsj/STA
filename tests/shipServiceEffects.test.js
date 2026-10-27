import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { prepareTask } from '../src/rules/taskPreparation.js'
import {
  createEmptyShip,
  getShipGameplayTraits,
  selectServiceRecord,
  selectSpaceframe,
  selectTimeframe,
  setServiceRecordDetail,
  shipTraitNames,
  toggleServiceHonor,
  toggleServiceNotableEvent,
  selectServiceReputation,
} from '../src/ships/shipModel.js'
import {
  augmentTaskSpec,
  crewSupportBonus,
  getActiveShip,
  prototypeAssistComplicationRange,
  serviceSpecialRuleStatus,
  shipNarrativeTraitRules,
} from '../src/ships/serviceEffects.js'
import { saveConfirmedShip } from '../src/ships/savedShips.js'

const LOCATION_KEY = 'st-adventures.location'
function saveSavedShipId(id) {
  localStorage.setItem(LOCATION_KEY, JSON.stringify({ savedShipId: id }))
}

const stored = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: (key) => stored.delete(key),
  },
})

function constitution() {
  return selectSpaceframe(selectTimeframe(createEmptyShip(), 'tos'), 'constitution')
}

function blankCharacter() {
  return {
    attributes: { control: 10, daring: 10, fitness: 10, insight: 10, presence: 10, reason: 10 },
    disciplines: { command: 2, conn: 2, security: 2, engineering: 2, science: 2, medicine: 2 },
    focuses: [],
    talents: [],
    traits: [],
    role: null,
    speciesAbility: null,
  }
}

describe('starship service gameplay traits', () => {
  beforeEach(() => stored.clear())

  it('aggregates class, service, events, reputation, and honors without duplicate names', () => {
    let ship = selectServiceRecord(constitution(), 'dependable-workhorse')
    ship = toggleServiceNotableEvent(ship, 'first-contact')
    ship = selectServiceReputation(ship, 'dependable')
    ship = toggleServiceHonor(ship, 'starfleet-commendation')
    const traits = getShipGameplayTraits(ship)
    const names = traits.map((entry) => entry.name)
    assert.ok(names.includes('Federation Starship'))
    assert.ok(names.includes('Dependable Workhorse'))
    assert.ok(names.includes('First Contact Experience'))
    assert.ok(names.includes('Dependable Reputation'))
    assert.ok(names.includes('Starfleet Commendation'))
    assert.equal(names.length, new Set(names.map((name) => name.toLowerCase())).size)
    assert.deepEqual(shipTraitNames(ship).sort(), names.filter((_, i) => !traits[i].pending).sort())
  })

  it('omits a pending Survivor namesake from active trait names', () => {
    const open = selectServiceRecord(constitution(), 'survivor')
    assert.equal(shipTraitNames(open).includes('Name the battle or war.'), false)
    assert.ok(getShipGameplayTraits(open).some((entry) => entry.pending))
    const named = setServiceRecordDetail(open, 'Wolf 359')
    assert.ok(shipTraitNames(named).includes('Survivor of Wolf 359'))
  })

  it('builds −1 / +1 trait rules only when task tags match', () => {
    let ship = toggleServiceNotableEvent(constitution(), 'major-scientific-discovery')
    ship = toggleServiceNotableEvent(ship, 'major-systems-failure')
    const scanRules = shipNarrativeTraitRules(ship, ['sensors', 'analysis'])
    assert.deepEqual(scanRules, [{ trait: 'Scientific Prestige', difficulty: -1 }])
    const repairRules = shipNarrativeTraitRules(ship, ['repair'])
    assert.deepEqual(repairRules, [{ trait: 'Scarred Systems', difficulty: -1 }])
    const engineeringRules = shipNarrativeTraitRules(ship, ['engineering'])
    assert.ok(engineeringRules.some((rule) => rule.trait === 'Scarred Systems' && rule.difficulty === 1))
    assert.deepEqual(shipNarrativeTraitRules(ship, ['unrelated']), [])
  })

  it('applies a matching ship Trait through prepareTask when the active ship is set', () => {
    let ship = toggleServiceNotableEvent(constitution(), 'major-scientific-discovery')
    ship = selectServiceRecord(ship, 'aging-relic')
    const saved = saveConfirmedShip(ship)
    saveSavedShipId(saved.id)
    assert.equal(getActiveShip().serviceRecordId, 'aging-relic')
    assert.equal(crewSupportBonus(getActiveShip()), 1)
    assert.equal(prototypeAssistComplicationRange(getActiveShip()), 0)
    assert.equal(serviceSpecialRuleStatus(getActiveShip()).available, false)

    const spec = augmentTaskSpec({
      attribute: 'reason',
      department: 'science',
      difficulty: 2,
      focuses: [],
      tags: ['sensors'],
    })
    assert.ok(spec.traitRules.some((rule) => rule.trait === 'Scientific Prestige' && rule.difficulty === -1))
    const prepared = prepareTask(blankCharacter(), spec, { traits: ['Scientific Prestige'], side: 'player' })
    assert.equal(prepared.difficulty, 1)
  })

  it('reports Prototype special rule as partial because refits already apply', () => {
    const ship = selectServiceRecord(constitution(), 'prototype')
    assert.equal(serviceSpecialRuleStatus(ship).available, 'partial')
    assert.equal(prototypeAssistComplicationRange(ship), 2)
  })
})
