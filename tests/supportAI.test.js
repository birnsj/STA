// Party AI support actions (designer request, Oct 2026): every party AI in Auto Combat weighs Scan, Persuade, Intimidate,
// First Aid, Guard and Direct against its own attack (supportAI.js), and an NPC scanned in exploration starts the fight
// scanned.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chooseAIStep, PARTY_AIS } from '../src/combat/autoCombat.js'
import { createCombat, SOCIAL_KINDS } from '../src/combat/combatState.js'
import { ownAttackValue, supportOptions, supportStep } from '../src/combat/supportAI.js'
import { startCombat } from '../src/exploration/combatLink.js'
import { createExplorationState } from '../src/exploration/explorationState.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const MEDIC = { attributes: { daring: 11 }, disciplines: { medicine: 4 }, focuses: ['First Aid'] }

function fight({ starts = [{ x: 2, y: 5 }], spawn = { x: 8, y: 5 }, skills = {} } = {}) {
  const map = createBlankMap({ name: 'Support Test Room', width: 24, height: 12 })
  map.markers.playerStarts = starts
  map.markers.enemySpawns = [spawn]
  const players = starts.map((_, index) => makeCharacter({ id: ['alpha', 'beta'][index], name: ['Alpha', 'Beta'][index], ...skills }))
  const state = createCombat({ map, players, seed: 7, initiativeOptions: { firstSide: 'player' } })
  const enemy = Object.values(state.combatants).find((combatant) => combatant.side === 'enemy')
  return { state, enemy }
}

const setCombatant = (state, id, changes) => ({ ...state, combatants: { ...state.combatants, [id]: { ...state.combatants[id], ...changes } } })
const active = (state) => state.combatants[state.order[state.turnIndex]]

describe('party AI support actions', () => {
  it('a medic revives a Defeated ally within Reach rather than shooting', () => {
    const { state } = fight({ starts: [{ x: 2, y: 5 }, { x: 3, y: 5 }], skills: MEDIC })
    const self = active(state)
    const allyId = self.id === 'alpha' ? 'beta' : 'alpha'
    const downed = setCombatant(state, allyId, { condition: { ...state.combatants[allyId].condition, defeated: true } })
    for (const { id } of PARTY_AIS.filter((ai) => ai.id !== 'random')) {
      const step = chooseAIStep(downed, { partyAI: id, partyAmbush: false })
      assert.equal(step.type, 'firstAid', `${id}: ${step.type}`)
      assert.equal(step.mode, 'revive')
      assert.equal(step.targetId, allyId)
    }
  })

  it('asks an enemy with no Stress left to surrender', () => {
    const { state, enemy } = fight()
    const worn = setCombatant(state, enemy.id, { condition: { ...enemy.condition, stress: 99 } })
    const step = chooseAIStep(worn, { partyAI: 'classic', partyAmbush: false })
    assert.ok(SOCIAL_KINDS.includes(step.type), step.type)
    assert.equal(step.targetId, enemy.id)
  })

  it('a fresh enemy is shot, not talked to: a win would only cost it Stress', () => {
    const { state, enemy } = fight()
    const self = active(state)
    const social = supportOptions(state, self).filter((option) => SOCIAL_KINDS.includes(option.action.type))
    assert.ok(social.length)
    assert.ok(social.every((option) => option.value <= ownAttackValue(state, self)))
    assert.equal(chooseAIStep(state, { partyAI: 'classic', partyAmbush: false }).targetId, enemy.id)
  })

  it('a skilled science officer scans before the party shoots', () => {
    const map = createBlankMap({ name: 'Scan Choice', width: 24, height: 12 })
    map.markers.playerStarts = [{ x: 2, y: 5 }, { x: 2, y: 7 }, { x: 3, y: 6 }]
    map.markers.enemySpawns = [{ x: 9, y: 6 }]
    const scientist = makeCharacter({ id: 'sci', name: 'Sci', attributes: { reason: 12 }, disciplines: { science: 5 }, focuses: ['Sensor Operations'] })
    const players = [scientist, makeCharacter({ id: 'beta', name: 'Beta' }), makeCharacter({ id: 'gamma', name: 'Gamma' })]
    const state = createCombat({ map, players, seed: 7, initiativeOptions: { firstSide: 'player' } })
    const asScientist = { ...state, turnIndex: state.order.indexOf('sci') }
    assert.equal(chooseAIStep(asScientist, { partyAI: 'classic', partyAmbush: false }).type, 'scan')
  })

  it('offers Scan only on an enemy not yet scanned', () => {
    const { state, enemy } = fight()
    const self = active(state)
    assert.ok(supportOptions(state, self).some((option) => option.action.type === 'scan'))
    const scanned = { ...state, scanned: { [enemy.id]: true } }
    assert.ok(!supportOptions(scanned, self).some((option) => option.action.type === 'scan'))
  })

  it('never acts for an enemy, and not after Aim', () => {
    const { state, enemy } = fight()
    assert.equal(supportStep(state, enemy), null)
    assert.equal(supportStep({ ...state, turn: { ...state.turn, aimed: true } }, active(state)), null)
  })

  it('the Random AI can pick a support action', () => {
    const { state, enemy } = fight()
    const worn = setCombatant(state, enemy.id, { condition: { ...enemy.condition, stress: 99 } })
    const types = new Set()
    for (let seed = 1; seed < 60; seed++) types.add(chooseAIStep({ ...worn, seed }, { partyAI: 'random', partyAmbush: false }).type)
    assert.ok([...types].some((type) => ['scan', 'guard', ...SOCIAL_KINDS].includes(type)), [...types].join(', '))
  })
})

describe('an exploration scan carries into combat', () => {
  function world(scanned) {
    const map = createBlankMap({ name: 'Scan Carry', width: 18, height: 12 })
    map.markers.playerStarts = [{ x: 4, y: 5 }]
    map.markers.enemySpawns = [{ x: 8, y: 5 }]
    const state = createExplorationState(map, [makeCharacter({ id: 'alpha', name: 'Alpha' })])
    const npcId = Object.keys(state.world.npcs)[0]
    const npcScans = scanned === undefined ? {} : { [npcId]: { key: 0, memberId: 'alpha', success: scanned } }
    return { state: { ...state, npcScans }, npcId }
  }

  it('a successful scan starts the NPC scanned, and the log says so', () => {
    const { state, npcId } = world(true)
    const fighting = startCombat(state, { triggerNpcId: npcId, triggerTargetId: 'alpha' })
    assert.deepEqual(fighting.combat.scanned, { [npcId]: true })
    assert.ok(fighting.combat.log.some((entry) => entry.lines.some((line) => line.includes('was scanned earlier'))))
  })

  it('a failed scan, or none, carries nothing', () => {
    for (const scanned of [false, undefined]) {
      const { state, npcId } = world(scanned)
      assert.deepEqual(startCombat(state, { triggerNpcId: npcId, triggerTargetId: 'alpha' }).combat.scanned, {})
    }
  })
})
