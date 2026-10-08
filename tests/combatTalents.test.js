// Talents in personal combat (combat/combatTalents.js), each against its book page (STA 2e Core Rulebook).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createCombat, evaluateAttack, getAssistFor, getAttackTask, injuryFor, previewAttack } from '../src/combat/combatState.js'
import { UNARMED_STRIKE_ID, wieldWeapon } from '../src/combat/combatTalents.js'
import { getWeapon } from '../src/combat/weaponSystem.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter, talent } from './support/characters.js'

function testMap() {
  const map = createBlankMap({ name: 'Talent Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [
    { x: 2, y: 5 },
    { x: 2, y: 6 },
  ]
  map.markers.enemySpawns = [{ x: 8, y: 5 }]
  return map
}

// alpha: the character under test; beta: an ally. The encounter's first Klingon stands on the enemy spawn.
function fight(alpha = {}, beta = {}) {
  const state = createCombat({
    map: testMap(),
    players: [makeCharacter({ id: 'alpha', name: 'Alpha', ...alpha }), makeCharacter({ id: 'beta', name: 'Beta', ...beta })],
    seed: 11,
  })
  const enemy = Object.values(state.combatants).find((combatant) => combatant.side === 'enemy')
  return { state, alpha: state.combatants.alpha, beta: state.combatants.beta, enemy }
}

const unarmed = getWeapon(UNARMED_STRIKE_ID)
const phaser = getWeapon('phaserType2')
const severityOf = (injury) => injury.severity + injury.protection

describe('the Unarmed Strike as the character wields it', () => {
  it('is the plain weapon without a talent that changes it', () => {
    assert.equal(wieldWeapon(makeCharacter(), unarmed), unarmed)
    assert.equal(wieldWeapon(makeCharacter({ talents: [talent('appliedForce')] }), phaser), phaser)
  })

  it('Book p.161 Applied Force: +1 Severity', () => {
    assert.equal(wieldWeapon(makeCharacter({ talents: [talent('appliedForce')] }), unarmed).severity, unarmed.severity + 1)
  })

  it('Book p.162 Mean Right Hook: gains Intense', () => {
    assert.ok(wieldWeapon(makeCharacter({ talents: [talent('meanRightHook')] }), unarmed).qualities.includes('Intense'))
  })

  it('Book p.162 Martial Artist: may inflict Deadly Injuries as well as Stun', () => {
    assert.deepEqual(wieldWeapon(makeCharacter({ talents: [talent('martialArtist')] }), unarmed).injuryModes, ['stun', 'deadly'])
  })

  it('is what a combatant fights with', () => {
    const { state, alpha } = fight({ talents: [talent('martialArtist')] })
    assert.ok(previewAttack(state, alpha.id, Object.keys(state.combatants).find((id) => state.combatants[id].side === 'enemy'), UNARMED_STRIKE_ID).weapon.injuryModes.includes('deadly'))
  })
})

describe('Applied Force: Fitness instead of Daring for Melee Attacks (Book p.161)', () => {
  it('Prototype: uses Fitness when it is higher', () => {
    const { state, alpha } = fight({ talents: [talent('appliedForce')], attributes: { fitness: 11, daring: 9 } })
    const prepared = getAttackTask(state, alpha.id, UNARMED_STRIKE_ID)
    assert.equal(prepared.task.attribute.id, 'fitness')
    assert.equal(prepared.task.targetNumber, 11 + 2)
    assert.ok(prepared.effects.some((effect) => effect.name === 'Applied Force' && effect.applied))
  })

  it('keeps Daring when it is as high, and for ranged attacks', () => {
    const even = fight({ talents: [talent('appliedForce')], attributes: { fitness: 9, daring: 9 } })
    assert.equal(getAttackTask(even.state, even.alpha.id, UNARMED_STRIKE_ID).task.attribute.id, 'daring')
    const armed = fight({ talents: [talent('appliedForce')], attributes: { fitness: 11 }, equipment: [{ itemId: 'phaserType2' }] })
    assert.equal(getAttackTask(armed.state, armed.alpha.id, 'phaserType2').task.attribute.id, 'control')
  })

  it('a Fitness shut down by Fatigue is never the higher one', () => {
    const { state, alpha } = fight({ talents: [talent('appliedForce')], attributes: { fitness: 11, daring: 9 } })
    const tired = { ...alpha, condition: { ...alpha.condition, fatigued: true, fatiguedAttribute: 'fitness' } }
    const next = { ...state, combatants: { ...state.combatants, alpha: tired } }
    assert.equal(getAttackTask(next, alpha.id, UNARMED_STRIKE_ID).task.attribute.id, 'daring')
  })
})

describe('Severity talents', () => {
  it('Book p.162 Steady Hands: +1 Severity on a Ranged Attack after Aim, not otherwise', () => {
    const { state, alpha, enemy } = fight({ talents: [talent('steadyHands')] })
    const base = severityOf(injuryFor(state, alpha, enemy, phaser, 'stun', 0, { aimed: false, targetUnaware: false }))
    assert.equal(severityOf(injuryFor(state, alpha, enemy, phaser, 'stun', 0, { aimed: true, targetUnaware: false })), base + 1)
    assert.equal(severityOf(injuryFor(state, alpha, enemy, unarmed, 'stun', 0, { aimed: true, targetUnaware: false })), unarmed.severity)
  })

  it('Book p.161 Ambush Tactics: +2 Severity against a target unaware of the attacker', () => {
    const { state, alpha, enemy } = fight({ talents: [talent('ambushTactics')] })
    const injury = injuryFor(state, alpha, enemy, phaser, 'stun', 0, { aimed: false, targetUnaware: true })
    assert.equal(severityOf(injury), phaser.severity + 2)
    assert.deepEqual(injury.talentSeverity, [{ label: 'Ambush Tactics', change: 2 }])
    assert.equal(severityOf(injuryFor(state, alpha, enemy, phaser, 'stun', 0, { aimed: false, targetUnaware: false })), phaser.severity)
  })
})

describe('Defensive Training (Book p.161)', () => {
  const trained = (choiceId) => ({ ...talent('defensiveTraining'), choice: { id: choiceId, name: choiceId } })

  it('Attacks of the chosen type against the character are +1 Difficulty; the other type is not', () => {
    const plain = fight()
    const ranged = fight({ talents: [trained('ranged')] })
    const melee = fight({ talents: [trained('melee')] })
    const weaponId = plain.enemy.weaponIds.find((id) => getWeapon(id).type === 'ranged')
    const difficulty = ({ state, enemy }) => previewAttack(state, enemy.id, 'alpha', weaponId).task.difficulty
    assert.equal(difficulty(ranged), difficulty(plain) + 1)
    assert.equal(difficulty(melee), difficulty(plain))
    assert.ok(previewAttack(ranged.state, ranged.enemy.id, 'alpha', weaponId).difficultyLines.some((line) => line.label.includes('Defensive Training')))
  })
})

describe('Assist talents', () => {
  const assistedBy = (helperTalents) => {
    const { state, alpha } = fight({ equipment: [{ itemId: 'phaserType2' }] }, { talents: helperTalents.map(talent) })
    return { state: { ...state, assists: { alpha: 'beta' } }, alpha }
  }

  it('Book p.157 Call Out Targets: +2 bonus Momentum on an assisted Attack; p.162 Pack Tactics: +1', () => {
    const { state, alpha } = assistedBy(['callOutTargets', 'packTactics'])
    assert.equal(getAssistFor(state, alpha.id, { weapon: phaser }).talents.bonusMomentum, 3)
    assert.equal(getAssistFor(state, alpha.id, { spec: { attribute: 'insight', department: 'security', difficulty: 0 } }).talents.bonusMomentum, 1)
  })

  it('Book p.163 Student of War: the assisted Attack may reroll one d20', () => {
    const { state, alpha } = assistedBy(['studentOfWar'])
    assert.equal(getAssistFor(state, alpha.id, { weapon: phaser }).talents.rerolls, 1)
  })

  it('bonus Momentum and cancelled complications reach the attack result', () => {
    const task = { targetNumber: 20, criticalRange: 1, complicationRange: 1, difficulty: 1, attribute: { value: 10 }, department: { value: 10 } }
    const result = evaluateAttack({ task, dice: [5, 20], assist: null, bonusMomentum: 2, ignoreComplications: 1 })
    assert.equal(result.success, true)
    assert.equal(result.bonusMomentum, 2)
    assert.equal(result.momentumGenerated, result.successes - 1 + 2)
    assert.equal(result.complications, 0)
  })
})
