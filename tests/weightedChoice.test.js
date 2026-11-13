import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addWeightedEntry,
  normalizeWeightedEntries,
  pickWeighted,
  removeWeightedEntry,
  setEntryWeight,
  weightedIds,
} from '../src/maps/generators/weightedChoice.js'

describe('weightedChoice', () => {
  it('normalizes legacy strings and string arrays to equal weights', () => {
    assert.deepEqual(normalizeWeightedEntries('floor'), [{ id: 'floor', weight: 1 }])
    const list = normalizeWeightedEntries(['a', 'b'])
    assert.equal(list.length, 2)
    assert.equal(list[0].weight + list[1].weight, 1)
    assert.deepEqual(weightedIds(list), ['a', 'b'])
  })

  it('equal-splits on add and renormalizes on remove', () => {
    let list = addWeightedEntry([], 'a')
    assert.deepEqual(list, [{ id: 'a', weight: 1 }])
    list = addWeightedEntry(list, 'b')
    assert.equal(list.length, 2)
    assert.equal(list[0].weight, 0.5)
    assert.equal(list[1].weight, 0.5)
    list = removeWeightedEntry(list, 'a')
    assert.deepEqual(list, [{ id: 'b', weight: 1 }])
  })

  it('setEntryWeight keeps total at 1', () => {
    const list = setEntryWeight(
      [
        { id: 'a', weight: 0.5 },
        { id: 'b', weight: 0.5 },
      ],
      'a',
      0.8,
    )
    assert.equal(list.find((entry) => entry.id === 'a').weight, 0.8)
    assert.equal(list.find((entry) => entry.id === 'b').weight, 0.2)
    assert.ok(Math.abs(list.reduce((sum, entry) => sum + entry.weight, 0) - 1) < 0.001)
  })

  it('pickWeighted respects weights', () => {
    const picks = { a: 0, b: 0 }
    const entries = [
      { id: 'a', weight: 0.9 },
      { id: 'b', weight: 0.1 },
    ]
    let i = 0
    const rolls = [0.05, 0.5, 0.95, 0.2, 0.99]
    const random = () => rolls[i++ % rolls.length]
    for (let n = 0; n < rolls.length; n++) {
      picks[pickWeighted(entries, random)]++
    }
    assert.ok(picks.a >= 3)
    assert.ok(picks.b >= 1)
  })
})
