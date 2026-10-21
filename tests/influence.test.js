// A conversation reaching the NPCs around the speaker (exploration/influence.js): who is affected (only the filtered group,
// within the radius, never unrelated bystanders) and what each effect does.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createNode } from '../src/conversation/conversationFormat.js'
import { STATE } from '../src/exploration/awareness.js'
import { MODE } from '../src/exploration/combatLink.js'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { defaultInfluenceRadius, influencedNpcs, influenceNearby } from '../src/exploration/influence.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const team = () => [makeCharacter({ id: 'alpha', name: 'Alpha' }), makeCharacter({ id: 'beta', name: 'Beta' })]

// speaker and mate: one alert group, close. far: the same group, out of the default radius. rival: close, another group.
// loner: close, no group. All Klingons, so they can fight.
function room() {
  const map = createBlankMap({ name: 'Influence Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [
    { x: 4, y: 4 },
    { x: 4, y: 5 },
  ]
  map.markers.enemySpawns = []
  const at = (id, x, y, extra) => ({ id, characterId: 'klingonWarrior1', name: null, position: { x, y }, facing: 180, disposition: 'wary', ...extra })
  map.npcs = [
    at('speaker', 5, 4, { alertGroupId: 'g1' }),
    at('mate', 6, 4, { alertGroupId: 'g1' }),
    at('far', 15, 10, { alertGroupId: 'g1' }),
    at('rival', 6, 5, { alertGroupId: 'g2' }),
    at('loner', 7, 4, {}),
  ]
  return map
}

const fresh = () => createExplorationState(room(), team())
const base = { effect: 'standDown', filter: 'sameGroup', filterId: '', radius: defaultInfluenceRadius, origin: 'speaker', needsSight: false, includeSpeaker: false }
const ids = (state, speakerId, action) => influencedNpcs(state, speakerId, { ...base, ...action }).map((npc) => npc.id)

describe('who a conversation reaches', () => {
  it('is the speaker group within the radius, without the speaker, the far member or any bystander', () => {
    assert.deepEqual(ids(fresh(), 'speaker', {}), ['mate'])
  })

  it('includes the speaker only when asked, and a bigger radius reaches the far member', () => {
    assert.deepEqual(ids(fresh(), 'speaker', { includeSpeaker: true }), ['speaker', 'mate'])
    assert.deepEqual(ids(fresh(), 'speaker', { radius: 20 }), ['mate', 'far'])
    assert.deepEqual(ids(fresh(), 'speaker', { radius: 0.5 }), [])
  })

  it('uses the action radius first, then the speaker\'s own radius, then the default', () => {
    const state = fresh()
    const wide = { ...state, world: { ...state.world, npcs: { ...state.world.npcs, speaker: { ...state.world.npcs.speaker, influenceRadius: 20 } } } }
    const blank = { radius: null }
    assert.deepEqual(ids(state, 'speaker', blank), ['mate'], 'no override: the default radius')
    assert.deepEqual(ids(wide, 'speaker', blank), ['mate', 'far'], "the speaker's radius reaches the far member")
    assert.deepEqual(ids(wide, 'speaker', { radius: 2 }), ['mate'], 'an action radius beats the NPC override')
  })

  it('reaches nobody when the speaker has no group, or the filter names nothing', () => {
    assert.deepEqual(ids(fresh(), 'loner', {}), [])
    assert.deepEqual(ids(fresh(), 'speaker', { filter: 'group', filterId: '' }), [])
    assert.deepEqual(ids(fresh(), 'speaker', { filter: 'group', filterId: 'nothing' }), [])
    assert.deepEqual(ids(fresh(), 'speaker', { filter: 'everyone' }), [])
  })

  it('can name a group or a faction, and measure from the leader or a tile', () => {
    assert.deepEqual(ids(fresh(), 'speaker', { filter: 'group', filterId: 'g2' }), ['rival'])
    assert.deepEqual(ids(fresh(), 'speaker', { filter: 'faction', filterId: 'klingonEmpire' }), ['mate', 'rival', 'loner'])
    // From the tile beside the far member, only the far member is near; the speaker is not asked for.
    assert.deepEqual(ids(fresh(), 'speaker', { origin: 'tile', tile: { x: 14, y: 10 } }), ['far'])
    assert.deepEqual(ids(fresh(), 'speaker', { origin: 'tile', tile: null }), [])
    assert.deepEqual(ids(fresh(), 'speaker', { origin: 'leader', radius: 1 }), [])
  })

  it('leaves out an NPC that is down, and one that cannot be seen when sight is required', () => {
    const state = fresh()
    const down = { ...state, world: { ...state.world, npcs: { ...state.world.npcs, mate: { ...state.world.npcs.mate, condition: { stress: 0, injuries: [], defeated: true } } } } }
    assert.deepEqual(ids(down, 'speaker', {}), [])
    assert.deepEqual(ids(state, 'speaker', { needsSight: true }), ['mate'], 'an open room: in sight')
  })
})

describe('what each effect does', () => {
  const apply = (effect, extra) => influenceNearby(fresh(), 'speaker', { ...base, effect, ...extra })

  it('stand down: the group is neutral and calm; others are untouched', () => {
    const state = apply('standDown')
    assert.equal(state.world.npcs.mate.disposition, 'neutral')
    assert.equal(state.world.npcs.mate.responseType, null)
    assert.equal(state.world.npcs.far.disposition, 'wary')
    assert.equal(state.world.npcs.rival.disposition, 'wary')
  })

  it('hesitate: the group only watches', () => {
    const state = apply('hesitate')
    assert.equal(state.world.npcs.mate.responseType, 'observe')
    assert.equal(state.world.npcs.mate.disposition, 'wary')
    assert.equal(state.world.npcs.rival.responseType, fresh().world.npcs.rival.responseType)
  })

  it('become hostile: the group turns hostile', () => {
    const state = apply('hostile')
    assert.equal(state.world.npcs.mate.disposition, 'hostile')
    assert.equal(state.world.npcs.loner.disposition, 'wary')
  })

  it('escalate: aggressive and told about the whole party', () => {
    const state = apply('escalate')
    assert.equal(state.world.npcs.mate.disposition, 'aggressive')
    for (const id of state.party.memberIds) {
      assert.equal(state.world.npcs.mate.awareness[id].state, STATE.ALERTED)
      assert.equal(state.world.npcs.mate.awareness[id].reported, true, 'told, not seen')
    }
    assert.notEqual(state.world.npcs.far.disposition, 'aggressive')
  })

  it('share: the group in reach is alerted to the leader; a group member out of reach is not', () => {
    const state = apply('share')
    assert.equal(state.world.npcs.mate.awareness[state.party.leaderId].state, STATE.ALERTED)
    assert.equal(state.world.npcs.far.awareness[state.party.leaderId]?.state ?? STATE.UNAWARE, STATE.UNAWARE)
    assert.equal(state.world.npcs.rival.awareness[state.party.leaderId]?.state ?? STATE.UNAWARE, STATE.UNAWARE)
    assert.ok(!state.world.events.some((event) => event.type === 'GROUP_ALERT_RECEIVED' && event.npcId === 'far'))
  })

  it('reaches nobody: the state is returned as it was', () => {
    const state = fresh()
    assert.equal(influenceNearby(state, 'loner', { ...base, effect: 'escalate' }), state)
    assert.equal(influenceNearby(state, 'speaker', { ...base, effect: 'nonsense' }), state)
  })
})

describe('as a conversation action', () => {
  const definition = (actions) => ({
    id: 'influenceTest',
    name: 'Influence test',
    start: 'a',
    nodes: [{ ...createNode('action', 'a'), actions, next: 'end' }, createNode('end', 'end')],
  })
  const talk = (actions) => explorationReducer(fresh(), { type: 'talk', npcId: 'speaker', definition: definition(actions) })

  it('applies to the NPC the party is talking to', () => {
    const state = talk([{ type: 'influenceNearby', ...base, effect: 'hostile' }])
    assert.equal(state.world.npcs.mate.disposition, 'hostile')
    assert.equal(state.world.npcs.speaker.disposition, 'wary')
  })

  it('escalating, then starting the fight, brings the group into combat', () => {
    const state = talk([{ type: 'influenceNearby', ...base, effect: 'escalate' }, { type: 'startCombat' }])
    assert.equal(state.mode, MODE.COMBAT)
    assert.ok(state.combat.combatants.speaker)
    assert.ok(state.combat.combatants.mate, 'the escalated neighbour joined')
    // A wary NPC joins a fight through its group's call anyway (awareness.json); the radius only decides who was escalated.
    assert.equal(state.world.npcs.mate.disposition, 'aggressive')
    assert.equal(state.world.npcs.far.disposition, 'wary', 'out of the radius, so not escalated')
  })
})
