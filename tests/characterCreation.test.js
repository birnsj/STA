// Character-creation rules: point totals, limits, talent counts and the service rules of Steps Five and Seven.
// Each test names the rule it holds to: "Book" = Captain's Log Solo RPG 2026 (printed page numbers) or the STA 2e
// Core Rulebook where noted; "Prototype" = our approved adaptation (recorded in src/data/adaptation and docs/).
//
// Whole characters come from the reducer's Dev Autofill with fixed seeds, so every rule is checked on the same
// characters a player could build on screen, not on hand-made fixtures that might skip a step.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createEmptyCharacter } from '../src/character/characterModel.js'
import { createInitialState, creatorReducer } from '../src/character/characterReducer.js'
import { getAttributeTotals, getDisciplineTotals } from '../src/rules/characterTotals.js'
import { validateCharacter } from '../src/rules/characterValidation.js'
import { getFocusEntries, getValueEntries } from '../src/rules/characterSheet.js'
import { getAssignmentBlock, getAssignments, getMinimumRank, isAboveNoviceCap, isBelowVeteranFloor, isRankAllowed } from '../src/rules/career.js'
import { getEventCount } from '../src/rules/careerHistory.js'
import { canIncreaseAttribute, createEmptyEducation, getAttributePointsTotal, getFocusCount, increaseAttribute } from '../src/rules/education.js'
import { getFinalScores, getLimitAnalysis, getRequiredFocusCount, getRequiredValueCount, getScoreLimits } from '../src/rules/finishingTouches.js'
import { getFixedCareerTalentId, getRequiredTalentCount, getTalentEntries, isTalentSlotMet, TALENT_STEPS } from '../src/rules/talents.js'
import { SCHEMA_VERSION, serializeCharacter } from '../src/export/serializeCharacter.js'
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
  education: { ...character.education, category: { id: 'starfleetAcademy', name: 'Starfleet Academy' }, option: { id: 'commandTrack', name: 'Command Track' } },
  career: { ...character.career, length: { id: 'experienced', name: 'Experienced' } },
})
const withLength = (character, id, name) => ({ ...character, career: { ...character.career, length: { id, name } } })
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

  it('two career events, each adding one attribute, one discipline and one focus (Book p.123)', () => {
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

describe('Untapped Potential caps (Core p.127, p.131)', () => {
  const NOVICES = BUILT.filter((entry) => entry.character.career.length.id === 'novice')
  const OTHERS = BUILT.filter((entry) => entry.character.career.length.id !== 'novice')
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

  it('built Novices end with no attribute above 11 and no department above 4, totals unchanged', () => {
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
      assert.ok(exercised, `${kind}: no built Novice went over the cap, so the redistribution path was not exercised`)
    }
  })

  it('switching an Experienced or Veteran character to Novice lowers the cap and the limit step picks it up', () => {
    for (const { seed, character } of OTHERS) {
      let state = creatorReducer({ ...createInitialState(), character }, { type: 'selectCareerLength', lengthId: 'novice' })
      for (const [kind, noviceMax, , total] of KINDS) {
        assert.equal(getScoreLimits(state.character, kind).max, noviceMax, `seed ${seed}`)
        state = resolveLimits(state, kind)
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
    const [top] = Object.entries(getFinalScores(character, 'disciplines')).sort(([, a], [, b]) => b - a)[0]
    // A loaded character whose career event granted more than its saved picks account for.
    const [first, second] = character.careerHistory.events
    const forced = { ...character, careerHistory: { ...character.careerHistory, events: [{ ...first, disciplineBonus: { id: top, value: 3 } }, second] } }
    const analysis = getLimitAnalysis(forced, 'disciplines')
    assert.ok(analysis.raw[top] > 4)
    assert.ok(analysis.overLimit.includes(top))
    assert.ok(analysis.excess > 0)
    assert.equal(getFinalScores(forced, 'disciplines'), null)
    assert.ok(messages(forced).includes('Disciplines are not finalized: choose both increases and resolve any scores over the limit.'))
  })
})

describe('Education attribute points (Book p.115–116)', () => {
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

describe('Assignment and rank (Book p.132)', () => {
  it('commanding officer needs at least commander; XO and the chiefs at least lieutenant (junior grade)', () => {
    assert.equal(getMinimumRank('commandingOfficer').id, 'commander')
    for (const id of ['executiveOfficer', 'chiefEngineer', 'chiefOfSecurity', 'chiefMedicalOfficer']) {
      assert.equal(getMinimumRank(id).id, 'lieutenantJuniorGrade', id)
    }
    for (const id of ['operationsManager', 'flightController', 'scienceOfficer', 'shipsCounselor', 'communicationsOfficer']) {
      assert.equal(getMinimumRank(id).id, 'ensign', id)
    }
  })

  it('an officer below the minimum rank is refused for that assignment', () => {
    const captain = withAssignment(asOfficer(BUILT[0].character), 'commandingOfficer')
    assert.equal(isRankAllowed(captain, 'ensign'), false)
    assert.equal(isRankAllowed(captain, 'lieutenantCommander'), false)
    assert.equal(isRankAllowed(captain, 'commander'), true)
    assert.equal(isRankAllowed(captain, 'captain'), true)
    const engineer = withAssignment(asOfficer(BUILT[0].character), 'chiefEngineer')
    assert.equal(isRankAllowed(engineer, 'ensign'), false)
    assert.equal(isRankAllowed(engineer, 'lieutenantJuniorGrade'), true)
  })

  it('enlisted characters never take commanding officer or executive officer', () => {
    const enlisted = {
      ...BUILT[0].character,
      education: { ...BUILT[0].character.education, category: { id: 'alliedMilitary', name: 'Allied Military' }, option: { id: 'rankAndFile', name: 'Rank and File' } },
      career: { ...BUILT[0].character.career, length: { id: 'experienced', name: 'Experienced' } },
    }
    assert.equal(getAssignmentBlock(enlisted, 'commandingOfficer'), 'Not for enlisted')
    assert.equal(getAssignmentBlock(enlisted, 'executiveOfficer'), 'Not for enlisted')
    assert.equal(getAssignmentBlock(enlisted, 'chiefEngineer'), null)
    // Prototype: the book gives enlisted ranks no assignment minimums, so any enlisted rank is allowed.
    assert.equal(isRankAllowed(withAssignment(enlisted, 'chiefEngineer'), 'crewman'), true)
  })

  it('Core p.127: a Novice (Untapped Potential) is capped at lieutenant (junior grade); Prototype: and kept out of the senior posts', () => {
    const novice = withLength(asOfficer(BUILT[0].character), 'novice', 'Novice')
    assert.equal(isAboveNoviceCap(novice, 'lieutenantJuniorGrade'), false)
    assert.equal(isAboveNoviceCap(novice, 'lieutenant'), true)
    assert.equal(isRankAllowed(withAssignment(novice, 'scienceOfficer'), 'lieutenant'), false)
    assert.equal(getAssignmentBlock(novice, 'commandingOfficer'), 'Not for Novice')
    assert.equal(getAssignmentBlock(novice, 'scienceOfficer'), null)
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
      education: { ...veteran.education, category: { id: 'alliedMilitary', name: 'Allied Military' }, option: { id: 'rankAndFile', name: 'Rank and File' } },
    }
    assert.equal(isRankAllowed(enlisted, 'pettyOfficer'), false)
    assert.equal(isRankAllowed(enlisted, 'chiefPettyOfficer'), true)
    // An Experienced officer in the same post may still be a lieutenant.
    assert.equal(isRankAllowed(withLength(veteran, 'experienced', 'Experienced'), 'lieutenant'), true)
    for (const { seed, character } of BUILT.filter((entry) => entry.character.career.length.id === 'veteran')) {
      assert.equal(isBelowVeteranFloor(character, character.career.rank.id), false, `seed ${seed}: ${character.career.rank.id}`)
    }
  })

  it('every built character holds an allowed assignment and rank', () => {
    for (const { seed, character } of BUILT) {
      assert.equal(getAssignmentBlock(character, character.career.assignment.id), null, `seed ${seed}`)
      assert.ok(isRankAllowed(character, character.career.rank.id), `seed ${seed}: ${character.career.rank.id} as ${character.career.assignment.id}`)
    }
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
})
