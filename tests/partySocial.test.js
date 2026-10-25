// Persuade and Intimidate on an NPC in exploration (social.json; PROTOTYPE PROPOSAL, designer request 2026-10-12): the
// combat opposed roll, then the NPC's disposition moves instead of Stress.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import socialData from '../src/data/adaptation/exploration/social.json' with { type: 'json' }
import { isHostile, STATE } from '../src/exploration/awareness.js'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { canAskNpc, socialCooldown } from '../src/exploration/partySocial.js'
import { createNode } from '../src/conversation/conversationFormat.js'
import { currentCheck, previewCheck } from '../src/conversation/conversationRuntime.js'
import { MODE } from '../src/exploration/combatLink.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

// The party at the west end, one NPC eight tiles east (just within earshot of alpha).
function testMap() {
  const map = createBlankMap({ name: 'Social Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [
    { x: 2, y: 5 },
    { x: 2, y: 7 },
  ]
  map.markers.enemySpawns = [{ x: 10, y: 6 }]
  return map
}

const talker = (id) => makeCharacter({ id, name: id, attributes: { presence: 12, control: 12 }, disciplines: { command: 5, security: 5 } })
const npcIdOf = (state) => Object.keys(state.world.npcs)[0]
function start(seed, disposition) {
  const state = createExplorationState(testMap(), [talker('alpha'), talker('beta')], seed, { enemiesActive: false })
  const npcId = npcIdOf(state)
  return { ...state, world: { ...state.world, npcs: { ...state.world.npcs, [npcId]: { ...state.world.npcs[npcId], disposition, responseType: null } } } }
}

// The first seed whose request comes out as wanted.
function find(disposition, kind, wanted) {
  for (let seed = 0; seed < 300; seed++) {
    const state = start(seed, disposition)
    const next = explorationReducer(state, { type: 'askNpc', memberId: 'alpha', npcId: npcIdOf(state), kind })
    if (next.lastSocial && next.lastSocial.passed === wanted) return { state, next, npcId: npcIdOf(state) }
  }
  assert.fail(`no ${wanted ? 'win' : 'loss'} found for ${kind}`)
}

describe('Persuade and Intimidate in exploration (Prototype)', () => {
  it('needs an NPC within earshot that is not already friendly, and starts a shared cooldown', () => {
    const state = start(1, 'wary')
    const npcId = npcIdOf(state)
    assert.equal(canAskNpc(state, 'alpha', npcId, 'persuade').possible, true)
    const far = { ...state, world: { ...state.world, npcs: { ...state.world.npcs, [npcId]: { ...state.world.npcs[npcId], position: { x: 15, y: 6 } } } } }
    assert.equal(canAskNpc(far, 'alpha', npcId, 'persuade').possible, false)
    assert.equal(canAskNpc(start(1, 'friendly'), 'alpha', npcId, 'persuade').possible, false)
    const asked = explorationReducer(state, { type: 'askNpc', memberId: 'alpha', npcId, kind: 'persuade' })
    assert.equal(socialCooldown(asked, 'alpha'), socialData.cooldownSeconds)
    assert.equal(canAskNpc(asked, 'alpha', npcId, 'intimidate').possible, false)
    assert.equal(asked.scenario.taskCount, state.scenario.taskCount + 1)
    assert.equal(asked.missionLog.entries.at(-1).kind, 'task')
  })

  it('does not allow a member in a transporter transition to use a social action', () => {
    const state = start(1, 'wary')
    const npcId = npcIdOf(state)
    for (const transition of [{ beaming: true }, { arriving: true }]) {
      const member = { ...state.party.members.alpha, ...transition }
      const blocked = { ...state, party: { ...state.party, members: { ...state.party.members, alpha: member } } }
      assert.equal(canAskNpc(blocked, 'alpha', npcId, 'persuade').possible, false)
      assert.equal(explorationReducer(blocked, { type: 'askNpc', memberId: 'alpha', npcId, kind: 'persuade' }), blocked)
    }
  })

  it('a won Persuade makes the NPC one step friendlier and its conversation checks easier; a lost one changes nothing', () => {
    const won = find('hostile', 'persuade', true)
    assert.equal(won.next.world.npcs[won.npcId].disposition, 'wary')
    assert.equal(won.next.npcSocial[won.npcId].checkDifficulty, socialData.conversationDifficulty.persuadeWin)
    assert.ok(won.next.resources.momentum >= won.state.resources.momentum)
    const lost = find('hostile', 'persuade', false)
    assert.equal(lost.next.world.npcs[lost.npcId].disposition, 'hostile')
    assert.equal(lost.next.npcSocial[lost.npcId].checkDifficulty, 0)
  })

  it('a won Intimidate makes a hostile NPC stand down and marks it Intimidated', () => {
    const { next, npcId } = find('aggressive', 'intimidate', true)
    const npc = next.world.npcs[npcId]
    assert.equal(npc.disposition, 'neutral')
    assert.equal(isHostile(npc), false)
    assert.equal(npc.combatReady, null)
    assert.equal(next.npcSocial[npcId].intimidated, true)
    assert.equal(next.lastSocial.stoodDown, true)
  })

  it('a lost Intimidate on an aggressive NPC provokes it into attacking the one who threatened it', () => {
    const { next, npcId } = find('aggressive', 'intimidate', false)
    assert.equal(next.mode, MODE.COMBAT)
    assert.deepEqual(next.link.npcIds, [npcId])
    assert.equal(next.link.trigger.source, 'PROVOKED')
  })

  it('a won Intimidate on an NPC that would not fight moves it two steps friendlier', () => {
    const { next, npcId } = find('neutral', 'intimidate', true)
    assert.equal(next.world.npcs[npcId].disposition, 'friendly')
    assert.equal(next.lastSocial.stoodDown, false)
  })

  it('a lost Intimidate makes the NPC one step more hostile, alerts it to the asker and makes its checks harder', () => {
    const { next, npcId } = find('neutral', 'intimidate', false)
    const npc = next.world.npcs[npcId]
    assert.equal(npc.disposition, 'wary')
    assert.equal(npc.awareness.alpha.state, STATE.ALERTED)
    assert.equal(next.npcSocial[npcId].checkDifficulty, socialData.conversationDifficulty.intimidateLoss)
    assert.equal(next.mode, MODE.EXPLORATION)
  })
})

// A one-check conversation: Success and Failure each say so and end.
const checkTalk = {
  id: 'socialCheck',
  name: 'Social check',
  start: 'c',
  nodes: [
    { ...createNode('check', 'c'), label: 'Talk them round', attribute: 'presence', department: 'command', difficulty: 2, success: 'win', failure: 'lose' },
    { ...createNode('npc', 'win'), text: 'Fine.', next: 'end' },
    { ...createNode('npc', 'lose'), text: 'No.', next: 'end' },
    createNode('end', 'end'),
  ],
}
const withSocial = (state, social) => ({ ...state, npcSocial: { [npcIdOf(state)]: social } })
const talkTo = (state) => explorationReducer(state, { type: 'talk', npcId: npcIdOf(state), definition: checkTalk })

describe('Persuade and Intimidate change the NPC conversation checks', () => {
  it('an Intimidated NPC lets every check pass without a roll', () => {
    const talking = talkTo(withSocial(start(1, 'neutral'), { intimidated: true, checkDifficulty: 0 }))
    assert.equal(currentCheck(talking), null)
    assert.equal(talking.conversation.nodeId, 'win')
  })

  it('a Persuaded NPC lowers the check Difficulty, an angered one raises it (never below 0)', () => {
    const plain = talkTo(start(1, 'neutral'))
    const node = currentCheck(plain)
    assert.equal(previewCheck(plain, node, 'alpha').difficulty, 2)
    assert.equal(previewCheck(talkTo(withSocial(start(1, 'neutral'), { checkDifficulty: -1 })), node, 'alpha').difficulty, 1)
    assert.equal(previewCheck(talkTo(withSocial(start(1, 'neutral'), { checkDifficulty: 2 })), node, 'alpha').difficulty, 4)
    assert.equal(previewCheck(talkTo(withSocial(start(1, 'neutral'), { checkDifficulty: -3 })), node, 'alpha').difficulty, 0)
  })
})
