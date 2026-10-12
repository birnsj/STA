// Everything decided before the dice (rules/taskPreparation.js): focus, Difficulty lines, equipment, listed talents,
// traits and Fatigue. Book p.256 (tools), p.252 (trait Potency), p.278 (Fatigued).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findTaskFocus, prepareAssist, prepareTask } from '../src/rules/taskPreparation.js'
import { makeCharacter, talent } from './support/characters.js'

const spec = (overrides = {}) => ({ attribute: 'reason', department: 'engineering', difficulty: 2, focuses: ['Diagnostics'], ...overrides })
const engineer = (overrides = {}) => makeCharacter({ attributes: { reason: 10 }, disciplines: { engineering: 4 }, focuses: ['diagnostics'], ...overrides })
const total = (prepared) => prepared.difficultyLines.reduce((sum, line) => sum + line.change, 0)

describe('task preparation', () => {
  it('finds the focus by exact name ignoring case, and a focus sets the critical range to the Department', () => {
    assert.equal(findTaskFocus(engineer(), ['Diagnostics']), 'diagnostics')
    assert.equal(findTaskFocus(engineer(), ['Diagnostic']), null)
    const prepared = prepareTask(engineer(), spec())
    assert.equal(prepared.task.targetNumber, 14)
    assert.equal(prepared.task.criticalRange, 4)
    assert.equal(prepareTask(engineer({ focuses: [] }), spec()).task.criticalRange, 1)
    assert.equal(prepared.difficulty, 2)
    assert.ok(prepared.possible)
  })

  it('applies the authored tool rule: impossible without, harder without, easier with a better tool', () => {
    const equipment = { label: 'a tricorder', tags: ['scanner'], without: 'impossible', bonus: [{ label: 'Engineering tricorder', itemIds: ['engineeringTricorder'], difficulty: -1 }] }
    const without = prepareTask(engineer(), spec({ equipment }))
    assert.equal(without.possible, false)
    assert.deepEqual(without.blockers, ['Needs a tricorder'])
    const standard = prepareTask(engineer({ equipment: [{ itemId: 'standardTricorder' }] }), spec({ equipment }))
    assert.ok(standard.possible)
    assert.equal(standard.difficulty, 2)
    const better = prepareTask(engineer({ equipment: [{ itemId: 'engineeringTricorder' }] }), spec({ equipment }))
    assert.equal(better.difficulty, 1)
    assert.match(better.equipment[0].note, /Counts as a tricorder; Engineering tricorder/)
    const harder = prepareTask(engineer(), spec({ equipment: { label: 'a toolkit', tags: ['repair'], without: { difficulty: 1 } } }))
    assert.ok(harder.possible)
    assert.equal(harder.difficulty, 3)
  })

  it('applies a talent only when the task lists it, and shows effects it cannot automate', () => {
    const character = engineer({ talents: [talent('disarmingNature')] })
    assert.deepEqual(prepareTask(character, spec()).effects, [])
    const listed = prepareTask(character, spec({ talentIds: ['disarmingNature'] }))
    assert.equal(listed.difficulty, 1)
    assert.deepEqual(
      listed.effects.map((effect) => effect.applied),
      [true, false],
    )
  })

  it('widens the critical range for Dedicated Focus on its chosen focus only', () => {
    const dedicated = { ...talent('dedicatedFocus'), choice: { name: 'Diagnostics' } }
    assert.equal(prepareTask(engineer({ talents: [dedicated] }), spec()).task.criticalRange, 8)
    assert.equal(prepareTask(engineer({ talents: [{ ...dedicated, choice: { name: 'Warp Theory' } }] }), spec()).task.criticalRange, 4)
  })

  it('multiplies a trait rule by Potency, honours its side, and never goes below 0', () => {
    const traitRules = [{ trait: 'Darkness', difficulty: 1 }, { trait: 'Alarm', difficulty: 1, side: 'enemy' }, { trait: 'Sealed', impossible: true }]
    const dark = prepareTask(engineer(), spec({ traitRules }), { traits: [{ name: 'darkness', potency: 2 }, 'Alarm'], side: 'player' })
    assert.equal(dark.difficulty, 4)
    assert.ok(dark.possible)
    assert.equal(prepareTask(engineer(), spec({ traitRules }), { traits: ['Alarm'], side: 'enemy' }).difficulty, 3)
    assert.equal(prepareTask(engineer(), spec({ traitRules }), { traits: ['Sealed'] }).possible, false)
    const eased = prepareTask(engineer(), spec({ difficulty: 0 }), { difficultyMod: -2 })
    assert.equal(total(eased), -2)
    assert.equal(eased.difficulty, 0)
  })

  it('Fatigued: +1 Difficulty, and a task using the shut-down Attribute fails automatically', () => {
    const tired = prepareTask(engineer(), spec(), { condition: { fatigued: true, fatiguedAttribute: 'fitness' } })
    assert.equal(tired.difficulty, 3)
    assert.equal(tired.task.autoFail, undefined)
    const shut = prepareTask(engineer(), spec(), { condition: { fatigued: true, fatiguedAttribute: 'reason' } })
    assert.equal(shut.task.autoFail, true)
  })

  it('an assistant rolls with their own Attribute, Department and focus', () => {
    const helper = makeCharacter({ attributes: { control: 11 }, disciplines: { engineering: 3 }, focuses: ['Emergency Repairs'] })
    const { task, focus } = prepareAssist(helper, { attribute: 'control', department: 'engineering', focuses: ['Emergency Repairs'] })
    assert.equal(task.targetNumber, 14)
    assert.equal(focus, 'Emergency Repairs')
    assert.equal(task.criticalRange, 3)
    assert.equal(prepareAssist(helper, { attribute: 'control', department: 'engineering', focuses: [] }, { fatigued: true, fatiguedAttribute: 'control' }).task.autoFail, true)
  })
})
