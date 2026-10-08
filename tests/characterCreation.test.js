// Character-creation rules: point totals, limits, talent counts and the service rules of Steps Five and Seven.
// Each test names the rule it holds to: "Book" = Captain's Log Solo RPG 2026 (printed page numbers) or the STA 2e
// Core Rulebook where noted; "Prototype" = our approved adaptation (recorded in src/data/adaptation and docs/).
//
// Whole characters come from the reducer's Dev Autofill with fixed seeds, so every rule is checked on the same
// characters a player could build on screen, not on hand-made fixtures that might skip a step.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createEmptyCharacter } from '../src/character/characterModel.js'
import { createInitialState, createRestoredState, creatorReducer } from '../src/character/characterReducer.js'
import { getAttributeTotals, getDisciplineTotals } from '../src/rules/characterTotals.js'
import { validateCharacter } from '../src/rules/characterValidation.js'
import { getFocusEntries, getTraitEntries, getValueEntries } from '../src/rules/characterSheet.js'
import {
  getAssignmentBlock,
  getAssignments,
  getMinimumRank,
  getRankOptions,
  getRankType,
  getRoleFor,
  isAboveNoviceCap,
  isBelowVeteranFloor,
  isRankAllowed,
  reconcileCareer,
} from '../src/rules/career.js'
import { getSidearm } from '../src/rules/equipment.js'
import { getEventCount } from '../src/rules/careerHistory.js'
import {
  canIncreaseAttribute,
  createEmptyEducation,
  getAttributePointsTotal,
  getDisciplineRows,
  getDisciplineRules,
  getEducationRequirements,
  getFocusCount,
  getTraitOptions,
  getValueExamples,
  increaseAttribute,
  selectEducationOption,
  selectMatrixValue,
  selectTrait,
} from '../src/rules/education.js'
import {
  canAddIncrease,
  createEmptyFinishingTouches,
  getFinalScores,
  getLimitAnalysis,
  getRequiredFocusCount,
  getRequiredValueCount,
  getScoreLimits,
  reconcileFinishingTouches,
  toggleIncrease,
} from '../src/rules/finishingTouches.js'
import { getFixedCareerTalentId, getRequiredTalentCount, getTalentEntries, isTalentSlotMet, TALENT_STEPS } from '../src/rules/talents.js'
import { SCHEMA_VERSION, serializeCharacter } from '../src/export/serializeCharacter.js'
import { createRandomChooser, fillSpecies } from '../src/rules/autofill.js'
import {
  createSpeciesSelection,
  getSpeciesAbility,
  getSpeciesAbilityLabel,
  getSpeciesRequirements,
  reconcileSpeciesSelection,
  setMixedParent,
  setNewSpeciesAbility,
  setNewSpeciesName,
  setPrimaryParent,
  toggleAttributeChoice,
} from '../src/rules/species.js'
import startingPoints from '../src/data/source/startingPoints.json'

const SEEDS = [0.05, 0.17, 0.29, 0.42, 0.61, 0.73, 0.88, 0.95]
const build = (seed) => creatorReducer(createInitialState(), { type: 'autofill', seed }).character
const BUILT = SEEDS.map((seed) => ({ seed, character: build(seed) }))

const sum = (scores) => Object.values(scores).reduce((total, value) => total + value, 0)
const countAt = (scores, value) => Object.values(scores).filter((score) => score === value).length
const messages = (character) => validateCharacter(character).map((issue) => issue.message)

// A character the rank rules see as a commissioned Experienced officer, so only the assignment minimums apply
// (Novice caps and the Veteran floor are tested on their own).
const asOfficer = (character) => ({
  ...character,
  education: { ...character.education, category: { id: 'starfleetAcademy', name: 'Starfleet (Officer)' }, option: { id: 'commandTrack', name: 'Command Track' } },
  career: { ...character.career, length: { id: 'experienced', name: 'Experienced' } },
})
const withLength = (character, id, name) => ({ ...character, career: { ...character.career, length: { id, name } } })
const asCareerPath = (character, categoryId) => ({ ...character, education: { ...character.education, category: { id: categoryId, name: categoryId } } })
const withAssignment = (character, assignmentId) => ({
  ...character,
  career: { ...character.career, assignment: getAssignments().find((entry) => entry.id === assignmentId) },
})

describe('Starting points (Book p.91)', () => {
  it('every attribute begins at 7 and every discipline at 1', () => {
    assert.equal(startingPoints.attributeStart, 7)
    assert.equal(startingPoints.disciplineStart, 1)
    const empty = createEmptyCharacter()
    assert.deepEqual(new Set(Object.values(getAttributeTotals(empty))), new Set([7]))
    assert.deepEqual(new Set(Object.values(getDisciplineTotals(empty))), new Set([1]))
  })
})

