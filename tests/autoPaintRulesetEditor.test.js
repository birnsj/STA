import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getAutoPaintRuleset,
  putAutoPaintRulesetLocal,
  resolveAutoPaintRuleset,
  validateAutoPaintRuleset,
} from '../src/maps/autoPaint/rulesets.js'

describe('Auto-Paint ruleset editor field preservation', () => {
  it('keeps fittings, fittingChance, and door flags when patching exposed wall/floor fields', () => {
    const base = getAutoPaintRuleset('template-32')
    const withHidden = resolveAutoPaintRuleset({
      ...base,
      walls: {
        ...base.walls,
        fittings: ['plainBulkhead'],
        fittingChance: 0.42,
      },
      doors: {
        ...base.doors,
        minGap: 2,
        preferOpenings: false,
      },
      floors: {
        ...base.floors,
        variants: ['floor'],
      },
      props: { enabled: true, rules: [{ id: 'keep-me' }] },
    })

    const afterUiEdit = resolveAutoPaintRuleset({
      ...withHidden,
      label: `${withHidden.label} edited`,
      floors: { ...withHidden.floors, defaultTile: withHidden.floors.defaultTile },
      walls: { ...withHidden.walls, straight: withHidden.walls.straight },
      doors: { ...withHidden.doors, underlayTile: withHidden.doors.underlayTile },
    })

    assert.equal(afterUiEdit.walls.fittingChance, 0.42)
    assert.deepEqual(afterUiEdit.walls.fittings, ['plainBulkhead'])
    assert.equal(afterUiEdit.doors.minGap, 2)
    assert.equal(afterUiEdit.doors.preferOpenings, false)
    assert.deepEqual(afterUiEdit.floors.variants, ['floor'])
    assert.equal(afterUiEdit.props.enabled, true)
    assert.deepEqual(afterUiEdit.props.rules, [{ id: 'keep-me' }])
  })

  it('putAutoPaintRulesetLocal round-trips unexposed fields when validation passes', () => {
    const base = getAutoPaintRuleset('template-32')
    const draft = resolveAutoPaintRuleset({
      ...base,
      id: 'template-32',
      walls: {
        ...base.walls,
        fittings: ['lcarsWall'],
        fittingChance: 0.15,
      },
      doors: { ...base.doors, minGap: 3, preferOpenings: true },
    })
    const { ok, errors } = validateAutoPaintRuleset(draft)
    assert.equal(ok, true, errors.join('; '))
    const saved = putAutoPaintRulesetLocal(draft)
    assert.equal(saved.walls.fittingChance, 0.15)
    assert.deepEqual(saved.walls.fittings, ['lcarsWall'])
    assert.equal(saved.doors.minGap, 3)
    putAutoPaintRulesetLocal(base)
  })
})
