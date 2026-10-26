import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  clearMissionProfile,
  clearSpaceframe,
  clearTimeframe,
  createEmptyShip,
  departmentScore,
  getExampleClasses,
  getMissionProfileById,
  getMissionProfiles,
  getSpaceframeById,
  getSpaceframes,
  pickMissionProfile,
  selectMissionProfile,
  selectMissionProfileSystem,
  selectMissionProfileTalent,
  selectSpaceframe,
  selectTimeframe,
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

const DEPARTMENTS = ['command', 'conn', 'engineering', 'security', 'science', 'medicine']
const SYSTEMS = ['comms', 'engines', 'structure', 'computers', 'sensors', 'weapons']

describe('starship mission profile', () => {
  beforeEach(() => stored.clear())

  it('lists the ten book profiles, with the checked baselines and talent counts', () => {
    const profiles = getMissionProfiles()
    assert.deepEqual(profiles.map((profile) => profile.id), [
      'battlecruiser',
      'crisis-response',
      'espionage',
      'flagship',
      'multirole-explorer',
      'pathfinder',
      'patrol',
      'scientific-survey',
      'strategic-diplomatic',
      'tactical',
    ])
    const battlecruiser = getMissionProfileById('battlecruiser')
    assert.equal(battlecruiser.system, 'weapons')
    assert.deepEqual(battlecruiser.departments, { command: 2, conn: 2, engineering: 2, security: 3, science: 2, medicine: 1 })
    assert.equal(battlecruiser.talents.length, 5)
    const multirole = getMissionProfileById('multirole-explorer')
    assert.equal(multirole.system, 'choice')
    assert.deepEqual(multirole.departments, { command: 2, conn: 2, engineering: 2, security: 2, science: 2, medicine: 2 })
    assert.equal(multirole.talents.length, 5)
    const survey = getMissionProfileById('scientific-survey')
    assert.equal(survey.system, 'computers')
    assert.deepEqual(survey.departments, { command: 2, conn: 1, engineering: 3, security: 1, science: 3, medicine: 2 })
    assert.equal(survey.talents.length, 4)
  })

  it('stores only the profile ids and leaves the class record unchanged', () => {
    const frame = getSpaceframeById('constitution')
    const next = selectMissionProfileTalent(selectMissionProfile(constitution(), 'battlecruiser'), 'ablative-armor')
    assert.deepEqual(next, saved({
      timeframeId: 'tos',
      spaceframeId: 'constitution',
      missionProfileId: 'battlecruiser',
      missionProfileTalentId: 'ablative-armor',
      missionProfileSystemId: 'weapons',
    }))
    assert.equal(next.departments, undefined)
    assert.equal(next.systems, undefined)
    assert.equal(frame.systems.weapons, 7)
    assert.equal(systemScore(next, 'weapons'), 8)
    assert.equal(systemScore(next, 'comms'), 7)
    assert.equal(departmentScore(next, 'security'), 4)
    assert.equal(departmentScore(next, 'command'), 3)
    assert.equal(departmentScore(next, 'science'), 3)
  })

  it('drops the previous system increase and talent when the profile changes', () => {
    const battle = selectMissionProfileTalent(selectMissionProfile(constitution(), 'battlecruiser'), 'ablative-armor')
    const flagship = selectMissionProfile(battle, 'flagship')
    assert.equal(flagship.missionProfileTalentId, null)
    assert.equal(flagship.missionProfileSystemId, 'comms')
    assert.equal(systemScore(flagship, 'weapons'), 7)
    assert.equal(systemScore(flagship, 'comms'), 8)
    assert.equal(departmentScore(flagship, 'command'), 4)
    assert.equal(selectMissionProfile(battle, 'battlecruiser'), battle)
    assert.equal(selectMissionProfile(battle, 'no-such-profile'), battle)
    assert.equal(selectMissionProfileTalent(battle, 'diplomatic-suites'), battle)
    assert.equal(selectMissionProfileSystem(battle, 'engines'), battle)
  })

  it('adds 1 to a Multirole Explorer system only after one is chosen', () => {
    const open = selectMissionProfile(constitution(), 'multirole-explorer')
    assert.equal(open.missionProfileSystemId, null)
    for (const system of SYSTEMS) assert.equal(systemScore(open, system), getSpaceframeById('constitution').systems[system])
    const engines = selectMissionProfileSystem(open, 'engines')
    assert.equal(systemScore(engines, 'engines'), 9)
    assert.equal(systemScore(engines, 'weapons'), 7)
    assert.equal(selectMissionProfileSystem(engines, 'not-a-system'), engines)
  })

  it('saves and loads the profile, and an older save without one still loads', () => {
    const selected = selectMissionProfileTalent(selectMissionProfile(constitution(), 'battlecruiser'), 'command-ship')
    saveShip(selected)
    assert.deepEqual(loadShip(), selected)
    stored.set('st-adventures.ship', JSON.stringify({ version: 1, timeframeId: 'voy', spaceframeId: 'intrepid' }))
    assert.deepEqual(loadShip(), saved({ timeframeId: 'voy', spaceframeId: 'intrepid' }))
    stored.set('st-adventures.ship', JSON.stringify({
      version: 1,
      timeframeId: 'tos',
      spaceframeId: 'constitution',
      missionProfileId: 'battlecruiser',
      missionProfileTalentId: 'not-a-talent',
      missionProfileSystemId: 'engines',
    }))
    assert.deepEqual(loadShip(), saved({
      timeframeId: 'tos',
      spaceframeId: 'constitution',
      missionProfileId: 'battlecruiser',
      missionProfileSystemId: 'weapons',
    }))
    stored.set('st-adventures.ship', JSON.stringify({ version: 1, timeframeId: 'tos', missionProfileId: 'exploration' }))
    assert.deepEqual(loadShip(), saved({ timeframeId: 'tos' }))
  })

  it('clears only the profile, keeps it when the class is cleared, and drops it with the era', () => {
    const selected = selectMissionProfile(constitution(), 'tactical')
    assert.deepEqual(clearMissionProfile(selected), saved({ timeframeId: 'tos', spaceframeId: 'constitution' }))
    const withoutClass = clearSpaceframe(selected)
    assert.equal(withoutClass.missionProfileId, 'tactical')
    assert.equal(withoutClass.spaceframeId, null)
    assert.equal(departmentScore(withoutClass, 'security'), null)
    assert.deepEqual(clearTimeframe(selected), saved({}))
    const kept = selectTimeframe(selected, 'tmp')
    assert.equal(kept.spaceframeId, 'constitution')
    assert.equal(kept.missionProfileId, 'tactical')
  })

  it('leaves the example classes unchanged, and no current pair exceeds the book caps', () => {
    assert.deepEqual(getExampleClasses().map((entry) => entry.id), ['constitution', 'miranda', 'excelsior-early', 'intrepid', 'new-orleans'])
    for (const frame of getSpaceframes()) {
      for (const profile of getMissionProfiles()) {
        for (const department of DEPARTMENTS) {
          assert.ok(profile.departments[department] + frame.departmentModifiers[department] <= 5)
        }
        for (const system of SYSTEMS) assert.ok(frame.systems[system] + 1 <= 12)
      }
    }
  })

  it('picks one talent from the chosen profile, and a system only for Multirole Explorer', () => {
    const battle = pickMissionProfile(constitution(), () => 0)
    assert.equal(battle.missionProfileId, 'battlecruiser')
    assert.equal(battle.missionProfileTalentId, 'ablative-armor')
    assert.equal(battle.missionProfileSystemId, 'weapons')
    const values = [0.4, 0, 0.5]
    let index = 0
    const multirole = pickMissionProfile(constitution(), () => values[index++])
    assert.equal(multirole.missionProfileId, 'multirole-explorer')
    assert.equal(multirole.missionProfileTalentId, 'improved-hull-integrity')
    assert.equal(multirole.missionProfileSystemId, 'computers')
    assert.equal(systemScore(multirole, 'computers'), 8)
    assert.equal(systemScore(multirole, 'engines'), 8)
  })
})