describe('Finished character (Book p.129)', () => {
  it('a character built through every screen passes validation', () => {
    for (const { seed, character } of BUILT) assert.deepEqual(messages(character), [], `seed ${seed}`)
  })

  it('attributes total 56, none above 12, at most one at 12', () => {
    for (const { seed, character } of BUILT) {
      const final = getFinalScores(character, 'attributes')
      assert.ok(final, `seed ${seed}: attributes not finalized`)
      assert.equal(sum(final), 56, `seed ${seed}`)
      assert.ok(Object.values(final).every((score) => score <= 12), `seed ${seed}: ${JSON.stringify(final)}`)
      assert.ok(countAt(final, 12) <= 1, `seed ${seed}: more than one attribute at 12`)
    }
  })

  it('disciplines total 16, none above 5, at most one at 5', () => {
    for (const { seed, character } of BUILT) {
      const final = getFinalScores(character, 'disciplines')
      assert.ok(final, `seed ${seed}: disciplines not finalized`)
      assert.equal(sum(final), 16, `seed ${seed}`)
      assert.ok(Object.values(final).every((score) => score <= 5), `seed ${seed}: ${JSON.stringify(final)}`)
      assert.ok(countAt(final, 5) <= 1, `seed ${seed}: more than one discipline at 5`)
    }
  })

  it('four values and six focuses, none repeated', () => {
    assert.equal(getRequiredValueCount(), 4)
    assert.equal(getRequiredFocusCount(), 6)
    for (const { seed, character } of BUILT) {
      const values = getValueEntries(character).map((entry) => entry.text.trim().toLowerCase())
      const focuses = getFocusEntries(character).map((entry) => entry.name.trim().toLowerCase())
      assert.equal(values.length, 4, `seed ${seed}`)
      assert.equal(new Set(values).size, 4, `seed ${seed}: duplicate value`)
      assert.equal(focuses.length, 6, `seed ${seed}`)
      assert.equal(new Set(focuses).size, 6, `seed ${seed}: duplicate focus`)
    }
  })

  it('two career events, each adding one attribute, one department and one focus (Core p.128)', () => {
    assert.equal(getEventCount(), 2)
    for (const { seed, character } of BUILT) {
      const slots = character.careerHistory.events
      assert.equal(slots.length, 2, `seed ${seed}`)
      for (const slot of slots) {
        assert.ok(slot?.event, `seed ${seed}: empty career event`)
        assert.equal(slot.attributeBonus?.value, 1, `seed ${seed}`)
        assert.equal(slot.disciplineBonus?.value, 1, `seed ${seed}`)
        assert.ok(slot.focus?.name.trim(), `seed ${seed}: career event without a focus`)
      }
    }
  })
})

// A character whose lifepath is over the limits: its first career event's attribute (or department) bonus is moved
// to the highest score and raised to `amount`, as a loaded file might hold. Its Finishing Touches start empty.
const KIND_BONUS = { attributes: 'attributeBonus', disciplines: 'disciplineBonus' }
const lifepathTotals = (character, kind) => (kind === 'attributes' ? getAttributeTotals(character) : getDisciplineTotals(character))
function forceOverLimit(character, kind, amount) {
  const totals = lifepathTotals(character, kind)
  const [top] = Object.keys(totals).sort((a, b) => totals[b] - totals[a])
  const [first, second] = character.careerHistory.events
  const events = [{ ...first, [KIND_BONUS[kind]]: { ...first[KIND_BONUS[kind]], id: top, value: amount } }, second]
  return { ...character, careerHistory: { ...character.careerHistory, events }, finishingTouches: { ...createEmptyFinishingTouches(), value: character.finishingTouches.value } }
}

// Adds +1s the way the screen allows them (only where canAddIncrease says a +1 fits) until both are chosen.
function fillIncreases(state, kind) {
  let next = state
  for (const id of Object.keys(lifepathTotals(next.character, kind))) {
    if (next.character.finishingTouches[kind].increases.length >= 2) break
    if (canAddIncrease(next.character, kind, id)) next = creatorReducer(next, { type: 'toggleFinalIncrease', kind, id })
  }
  return next
}

// The Novice version of every built character, switched on Career the way a player would.
const toNovice = (character) => creatorReducer({ ...createInitialState(), character }, { type: 'selectCareerLength', lengthId: 'novice' })

describe('Finishing Touches order (Core p.132)', () => {
  const KINDS = [
    ['attributes', 12, 54, 56],
    ['disciplines', 5, 14, 16],
  ]

  it('scores over the limits are brought down first, before any +1, and their points go to other scores', () => {
    for (const { seed, character } of BUILT) {
      for (const [kind, max, lifepathTotal] of KINDS) {
        const settled = reconcileFinishingTouches(forceOverLimit(character, kind, 4))
        const analysis = getLimitAnalysis(settled, kind)
        assert.deepEqual(settled.finishingTouches[kind].increases, [], `seed ${seed}`)
        assert.ok(analysis.overLimit.length > 0, `seed ${seed}: ${kind} not over the limits`)
        assert.equal(analysis.assigned, analysis.excess, `seed ${seed}: reduced points not all placed`)
        // With no +1s yet, the adjusted scores keep the lifepath total, within the limits.
        assert.equal(sum(analysis.adjusted), sum(lifepathTotals(settled, kind)), `seed ${seed}`)
        assert.ok(sum(lifepathTotals(settled, kind)) > lifepathTotal, `seed ${seed}: forced bonus missing`)
        assert.ok(Object.values(analysis.adjusted).every((score) => score <= max), `seed ${seed}: ${JSON.stringify(analysis.adjusted)}`)
        assert.ok(countAt(analysis.adjusted, max) <= 1, `seed ${seed}: more than one at ${max}`)
      }
    }
  })

  it('a +1 can never take a score over the limits, nor make a second score reach the maximum', () => {
    let refused = 0
    for (const { seed, character } of BUILT) {
      for (const [kind, max] of KINDS) {
        const settled = reconcileFinishingTouches(forceOverLimit(character, kind, 4))
        const { adjusted } = getLimitAnalysis(settled, kind)
        for (const id of Object.keys(adjusted)) {
          const breaksLimit = adjusted[id] + 1 > max || (adjusted[id] + 1 === max && Object.keys(adjusted).some((other) => other !== id && adjusted[other] >= max))
          assert.equal(canAddIncrease(settled, kind, id), !breaksLimit, `seed ${seed}: ${kind} ${id} at ${adjusted[id]}`)
          if (breaksLimit) {
            refused++
            assert.deepEqual(toggleIncrease(settled, kind, id)[kind].increases, [], `seed ${seed}: ${id} was increased past the limits`)
          }
        }
      }
    }
    assert.ok(refused > 0, 'no +1 was refused, so the limit check was not exercised')
  })

  it('after the limits and both +1s, attributes total 56 and departments 16, within the limits', () => {
    let reduced = 0
    for (const { seed, character } of BUILT) {
      // As built (Veteran), and switched to Novice so the lower limits force reductions before the +1s.
      for (const state of [{ character }, fillIncreases(fillIncreases(toNovice(character), 'attributes'), 'disciplines')]) {
        for (const [kind, , , total] of KINDS) {
          const { max, oneAtMax } = getScoreLimits(state.character, kind)
          const analysis = getLimitAnalysis(state.character, kind)
          if (analysis.excess > 0) reduced++
          const final = getFinalScores(state.character, kind)
          assert.ok(final, `seed ${seed}: ${kind} not finalized`)
          assert.equal(sum(final), total, `seed ${seed}`)
          assert.ok(Object.values(final).every((score) => score <= max), `seed ${seed}: ${JSON.stringify(final)}`)
          if (oneAtMax) assert.ok(countAt(final, max) <= 1, `seed ${seed}: more than one at ${max}`)
          // The +1s land on the scores as they stand after the limits.
          for (const id of state.character.finishingTouches[kind].increases) assert.equal(final[id], analysis.adjusted[id] + 1, `seed ${seed}: ${id}`)
        }
      }
    }
    assert.ok(reduced > 0, 'no score went over the limits, so reductions before the +1s were not exercised')
  })

  it('Auto and Autofill pick Veteran for Experience (Core p.127: random characters default to Veteran)', () => {
    for (const { seed, character } of BUILT) assert.equal(character.career.length.id, 'veteran', `seed ${seed}`)
  })
})

