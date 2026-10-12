// Character-creation rules modules with no screen logic of their own: values (Core p.96, species sidebars
// pp.100-113), focuses (Core pp.94-95), Service Roles and the section unlock order.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getAllMatrixFocuses, getFocusGroups, isBookFocus, isMatrixFocus } from '../src/rules/focuses.js'
import { areAllMet, getLockedSections } from '../src/rules/requirements.js'
import { getRoleById, getRoleRecord, getRoles, isRoleEligible } from '../src/rules/roles.js'
import { getSampleValues, getSpeciesValueExamples, getSpeciesValuePage, getValueById, reconcileValue } from '../src/rules/values.js'

describe('values', () => {
  it('finds sample values and species example values by id', () => {
    assert.equal(getSampleValues().length, 72)
    assert.equal(getValueById('core-value-01').text, 'A good mystery is irresistible')
    assert.equal(getValueById('andorian-value-1').text, 'I always repay my debts')
    assert.equal(getValueById('nope'), null)
  })

  it('lists species examples in order without repeats, skipping species with no sidebar', () => {
    const examples = getSpeciesValueExamples(['andorian', 'noSuchSpecies', 'andorian'])
    assert.deepEqual(
      examples.map((value) => value.id),
      ['andorian-value-1', 'andorian-value-2', 'andorian-value-3', 'andorian-value-4'],
    )
    assert.equal(getSpeciesValuePage('andorian'), 100)
    assert.equal(getSpeciesValuePage('noSuchSpecies'), null)
  })

  it('keeps a saved value whose id no longer exists as the player\u2019s own wording', () => {
    const known = { text: 'A good mystery is irresistible', matrixId: 'core-value-01' }
    assert.equal(reconcileValue(known), known)
    assert.deepEqual(reconcileValue({ text: 'Old wording', matrixId: 'retired-id' }), { text: 'Old wording', matrixId: null })
    assert.equal(reconcileValue(null), null)
  })
})

describe('focuses', () => {
  it('a book focus is a step example or a Sample Focus; anything else is the player\u2019s own', () => {
    assert.ok(isMatrixFocus('Art'))
    assert.ok(isBookFocus('Art', []))
    assert.ok(isBookFocus('Klingon Opera', ['Klingon Opera']))
    assert.equal(isBookFocus('Klingon Opera', []), false)
    assert.equal(getAllMatrixFocuses().length, 31 * 6)
  })

  it('groups the picker: the step examples first when there are any, then each division', () => {
    assert.deepEqual(getFocusGroups([]).map((group) => group.id), ['command', 'conn', 'engineering', 'security', 'medicine', 'science'])
    const withExamples = getFocusGroups(['Klingon Opera'])
    assert.equal(withExamples[0].id, 'examples')
    assert.deepEqual(withExamples[0].focuses, ['Klingon Opera'])
    assert.equal(withExamples.length, 7)
  })
})

describe('service roles', () => {
  it('every known role is eligible (the book lists no requirements)', () => {
    assert.equal(getRoles().length, 15)
    assert.ok(getRoles().every((role) => isRoleEligible(role.id)))
    assert.equal(isRoleEligible('noSuchRole'), false)
  })

  it('exports a role with its benefit named after it', () => {
    const record = getRoleRecord({ id: 'commandingOfficer' })
    const role = getRoleById('commandingOfficer')
    assert.equal(record.id, 'commandingOfficer')
    assert.equal(record.benefit.name, `${role.name} Role Benefit`)
    assert.deepEqual(record.benefit.effects, role.benefit.effects)
    assert.equal(getRoleRecord({ id: 'noSuchRole' }), null)
    assert.equal(getRoleRecord(null), null)
  })
})

describe('section unlock order', () => {
  it('locks every section after the first unmet one', () => {
    assert.deepEqual(getLockedSections({ species: true, traits: false, values: false, focus: true }), { species: false, traits: false, values: true, focus: true })
    assert.deepEqual(getLockedSections({ a: true, b: true }), { a: false, b: false })
    assert.ok(areAllMet({ a: true, b: true }))
    assert.equal(areAllMet({ a: true, b: false }), false)
  })
})
