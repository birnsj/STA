// Prototype (2026-10-18): weapon hits auto-resolve Avoid Injury like blasts and hazards — no Injury Incoming popup.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { combatReducer, createCombat, inflictInjury, injuryFor, previewAttack } from '../src/combat/combatState.js'
import { awaitingDecision } from '../src/combat/combatSelectors.js'
import { getCombatantWeapon } from '../src/combat/weaponSystem.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { createMissionResources } from '../src/rules/missionResources.js'
import { createCondition, getMaxStress } from '../src/rules/personalCondition.js'
import { makeCharacter, speciesAbility } from './support/characters.js'

function testMap() {
  const map = createBlankMap({ name: 'Injury Auto Room', width: 16, height: 12 })
  map.markers.playerStarts = [{ x: 2, y: 5 }, { x: 2, y: 6 }]
  map.markers.enemySpawns = [{ x: 4, y: 5 }]
  return map
}

function fight(players, { resources = createMissionResources({ threat: 10 }), firstSide = 'player' } = {}) {
  const state = createCombat({ map: testMap(), players, seed: 11, resources, initiativeOptions: { firstSide } })
  const enemy = Object.values(state.combatants).find((combatant) => combatant.side === 'enemy')
  return { state, alpha: state.combatants.alpha ?? state.combatants[players[0].id], enemy }
}