describe('Limit defaults on Finishing Touches (Prototype, Oct 2026)', () => {
  // Switching a built character to Novice lowers the limits (Untapped Potential), pushing lifepath scores over them.
  const overTheLimit = (seed) => toNovice(BUILT.find((entry) => entry.seed === seed).character)

  it('scores that go over the limits are resolved at once, so the step never waits', () => {
    let overflowed = 0
    for (const seed of SEEDS) {
      const state = overTheLimit(seed)
      for (const kind of ['attributes', 'disciplines']) {
        const analysis = getLimitAnalysis(state.character, kind)
        if (analysis.needsAdjustment) overflowed++
        assert.ok(analysis.final, `seed ${seed}: ${kind} left unresolved`)
      }
    }
    assert.ok(overflowed > 0, 'no seed went over the limits, so the defaults were not exercised')
  })

  it('a point the player takes back stays off until they place it', () => {
    for (const seed of SEEDS) {
      const state = overTheLimit(seed)
      for (const kind of ['attributes', 'disciplines']) {
        const [placed] = state.character.finishingTouches[kind].redistribution
        if (!placed) continue
        const after = creatorReducer(state, { type: 'removeFinalRedistributionPoint', kind, id: placed })
        assert.equal(after.character.finishingTouches[kind].redistribution.length, state.character.finishingTouches[kind].redistribution.length - 1, `seed ${seed}`)
      }
    }
  })
})

describe('Untapped Potential caps (Core p.127, p.131)', () => {
  const NOVICES = BUILT.map(({ seed, character }) => ({ seed, character: fillIncreases(fillIncreases(toNovice(character), 'attributes'), 'disciplines').character }))
  const OTHERS = BUILT
  const KINDS = [
    ['attributes', 11, 12, 56],
    ['disciplines', 4, 5, 16],
  ]

  // Walks the reducer the way the screen does: add redistribution points until the limit step is resolved.
  const resolveLimits = (state, kind) => {
    let next = state
    for (let guard = 0; guard < 20; guard += 1) {
      const analysis = getLimitAnalysis(next.character, kind)
      if (analysis.assigned >= analysis.excess) break
      const id = Object.keys(analysis.raw).find((entry) => analysis.canReceive(entry))
      next = creatorReducer(next, { type: 'addFinalRedistributionPoint', kind, id })
    }
    return next
  }

  it('a Novice has a flat cap of 11 / 4 with no one-at-max rule; everyone else keeps 12 / 5 with one at the maximum', () => {
    assert.ok(NOVICES.length >= 2 && OTHERS.length >= 2, 'the seeds should give both Novices and others')
    for (const [kind, noviceMax, bookMax] of KINDS) {
      for (const { character } of NOVICES) assert.deepEqual(getScoreLimits(character, kind), { max: noviceMax, oneAtMax: false, reason: 'Untapped Potential (Core Rulebook p.127)' })
      for (const { character } of OTHERS) assert.deepEqual(getScoreLimits(character, kind), { max: bookMax, oneAtMax: true, reason: null })
    }
  })

  it('Novices end with no attribute above 11 and no department above 4, totals unchanged', () => {
    for (const [kind, noviceMax, , total] of KINDS) {
      let exercised = false
      for (const { seed, character } of NOVICES) {
        const analysis = getLimitAnalysis(character, kind)
        const final = getFinalScores(character, kind)
        assert.ok(final, `seed ${seed}: ${kind} not finalized`)
        assert.ok(Object.values(final).every((score) => score <= noviceMax), `seed ${seed}: ${JSON.stringify(final)}`)
        assert.equal(sum(final), total, `seed ${seed}`)
        // Flat cap: every point over the cap is moved, nobody is asked which score "keeps" the maximum.
        assert.equal(analysis.excess, Object.values(analysis.raw).reduce((acc, score) => acc + Math.max(0, score - noviceMax), 0), `seed ${seed}`)
        assert.equal(analysis.needsKeeperChoice, false, `seed ${seed}`)
        assert.equal(analysis.keeper, null, `seed ${seed}`)
        if (analysis.excess > 0) exercised = true
      }
      assert.ok(exercised, `${kind}: no Novice went over the cap, so the redistribution path was not exercised`)
    }
  })

  it('switching an Experienced or Veteran character to Novice lowers the cap and the limit step picks it up', () => {
    for (const { seed, character } of OTHERS) {
      let state = toNovice(character)
      for (const [kind, noviceMax, , total] of KINDS) {
        assert.equal(getScoreLimits(state.character, kind).max, noviceMax, `seed ${seed}`)
        state = fillIncreases(resolveLimits(state, kind), kind)
        const final = getFinalScores(state.character, kind)
        assert.ok(final, `seed ${seed}: ${kind} unresolved after redistribution`)
        assert.ok(Object.values(final).every((score) => score <= noviceMax), `seed ${seed}: ${JSON.stringify(final)}`)
        assert.equal(sum(final), total, `seed ${seed}`)
      }
      // And back again: the book limits return.
      const back = creatorReducer(state, { type: 'selectCareerLength', lengthId: character.career.length.id })
      assert.equal(getScoreLimits(back.character, 'attributes').max, 12, `seed ${seed}`)
    }
  })

  it('a Novice whose lifepath pushes a department past 4 is held at Finishing Touches until the points are moved', () => {
    const { character } = NOVICES[0]
    const [top] = Object.entries(getDisciplineTotals(character)).sort(([, a], [, b]) => b - a)[0]
    // A loaded character whose career event granted more than its saved picks account for.
    const [first, second] = character.careerHistory.events
    const forced = { ...character, careerHistory: { ...character.careerHistory, events: [{ ...first, disciplineBonus: { id: top, value: 3 } }, second] } }
    const analysis = getLimitAnalysis(forced, 'disciplines')
    assert.ok(analysis.raw[top] > 4)
    assert.ok(analysis.overLimit.includes(top))
    assert.ok(analysis.excess > 0)
    assert.equal(getFinalScores(forced, 'disciplines'), null)
    assert.ok(messages(forced).includes('Departments are not finalized: choose both increases and resolve any scores over the limit.'))
  })
})

