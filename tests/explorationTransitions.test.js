// Exploration and the hand-offs to and from Combat Type 1 (exploration/combatLink.js): what a Defeated character can
// do, what survives the end of a fight, and the clock in the editor's passive play-test.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createCombat, getActiveCombatant } from '../src/combat/combatState.js'
import { rollCombatTask } from '../src/combat/combatTasks.js'
import { getItemById, getItemStatLines } from '../src/rules/equipment.js'
import { describeRange, getWeaponForItem } from '../src/combat/weaponSystem.js'
import { getNpcs, tickWorld } from '../src/exploration/awareness.js'
import { endCombat, MODE, startCombat } from '../src/exploration/combatLink.js'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { canAct, partyReducer, withAbleSelection } from '../src/exploration/partyControl.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { MAX_MOMENTUM } from '../src/rules/missionResources.js'
import { buildStaTask } from '../src/rules/taskResolver.js'
import { makeCharacter } from './support/characters.js'

const DEFEATED = { stress: 0, injuries: [], defeated: true }

// A plain room: two party starts near the middle, one enemy spawn facing them two tiles away.
function testMap() {
  const map = createBlankMap({ name: 'Transition Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [
    { x: 9, y: 5 },
    { x: 9, y: 7 },
  ]
  map.markers.enemySpawns = [{ x: 12, y: 6 }]
  return map
}

const team = () => [makeCharacter({ id: 'alpha', name: 'Alpha' }), makeCharacter({ id: 'beta', name: 'Beta' })]
const withCondition = (party, id, condition) => ({ ...party, members: { ...party.members, [id]: { ...party.members[id], condition } } })

describe('a Defeated party member in exploration', () => {
  it('cannot be selected, made leader or regrouped', () => {
    const { party } = createExplorationState(testMap(), team())
    const downed = withCondition(party, 'beta', DEFEATED)
    assert.equal(canAct(downed.members.beta), false)
    assert.equal(partyReducer(downed, { type: 'select', id: 'beta' }), downed)
    assert.equal(partyReducer(downed, { type: 'toggleSelect', id: 'beta' }), downed)
    const regrouped = partyReducer(downed, { type: 'regroup' })
    assert.deepEqual(regrouped.selectedIds, ['alpha'])
    assert.equal(regrouped.members.beta.order, null)
  })

  it('drops out of the selection and the lead; with everyone down the lead stays for the camera', () => {
    const { party } = createExplorationState(testMap(), team())
    const leaderDown = withAbleSelection({ ...withCondition(party, 'alpha', DEFEATED), leaderId: 'alpha' })
    assert.deepEqual(leaderDown.selectedIds, ['beta'])
    assert.equal(leaderDown.leaderId, 'beta')
    const allDown = withAbleSelection(withCondition(withCondition(party, 'alpha', DEFEATED), 'beta', DEFEATED))
    assert.deepEqual(allDown.selectedIds, [])
    assert.equal(allDown.leaderId, party.leaderId)
  })

  it('is not noticed by NPCs, while a standing one in the same spot is', () => {
    const state = createExplorationState(testMap(), team())
    const [npc] = getNpcs(state.world)
    assert.ok(npc, 'the test map should field a fallback NPC')
    const standing = getNpcs(tickWorld(state.world, state.party, 0.05))[0]
    assert.ok(standing.awareness.alpha, 'control: the NPC perceives a standing member here')
    const downed = withCondition(withCondition(state.party, 'alpha', DEFEATED), 'beta', DEFEATED)
    const after = getNpcs(tickWorld(state.world, downed, 0.05))[0]
    assert.equal(after.awareness.alpha, undefined)
    assert.equal(after.awareness.beta, undefined)
  })
})

describe('ending a fight started in the world', () => {
  function inCombat() {
    const state = createExplorationState(testMap(), team())
    const [npc] = getNpcs(state.world)
    const fighting = startCombat(state, { triggerNpcId: npc.id, triggerTargetId: 'alpha' })
    assert.equal(fighting.mode, MODE.COMBAT)
    return fighting
  }

  it('hands back conditions, positions and the mission pools, and a Defeated member leaves the selection', () => {
    const fighting = inCombat()
    const combatants = { ...fighting.combat.combatants, beta: { ...fighting.combat.combatants.beta, condition: DEFEATED, position: { x: 4, y: 4 } } }
    const ended = endCombat({ ...fighting, combat: { ...fighting.combat, combatants, resources: { momentum: 3, threat: 2 } } })
    assert.equal(ended.mode, MODE.EXPLORATION)
    assert.equal(ended.party.members.beta.condition.defeated, true)
    assert.deepEqual(ended.party.members.beta.position, { x: 4, y: 4 })
    assert.deepEqual(ended.resources, { momentum: 3, threat: 2 })
    assert.deepEqual(ended.party.selectedIds, ['alpha'])
  })

  it('clears combat locks, which count rounds of that fight only, and keeps scenario flags and timed locks', () => {
    const fighting = inCombat()
    const scenario = {
      ...fighting.scenario,
      flags: { ...fighting.scenario.flags, alarmRaised: true },
      objects: { ...fighting.scenario.objects, testPanel: { state: 'closed', locks: { open: 30 }, combatLocks: { open: 6 }, difficultyMods: {} } },
    }
    const ended = endCombat({ ...fighting, scenario })
    assert.deepEqual(ended.scenario.objects.testPanel.combatLocks, {})
    assert.deepEqual(ended.scenario.objects.testPanel.locks, { open: 30 })
    assert.equal(ended.scenario.flags.alarmRaised, true)
  })
})

describe("the map editor's passive play-test", () => {
  it('keeps the world clock running (timed locks expire) while NPCs stand still', () => {
    const state = createExplorationState(testMap(), team(), 0, { enemiesActive: false })
    const [npc] = getNpcs(state.world)
    const next = explorationReducer(state, { type: 'tick', seconds: 0.05 })
    assert.equal(next.world.time, state.world.time + 0.05)
    assert.deepEqual(getNpcs(next.world)[0].position, npc.position)
    assert.equal(next.mode, MODE.EXPLORATION)
  })
})

describe('combat tasks and Momentum', () => {
  it('Prototype rule (Book p.260 says otherwise): bonus Momentum is saved to the group pool', () => {
    const map = testMap()
    const combat = createCombat({ map, players: team(), seed: 3 })
    const actor = getActiveCombatant(combat)
    // Target number 20 and Difficulty 0: every die succeeds, so the task always passes.
    const task = { ...buildStaTask(makeCharacter({ attributes: { control: 12 }, disciplines: { command: 8 } }), { attribute: 'control', department: 'command' }), difficulty: 0 }
    const preview = { label: 'Guard', targetId: actor.id, task, prepared: { bonusMomentum: 2, difficultyLines: [] }, assist: null }
    const { state, passed } = rollCombatTask(combat, actor, preview, {}, 'guard')
    assert.equal(passed, true)
    assert.equal(state.result.momentumGenerated, state.result.taskResult.successes + 2)
    assert.equal(state.result.momentumSaved, Math.min(MAX_MOMENTUM, state.result.taskResult.successes + 2))
    assert.equal(state.resources.momentum, Math.min(MAX_MOMENTUM, state.result.taskResult.successes + 2))
  })
})

describe('weapon stats on screen', () => {
  it('come from the combat weapon data, so the Review sheet shows what combat uses', () => {
    for (const itemId of ['phaserType1', 'phaserType2']) {
      const weapon = getWeaponForItem(itemId)
      const lines = Object.fromEntries(getItemStatLines(getItemById(itemId)).map((line) => [line.id, line.value]))
      assert.equal(lines.severity, String(weapon.severity))
      assert.equal(lines.range, describeRange(weapon))
      assert.equal(lines.damage, undefined)
    }
  })
})
