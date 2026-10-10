// Book (STA 2e Core p.286): within Reach of an enemy, any task that isn't a melee attack is +1 Difficulty.
// Book (p.290): a target that wins an opposed attack may spend 2 Momentum to Counterattack (NPCs: Threat, p.265).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attackDifficulty, awaitingDecision, combatReducer, createCombat, previewAttack, previewGuard } from '../src/combat/combatState.js'
import { createMissionResources } from '../src/rules/missionResources.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const REACH_LABEL = /Enemy within Reach/

function testMap() {
  const map = createBlankMap({ name: 'Reach Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [{ x: 2, y: 5 }]
  map.markers.enemySpawns = [{ x: 3, y: 5 }]
  return map
}

function fight({ resources = createMissionResources(), firstSide = 'player' } = {}) {
  const state = createCombat({ map: testMap(), players: [makeCharacter({ id: 'alpha', name: 'Alpha' })], seed: 7, resources, initiativeOptions: { firstSide } })
  const enemy = Object.values(state.combatants).find((combatant) => combatant.side === 'enemy')
  return { state, alpha: state.combatants.alpha, enemy }
}

const moveTo = (state, id, position) => ({ ...state, combatants: { ...state.combatants, [id]: { ...state.combatants[id], position } } })
const rangedWeapon = (combatant) => combatant.weaponIds.find((id) => id !== 'unarmedStrike' && id !== 'dkTahg')

describe('Reach penalty (Core p.286)', () => {
  it('a ranged attack with an enemy within Reach is +1 Difficulty', () => {
    const { state, alpha, enemy } = fight()
    const weaponId = rangedWeapon(alpha)
    const near = previewAttack(state, alpha.id, enemy.id, weaponId)
    assert.ok(near.difficultyLines.some((line) => REACH_LABEL.test(line.label) && line.change === 1), JSON.stringify(near.difficultyLines))
    const apart = previewAttack(moveTo(state, enemy.id, { x: 5, y: 5 }), alpha.id, enemy.id, weaponId)
    assert.ok(!apart.difficultyLines.some((line) => REACH_LABEL.test(line.label)))
    assert.equal(near.task.difficulty, apart.task.difficulty + 1)
  })

  it('a melee attack is not raised', () => {
    const { state, alpha, enemy } = fight()
    const melee = previewAttack(state, alpha.id, enemy.id, 'unarmedStrike')
    assert.ok(melee.available)
    assert.ok(!melee.difficultyLines.some((line) => REACH_LABEL.test(line.label)))
  })

  it('no penalty when the adjacent enemy is Defeated', () => {
    const { state, alpha, enemy } = fight()
    const down = { ...state, combatants: { ...state.combatants, [enemy.id]: { ...enemy, condition: { ...enemy.condition, defeated: true } } } }
    const guard = previewGuard(down, alpha.id)
    assert.equal(guard.task.difficulty, 0)
    assert.ok(!guard.prepared.difficultyLines.some((line) => REACH_LABEL.test(line.label)))
  })

  it('Guard (Difficulty 0) is a task too: 1 with an enemy within Reach', () => {
    const { state, alpha } = fight()
    assert.equal(previewGuard(state, alpha.id).task.difficulty, 1)
  })

  it('the enemy suffers it as well', () => {
    const { state, alpha, enemy } = fight({ firstSide: 'enemy' })
    const shot = previewAttack(state, enemy.id, alpha.id, rangedWeapon(enemy))
    assert.ok(shot.difficultyLines.some((line) => REACH_LABEL.test(line.label)))
  })
})

// A pending melee attack (opposed: the target is aware) that failed: 0 successes against the defender's.
function failedOpposedAttack(state, attackerId, targetId, defenderSuccesses) {
  const preview = previewAttack(state, attackerId, targetId, 'unarmedStrike')
  assert.ok(preview.available && preview.opposition, 'test needs an opposed melee attack')
  const opposition = { ...preview.opposition, dice: [], successes: defenderSuccesses, complications: 0 }
  const task = { ...preview.task, difficulty: attackDifficulty(preview, defenderSuccesses) }
  const pending = {
    attackerId,
    targetId,
    weaponId: 'unarmedStrike',
    injuryMode: 'stun',
    band: preview.band,
    distance: preview.distance,
    baseDifficulty: preview.baseDifficulty,
    rangeModifier: 0,
    guardModifier: 0,
    extraLines: preview.extraLines,
    traitLines: [],
    opposition,
    task,
    dice: [19, 19],
    rerolls: [],
    aimRerolls: 0,
    assistRerolls: 0,
    assist: null,
    aimed: false,
    targetUnaware: false,
    ignoreComplications: 0,
    bonusMomentum: 0,
  }
  return { ...state, pending }
}

describe('Counterattack (Core p.290)', () => {
  it('a party defender who wins is offered the Counterattack and pays 2 Momentum', () => {
    const { state, alpha, enemy } = fight({ firstSide: 'enemy' })
    const resolved = combatReducer(failedOpposedAttack(state, enemy.id, alpha.id, 2), { type: 'resolveAttack' })
    assert.equal(resolved.result.passed, false)
    // Book p.256: the defender generates 1 Momentum per success the attacker fell short (2 here), saved to the pool.
    assert.equal(resolved.resources.momentum, 2)
    assert.equal(resolved.pendingCounterattack?.defenderId, alpha.id)
    assert.equal(resolved.result.counterattack.decided, 'pending')
    assert.ok(awaitingDecision(resolved))
    assert.equal(combatReducer(resolved, { type: 'endTurn' }), resolved, 'nothing else happens until the choice is made')

    const countered = combatReducer(resolved, { type: 'counterattackDecision', accept: true, injuryMode: 'stun' })
    assert.equal(countered.pendingCounterattack, null)
    assert.equal(countered.resources.momentum, 0)
    assert.equal(countered.stats.momentum.spentCounterattack, 2)
    assert.equal(countered.result.counterattack.decided, 'taken')
    const hit = countered.combatants[enemy.id]
    assert.ok(hit.condition.stress > 0 || hit.condition.defeated, 'the Counterattack inflicts an Injury (avoided with Stress or suffered)')
    // A Minor NPC goes down to the hit, so the victory entry may follow it.
    assert.ok(countered.log.slice(-2).some((entry) => entry.lines.some((line) => line.startsWith('COUNTERATTACK'))))
  })

  it('declining keeps the Momentum', () => {
    const { state, alpha, enemy } = fight({ firstSide: 'enemy' })
    const resolved = combatReducer(failedOpposedAttack(state, enemy.id, alpha.id, 2), { type: 'resolveAttack' })
    const declined = combatReducer(resolved, { type: 'counterattackDecision', accept: false })
    assert.equal(declined.pendingCounterattack, null)
    assert.equal(declined.resources.momentum, 2)
    assert.equal(declined.result.counterattack.decided, 'declined')
  })

  it('not offered without 2 Momentum to pay', () => {
    const { state, alpha, enemy } = fight({ firstSide: 'enemy' })
    const resolved = combatReducer(failedOpposedAttack(state, enemy.id, alpha.id, 1), { type: 'resolveAttack' })
    assert.equal(resolved.resources.momentum, 1)
    assert.equal(resolved.pendingCounterattack, null)
    assert.equal(resolved.result.counterattack.decided, 'unavailable')
  })

  it('an enemy defender who wins counterattacks with Threat', () => {
    const { state, alpha, enemy } = fight()
    const resolved = combatReducer(failedOpposedAttack(state, alpha.id, enemy.id, 2), { type: 'resolveAttack' })
    // The NPC's 2 Momentum became Threat (Book p.265), then paid for the Counterattack.
    assert.equal(resolved.resources.threat, 0)
    assert.equal(resolved.stats.tasks.counterattack, 1)
    assert.equal(resolved.result.counterattack.decided, 'taken')
    // The party attacker now chooses whether to Avoid the Injury.
    assert.equal(resolved.incomingInjury?.targetId, alpha.id)
    assert.equal(resolved.incomingInjury?.attackerId, enemy.id)
  })

  it('an unopposed miss offers nothing', () => {
    const { state, alpha, enemy } = fight()
    const opposed = failedOpposedAttack(state, alpha.id, enemy.id, 2)
    const unopposed = { ...opposed, pending: { ...opposed.pending, opposition: null, task: { ...opposed.pending.task, difficulty: 1 } } }
    const resolved = combatReducer(unopposed, { type: 'resolveAttack' })
    assert.equal(resolved.result.passed, false)
    assert.equal(resolved.result.counterattack, null)
    assert.equal(resolved.pendingCounterattack, null)
  })
})