describe('Career Path attribute points (Core p.120)', () => {
  it('three points, split between two or three attributes (no more than +2 on one)', () => {
    assert.equal(getAttributePointsTotal(), 3)
    assert.equal(getFocusCount(), 3)
    for (const { seed, character } of BUILT) {
      const bonuses = character.education.attributeBonuses
      assert.equal(bonuses.reduce((total, bonus) => total + bonus.value, 0), 3, `seed ${seed}`)
      assert.ok(bonuses.every((bonus) => bonus.value <= 2), `seed ${seed}: ${JSON.stringify(bonuses)}`)
      assert.ok(bonuses.length >= 2 && bonuses.length <= 3, `seed ${seed}: spread over ${bonuses.length} attributes`)
      assert.equal(character.education.focuses.length, 3, `seed ${seed}`)
    }
  })

  it('a third point cannot go on the same attribute', () => {
    const education = increaseAttribute(increaseAttribute(createEmptyEducation(), 'reason'), 'reason')
    assert.equal(education.attributeBonuses.find((bonus) => bonus.id === 'reason').value, 2)
    assert.equal(canIncreaseAttribute(education, 'reason'), false)
    assert.equal(canIncreaseAttribute(education, 'control'), true)
    assert.equal(increaseAttribute(education, 'reason'), education)
  })
})

describe('Career Path (Core pp.120–126)', () => {
  // Security at 3 before Step Four, from the environment and early outlook +1s.
  const security = { id: 'security', name: 'Security', value: 1 }
  const base = {
    ...BUILT[0].character,
    environment: { ...BUILT[0].character.environment, disciplineBonus: security },
    earlyOutlook: { ...BUILT[0].character.earlyOutlook, disciplineBonus: security },
    education: createEmptyEducation(),
  }
  const withPath = (optionId) => ({ ...base, education: selectEducationOption(base, optionId) })

  it('Starfleet (Enlisted): +2 to one of Conn, Security, Engineering or Science, no department above 4', () => {
    const character = withPath('starfleetEnlisted')
    const rows = getDisciplineRows(character)
    assert.deepEqual(rows.filter((row) => row.isMajorOption).map((row) => row.id).sort(), ['conn', 'engineering', 'science', 'security'])
    assert.equal(getDisciplineRules('starfleetEnlisted').cap, 4)
    const securityRow = rows.find((row) => row.id === 'security')
    assert.equal(securityRow.before, 3)
    assert.equal(securityRow.canMajor, false)
    assert.equal(securityRow.canMinor, true)
    // Civilians have no stage cap.
    assert.equal(getDisciplineRules('physician').cap, null)
  })

  it('every path grants its trait, which appears in the character and export traits', () => {
    assert.deepEqual(withPath('starfleetEnlisted').education.trait, { id: 'starfleetCrew', name: 'Starfleet Crew' })
    assert.deepEqual(withPath('politicianOrBureaucrat').education.trait, { id: 'administrator', name: 'Administrator' })
    for (const { seed, character } of BUILT) {
      const { trait } = character.education
      assert.ok(getTraitOptions(character.education.option.id).some((option) => option.id === trait?.id), `seed ${seed}`)
      assert.ok(getTraitEntries(character).some((entry) => entry.stepId === 'education' && entry.id === trait.id), `seed ${seed}`)
      assert.ok(serializeCharacter(character).final.traits.some((entry) => entry.id === trait.id), `seed ${seed}`)
    }
  })

  it('Prototype: where Core names two traits, the player must pick one of them', () => {
    const character = withPath('diplomaticCorps')
    assert.equal(character.education.trait, null)
    assert.equal(getEducationRequirements(character).trait, false)
    assert.equal(selectTrait(character.education, 'starfleetOfficer'), character.education)
    const picked = { ...character, education: selectTrait(character.education, 'ambassador') }
    assert.deepEqual(picked.education.trait, { id: 'ambassador', name: 'Ambassador' })
    assert.equal(getEducationRequirements(picked).trait, true)
    assert.equal(withPath('scientificOrTechnicalExpert').education.trait, null)
  })

  it('Core example values are offered for the chosen path', () => {
    const character = withPath('commandTrack')
    const examples = getValueExamples('commandTrack')
    assert.equal(examples.length, 3)
    const truth = examples.find((example) => example.text === 'The first duty of every Starfleet officer is to the truth')
    assert.deepEqual(selectMatrixValue(character.education, truth.id).value, { text: truth.text, matrixId: truth.id })
  })

  it('a saved character with a retired Captain\u2019s Log option loads with the step cleared', () => {
    const saved = {
      ...BUILT[0].character,
      education: { ...BUILT[0].character.education, category: { id: 'alliedMilitary', name: 'Allied Military' }, option: { id: 'rankAndFile', name: 'Rank and File' } },
    }
    const { character } = createRestoredState(saved)
    assert.equal(character.education.option, null)
    assert.equal(character.education.trait, null)
    assert.ok(validateCharacter(character).some((issue) => issue.stepId === 'education'))
  })
})

