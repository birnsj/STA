// The STA 2E task: target number, successes, criticals, complications, assists and Difficulty
// (rules/taskResolver.js). The resolver is pure and takes the dice already rolled, so every case here is exact rather
// than statistical. "Book" = STA 2e Core Rulebook p.255-259.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildStaTask, evaluateStaDie, MAX_COMPLICATION_RANGE, resolveStaTask, rollDice, staTaskChance, TASK_DICE } from '../src/rules/taskResolver.js'
import { makeCharacter } from './support/characters.js'

const officer = makeCharacter({ attributes: { control: 9 }, disciplines: { engineering: 3 } })
const task = (overrides = {}) => buildStaTask(officer, { attribute: 'control', department: 'engineering', ...overrides })

describe('building a task', () => {
  it('Book p.255: the target number is Attribute + Department', () => {
    const built = task()
    assert.equal(built.targetNumber, 12)
    assert.equal(built.attribute.value, 9)
    assert.equal(built.department.value, 3)
  })

  it('Book p.257: a focus makes the critical range the Department rating; without one only a natural 1', () => {
    assert.equal(task({ focus: 'Warp Field Dynamics' }).criticalRange, 3)
    assert.equal(task().criticalRange, 1)
  })

  it('the complication range is 1 (a 20) by default and is clamped to a sane maximum', () => {
    assert.equal(task().complicationRange, 1)
    assert.equal(task({ complicationRange: 2 }).complicationRange, 2)
    assert.equal(task({ complicationRange: 99 }).complicationRange, MAX_COMPLICATION_RANGE)
    assert.equal(task({ complicationRange: 0 }).complicationRange, 1, 'never below 1')
  })
})

describe('a single d20', () => {
  it('Book p.255: a die at or under the target number is a success', () => {
    assert.equal(evaluateStaDie(task(), 12).successes, 1, 'equal to the target number counts')
    assert.equal(evaluateStaDie(task(), 13).successes, 0)
    assert.equal(evaluateStaDie(task(), 1).successes, 2, 'a natural 1 is a critical: 2 successes')
  })

  it('Book p.257: with a focus, any die at or under the Department rating is a critical', () => {
    const focused = task({ focus: 'Warp Field Dynamics' })
    assert.equal(evaluateStaDie(focused, 3).successes, 2)
    assert.equal(evaluateStaDie(focused, 4).successes, 1)
    assert.equal(evaluateStaDie(task(), 3).successes, 1, 'without a focus, a 3 is an ordinary success')
  })

  it('Book p.258: a 20 is a complication', () => {
    assert.equal(evaluateStaDie(task(), 20).complication, true)
    assert.equal(evaluateStaDie(task(), 19).complication, false)
    assert.equal(evaluateStaDie(task({ complicationRange: 2 }), 19).complication, true, 'a widened range catches 19 too')
  })

  it('Book p.277: a Fatigued character\'s shut-down attribute scores nothing, but complications still count', () => {
    const shutDown = { ...task(), autoFail: true }
    assert.equal(evaluateStaDie(shutDown, 1).successes, 0, 'not even a natural 1')
    assert.equal(evaluateStaDie(shutDown, 20).complication, true)
  })
})

