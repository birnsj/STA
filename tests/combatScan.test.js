// Combat Scan (PROTOTYPE, designer decision Oct 2026): Reason + Science, Difficulty 2, a major action; success makes the
// enemy's Stress, Protection, weapons and tactical tips known for the rest of the fight.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { combatReducer, createCombat, isScanned, previewAttack, previewScan, SCAN_TRAIT, scanReport, visibleCondition } from '../src/combat/combatState.js'
import { scanTraitLines } from '../src/combat/combatScan.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

function fight(seed = 7) {
  const map = createBlankMap({ name: 'Scan Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [{ x: 2, y: 5 }]
  map.markers.enemySpawns = [{ x: 8, y: 5 }]
  const state = createCombat({ map, players: [makeCharacter({ id: 'alpha', name: 'Alpha' })], seed, initiativeOptions: { firstSide: 'player' } })
  const enemy = Object.values(state.combatants).find((combatant) => combatant.side === 'enemy')
  return { state, alpha: state.combatants.alpha, enemy }
}

// The first seed whose scan passes (or fails).
function scanUntil(passed) {
  for (let seed = 1; seed < 200; seed += 1) {
    const { state, enemy } = fight(seed)
    const next = combatReducer(state, { type: 'scan', targetId: enemy.id })
    if (next.result?.passed === passed) return { before: state, next, enemy }
  }
  throw new Error(`no seed gave a ${passed ? 'passed' : 'failed'} scan`)
}

describe('Combat Scan', () => {
  it('is Reason + Science at Difficulty 2', () => {
    const { state, alpha, enemy } = fight()
    const preview = previewScan(state, alpha.id, enemy.id)
    assert.ok(preview.available, preview.reason)
    assert.equal(preview.task.attribute.id, 'reason')
    assert.equal(preview.task.department.id, 'science')
    assert.equal(preview.task.difficulty, 2)
  })

  it('only scans an enemy', () => {
    const { state, alpha } = fight()
    assert.equal(previewScan(state, alpha.id, alpha.id).available, false)
  })

  it('a success marks the enemy scanned and spends the major action', () => {
    const { before, next, enemy } = scanUntil(true)
    assert.ok(isScanned(next, enemy.id))
    assert.equal(next.turn.major, before.turn.major - 1)
    assert.equal(previewScan(next, 'alpha', enemy.id).available, false)
  })

  it('a failure leaves it unscanned', () => {
    const { next, enemy } = scanUntil(false)
    assert.equal(isScanned(next, enemy.id), false)
  })

  it('the report lists Stress, Protection and each weapon, with tips', () => {
    const { next, enemy } = scanUntil(true)
    const report = scanReport(next, next.combatants.alpha, next.combatants[enemy.id])
    const labels = report.rows.map(([label]) => label)
    assert.ok(labels.includes('Stress'))
    assert.ok(labels.includes('Protection'))
    assert.ok(labels.includes('Trait'))
    assert.equal(report.rows.length, 3 + next.combatants[enemy.id].weaponIds.length)
    assert.ok(report.tips.length >= 1)
  })

  it('a scanned enemy carries Weak Point Located: attacks on it are -1 Difficulty, never below 0', () => {
    const { state, alpha, enemy } = fight()
    const weaponId = alpha.weaponIds[0]
    const plain = previewAttack(state, alpha.id, enemy.id, weaponId)
    const scanned = { ...state, scanned: { [enemy.id]: true } }
    const helped = previewAttack(scanned, alpha.id, enemy.id, weaponId)
    const line = helped.difficultyLines.find((entry) => entry.label === `Trait: ${SCAN_TRAIT.name}`)
    assert.ok(plain.task.difficulty > 0)
    assert.deepEqual(line, { label: 'Trait: Weak Point Located', change: -1 })
    assert.equal(helped.task.difficulty, plain.task.difficulty - 1)
    assert.ok(helped.traitLines.includes(line))
    assert.deepEqual(scanTraitLines(scanned, alpha, enemy, 0), [])
  })

  it('the trait only helps the scanned enemy\'s opponents', () => {
    const { state, alpha, enemy } = fight()
    const scanned = { ...state, scanned: { [enemy.id]: true } }
    assert.deepEqual(scanTraitLines(scanned, enemy, enemy, 2), [])
    assert.deepEqual(scanTraitLines(state, alpha, enemy, 2), [])
  })

  it('Stress is shown in the condition without a scan (designer decision, Oct 2026)', () => {
    const { state, enemy } = fight()
    assert.match(visibleCondition(state, enemy), /Stress 0\/5/)
  })
})