describe('Talents (Core p.127–128, p.131)', () => {
  it('four talents, one from each granting step, each legal where it sits', () => {
    assert.equal(getRequiredTalentCount(), 4)
    assert.deepEqual(TALENT_STEPS, ['earlyOutlook', 'education', 'career', 'finishingTouches'])
    for (const { seed, character } of BUILT) {
      assert.equal(getTalentEntries(character).length, 4, `seed ${seed}`)
      for (const stepId of TALENT_STEPS) assert.ok(isTalentSlotMet(character, stepId), `seed ${seed}: ${stepId} talent not met`)
      const ids = getTalentEntries(character).map(({ slot, talent }) => (talent.repeatable === 'perChoice' ? `${slot.id}:${slot.choice?.id}` : slot.id))
      assert.equal(new Set(ids).size, 4, `seed ${seed}: a talent is held twice`)
    }
  })

  it('Novice receives Untapped Potential, Veteran receives Veteran, Experienced chooses', () => {
    assert.equal(getFixedCareerTalentId({ career: { length: { id: 'novice' } } }), 'untappedPotential')
    assert.equal(getFixedCareerTalentId({ career: { length: { id: 'veteran' } } }), 'veteran')
    assert.equal(getFixedCareerTalentId({ career: { length: { id: 'experienced' } } }), null)
    for (const { seed, character } of BUILT) {
      const fixed = getFixedCareerTalentId(character)
      if (fixed) assert.equal(character.talents.career.id, fixed, `seed ${seed}: ${character.career.length.id}`)
    }
  })
})

