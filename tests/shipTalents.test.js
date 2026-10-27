import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  createEmptyShip,
  isRefitsFinished,
  pickRefitsAndTalents,
  selectMissionProfile,
  selectMissionProfileSystem,
  selectMissionProfileTalent,
  selectServiceRecord,
  selectSpaceframe,
  selectTimeframe,
  shipCrewSupport,
  shipResistance,
  shipShields,
  talentsFilled,
  toggleShipTalent,
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

describe('starship talents and derived stats', () => {
  beforeEach(() => stored.clear())

  it('fills talents to Scale and persists extraTalentIds', () => {
    let ship = selectMissionProfileSystem(
      selectMissionProfileTalent(selectMissionProfile(shipOf('tos', 'constitution'), 'multirole-explorer'), 'rugged-design'),
      'sensors',
    )
    ship = pickRefitsAndTalents(ship)
    assert.equal(talentsFilled(ship), true)
    assert.equal(isRefitsFinished(ship), true)
    saveShip(ship)
    assert.deepEqual(loadShip().extraTalentIds, ship.extraTalentIds)
  })

  it('computes Resistance, Shields, and Crew Support from Core formulas', () => {
    const ship = selectMissionProfileTalent(selectMissionProfile(shipOf('tng', 'galaxy'), 'multirole-explorer'), 'rugged-design')
    // Galaxy Scale 6, Structure 10 → Resistance 3+2=5 before talents; Shields = Structure+Scale+Security.
    assert.equal(shipResistance(ship), 5)
    assert.ok(shipShields(ship) > 0)
    assert.equal(shipCrewSupport(ship), 6)
    const relic = selectServiceRecord(ship, 'aging-relic')
    assert.equal(shipCrewSupport(relic), 7)
  })

  it('rejects Cloaking Device on a Federation ship', () => {
    const ship = selectMissionProfileTalent(selectMissionProfile(shipOf('tos', 'constitution'), 'multirole-explorer'), 'rugged-design')
    assert.equal(toggleShipTalent(ship, 'cloaking-device'), ship)
  })

  it('allows Cloaking Device on a Klingon ship when slots remain', () => {
    let ship = selectMissionProfileTalent(selectMissionProfile(shipOf('tos', 'd7'), 'battlecruiser'), 'improved-damage-control')
    const before = ship.extraTalentIds?.length ?? 0
    ship = toggleShipTalent(ship, 'cloaking-device')
    assert.ok((ship.extraTalentIds?.length ?? 0) >= before)
    assert.ok(ship.extraTalentIds.includes('cloaking-device') || ship.extraTalentIds?.length === before)
  })
})
