import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  clearServiceRecord,
  clearSpaceframe,
  clearTimeframe,
  createEmptyShip,
  departmentScore,
  getServiceRecordById,
  getServiceRecords,
  getSpaceframeById,
  isMissionProfileComplete,
  pickServiceRecord,
  selectMissionProfile,
  selectMissionProfileTalent,
  selectServiceRecord,
  selectSpaceframe,
  selectTimeframe,
  setServiceRecordDetail,
  shipTraitNames,
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

const saved = (fields) => ({
  version: 1,
  timeframeId: null,
  spaceframeId: null,
  missionProfileId: null,
  missionProfileTalentId: null,
  missionProfileSystemId: null,
  serviceRecordId: null,
  serviceRecordDetail: null,
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

const constitution = () => selectSpaceframe(selectTimeframe(createEmptyShip(), 'tos'), 'constitution')

describe('starship service record', () => {
  beforeEach(() => stored.clear())

  it('lists the six book records and the checked rules', () => {
    assert.deepEqual(getServiceRecords().map((record) => record.id), [
      'aging-relic',
      'dependable-workhorse',
      'legendary',
      'hope-ship',
      'prototype',
      'survivor',
    ])
    assert.equal(getServiceRecordById('aging-relic').ruleName, 'Larger Crew')
    assert.equal(getServiceRecordById('prototype').ruleName, 'Experimental Vessel')
    assert.equal(getServiceRecordById('survivor').ruleName, 'Ready for Battle')
    assert.equal(getServiceRecordById('survivor').namesake, true)
  })

  it('stores only the record id and leaves the class and profile scores unchanged', () => {
    const frame = getSpaceframeById('constitution')
    const profiled = selectMissionProfileTalent(selectMissionProfile(constitution(), 'battlecruiser'), 'ablative-armor')
    const next = selectServiceRecord(profiled, 'legendary')
    assert.equal(next.serviceRecordId, 'legendary')
    assert.equal(next.serviceRecordDetail, null)
    assert.equal(next.departments, undefined)
    assert.equal(frame, getSpaceframeById('constitution'))
    assert.equal(departmentScore(next, 'security'), 4)
    assert.ok(shipTraitNames(next).includes('Legendary'))
    assert.equal(shipTraitNames(next).filter((name) => name === 'Legendary').length, 1)
    assert.equal(selectServiceRecord(next, 'no-such-record'), next)
  })

  it('drops the previous record when another is chosen', () => {
    const legendary = selectServiceRecord(constitution(), 'legendary')
    const hope = selectServiceRecord(legendary, 'hope-ship')
    assert.equal(hope.serviceRecordId, 'hope-ship')
    assert.equal(shipTraitNames(hope).includes('Legendary'), false)
    assert.ok(shipTraitNames(hope).includes('Hope Ship'))
  })

  it('keeps a Survivor name, clears it with another record, and ignores a blank name', () => {
    const survivor = selectServiceRecord(constitution(), 'survivor')
    assert.equal(serviceTitle(survivor), null)
    const named = setServiceRecordDetail(survivor, '  Wolf 359  ')
    assert.equal(named.serviceRecordDetail, 'Wolf 359')
    assert.ok(shipTraitNames(named).includes('Survivor of Wolf 359'))
    assert.equal(setServiceRecordDetail(named, '   ').serviceRecordDetail, null)
    assert.equal(shipTraitNames(setServiceRecordDetail(named, '   ')).includes('Survivor of Wolf 359'), false)
    const hope = selectServiceRecord(named, 'hope-ship')
    assert.equal(hope.serviceRecordDetail, null)
    assert.equal(setServiceRecordDetail(hope, 'Wolf 359'), hope)
    assert.equal(selectServiceRecord(named, 'survivor'), named)
  })

  it('saves and loads the record, and an older save without one still loads', () => {
    const selected = setServiceRecordDetail(selectServiceRecord(constitution(), 'survivor'), 'Wolf 359')
    saveShip(selected)
    assert.deepEqual(loadShip(), selected)
    stored.set('st-adventures.ship', JSON.stringify({ version: 1, timeframeId: 'tos', spaceframeId: 'constitution' }))
    assert.deepEqual(loadShip(), saved({ timeframeId: 'tos', spaceframeId: 'constitution' }))
    stored.set('st-adventures.ship', JSON.stringify({
      version: 1,
      timeframeId: 'tos',
      spaceframeId: 'constitution',
      serviceRecordId: 'frontier-operations',
      serviceRecordDetail: 'Wolf 359',
    }))
    assert.deepEqual(loadShip(), saved({ timeframeId: 'tos', spaceframeId: 'constitution' }))
  })

  it('clears only the record, keeps it when the class changes, and drops it with the era', () => {
    const selected = selectServiceRecord(constitution(), 'legendary')
    assert.deepEqual(clearServiceRecord(selected), saved({ timeframeId: 'tos', spaceframeId: 'constitution' }))
    const moved = selectSpaceframe(selectTimeframe(selected, 'tmp'), 'excelsior')
    assert.equal(moved.spaceframeId, 'excelsior')
    assert.equal(moved.serviceRecordId, 'legendary')
    assert.deepEqual(clearTimeframe(selected), saved({}))
  })

  it('picks a record that does not ask for a name', () => {
    for (let step = 0; step < 20; step += 1) {
      const next = pickServiceRecord(constitution(), () => step / 20)
      assert.notEqual(next.serviceRecordId, 'survivor')
      assert.equal(next.serviceRecordDetail, null)
    }
    assert.equal(pickServiceRecord(constitution(), () => 0).serviceRecordId, 'aging-relic')
  })

  it('treats the mission profile as complete only when its talent and system are chosen', () => {
    const open = selectMissionProfile(constitution(), 'battlecruiser')
    assert.equal(isMissionProfileComplete(open), false)
    assert.equal(isMissionProfileComplete(selectMissionProfileTalent(open, 'ablative-armor')), true)
    const multirole = selectMissionProfile(constitution(), 'multirole-explorer')
    assert.equal(isMissionProfileComplete(selectMissionProfileTalent(multirole, 'rugged-design')), false)
  })
})

function serviceTitle(ship) {
  return shipTraitNames(ship).find((name) => name.startsWith('Survivor of')) ?? null
}