describe('Assignment and rank (Core p.140)', () => {
  it('only the commanding officer has a minimum rank: commander', () => {
    assert.equal(getMinimumRank('commandingOfficer').id, 'commander')
    for (const { id } of getAssignments().filter((entry) => entry.id !== 'commandingOfficer')) assert.equal(getMinimumRank(id), null, id)
  })

  it('the commanding officer needs commander or higher; the executive officer may be an ensign', () => {
    const captain = withAssignment(asOfficer(BUILT[0].character), 'commandingOfficer')
    assert.equal(isRankAllowed(captain, 'ensign'), false)
    assert.equal(isRankAllowed(captain, 'lieutenantCommander'), false)
    assert.equal(isRankAllowed(captain, 'commander'), true)
    assert.equal(isRankAllowed(captain, 'fleetAdmiral'), true)
    const xo = withAssignment(asOfficer(BUILT[0].character), 'executiveOfficer')
    assert.equal(getAssignmentBlock(xo, 'executiveOfficer'), null)
    assert.equal(isRankAllowed(xo, 'ensign'), true)
    assert.equal(isRankAllowed(withAssignment(asOfficer(BUILT[0].character), 'chiefEngineer'), 'ensign'), true)
  })

  it('Core ranks: cadet below ensign, the flag ranks above captain', () => {
    const ids = getRankOptions(asOfficer(BUILT[0].character)).map((rank) => rank.id)
    assert.deepEqual(ids.slice(0, 2), ['cadet', 'ensign'])
    assert.deepEqual(ids.slice(ids.indexOf('captain')), ['captain', 'fleetCaptain', 'commodore', 'rearAdmiral', 'viceAdmiral', 'admiral', 'fleetAdmiral'])
  })

  it('Prototype: rank type follows the Career Path category', () => {
    const types = Object.fromEntries(
      ['starfleetAcademy', 'starfleetEnlisted', 'starfleetIntelligence', 'diplomatic', 'civilian'].map((id) => [id, getRankType(asCareerPath(BUILT[0].character, id))]),
    )
    assert.deepEqual(types, { starfleetAcademy: 'officer', starfleetEnlisted: 'enlisted', starfleetIntelligence: 'officer', diplomatic: 'optional', civilian: 'optional' })
    assert.ok(getRankOptions(asCareerPath(BUILT[0].character, 'starfleetEnlisted')).every((rank) => rank.type === 'enlisted'))
  })

  it('enlisted characters can take any post but commanding officer, whose minimum is an officer rank', () => {
    const enlisted = asCareerPath(asOfficer(BUILT[0].character), 'starfleetEnlisted')
    assert.equal(getAssignmentBlock(enlisted, 'commandingOfficer'), 'Not for enlisted')
    assert.equal(getAssignmentBlock(enlisted, 'executiveOfficer'), null)
    assert.equal(getAssignmentBlock(enlisted, 'chiefEngineer'), null)
    assert.equal(isRankAllowed(withAssignment(enlisted, 'chiefEngineer'), 'crewman'), true)
  })

  it('Core p.123, p.140: diplomats and civilians start at No Rank but may take an officer rank', () => {
    for (const category of ['diplomatic', 'civilian']) {
      const character = withAssignment(asCareerPath(asOfficer(BUILT[0].character), category), 'scienceOfficer')
      const reconciled = reconcileCareer({ ...character, career: { ...character.career, rank: null } })
      assert.equal(reconciled.career.rank.id, 'noRank', category)
      assert.equal(isRankAllowed(character, 'lieutenant'), true, category)
      assert.equal(isRankAllowed(character, 'crewman'), false, category)
      const ranked = reconcileCareer({ ...character, career: { ...character.career, rank: { id: 'lieutenant', name: 'Lieutenant', type: 'officer' } } })
      assert.equal(ranked.career.rank.id, 'lieutenant', category)
    }
  })

  it('Core p.137: Chief Tactical Officer, Navigator and Ship\u2019s Doctor are assignments that set their role', () => {
    const departments = { chiefTacticalOfficer: 'security', navigator: 'conn', shipsDoctor: 'medicine' }
    for (const [id, department] of Object.entries(departments)) {
      assert.equal(getAssignments().find((entry) => entry.id === id)?.department, department, id)
      assert.equal(getRoleFor(id)?.id, id)
    }
  })

  it('saved ranks and assignments the rules no longer allow are cleared', () => {
    const enlistedCaptain = withAssignment(asCareerPath(BUILT[0].character, 'starfleetEnlisted'), 'commandingOfficer')
    const reconciled = reconcileCareer({ ...enlistedCaptain, career: { ...enlistedCaptain.career, rank: { id: 'captain', name: 'Captain', type: 'officer' } } })
    assert.equal(reconciled.career.assignment, null)
    assert.equal(reconciled.career.rank, null)
    const oldPath = { ...asOfficer(BUILT[0].character), education: { ...BUILT[0].character.education, category: { id: 'alliedMilitary', name: 'Allied Military' } } }
    assert.equal(getRankType(oldPath), 'officer')
  })

  it('Core p.127: a Novice (Untapped Potential) is capped at lieutenant (junior grade), so cannot reach commanding officer', () => {
    const novice = withLength(asOfficer(BUILT[0].character), 'novice', 'Novice')
    assert.equal(isAboveNoviceCap(novice, 'lieutenantJuniorGrade'), false)
    assert.equal(isAboveNoviceCap(novice, 'lieutenant'), true)
    assert.equal(isRankAllowed(withAssignment(novice, 'scienceOfficer'), 'lieutenant'), false)
    assert.equal(getAssignmentBlock(novice, 'commandingOfficer'), 'Not for Novice')
    for (const id of ['executiveOfficer', 'chiefEngineer', 'chiefOfSecurity', 'chiefMedicalOfficer', 'scienceOfficer']) {
      assert.equal(getAssignmentBlock(novice, id), null, id)
    }
    for (const { seed, character } of BUILT.filter((entry) => entry.character.career.length.id === 'novice')) {
      assert.equal(isAboveNoviceCap(character, character.career.rank.id), false, `seed ${seed}`)
    }
  })

  it('Core p.128: a Veteran holds at least lieutenant commander, or chief petty officer if enlisted', () => {
    const veteran = withAssignment(withLength(asOfficer(BUILT[0].character), 'veteran', 'Veteran'), 'scienceOfficer')
    assert.equal(isBelowVeteranFloor(veteran, 'lieutenant'), true)
    assert.equal(isBelowVeteranFloor(veteran, 'lieutenantCommander'), false)
    assert.equal(isRankAllowed(veteran, 'lieutenant'), false)
    assert.equal(isRankAllowed(veteran, 'lieutenantCommander'), true)
    assert.equal(isRankAllowed(veteran, 'captain'), true)
    const enlisted = {
      ...veteran,
      education: { ...veteran.education, category: { id: 'starfleetEnlisted', name: 'Starfleet (Enlisted)' }, option: { id: 'starfleetEnlisted', name: 'Starfleet (Enlisted)' } },
    }
    assert.equal(isRankAllowed(enlisted, 'pettyOfficer'), false)
    assert.equal(isRankAllowed(enlisted, 'chiefPettyOfficer'), true)
    // An Experienced officer in the same post may still be a lieutenant.
    assert.equal(isRankAllowed(withLength(veteran, 'experienced', 'Experienced'), 'lieutenant'), true)
    for (const { seed, character } of BUILT.filter((entry) => entry.character.career.length.id === 'veteran')) {
      assert.equal(isBelowVeteranFloor(character, character.career.rank.id), false, `seed ${seed}: ${character.career.rank.id}`)
    }
  })

  it('Prototype (designer decision): No Rank is never Commanding or Executive Officer', () => {
    for (const category of ['diplomatic', 'civilian']) {
      const character = asCareerPath(asOfficer(BUILT[0].character), category)
      assert.equal(isRankAllowed(withAssignment(character, 'scienceOfficer'), 'noRank'), true, category)
      // The post is open, but only with an officer rank; reconciling leaves the rank for the player to pick.
      const xo = withAssignment(character, 'executiveOfficer')
      assert.equal(getAssignmentBlock(xo, 'executiveOfficer'), null, category)
      assert.equal(isRankAllowed(xo, 'noRank'), false, category)
      assert.equal(isRankAllowed(xo, 'lieutenant'), true, category)
      assert.equal(reconcileCareer({ ...xo, career: { ...xo.career, rank: null } }).career.rank, null, category)
    }
  })

  it('every built character holds an allowed assignment and rank', () => {
    for (const { seed, character } of BUILT) {
      assert.equal(getAssignmentBlock(character, character.career.assignment.id), null, `seed ${seed}`)
      assert.ok(isRankAllowed(character, character.career.rank.id), `seed ${seed}: ${character.career.rank.id} as ${character.career.assignment.id}`)
    }
  })

  it('Autofill never picks a cadet, fleet captain or flag rank (career.json autoRankRange)', () => {
    const excluded = ['cadet', 'fleetCaptain', 'commodore', 'rearAdmiral', 'viceAdmiral', 'admiral', 'fleetAdmiral']
    for (let index = 0; index < 60; index += 1) {
      const seed = (index + 0.5) / 60
      const { rank } = build(seed).career
      assert.equal(excluded.includes(rank.id), false, `seed ${seed}: ${rank.id}`)
    }
  })
})

