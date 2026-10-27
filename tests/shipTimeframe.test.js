import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import timeframes from '../src/data/ships/timeframes.json'
import {
  clearTimeframe,
  createEmptyShip,
  getExampleClasses,
  getTimeframes,
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

const YEARS = {
  tos: '2260s–2270s',
  tmp: '2270s–2280s',
  tng: '2360s–2370s',
  ds9: '2369–2375',
  voy: '2371–2378',
}

describe('starship timeframe', () => {
  beforeEach(() => stored.clear())

  it('lists the five mockup eras and the years on the cards', () => {
    const eras = getTimeframes()
    assert.deepEqual(eras.map((era) => era.id), ['tos', 'tmp', 'tng', 'ds9', 'voy'])
    assert.equal(eras.length, timeframes.eras.length)
    for (const era of eras) assert.equal(era.years, YEARS[era.id])
  })

  it('records the era id and leaves the spaceframe empty', () => {
    const next = selectTimeframe(createEmptyShip(), 'tos')
    assert.deepEqual(next, ship({ timeframeId: 'tos' }))
  })

  it('leaves the ship unchanged for an unknown id', () => {
    const ship = selectTimeframe(createEmptyShip(), 'tos')
    assert.equal(selectTimeframe(ship, 'no-such-era'), ship)
  })

  it('keeps the example classes the same for every era', () => {
    const untouched = getExampleClasses()
    const selected = getExampleClasses(selectTimeframe(createEmptyShip(), 'voy'))
    const empty = getExampleClasses(createEmptyShip())
    assert.deepEqual(selected, untouched)
    assert.deepEqual(empty, untouched)
    assert.deepEqual(untouched.map((entry) => entry.id), ['constitution', 'miranda', 'excelsior-early', 'intrepid', 'new-orleans'])
  })

  it('saves and loads the timeframe, and clear removes it', () => {
    const selected = selectTimeframe(createEmptyShip(), 'ds9')
    saveShip(selected)
    assert.deepEqual(loadShip(), ship({ timeframeId: 'ds9' }))
    assert.deepEqual(clearTimeframe(selected), ship({}))
  })
})
