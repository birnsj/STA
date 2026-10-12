// The Deck 10 Brig played from start to finish through explorationReducer, the one entry point the screen uses: talk to
// Lt. Okafor, restore power, get through the east bulkhead, defeat the Klingon guards. Everything goes through the real
// maps, challenges.json and conversation file, with a seeded state; the asserts are about structure (which flags,
// objectives and states follow which step), never about which dice came up, so authored content can change without
// breaking them as long as the mission still hangs together.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import engineerFile from '../conversations/engineerSealedSection.json'
import brigFile from '../maps/Deck 10 Brig.json'
import { parseConversation } from '../src/conversation/conversationFormat.js'
import { getAvailableActions } from '../src/exploration/challengeObjects.js'
import { MODE } from '../src/exploration/combatLink.js'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { objectiveStatus } from '../src/exploration/missionFlags.js'
import { isMissionAccomplished, isMissionFailed } from '../src/exploration/missionObjectives.js'
import { parseMapFile } from '../src/maps/mapFormat.js'
import { objectFor } from '../src/world/objects.js'
import { makeCharacter } from './support/characters.js'

const engineerTalk = parseConversation(engineerFile, 'engineerSealedSection')
const GUARDS = ['guardA', 'guardB', 'guardC']
const MAX_ATTEMPTS = 40

// Strong enough that a few seeded attempts always get through; the test never depends on a particular roll.
const team = () => [
  makeCharacter({ id: 'alpha', name: 'Alpha', attributes: { reason: 12, control: 12 }, disciplines: { engineering: 5, science: 4, security: 4 }, equipment: [{ itemId: 'engineeringTricorder', name: 'Engineering Tricorder' }] }),
  makeCharacter({ id: 'beta', name: 'Beta', attributes: { reason: 11, control: 11 }, disciplines: { engineering: 4, science: 4, security: 4 } }),
]
const brig = (seed = 11) => createExplorationState(parseMapFile({ ...brigFile, objectPlacements: {} }, 'Deck 10 Brig'), team(), seed, { enemiesActive: false })

const dispatch = (state, action) => explorationReducer(state, action)
const flags = (state) => state.scenario.flags
const status = (state, id) => objectiveStatus(flags(state), id)
const objectState = (state, id) => objectFor(state.scenario, id).runtime(state.scenario).state
const standAt = (state, objectId, memberId = 'alpha') => {
  const [x, y] = objectFor(state.scenario, objectId).definition.position
  return { ...state, party: { ...state.party, members: { ...state.party.members, [memberId]: { ...state.party.members[memberId], position: { x: x + 0.5, y: y + 0.5 } } } } }
}
const talkToEngineer = (state) => dispatch(dispatch(state, { type: 'talk', npcId: 'engineer', definition: engineerTalk }), { type: 'conversationLeave' })
const attempt = (state, objectId, actionId, performerId = 'alpha') => dispatch(state, { type: 'challenge', objectId, actionId, performerId })

// Tries the action until the object leaves `from` (a failed roll can be retried; locks and noise don't stop the test).
function succeed(state, objectId, actionId, from) {
  let next = standAt(state, objectId)
  for (let tries = 0; tries < MAX_ATTEMPTS && objectState(next, objectId) === from; tries += 1) next = attempt(next, objectId, actionId)
  assert.notEqual(objectState(next, objectId), from, `${objectId}: ${actionId} never succeeded in ${MAX_ATTEMPTS} attempts`)
  return next
}

// Attacks the NPC, leaves everyone they dragged into the fight Defeated, and comes back out the way the screen does.
function defeatGuard(state, npcId) {
  const fighting = dispatch(state, { type: 'attackNpc', npcId, targetId: 'alpha' })
  assert.equal(fighting.mode, MODE.COMBAT, `attacking ${npcId} starts a fight`)
  const combatants = { ...fighting.combat.combatants }
  fighting.link.npcIds.forEach((id) => {
    combatants[id] = { ...combatants[id], condition: { ...combatants[id].condition, defeated: true } }
  })
  const ended = dispatch({ ...fighting, combat: { ...fighting.combat, combatants } }, { type: 'endCombat' })
  assert.equal(ended.mode, MODE.EXPLORATION)
  return ended
}