describe('automatic Avoid Injury on weapon hits', () => {
  it('a player with Stress room spends Stress and is not Defeated; combat does not wait', () => {
    const { state, alpha, enemy } = fight([makeCharacter({ id: 'alpha', name: 'Alpha', attributes: { fitness: 10 } })])
    const weapon = getCombatantWeapon(enemy, enemy.weaponIds[0])
    const injury = injuryFor(state, enemy, alpha, weapon, 'stun')
    const before = alpha.condition.stress
    const hit = inflictInjury(state, enemy.id, alpha.id, injury)
    assert.equal(hit.avoided, true)
    assert.equal(hit.state.combatants.alpha.condition.defeated, false)
    assert.equal(hit.state.combatants.alpha.condition.stress, before + injury.severity)
    assert.ok(hit.lines.some((line) => /avoids the Injury/i.test(line)))
    assert.equal(awaitingDecision(hit.state), false)
  })

  it('Protection lowers Severity before the Stress cost', () => {
    const { state, alpha, enemy } = fight([
      makeCharacter({ id: 'alpha', name: 'Alpha', attributes: { fitness: 10 }, speciesAbility: speciesAbility('brakLul') }),
    ])
    const weapon = getCombatantWeapon(enemy, enemy.weaponIds[0])
    const plainTarget = { ...alpha, character: makeCharacter({ id: 'alpha', attributes: { fitness: 10 } }), condition: createCondition(makeCharacter({ id: 'alpha', attributes: { fitness: 10 } })) }
    const plain = injuryFor(state, enemy, plainTarget, weapon, 'stun')
    const protectedInjury = injuryFor(state, enemy, alpha, weapon, 'stun')
    assert.ok(protectedInjury.protection >= 1)
    assert.equal(protectedInjury.severity, Math.max(1, plain.severity - protectedInjury.protection))
    const hit = inflictInjury(state, enemy.id, alpha.id, protectedInjury)
    assert.equal(hit.avoided, true)
    assert.equal(hit.state.combatants.alpha.condition.stress, protectedInjury.severity)
  })

  it('at maximum Stress (Fatigued) Avoid Injury is unavailable and the Injury Defeats them', () => {
    const character = makeCharacter({ id: 'alpha', name: 'Alpha', attributes: { fitness: 8 } })
    const { state, enemy } = fight([character])
    const max = getMaxStress(character).value
    const fatigued = {
      ...state,
      combatants: {
        ...state.combatants,
        alpha: {
          ...state.combatants.alpha,
          condition: { ...createCondition(character), stress: max, fatigued: true, shutDown: ['insight'] },
        },
      },
    }
    const alpha = fatigued.combatants.alpha
    const weapon = getCombatantWeapon(enemy, enemy.weaponIds[0])
    const injury = injuryFor(fatigued, enemy, alpha, weapon, 'deadly')
    const hit = inflictInjury(fatigued, enemy.id, alpha.id, injury)
    assert.equal(hit.avoided, false)
    assert.equal(hit.state.combatants.alpha.condition.defeated, true)
    assert.ok(hit.lines.some((line) => /Cannot Avoid Injury/i.test(line)))
    assert.ok(hit.lines.some((line) => /suffers a|Defeated/i.test(line)))
    assert.equal(awaitingDecision(hit.state), false)
  })

  it('overflow Stress still Avoids: track fills and a complication follows', () => {
    const character = makeCharacter({ id: 'alpha', name: 'Alpha', attributes: { fitness: 5 } })
    const { state, enemy } = fight([character])
    const almostFull = {
      ...state,
      combatants: {
        ...state.combatants,
        alpha: { ...state.combatants.alpha, condition: { ...createCondition(character), stress: 4 } },
      },
    }
    const alpha = almostFull.combatants.alpha
    const weapon = getCombatantWeapon(enemy, enemy.weaponIds[0])
    const injury = injuryFor(almostFull, enemy, alpha, weapon, 'stun')
    assert.ok(injury.severity >= 2)
    const hit = inflictInjury(almostFull, enemy.id, alpha.id, injury)
    assert.equal(hit.avoided, true)
    assert.equal(hit.state.combatants.alpha.condition.defeated, false)
    assert.equal(hit.state.combatants.alpha.condition.stress, getMaxStress(character).value)
    assert.ok(hit.lines.some((line) => /complication|Fatigued|avoids the Injury/i.test(line)))
  })

  it('a supporting-character enemy Avoids with Stress like a main character', () => {
    const { state, alpha, enemy } = fight([makeCharacter({ id: 'alpha', name: 'Alpha' })])
    assert.ok(getMaxStress(enemy.character).value > 0)
    const weapon = getCombatantWeapon(alpha, alpha.weaponIds.find((id) => id !== 'unarmedStrike') ?? alpha.weaponIds[0])
    const injury = injuryFor(state, alpha, enemy, weapon, 'stun')
    const before = enemy.condition.stress
    const hit = inflictInjury(state, alpha.id, enemy.id, injury)
    assert.equal(hit.avoided, true)
    assert.equal(hit.state.combatants[enemy.id].condition.defeated, false)
    assert.equal(hit.state.combatants[enemy.id].condition.stress, before + injury.severity)
  })

  it('a Minor NPC cannot Avoid and is Defeated outright (Stun unconscious)', () => {
    const { state, alpha, enemy } = fight([makeCharacter({ id: 'alpha', name: 'Alpha' })])
    const minorCharacter = { ...enemy.character, npcRules: 'minor' }
    const minor = {
      ...state,
      combatants: {
        ...state.combatants,
        [enemy.id]: {
          ...enemy,
          character: minorCharacter,
          condition: createCondition(minorCharacter),
        },
      },
    }
    const target = minor.combatants[enemy.id]
    const weapon = getCombatantWeapon(alpha, alpha.weaponIds.find((id) => id !== 'unarmedStrike') ?? alpha.weaponIds[0])
    const injury = injuryFor(minor, alpha, target, weapon, 'stun')
    const hit = inflictInjury(minor, alpha.id, enemy.id, injury)
    assert.equal(hit.avoided, false)
    assert.equal(hit.state.combatants[enemy.id].condition.defeated, true)
    assert.equal(hit.state.combatants[enemy.id].condition.unconscious, true)
    assert.ok(hit.lines.some((line) => /Minor NPC|unconscious|Defeated/i.test(line)))
  })

  it('Stun and Deadly both auto-resolve; Deadly Defeat is Dying when suffered', () => {
    const character = makeCharacter({ id: 'alpha', name: 'Alpha', attributes: { fitness: 6 } })
    const { state, enemy } = fight([character])
    const weapon = getCombatantWeapon(enemy, enemy.weaponIds[0])
    const stun = injuryFor(state, enemy, state.combatants.alpha, weapon, 'stun')
    const stunHit = inflictInjury(state, enemy.id, 'alpha', stun)
    assert.equal(stunHit.avoided, true)
    assert.equal(stun.type, 'stun')

    const fatigued = {
      ...state,
      combatants: {
        ...state.combatants,
        alpha: {
          ...state.combatants.alpha,
          condition: { ...createCondition(character), stress: getMaxStress(character).value, fatigued: true, shutDown: ['presence'] },
        },
      },
    }
    const deadly = injuryFor(fatigued, enemy, fatigued.combatants.alpha, weapon, 'deadly')
    const deadlyHit = inflictInjury(fatigued, enemy.id, 'alpha', deadly)
    assert.equal(deadlyHit.avoided, false)
    assert.equal(deadlyHit.state.combatants.alpha.condition.defeated, true)
    assert.equal(deadlyHit.state.combatants.alpha.condition.dying, true)
  })

  it('resolving a successful attack never leaves an Injury choice pending', () => {
    const { state, alpha, enemy } = fight([
      makeCharacter({ id: 'alpha', name: 'Alpha', attributes: { fitness: 10, control: 11, daring: 10 }, disciplines: { security: 5 } }),
    ])
    const weaponId = alpha.weaponIds.find((id) => id !== 'unarmedStrike') ?? alpha.weaponIds[0]
    const preview = previewAttack(state, alpha.id, enemy.id, weaponId)
    assert.ok(preview.available)
    const pending = {
      attackerId: alpha.id,
      targetId: enemy.id,
      weaponId,
      injuryMode: 'stun',
      band: preview.band,
      distance: preview.distance,
      baseDifficulty: preview.baseDifficulty,
      rangeModifier: preview.rangeModifier ?? 0,
      task: { ...preview.task, difficulty: 0 },
      opposition: null,
      dice: [1, 1],
      assist: null,
      aimed: false,
      targetUnaware: false,
      aimRerolls: 0,
      assistRerolls: 0,
      rerolls: [],
    }
    const resolved = combatReducer({ ...state, pending }, { type: 'resolveAttack' })
    assert.equal(resolved.pending, null)
    assert.equal(resolved.result?.passed, true)
    assert.ok(['avoided', 'suffered'].includes(resolved.result?.injury?.decided))
    assert.notEqual(resolved.result?.injury?.decided, 'pending')
    assert.equal(awaitingDecision(resolved), Boolean(resolved.pendingFatigue || resolved.pendingCounterattack))
  })
})
