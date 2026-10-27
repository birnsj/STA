import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  clearSpaceframe,
  createEmptyShip,
  getEligibleSpaceframes,
  getExampleClasses,
  getSpaceframeById,
  getTimeframes,
  selectSpaceframe,
  selectTimeframe,
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

const ship = (fields) => ({
  version: 1,
  timeframeId: null,
  spaceframeId: null,
  missionProfileId: null,
  missionProfileTalentId: null,
  missionProfileSystemId: null,
  serviceRecordId: null,
  serviceRecordDetail: null,
  serviceNotableEventIds: [],
  serviceReputationId: null,
  serviceHonorIds: [],
  refits: [],
  shipName: null,
  registry: null,
  bridgeLayoutId: null,
  hullMarkingsId: null,
  stripingStyleId: null,
  nacelleCapsId: null,
  emblemStyleId: null,
  secondaryMarkingsId: null,
  confirmedAt: null,
  ...fields,
})

const ids = (timeframeId) => getEligibleSpaceframes(timeframeId).map((frame) => frame.id)

describe('starship spaceframe', () => {
  beforeEach(() => stored.clear())

  it('offers classes launched by the end of the era, and not later ones', () => {
    const tos = ids('tos')
    assert.ok(tos.includes('nx'))
    assert.ok(tos.includes('constitution'))
    assert.equal(tos.includes('excelsior'), false)
    assert.equal(tos.includes('brel'), false)
    const tmp = ids('tmp')
    assert.ok(tmp.includes('excelsior'))
    assert.ok(tmp.includes('brel'))
  })

  it('keeps Constitution III out of every current era', () => {
    for (const era of getTimeframes()) assert.equal(ids(era.id).includes('constitution-iii'), false)
  })

  it('stores only the class id, and ignores an unknown id', () => {
    const era = selectTimeframe(createEmptyShip(), 'tos')
    const next = selectSpaceframe(era, 'constitution')
    assert.deepEqual(next, ship({ timeframeId: 'tos', spaceframeId: 'constitution' }))
    assert.equal(selectSpaceframe(next, 'no-such-class'), next)
  })

  it('keeps a class that is still eligible after an era change, and clears one that is not', () => {
    const constitution = selectSpaceframe(selectTimeframe(createEmptyShip(), 'tos'), 'constitution')
    const kept = selectTimeframe(constitution, 'tmp')
    assert.equal(kept.spaceframeId, 'constitution')
    const excelsior = selectSpaceframe(selectTimeframe(createEmptyShip(), 'tmp'), 'excelsior')
    const cleared = selectTimeframe(excelsior, 'tos')
    assert.equal(cleared.timeframeId, 'tos')
    assert.equal(cleared.spaceframeId, null)
  })

  it('saves and loads the class, and an older save without one still loads', () => {
    const selected = selectSpaceframe(selectTimeframe(createEmptyShip(), 'ds9'), 'galaxy')
    saveShip(selected)
    assert.deepEqual(loadShip(), ship({ timeframeId: 'ds9', spaceframeId: 'galaxy' }))
    stored.set('st-adventures.ship', JSON.stringify({ version: 1, timeframeId: 'voy' }))
    assert.deepEqual(loadShip(), ship({ timeframeId: 'voy' }))
    assert.deepEqual(clearSpaceframe(selected), ship({ timeframeId: 'ds9' }))
  })

  it('keeps department modifiers on the class record, not on the saved ship', () => {
    const constitution = getSpaceframeById('constitution')
    assert.equal(constitution.departmentModifiers.command, 1)
    assert.equal(constitution.departmentModifiers.engineering, 0)
    const ship = selectSpaceframe(selectTimeframe(createEmptyShip(), 'tos'), 'constitution')
    assert.equal(ship.departmentModifiers, undefined)
    saveShip(ship)
    assert.equal(loadShip().departmentModifiers, undefined)
  })

  it('keeps Constitution’s saucer separation and its talents, and leaves the example classes alone', () => {
    const constitution = getSpaceframeById('constitution')
    assert.ok(constitution.specialRuleIds.includes('saucer-separation'))
    assert.deepEqual(
      constitution.talents.map((talent) => talent.name),
      ['Modular Laboratories', 'Rugged Design'],
    )
    assert.deepEqual(getExampleClasses().map((entry) => entry.id), ['constitution', 'miranda', 'excelsior-early', 'intrepid', 'new-orleans'])
  })
})
