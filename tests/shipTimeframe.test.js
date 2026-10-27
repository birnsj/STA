import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import timeframes from '../src/data/ships/timeframes.json'
import {
  clearTimeframe,
  createEmptyShip,
  getEligibleSpaceframes,
  getExampleClasses,
  getTimeframes,
  refitBudget,
  selectSpaceframe,
  selectTimeframe,
  setCampaignYear,
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
  campaignYear: null,
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
  extraTalentIds: [],
  talentChoices: {},
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
    assert.deepEqual(next, ship({ timeframeId: 'tos', campaignYear: 2279 }))
  })

  it('defaults campaign year to the era throughYear and clamps on change', () => {
    const era = selectTimeframe(createEmptyShip(), 'tos')
    assert.equal(era.campaignYear, 2279)
    const earlier = setCampaignYear(era, 2265)
    assert.equal(earlier.campaignYear, 2265)
    assert.equal(setCampaignYear(earlier, 2200).campaignYear, 2260)
    assert.equal(setCampaignYear(earlier, 2300).campaignYear, 2279)
  })

  it('uses campaign year for class eligibility and refit decades', () => {
    let ship = selectTimeframe(createEmptyShip(), 'tos')
    ship = setCampaignYear(ship, 2255)
    assert.equal(getEligibleSpaceframes('tos', 2255).some((frame) => frame.id === 'constitution'), true)
    ship = selectSpaceframe(ship, 'constitution')
    assert.equal(refitBudget(ship), 1)
    ship = setCampaignYear(ship, 2279)
    assert.equal(refitBudget(ship), 3)
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
    assert.deepEqual(loadShip(), ship({ timeframeId: 'ds9', campaignYear: 2375 }))
    assert.deepEqual(clearTimeframe(selected), ship({}))
    stored.set('st-adventures.ship', JSON.stringify({ version: 1, timeframeId: 'voy' }))
    assert.deepEqual(loadShip(), ship({ timeframeId: 'voy', campaignYear: 2378 }))
  })
})
