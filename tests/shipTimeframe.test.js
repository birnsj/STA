import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import timeframes from '../src/data/ships/timeframes.json'
import {
  clearTimeframe,
  createEmptyShip,
  emptyAppearanceDetail,
  getEligibleSpaceframes,
  getExampleClasses,
  getTimeframes,
  refitBudget,
  selectSpaceframe,
  selectTimeframe,
  setCampaignYear,
  timeframeYearSpan,
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
  classDesignation: null,
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
  appearanceDetail: emptyAppearanceDetail(),
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

  it('uses campaign ranges that match each era card label (decade-inclusive)', () => {
    assert.deepEqual(timeframeYearSpan('tos'), { start: 2260, end: 2279 })
    assert.deepEqual(timeframeYearSpan('tmp'), { start: 2270, end: 2289 })
    assert.deepEqual(timeframeYearSpan('tng'), { start: 2360, end: 2379 })
    assert.deepEqual(timeframeYearSpan('ds9'), { start: 2369, end: 2375 })
    assert.deepEqual(timeframeYearSpan('voy'), { start: 2371, end: 2378 })
  })

  it('defaults campaign year inside the era and stops at continuum edges', () => {
    const era = selectTimeframe(createEmptyShip(), 'tos')
    assert.equal(era.campaignYear, 2279)
    const earlier = setCampaignYear(era, 2265)
    assert.equal(earlier.campaignYear, 2265)
    assert.equal(earlier.timeframeId, 'tos')
    assert.equal(setCampaignYear(earlier, 2200).campaignYear, 2260)
    assert.equal(setCampaignYear(earlier, 2200).timeframeId, 'tos')
    assert.equal(selectTimeframe(createEmptyShip(), 'tng').campaignYear, 2379)
  })

  it('changes era when the campaign year leaves the current card, and stops after the last year', () => {
    let ship = selectTimeframe(createEmptyShip(), 'tos')
    ship = setCampaignYear(ship, 2279)
    ship = setCampaignYear(ship, 2280)
    assert.equal(ship.timeframeId, 'tmp')
    assert.equal(ship.campaignYear, 2280)

    ship = setCampaignYear(ship, 2289)
    ship = setCampaignYear(ship, 2290)
    assert.equal(ship.timeframeId, 'tng')
    assert.equal(ship.campaignYear, 2360)

    // Overlap years keep the selected TNG card until the player picks DS9/VOY.
    ship = setCampaignYear(ship, 2371)
    assert.equal(ship.timeframeId, 'tng')
    assert.equal(ship.campaignYear, 2371)

    ship = selectTimeframe(ship, 'ds9')
    assert.equal(ship.timeframeId, 'ds9')
    assert.equal(ship.campaignYear, 2371)
    ship = setCampaignYear(ship, 2375)
    ship = setCampaignYear(ship, 2376)
    assert.equal(ship.timeframeId, 'voy')
    assert.equal(ship.campaignYear, 2376)

    ship = setCampaignYear(ship, 2400)
    assert.equal(ship.timeframeId, 'voy')
    assert.equal(ship.campaignYear, 2378)
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