describe('resolving a task', () => {
  const resolve = (dice, difficulty, extra = {}) => resolveStaTask({ leader: { task: task(), dice }, difficulty, ...extra })

  it('Book p.256: successes at or above the Difficulty pass', () => {
    assert.equal(resolve([5, 5], 2).success, true)
    assert.equal(resolve([5, 19], 2).success, false, '1 success against Difficulty 2 fails')
    assert.equal(resolve([19, 19], 0).success, true, 'Difficulty 0 needs nothing')
  })

  it('Book p.256: each success beyond the Difficulty is 1 Momentum', () => {
    assert.equal(resolve([5, 5], 1).momentumGenerated, 1)
    assert.equal(resolve([1, 5], 1).momentumGenerated, 2, 'a critical counts as 2 successes')
    assert.equal(resolve([19, 19], 1).momentumGenerated, 0, 'a failed task generates none')
  })

  it('counts complications across every die, and lets an effect cancel some', () => {
    assert.equal(resolve([20, 20], 1).complicationsRolled, 2)
    assert.equal(resolve([20, 20], 1).complications, 2)
    const ignored = resolve([20, 20], 1, { ignoreComplications: 1 })
    assert.equal(ignored.complicationsIgnored, 1)
    assert.equal(ignored.complications, 1)
    assert.equal(resolve([20], 1, { ignoreComplications: 5 }).complications, 0, 'cannot cancel more than were rolled')
  })

  it('Book p.277: a shut-down attribute fails however the dice land', () => {
    const result = resolveStaTask({ leader: { task: { ...task(), autoFail: true }, dice: [1, 1] }, difficulty: 1 })
    assert.equal(result.successes, 0)
    assert.equal(result.success, false)
    assert.equal(result.momentumGenerated, 0)
  })

  it('bonus Momentum is only paid out on a success', () => {
    assert.equal(resolve([5, 5], 2, { bonusMomentum: 2 }).momentumGenerated, 2)
    assert.equal(resolve([19, 19], 2, { bonusMomentum: 2 }).momentumGenerated, 0)
  })
})

describe('assisting', () => {
  const helper = makeCharacter({ attributes: { presence: 10 }, disciplines: { command: 2 } })
  const assistTask = buildStaTask(helper, { attribute: 'presence', department: 'command' })
  const withAssist = (dice, die, difficulty) => resolveStaTask({ leader: { task: task(), dice }, assist: { task: assistTask, die }, difficulty })

  it('Book p.259: the assistant\'s successes count only if the leader scored at least one', () => {
    const helped = withAssist([5, 19], 5, 2)
    assert.equal(helped.leaderSuccesses, 1)
    assert.equal(helped.successes, 2, 'the assist adds its success')
    assert.equal(helped.assist.counted, true)
    assert.equal(helped.success, true)

    const wasted = withAssist([19, 19], 5, 1)
    assert.equal(wasted.leaderSuccesses, 0)
    assert.equal(wasted.successes, 0, 'the leader scored nothing, so the assist is wasted')
    assert.equal(wasted.assist.counted, false)
    assert.equal(wasted.success, false)
  })

  it('an assist rolls one die against its own target number', () => {
    assert.equal(withAssist([5, 5], 12, 1).assist.targetNumber, 12)
    assert.equal(withAssist([5, 5], 13, 1).assist.successes, 0, 'over its own target number')
  })

  it('a complication on the assist die counts even when the assist does not', () => {
    const result = withAssist([19, 19], 20, 1)
    assert.equal(result.assist.counted, false)
    assert.equal(result.complicationsRolled, 1)
  })
})

describe('pass chance (presentation and AI only)', () => {
  it('is 0 for a shut-down attribute and 1 for Difficulty 0', () => {
    assert.equal(staTaskChance({ task: { ...task(), autoFail: true }, difficulty: 2 }), 0)
    assert.equal(staTaskChance({ task: task(), difficulty: 0 }), 1)
  })

  it('rises with more dice and falls with a higher Difficulty', () => {
    const base = staTaskChance({ task: task(), difficulty: 2 })
    assert.ok(staTaskChance({ task: task(), difficulty: 2, dice: 4 }) > base, 'more dice is better')
    assert.ok(staTaskChance({ task: task(), difficulty: 3 }) < base, 'a harder task is worse')
    assert.ok(staTaskChance({ task: task(), difficulty: 2, rerolls: 1 }) > base, 'a reroll is better')
    assert.ok(base > 0 && base < 1)
  })

  it('matches an exact hand calculation: 2d20, target 12, Difficulty 1 with no focus', () => {
    // A die scores nothing with a probability of 8/20; so at least one success is 1 - (8/20)^2.
    const expected = 1 - (8 / 20) ** 2
    assert.ok(Math.abs(staTaskChance({ task: task(), difficulty: 1 }) - expected) < 1e-12)
  })
})

describe('rolling', () => {
  it('rolls the standard 2d20 from the seeded random handed in', () => {
    const values = [0, 0.5, 0.999]
    let index = 0
    const random = () => values[index++ % values.length]
    assert.deepEqual(rollDice(random, 3), [1, 11, 20], 'maps [0,1) onto 1-20')
    assert.equal(TASK_DICE, 2)
  })
})
