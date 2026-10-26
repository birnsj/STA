import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  addRefit,
  autofillShip,
  confirmShip,
  createEmptyShip,
  isShipComplete,
  departmentScore,
  getExampleClasses,
  reviewScoreLabel,
  selectMissionProfile,
  selectMissionProfileTalent,
  selectSpaceframe,
  selectTimeframe,
  setRegistry,
  setShipName,
  shipIssues,
  systemScore,
} from '../src/ships/shipModel.js'
import { loadShip, saveShip, shipFromRecord } from '../src/ships/persistence.js'
import { loadSavedShips, saveConfirmedShip } from '../src/ships/savedShips.js'

const stored = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: (key) => stored.delete(key),
  },
})

function battlecruiser() {
  return selectMissionProfileTalent(
    selectMissionProfile(selectSpaceframe(selectTimeframe(createEmptyShip(), 'tos'), 'constitution'), 'battlecruiser'),
    'ablative-armor',
  )
}

function assigned() {
  return ['comms', 'engines', 'structure'].reduce((ship, system) => addRefit(ship, system), battlecruiser())
}

describe('starship review', () => {
  beforeEach(() => stored.clear())

  it('keeps an unnamed Constitution battlecruiser incomplete without changing Weapons or Security', () => {
    const ship = assigned()
    assert.equal(ship.shipName, null)
    assert.equal(shipIssues(ship).some((issue) => issue.stepId === 'finishingTouches'), true)
    assert.equal(systemScore(ship, 'weapons'), 8)
    assert.equal(departmentScore(ship, 'security'), 4)
    assert.equal(confirmShip(ship), ship)
  })

  it('confirms once and leaves the scores unchanged', () => {
    let ship = setRegistry(setShipName(assigned(), 'Endeavour'), '1701')
    const confirmed = confirmShip(ship, '2026-10-25T00:00:00.000Z')
    assert.equal(confirmed.confirmedAt, '2026-10-25T00:00:00.000Z')
    assert.equal(systemScore(confirmed, 'weapons'), 8)
    assert.equal(departmentScore(confirmed, 'security'), 4)
    assert.equal(confirmShip(confirmed, '2026-10-26T00:00:00.000Z'), confirmed)
    assert.equal(confirmed.bridgeLayoutId, null)
    assert.equal(shipIssues(confirmed).some((issue) => issue.message.includes('Bridge')), false)
    assert.equal(confirmed.resistance, undefined)
  })

  it('labels a score that cannot be calculated as Pending and a real zero as 0', () => {
    const open = selectSpaceframe(selectTimeframe(createEmptyShip(), 'tos'), 'constitution')
    assert.equal(systemScore(open, 'weapons'), null)
    assert.equal(departmentScore(open, 'security'), null)
    assert.equal(reviewScoreLabel(systemScore(open, 'weapons')), 'Pending')
    assert.equal(reviewScoreLabel(departmentScore(open, 'security')), 'Pending')
    assert.equal(reviewScoreLabel(0), '0')
  })

  it('saves confirmation, drops it from an old save, and clears it when the name changes', () => {
    const ship = confirmShip(setRegistry(setShipName(assigned(), 'Endeavour'), '1701'), '2026-10-25T00:00:00.000Z')
    saveShip(ship)
    assert.equal(loadShip().confirmedAt, '2026-10-25T00:00:00.000Z')
    const raw = JSON.parse(stored.get('st-adventures.ship'))
    delete raw.confirmedAt
    stored.set('st-adventures.ship', JSON.stringify(raw))
    assert.equal(loadShip().confirmedAt, null)
    saveShip(ship)
    const edited = setShipName(loadShip(), 'Yorktown')
    assert.equal(edited.confirmedAt, null)
    assert.equal(edited.shipName, 'Yorktown')
    assert.equal(systemScore(edited, 'weapons'), 8)
  })

  it('leaves the example-class list unchanged', () => {
    assert.deepEqual(getExampleClasses().map((entry) => entry.id), ['constitution', 'miranda', 'excelsior-early', 'intrepid', 'new-orleans'])
  })

  it('autofills a complete ship and saves it beside the draft', () => {
    let tick = 0
    const ship = confirmShip(autofillShip(() => ((tick += 1) % 17) / 17), '2026-10-25T00:00:00.000Z')
    assert.equal(isShipComplete(ship), true)
    assert.equal(ship.resistance, undefined)
    const saved = saveConfirmedShip(ship)
    assert.equal(loadSavedShips().length, 1)
    assert.equal(shipFromRecord(saved.ships[0].record).shipName, ship.shipName)
    const again = saveConfirmedShip(ship, saved.id)
    assert.equal(again.ships.length, 1)
    assert.equal(again.id, saved.id)
  })
})
