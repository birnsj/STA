import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  APPEARANCE_FIELDS,
  createEmptyShip,
  departmentScore,
  getAppearanceContextEntries,
  getFinishingOptions,
  getShipGameplayTraits,
  isAppearanceOptionAvailable,
  isFinishingPackageAvailable,
  normalizeAppearanceDetail,
  selectServiceRecord,
  selectSpaceframe,
  selectTimeframe,
  setAppearanceDetailChoice,
  setFinishingChoice,
  systemScore,
  toggleServiceHonor,
  toggleServiceNotableEvent,
} from '../src/ships/shipModel.js'
import { getAppearanceOption } from '../src/ships/appearanceRules.js'
import { loadShip, saveShip, shipFromRecord, persistedShip } from '../src/ships/persistence.js'

const stored = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: (key) => stored.delete(key),
  },
})

const baseShip = () => selectSpaceframe(selectTimeframe(createEmptyShip(), 'tos'), 'constitution')

describe('ship appearance detail', () => {
  beforeEach(() => stored.clear())

  it('loads old saves without appearanceDetail as empty nested nulls', () => {
    const legacy = persistedShip(baseShip())
    delete legacy.appearanceDetail
    const loaded = shipFromRecord(legacy)
    assert.deepEqual(normalizeAppearanceDetail(loaded.appearanceDetail), normalizeAppearanceDetail(null))
    assert.equal(loaded.hullMarkingsId ?? null, null)
  })

  it('persists appearanceDetail round-trip', () => {
    let ship = setAppearanceDetailChoice(baseShip(), 'identification', 'registryStyleId', 'registry-standard')
    assert.equal(ship.appearanceDetail.identification.registryStyleId, 'registry-standard')
    saveShip(ship)
    const loaded = loadShip()
    assert.equal(loaded.appearanceDetail.identification.registryStyleId, 'registry-standard')
  })

  it('locks earned medical markings until Screen 04 qualifies', () => {
    const option = getAppearanceOption('identification', 'missionIdMarkingsId', 'mission-medical')
    let ship = baseShip()
    assert.equal(isAppearanceOptionAvailable(ship, option), false)
    ship = setAppearanceDetailChoice(ship, 'identification', 'missionIdMarkingsId', 'mission-medical')
    assert.equal(ship.appearanceDetail.identification.missionIdMarkingsId, null)

    ship = selectServiceRecord(ship, 'hope-ship')
    assert.equal(isAppearanceOptionAvailable(ship, option), true)
    ship = setAppearanceDetailChoice(ship, 'identification', 'missionIdMarkingsId', 'mission-medical')
    assert.equal(ship.appearanceDetail.identification.missionIdMarkingsId, 'mission-medical')
  })

  it('clears earned markings when the qualifying honor is removed', () => {
    let ship = toggleServiceHonor(baseShip(), 'starfleet-commendation')
    ship = setAppearanceDetailChoice(ship, 'identification', 'honorInsigniaId', 'insignia-starfleet-commendation')
    assert.equal(ship.appearanceDetail.identification.honorInsigniaId, 'insignia-starfleet-commendation')
    ship = toggleServiceHonor(ship, 'starfleet-commendation')
    assert.equal(ship.appearanceDetail.identification.honorInsigniaId, null)
    assert.deepEqual(ship.serviceHonorIds, [])
  })

  it('does not add a second Trait when honor insignia is applied', () => {
    let ship = toggleServiceHonor(baseShip(), 'humanitarian-service-citation')
    const before = getShipGameplayTraits(ship).map((entry) => entry.name).sort()
    ship = setAppearanceDetailChoice(ship, 'identification', 'honorInsigniaId', 'insignia-humanitarian')
    const after = getShipGameplayTraits(ship).map((entry) => entry.name).sort()
    assert.deepEqual(after, before)
    assert.equal(ship.appearanceDetail.identification.honorInsigniaId, 'insignia-humanitarian')
  })

  it('era-gates aztec striping and clears it when leaving TMP+', () => {
    const option = getAppearanceOption('livery', 'stripingPatternId', 'stripe-aztec')
    let ship = selectSpaceframe(selectTimeframe(createEmptyShip(), 'tng'), 'galaxy')
    assert.equal(isAppearanceOptionAvailable(ship, option), true)
    ship = setAppearanceDetailChoice(ship, 'livery', 'stripingPatternId', 'stripe-aztec')
    assert.equal(ship.appearanceDetail.livery.stripingPatternId, 'stripe-aztec')
    ship = selectTimeframe(ship, 'tos')
    assert.equal(ship.appearanceDetail.livery.stripingPatternId, null)
  })

  it('keeps battle-scarred weathering unlocked by a qualifying event', () => {
    let ship = toggleServiceNotableEvent(baseShip(), 'border-incident')
    const option = getAppearanceOption('surfaceFinish', 'weatheringId', 'weather-battle-scarred')
    assert.equal(isAppearanceOptionAvailable(ship, option), true)
    ship = setAppearanceDetailChoice(ship, 'surfaceFinish', 'weatheringId', 'weather-battle-scarred')
    assert.equal(ship.appearanceDetail.surfaceFinish.weatheringId, 'weather-battle-scarred')
  })
})