describe('Species Ability for Mixed Heritage and New Species', () => {
  const mixed = (...parentIds) => parentIds.reduce((selection, id, index) => setMixedParent(selection, index, id), createSpeciesSelection('mixedHeritage'))

  it('Book (Core p.99): mixed heritage has the primary species\u2019 ability; Prototype: the player picks the primary parent', () => {
    const selection = mixed('human', 'vulcan')
    assert.equal(getSpeciesAbility(selection), null)
    assert.equal(getSpeciesAbilityLabel(selection), 'Choose primary species')
    const vulcanPrimary = setPrimaryParent(selection, 'vulcan')
    assert.equal(getSpeciesAbility(vulcanPrimary).id, getSpeciesAbility(createSpeciesSelection('vulcan')).id)
    assert.equal(vulcanPrimary.speciesAbility.id, getSpeciesAbility(vulcanPrimary).id)
    assert.equal(getSpeciesAbility(setPrimaryParent(vulcanPrimary, 'human')).id, getSpeciesAbility(createSpeciesSelection('human')).id)
  })

  it('the primary must be one of the parents, and replacing that parent clears it', () => {
    const selection = setPrimaryParent(mixed('human', 'vulcan'), 'vulcan')
    assert.equal(setPrimaryParent(selection, 'andorian'), selection)
    const replaced = setMixedParent(selection, 1, 'andorian')
    assert.equal(replaced.primarySpeciesId, null)
    assert.equal(replaced.speciesAbility, null)
  })

  it('the Species screen is not complete until the primary parent is chosen', () => {
    const character = { ...createEmptyCharacter(), species: mixed('human', 'vulcan'), identity: { ...createEmptyCharacter().identity, gender: { id: 'female', name: 'Female' } } }
    assert.equal(getSpeciesRequirements(character).traits, false)
    assert.equal(getSpeciesRequirements({ ...character, species: setPrimaryParent(character.species, 'human') }).traits, true)
  })

  it('Core p.99: attribute bonuses come from the primary parent, and both parents give a species trait', () => {
    const vulcanPrimary = setPrimaryParent(mixed('human', 'vulcan'), 'vulcan')
    assert.deepEqual(vulcanPrimary.attributeBonuses.map((bonus) => bonus.id).sort(), ['control', 'fitness', 'reason'])
    assert.deepEqual(vulcanPrimary.traits.map((trait) => trait.id), ['human', 'vulcan'])
    assert.equal(mixed('human', 'vulcan').attributeBonuses.length, 0)
    // A Human primary chooses any three, as a Human would.
    const humanPrimary = setPrimaryParent(vulcanPrimary, 'human')
    assert.equal(humanPrimary.attributeBonuses.length, 0)
    const chosen = ['daring', 'insight', 'presence'].reduce(toggleAttributeChoice, humanPrimary)
    assert.deepEqual(chosen.attributeBonuses.map((bonus) => bonus.id), ['daring', 'insight', 'presence'])
    assert.equal(toggleAttributeChoice(vulcanPrimary, 'daring'), vulcanPrimary)
  })

  it('a saved mixed-heritage character is brought up to the primary-parent rule', () => {
    const old = { ...setPrimaryParent(mixed('human', 'vulcan'), 'vulcan'), attributeBonuses: [{ id: 'daring', name: 'Daring', value: 1 }], traits: [{ id: 'mixedHeritage', name: 'Human/Vulcan' }] }
    const reconciled = reconcileSpeciesSelection(old)
    assert.deepEqual(reconciled.attributeBonuses.map((bonus) => bonus.id).sort(), ['control', 'fitness', 'reason'])
    assert.deepEqual(reconciled.traits.map((trait) => trait.name), ['Human', 'Vulcan'])
  })

  it('Core p.114: a New Species chooses three attributes and needs its own written Species Ability', () => {
    const gender = { ...createEmptyCharacter().identity, gender: { id: 'female', name: 'Female' } }
    const named = setNewSpeciesName(createSpeciesSelection('newSpecies'), 'Zzyx')
    assert.equal(getSpeciesAbility(named), null)
    assert.equal(getSpeciesAbilityLabel(named), 'Create a Species Ability')
    assert.equal(getSpeciesRequirements({ ...createEmptyCharacter(), identity: gender, species: named }).traits, false)
    const onlyNamed = setNewSpeciesAbility(named, { name: 'Hive Mind' })
    assert.equal(getSpeciesAbility(onlyNamed), null)
    const written = setNewSpeciesAbility(onlyNamed, { description: 'Shares thoughts with kin.' })
    assert.deepEqual(getSpeciesAbility(written), { id: 'custom', name: 'Hive Mind', description: 'Shares thoughts with kin.', effects: [], source: null })
    const three = ['control', 'daring', 'reason'].reduce(toggleAttributeChoice, written)
    assert.equal(three.attributeBonuses.length, 3)
    assert.equal(toggleAttributeChoice(three, 'insight').attributeBonuses.length, 3)
    const character = { ...BUILT[0].character, species: three }
    assert.equal(getSpeciesRequirements(character).traits, true)
    assert.deepEqual(serializeCharacter(character).final.speciesAbility, getSpeciesAbility(written))
  })

  it('autofill picks a primary parent', () => {
    for (const seed of SEEDS) {
      const character = { ...createEmptyCharacter(), species: createSpeciesSelection('mixedHeritage') }
      const { species } = fillSpecies(character, createRandomChooser(seed))
      assert.ok(species.parents.some((parent) => parent.id === species.primarySpeciesId), `seed ${seed}`)
      assert.ok(getSpeciesAbility(species), `seed ${seed}`)
    }
  })
})

describe('Sidearm (Core p.141)', () => {
  const person = (categoryId, departmentId, rankId) => ({
    education: { category: categoryId ? { id: categoryId, name: categoryId } : null },
    career: { department: { id: departmentId, name: departmentId }, rank: { id: rankId, name: rankId } },
  })

  it('Starfleet gets a Type-1; security and lieutenant commanders and up a Type-2; civilians none', () => {
    assert.equal(getSidearm(person('starfleetAcademy', 'science', 'ensign')), 'phaserType1')
    assert.equal(getSidearm(person('starfleetAcademy', 'security', 'ensign')), 'phaserType2')
    assert.equal(getSidearm(person('starfleetEnlisted', 'security', 'crewman')), 'phaserType2')
    assert.equal(getSidearm(person('starfleetAcademy', 'science', 'lieutenantCommander')), 'phaserType2')
    assert.equal(getSidearm(person('starfleetEnlisted', 'engineering', 'masterChiefPettyOfficer')), 'phaserType1')
    assert.equal(getSidearm(person('civilian', 'science', 'noRank')), null)
    assert.equal(getSidearm(person('diplomatic', 'command', 'noRank')), null)
  })

  it('Prototype: a diplomat or civilian who takes a rank is treated as Starfleet', () => {
    assert.equal(getSidearm(person('civilian', 'medicine', 'lieutenant')), 'phaserType1')
    assert.equal(getSidearm(person('diplomatic', 'command', 'commander')), 'phaserType2')
  })
})

