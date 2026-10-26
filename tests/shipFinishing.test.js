import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  addRefit,
  applyNotableExample,
  createEmptyShip,
  departmentScore,
  getExampleClasses,
  getSpaceframeById,
  isFinishingTouchesComplete,
  isRefitsFinished,
  namePrefix,
  pickFinishing,
  registryPrefix,
  registryRequired,
  selectMissionProfile,
  selectMissionProfileTalent,
  selectServiceRecord,
  selectSpaceframe,
  selectTimeframe,
  setFinishingChoice,
  setRegistry,
  setShipName,
  shipDisplayName,
  shipDisplayRegistry,
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

describe('starship finishing touches', () => {
  beforeEach(() => stored.clear())

  it('stores a Federation name and registry without doubling the prefix', () => {
    const frame = getSpaceframeById('constitution')
    let ship = setShipName(battlecruiser(shipOf('tos', 'constitution')), 'U.S.S. Endeavour')
    ship = setRegistry(ship, 'NCC-1701')
    assert.equal(ship.shipName, 'Endeavour')
    assert.equal(ship.registry, '1701')
    assert.equal(shipDisplayName(ship), 'U.S.S. Endeavour')
    assert.equal(shipDisplayRegistry(ship), 'NCC-1701')
    assert.equal(frame.systems.weapons, 7)
    ship = selectServiceRecord(ship, 'prototype')
    assert.equal(ship.registry, '1701')
    assert.equal(shipDisplayRegistry(ship), 'NX-1701')
    assert.equal(getSpaceframeById('constitution').systems.weapons, 7)
  })

  it('lets a Klingon ship finish on a name, and gives a Cardassian ship no invented prefix', () => {
    const klingon = setShipName(shipOf('tos', 'd7'), 'I.K.S. Rotarran')
    assert.equal(klingon.shipName, 'Rotarran')
    assert.equal(namePrefix(klingon), 'I.K.S.')
    assert.equal(registryPrefix(klingon), null)
    assert.equal(registryRequired(klingon), false)
    assert.equal(isFinishingTouchesComplete(klingon), true)
    const cardassian = setShipName(shipOf('tng', 'galor'), 'Aldara')
    assert.equal(namePrefix(cardassian), null)
    assert.equal(registryPrefix(cardassian), null)
    assert.equal(isFinishingTouchesComplete(cardassian), true)
    assert.equal(namePrefix(shipOf('tos', 'tliss')), 'I.R.W.')
    assert.equal(registryPrefix(shipOf('tos', 'nx')), 'NX')
    assert.equal(namePrefix(shipOf('tos', 'nx')), null)
  })

  it('keeps a cosmetic choice from changing Weapons or Security', () => {
    let ship = battlecruiser(shipOf('tos', 'constitution'))
    ship = setFinishingChoice(ship, 'bridgeLayoutId', 'tactical')
    ship = setFinishingChoice(ship, 'emblemStyleId', 'federation-insignia')
    assert.equal(systemScore(ship, 'weapons'), 8)
    assert.equal(departmentScore(ship, 'security'), 4)
    assert.equal(setFinishingChoice(ship, 'emblemStyleId', 'no-such'), ship)
  })

  it('saves the new fields, loads an old save as empty, and keeps the name when the class changes', () => {
    let ship = setRegistry(setShipName(battlecruiser(shipOf('tos', 'constitution')), 'Endeavour'), '1701')
    ship = setFinishingChoice(ship, 'bridgeLayoutId', 'standard')
    saveShip(ship)
    const loaded = loadShip()
    assert.equal(loaded.shipName, 'Endeavour')
    assert.equal(loaded.registry, '1701')
    assert.equal(loaded.bridgeLayoutId, 'standard')
    stored.set('st-adventures.ship', JSON.stringify({ version: 1, timeframeId: 'tos', spaceframeId: 'constitution' }))
    assert.equal(loadShip().shipName, null)
    assert.equal(loadShip().emblemStyleId, null)
    saveShip({ ...ship, emblemStyleId: 'no-such' })
    assert.equal(loadShip().emblemStyleId, null)
    assert.equal(loadShip().shipName, 'Endeavour')
    const moved = selectSpaceframe(ship, 'nx')
    assert.equal(moved.shipName, 'Endeavour')
    assert.equal(moved.spaceframeId, 'nx')
  })

  it('fills the first notable example and finishes refits only when every earned refit is assigned', () => {
    const named = applyNotableExample(shipOf('tos', 'constitution'))
    assert.equal(named.shipName, 'Enterprise')
    assert.equal(named.registry, '1701')
    const picked = pickFinishing(shipOf('tos', 'nx'))
    assert.equal(picked.shipName, 'Enterprise')
    assert.equal(picked.registry, '01')
    const klingon = pickFinishing(shipOf('tos', 'd7'))
    assert.equal(klingon.shipName, 'Devisor')
    assert.equal(klingon.registry, null)
    assert.equal(picked.bridgeLayoutId, 'standard')
    let ready = battlecruiser(shipOf('tos', 'constitution'))
    assert.equal(isRefitsFinished(ready), false)
    for (const system of ['comms', 'engines', 'structure']) ready = addRefit(ready, system)
    assert.equal(isRefitsFinished(ready), true)
    const none = battlecruiser(shipOf('voy', 'intrepid'))
    assert.equal(isRefitsFinished(none), true)
  })

  it('leaves the example class list unchanged', () => {
    assert.deepEqual(getExampleClasses().map((entry) => entry.id), ['constitution', 'miranda', 'excelsior-early', 'intrepid', 'new-orleans'])
  })
})