describe('Deck 10 Brig, start to finish', () => {
  it('starts with only the power objective active and the bulkheads sealed', () => {
    const state = brig()
    assert.equal(status(state, 'restorePower'), 'active')
    for (const id of ['okaforClearance', 'enterEastSection', 'klingonGuards']) assert.equal(status(state, id), null, id)
    assert.equal(objectState(state, 'eastBulkheadSouth'), 'sealed')
    assert.equal(isMissionAccomplished(state), false)
  })

  it('can be completed in order: talk, power, clearance, bulkhead, guards', () => {
    let state = brig()

    state = talkToEngineer(state)
    assert.equal(flags(state).engineerMet, true)
    assert.equal(status(state, 'okaforClearance'), 'active', 'meeting her opens the clearance objective')
    assert.equal(state.conversation, null)
    assert.equal(flags(state).sectionAccessGranted, undefined, 'no clearance before there is power')

    // Sealed, unpowered: the bulkhead offers nothing yet (the open approaches are not available).
    assert.ok(objectFor(state.scenario, 'eastBulkheadSouth').listedActions(state).every(({ available }) => !available))

    state = succeed(state, 'powerJunction01', 'restorePower', 'offline')
    assert.equal(objectState(state, 'powerJunction01'), 'online')
    assert.equal(flags(state).stationPowerRestored, true)
    assert.equal(status(state, 'restorePower'), 'complete')
    assert.equal(status(state, 'enterEastSection'), 'active', 'power makes the bulkhead objective active')

    state = talkToEngineer(state)
    assert.equal(flags(state).sectionAccessGranted, true)
    assert.equal(status(state, 'okaforClearance'), 'complete')

    state = standAt(state, 'eastBulkheadSouth')
    assert.ok(getAvailableActions(state, 'eastBulkheadSouth').some(({ action, available }) => action.id === 'openDoor' && available))
    state = attempt(state, 'eastBulkheadSouth', 'openDoor')
    assert.equal(objectState(state, 'eastBulkheadSouth'), 'open')
    assert.equal(flags(state).eastSectionOpen, true)
    assert.equal(status(state, 'enterEastSection'), 'complete')
    assert.equal(status(state, 'klingonGuards'), 'active', 'opening the way brings the guards into the mission')
    assert.equal(isMissionAccomplished(state), false)

    // One fight can pull the other guards in (they hear it), so keep going until each is recorded as defeated.
    for (let fights = 0; fights < GUARDS.length; fights += 1) {
      const next = GUARDS.find((id) => !flags(state)[`defeated.${id}`])
      if (!next) break
      assert.equal(status(state, 'klingonGuards'), 'active', `before the fight with ${next}`)
      state = defeatGuard(state, next)
    }
    GUARDS.forEach((id) => assert.equal(flags(state)[`defeated.${id}`], true, `${id} is recorded as defeated`))
    assert.equal(status(state, 'klingonGuards'), 'complete')
    assert.equal(isMissionAccomplished(state), true)
  })

  it('the Captain\u2019s Log records the way through, once per step and in order', () => {
    let state = talkToEngineer(brig())
    state = succeed(state, 'powerJunction01', 'restorePower', 'offline')
    state = talkToEngineer(state)
    const texts = state.missionLog.entries.map((entry) => entry.text)
    assert.ok(texts.length >= 3)
    assert.ok(texts.some((text) => text.startsWith('New objective:')), 'an objective becoming active is logged')
    assert.ok(texts.some((text) => text.startsWith('Objective complete:')), 'an objective completing is logged')
    assert.equal(new Set(texts).size, texts.length, 'no entry is written twice')
    assert.ok(texts.findIndex((text) => /grid back online|brought the section/i.test(text)) < texts.findIndex((text) => /cleared us through/i.test(text)), 'the repair comes before the clearance')
  })

  it('fails if Lt. Okafor (Must survive) is fought at all, however the fight ends', () => {
    const fightWith = (state, condition, extra = {}) => {
      const fighting = dispatch(state, { type: 'attackNpc', npcId: 'engineer', targetId: 'alpha' })
      assert.equal(fighting.mode, MODE.COMBAT)
      const engineer = fighting.combat.combatants.engineer
      const combatants = { ...fighting.combat.combatants, engineer: { ...engineer, ...extra, condition: { ...engineer.condition, ...condition } } }
      return dispatch({ ...fighting, combat: { ...fighting.combat, combatants } }, { type: 'endCombat' })
    }
    const deadly = { id: 'i1', type: 'deadly', severity: 2, treated: false }

    const stressed = fightWith(brig(), { stress: 4 })
    assert.equal(isMissionFailed(stressed), true, 'fighting her at all fails it, even if she is still standing')

    const stunned = fightWith(brig(), { defeated: true, injuries: [{ ...deadly, type: 'stun' }] })
    assert.equal(isMissionFailed(stunned), true, 'Defeated by Stun fails it')
    assert.deepEqual(stunned.missionFailed.npcIds, ['engineer'])
    assert.ok(stunned.missionLog.entries.some((entry) => /We failed to protect .*Okafor\. Mission failed\./.test(entry.text)))
    const surrendered = fightWith(brig(), { stress: 6 }, { surrendered: true })
    assert.equal(isMissionFailed(surrendered), true, 'surrendering fails it')
    const fled = fightWith(brig(), {}, { fled: true })
    assert.equal(isMissionFailed(fled), true, 'fleeing (beaming out) fails it')
    const treated = fightWith(brig(), { defeated: true, dying: true, injuries: [{ ...deadly, treated: true }] })
    assert.equal(isMissionFailed(treated), true, 'Dying, even treated, fails it')
    const killed = fightWith(brig(), { defeated: true, dying: true, injuries: [deadly] })
    assert.equal(isMissionFailed(killed), true)
    const dead = fightWith(brig(), { defeated: true, dead: true, injuries: [] })
    assert.equal(isMissionFailed(dead), true, 'dead outright fails it')

    // Guards are not marked: killing one fails nothing.
    const guard = dispatch(brig(), { type: 'attackNpc', npcId: 'guardA', targetId: 'alpha' })
    const guardDown = { ...guard.combat.combatants }
    guard.link.npcIds.forEach((id) => (guardDown[id] = { ...guardDown[id], condition: { ...guardDown[id].condition, defeated: true, dead: true } }))
    assert.equal(isMissionFailed(dispatch({ ...guard, combat: { ...guard.combat, combatants: guardDown } }, { type: 'endCombat' })), false)
  })

  it('can take the other routes: diagnose then replace the coupling, and override the lockout without clearance', () => {
    let state = standAt(brig(), 'powerJunction01')
    assert.ok(objectFor(state.scenario, 'powerJunction01').listedActions(state).some(({ action, available }) => action.id === 'replaceCoupling' && !available), 'the easier repair is shown but locked until the fault is found')
    for (let tries = 0; tries < MAX_ATTEMPTS && !flags(state).faultDiagnosed; tries += 1) state = attempt(state, 'powerJunction01', 'scanJunction')
    assert.equal(flags(state).faultDiagnosed, true)
    state = succeed(state, 'powerJunction01', 'replaceCoupling', 'offline')
    assert.equal(flags(state).stationPowerRestored, true)

    state = succeed(state, 'eastBulkheadSouth', 'overrideLock', 'sealed')
    assert.equal(flags(state).eastSectionOpen, true)
    assert.equal(status(state, 'enterEastSection'), 'complete')
    assert.notEqual(status(state, 'okaforClearance'), 'complete', 'the override does not earn her clearance')
    assert.equal(isMissionAccomplished(state), false, 'every objective has to be complete, including the clearance')
  })
})