describe('Validation reports what is wrong and which screen fixes it', () => {
  const valid = BUILT[3].character

  it('a missing name or talent', () => {
    const unnamed = { ...valid, identity: { ...valid.identity, name: '  ' } }
    const nameIssues = validateCharacter(unnamed)
    assert.ok(nameIssues.every((issue) => issue.stepId === 'finishingTouches'), messages(unnamed).join(' | '))
    assert.ok(messages(unnamed).includes('The character has no name.'))
    const threeTalents = { ...valid, talents: { ...valid.talents, finishingTouches: null } }
    assert.ok(messages(threeTalents).includes('3 of 4 Talents chosen.'))
  })

  it('attributes that no longer total 56 send the player back to Finishing Touches', () => {
    const final = getFinalScores(valid, 'attributes')
    const lowest = Object.keys(final).reduce((best, id) => (final[id] < final[best] ? id : best))
    const extra = { id: lowest, name: lowest, value: 1 }
    const overfed = { ...valid, species: { ...valid.species, attributeBonuses: [...valid.species.attributeBonuses, extra] } }
    // A stray point means Step Seven no longer adds up to the book total, so the scores are unfinalized rather than
    // accepted at 57; the issue points at the screen that resolves them.
    assert.equal(getFinalScores(overfed, 'attributes'), null)
    const scoreIssue = validateCharacter(overfed).find((issue) => issue.message.startsWith('Attributes are not finalized'))
    assert.ok(scoreIssue, messages(overfed).join(' | '))
    assert.equal(scoreIssue.stepId, 'finishingTouches')
  })

  it('a rank the assignment does not allow', () => {
    const ensignCaptain = {
      ...withAssignment(asOfficer(valid), 'commandingOfficer'),
      career: { ...asOfficer(valid).career, assignment: getAssignments().find((entry) => entry.id === 'commandingOfficer'), rank: { id: 'ensign', name: 'Ensign' } },
    }
    const careerIssues = validateCharacter(ensignCaptain).filter((issue) => issue.stepId === 'career')
    assert.ok(careerIssues.some((issue) => issue.message.includes('Ensign is not allowed')), careerIssues.map((issue) => issue.message).join(' | '))
  })

  it('a value chosen twice, blamed on the later screen', () => {
    const repeated = { ...valid, finishingTouches: { ...valid.finishingTouches, value: { ...valid.career.value } } }
    const issue = validateCharacter(repeated).find((entry) => entry.message.includes('is chosen more than once'))
    assert.ok(issue, messages(repeated).join(' | '))
    assert.equal(issue.stepId, 'finishingTouches')
  })

  it('a missing career event', () => {
    const oneEvent = { ...valid, careerHistory: { events: [valid.careerHistory.events[0], null] } }
    assert.ok(messages(oneEvent).includes('1 of 2 Career Events chosen.'))
  })
})

describe('Export record', () => {
  it('carries the schema version, a valid status and the final scores', () => {
    const record = serializeCharacter(BUILT[1].character)
    assert.equal(record.schemaVersion, SCHEMA_VERSION)
    assert.equal(record.status.valid, true)
    assert.deepEqual(record.status.issues, [])
    assert.equal(sum(record.final.attributes), 56)
    assert.equal(sum(record.final.disciplines), 16)
    assert.equal(record.final.values.length, 4)
    assert.equal(record.final.focuses.length, 6)
    assert.equal(record.final.talents.length, 4)
    assert.ok(record.final.rank && record.final.assignment && record.final.department)
    // Only plain data leaves the app.
    assert.deepEqual(JSON.parse(JSON.stringify(record.character)), record.character)
  })

  it('Core p.132: age and the optional pastime are character data and are exported', () => {
    let state = createRestoredState(BUILT[1].character)
    state = creatorReducer(state, { type: 'setCharacterAge', age: '34' })
    state = creatorReducer(state, { type: 'setCharacterPastime', pastime: 'Kal-toh' })
    const record = serializeCharacter(state.character)
    assert.equal(record.character.identity.age, '34')
    assert.equal(record.character.identity.pastime, 'Kal-toh')
    assert.equal(record.status.valid, true)
  })
})

describe('Saves from before the Core lifepath', () => {
  it('a removed Condition, Aspiration or Caste, or an old value id, loads without crashing and is cleared', () => {
    const valid = BUILT[2].character
    const old = {
      ...valid,
      environment: { ...valid.environment, setting: null, condition: { id: 'cosmopolitan', name: 'Cosmopolitan' }, value: { text: 'Old value', matrixId: 'value-07' } },
      earlyOutlook: { ...valid.earlyOutlook, approach: { id: 'aspiration', name: 'Aspiration' }, outlook: { id: 'explorer', name: 'Explorer' } },
      finishingTouches: { ...valid.finishingTouches, value: { text: 'Another old value', matrixId: 'value-12' } },
      education: { ...valid.education, value: { text: 'Old path value', matrixId: 'value-03' } },
      career: { ...valid.career, value: { text: 'Old career value', matrixId: 'value-15' } },
    }
    const { character } = createRestoredState(old)
    assert.deepEqual(character.education.value, { text: 'Old path value', matrixId: null })
    assert.deepEqual(character.career.value, { text: 'Old career value', matrixId: null })
    assert.equal('condition' in character.environment, false)
    assert.equal(character.environment.setting, null)
    assert.equal(character.environment.attributeBonus, null)
    assert.deepEqual(character.environment.value, { text: 'Old value', matrixId: null })
    assert.equal('approach' in character.earlyOutlook, false)
    assert.equal(character.earlyOutlook.outlook, null)
    assert.deepEqual(character.finishingTouches.value, { text: 'Another old value', matrixId: null })
    const issues = messages(character)
    assert.ok(issues.includes('No environment chosen.'), issues.join(' | '))
    assert.ok(issues.includes('No Upbringing chosen.'), issues.join(' | '))
  })

  it('a valid Upbringing keeps its picks when the old approach field is dropped', () => {
    const valid = BUILT[2].character
    const { character } = createRestoredState({ ...valid, earlyOutlook: { ...valid.earlyOutlook, approach: { id: 'upbringing', name: 'Upbringing' } } })
    assert.deepEqual(character.earlyOutlook, valid.earlyOutlook)
  })
})