describe('appearance packages four choices', () => {
  beforeEach(() => stored.clear())

  it('offers exactly four options for each of the five Appearance Packages', () => {
    assert.equal(APPEARANCE_FIELDS.length, 5)
    for (const [field] of APPEARANCE_FIELDS) {
      assert.equal(getFinishingOptions(field).length, 4, field)
    }
  })

  it('keeps package selections from changing Weapons, Security, or Engines', () => {
    let ship = baseShip()
    const before = {
      weapons: systemScore(ship, 'weapons'),
      engines: systemScore(ship, 'engines'),
      security: departmentScore(ship, 'security'),
    }
    ship = setFinishingChoice(ship, 'bridgeLayoutId', 'tactical')
    ship = setFinishingChoice(ship, 'hullMarkingsId', 'special-operations')
    ship = setFinishingChoice(ship, 'stripingStyleId', 'command-gold')
    ship = setFinishingChoice(ship, 'nacelleCapsId', 'experimental')
    ship = setFinishingChoice(ship, 'emblemStyleId', 'starfleet-command')
    assert.equal(systemScore(ship, 'weapons'), before.weapons)
    assert.equal(systemScore(ship, 'engines'), before.engines)
    assert.equal(departmentScore(ship, 'security'), before.security)
  })

  it('blocks Mission Citation without an honor and clears it when the honor is removed', () => {
    let ship = baseShip()
    assert.equal(isFinishingPackageAvailable(ship, 'emblemStyleId', 'mission-citation'), false)
    ship = setFinishingChoice(ship, 'emblemStyleId', 'mission-citation')
    assert.equal(ship.emblemStyleId, null)

    ship = toggleServiceHonor(ship, 'starfleet-commendation')
    assert.equal(isFinishingPackageAvailable(ship, 'emblemStyleId', 'mission-citation'), true)
    ship = setFinishingChoice(ship, 'emblemStyleId', 'mission-citation')
    assert.equal(ship.emblemStyleId, 'mission-citation')

    const beforeTraits = getShipGameplayTraits(ship).map((entry) => entry.name).sort()
    ship = toggleServiceHonor(ship, 'starfleet-commendation')
    assert.equal(ship.emblemStyleId, null)
    assert.ok(!beforeTraits.includes('Mission Citation'))
  })

  it('does not add a Trait when Mission Citation is applied', () => {
    let ship = toggleServiceHonor(baseShip(), 'distinguished-exploration-citation')
    const before = getShipGameplayTraits(ship).map((entry) => entry.name).sort()
    ship = setFinishingChoice(ship, 'emblemStyleId', 'mission-citation')
    const after = getShipGameplayTraits(ship).map((entry) => entry.name).sort()
    assert.equal(ship.emblemStyleId, 'mission-citation')
    assert.deepEqual(after, before)
  })

  it('persists new package ids and loads an old emblem-only save', () => {
    let ship = setFinishingChoice(baseShip(), 'hullMarkingsId', 'exploration-assignment')
    ship = setFinishingChoice(ship, 'nacelleCapsId', 'modernized')
    saveShip(ship)
    const loaded = loadShip()
    assert.equal(loaded.hullMarkingsId, 'exploration-assignment')
    assert.equal(loaded.nacelleCapsId, 'modernized')

    const legacy = persistedShip(baseShip())
    legacy.emblemStyleId = 'federation-insignia'
    delete legacy.appearanceDetail
    const fromLegacy = shipFromRecord(legacy)
    assert.equal(fromLegacy.emblemStyleId, 'federation-insignia')
  })

  it('exports context tags for contextual packages without claiming dialogue runtime', () => {
    let ship = setFinishingChoice(baseShip(), 'bridgeLayoutId', 'tactical')
    ship = setFinishingChoice(ship, 'hullMarkingsId', 'special-operations')
    const entries = getAppearanceContextEntries(ship)
    const bridge = entries.find((entry) => entry.optionId === 'tactical')
    const hull = entries.find((entry) => entry.optionId === 'special-operations')
    assert.ok(bridge?.contextTags.includes('tactical'))
    assert.ok(hull?.contextTags.includes('covert'))
  })
})
