// Stress, Fatigue, Injury severity, Avoid Injury and Defeat (rules/personalCondition.js).
// Each test names the rule it holds to: "Book" = STA 2e Core Rulebook, "Prototype" = our approved adaptation.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  avoidInjury,
  buildInjury,
  chooseFatiguedAttribute,
  createCondition,
  defeatOutright,
  endOfTurnCondition,
  getAvoidOption,
  getMaxStress,
  getProtection,
  getStressBaseAttribute,
  isDead,
  isDying,
  MAX_ADDED_SEVERITY,
  addedSeverityCost,
  minorDefeatText,
  needsFatigueAttribute,
  normalizeCondition,
  npcCategoryOf,
  recoverStress,
  reviveCondition,
  sufferStress,
  takeHit,
  treatInjury,
  wouldDieAtSceneEnd,
} from '../src/rules/personalCondition.js'
import { makeCharacter, makeInjury, makeWeapon, speciesAbility, talent } from './support/characters.js'

describe('maximum Stress', () => {
  it('Book p.276: equals Fitness', () => {
    assert.equal(getMaxStress(makeCharacter({ attributes: { fitness: 9 } })).value, 9)
    assert.equal(getMaxStress(makeCharacter({ attributes: { fitness: 11 } })).value, 11)
  })

  it('Book p.113: Vulcan Mental Discipline bases it on Control instead', () => {
    const vulcan = makeCharacter({ attributes: { control: 11, fitness: 8 }, speciesAbility: speciesAbility('mentalDiscipline') })
    assert.equal(getStressBaseAttribute(vulcan).attributeId, 'control')
    assert.equal(getMaxStress(vulcan).value, 11)
  })

  it('Book p.150: Tough adds a flat 2', () => {
    const tough = makeCharacter({ attributes: { fitness: 9 }, talents: [talent('tough')] })
    assert.equal(getMaxStress(tough).value, 11)
  })

  it('Book p.152: Resolute adds the Command rating', () => {
    const resolute = makeCharacter({ attributes: { fitness: 9 }, disciplines: { command: 3 }, talents: [talent('resolute')] })
    assert.equal(getMaxStress(resolute).value, 12)
  })

  it('every source is listed, so the UI can show where the total came from', () => {
    const { value, lines } = getMaxStress(makeCharacter({ attributes: { fitness: 9 }, talents: [talent('tough')] }))
    assert.equal(value, 9 + 2)
    assert.deepEqual(lines.map((line) => line.change), [9, 2])
    assert.match(lines[1].label, /Tough/)
  })

  it('Book p.277: an NPC on the book\'s streamlined rules has no Stress', () => {
    for (const npcRules of ['minor', 'notable', 'major']) {
      assert.equal(getMaxStress(makeCharacter({ npcRules })).value, 0)
    }
  })

  it('Prototype: being AI-controlled or hostile does not change the rules; only authored npcRules does', () => {
    assert.equal(npcCategoryOf(makeCharacter()), 'main')
    assert.equal(npcCategoryOf(makeCharacter({ npcRules: 'minor' })), 'minor')
    // A Klingon warrior in our game is a main character: max Stress from Fitness like the crew.
    assert.equal(getMaxStress(makeCharacter({ attributes: { fitness: 10 } })).value, 10)
  })
})

describe('suffering Stress', () => {
  const character = makeCharacter({ attributes: { fitness: 9 } })

  it('adds to the track', () => {
    const { condition, taken, overflow, complication } = sufferStress(character, createCondition(), 4)
    assert.equal(condition.stress, 4)
    assert.equal(taken, 4)
    assert.equal(overflow, 0)
    assert.equal(complication, null)
    assert.equal(condition.fatigued, false)
  })

  it('Book p.276: what will not fit fills the track and causes a complication', () => {
    const { condition, taken, overflow, complication } = sufferStress(character, { ...createCondition(), stress: 7 }, 5)
    assert.equal(condition.stress, 9, 'the track fills to the maximum, no further')
    assert.equal(taken, 2)
    assert.equal(overflow, 3)
    assert.ok(complication, 'a complication follows')
    assert.equal(condition.complications.length, 1)
  })

  it('Book p.277: reaching the maximum makes the character Fatigued', () => {
    const { condition, becameFatigued } = sufferStress(character, createCondition(), 9)
    assert.equal(condition.stress, 9)
    assert.equal(condition.fatigued, true)
    assert.equal(becameFatigued, true)
    assert.equal(needsFatigueAttribute(condition), true, 'an attribute still has to be chosen')
  })

  it('Book p.277: a Fatigued character can take no more Stress', () => {
    const fatigued = sufferStress(character, createCondition(), 9).condition
    const again = sufferStress(character, fatigued, 3)
    assert.equal(again.condition.stress, 9)
    assert.equal(again.taken, 0)
    assert.equal(again.overflow, 3)
    assert.equal(again.becameFatigued, false, 'already Fatigued, so this is not a fresh Fatigue')
  })

  it('the shut-down attribute must be one of the six', () => {
    const fatigued = sufferStress(character, createCondition(), 9).condition
    assert.equal(chooseFatiguedAttribute(fatigued, 'control').fatiguedAttribute, 'control')
    assert.equal(chooseFatiguedAttribute(fatigued, 'command').fatiguedAttribute, null, 'a department is not an attribute')
    assert.equal(chooseFatiguedAttribute(createCondition(), 'control').fatiguedAttribute, null, 'nothing to choose when not Fatigued')
  })

  it('Book p.277: recovering below the maximum ends Fatigue and releases the attribute', () => {
    const fatigued = chooseFatiguedAttribute(sufferStress(character, createCondition(), 9).condition, 'daring')
    const rested = recoverStress(character, fatigued, 3)
    assert.equal(rested.stress, 6)
    assert.equal(rested.fatigued, false)
    assert.equal(rested.fatiguedAttribute, null)
    assert.equal(recoverStress(character, fatigued, 0).fatigued, true, 'still at the maximum, still Fatigued')
  })

  it('never leaves the condition passed in modified', () => {
    const before = createCondition()
    const snapshot = JSON.stringify(before)
    sufferStress(character, before, 5)
    assert.equal(JSON.stringify(before), snapshot)
  })
})

describe('Injury severity and Protection', () => {
  it('Book p.291: severity is the weapon\'s, less Protection, to a minimum of 1', () => {
    const weapon = makeWeapon({ severity: 4 })
    const attacker = { id: 'a', character: { name: 'Attacker' } }
    assert.equal(buildInjury({ id: 'i1', type: 'stun', weapon, attacker, protection: { value: 0 } }).severity, 4)
    assert.equal(buildInjury({ id: 'i2', type: 'stun', weapon, attacker, protection: { value: 1 } }).severity, 3)
    assert.equal(buildInjury({ id: 'i3', type: 'stun', weapon, attacker, protection: { value: 99 } }).severity, 1, 'never below 1')
  })

  it('Book p.291: Momentum adds severity, at most +2', () => {
    const weapon = makeWeapon({ severity: 4 })
    const build = (addedSeverity) => buildInjury({ id: 'i', type: 'stun', weapon, attacker: null, addedSeverity, protection: { value: 0 } })
    assert.equal(build(1).severity, 5)
    assert.equal(build(MAX_ADDED_SEVERITY).severity, 6)
    assert.equal(build(5).severity, 6, 'capped at +2')
    assert.equal(build(-1).severity, 4, 'never negative')
  })

  it('Book p.241: Intense costs 1 Momentum per point instead of 2', () => {
    assert.equal(addedSeverityCost(makeWeapon()), 2)
    assert.equal(addedSeverityCost(makeWeapon({ qualities: ['Intense'] })), 1)
    assert.equal(addedSeverityCost(makeWeapon({ qualities: ['intense'] })), 1, 'case does not matter')
  })

  it('Book p.113: Klingon Brak\'lul gives 1 Protection', () => {
    const klingon = makeCharacter({ speciesAbility: speciesAbility('brakLul') })
    assert.equal(getProtection(klingon, { injuryType: 'stun' }).value, 1)
    assert.equal(getProtection(klingon, { injuryType: 'deadly' }).value, 1, 'it is not limited to one Injury type')
    assert.equal(getProtection(makeCharacter(), { injuryType: 'stun' }).value, 0)
  })
})

describe('Avoid Injury', () => {
  const injury = makeInjury({ severity: 3 })

  it('Book p.292: a main character may suffer Stress equal to the severity instead', () => {
    const character = makeCharacter({ attributes: { fitness: 9 } })
    const option = getAvoidOption(character, createCondition(), injury)
    assert.equal(option.possible, true)
    assert.equal(option.kind, 'stress')
    assert.equal(option.cost, 3)
    const { condition } = avoidInjury(character, createCondition(), injury)
    assert.equal(condition.stress, 3)
    assert.equal(condition.injuries.length, 0, 'the Injury is ignored')
    assert.equal(condition.defeated, false, 'and so is the Defeat it would have caused')
  })

  it('Book p.276: avoiding more than the track holds fills it and causes a complication', () => {
    const character = makeCharacter({ attributes: { fitness: 9 } })
    const nearlySpent = { ...createCondition(), stress: 8 }
    const option = getAvoidOption(character, nearlySpent, injury)
    assert.deepEqual([option.taken, option.overflow], [1, 2])
    const { condition, complication } = avoidInjury(character, nearlySpent, injury)
    assert.equal(condition.stress, 9)
    assert.ok(complication)
  })

  it('Book p.277: a Fatigued character cannot avoid by Stress', () => {
    const character = makeCharacter({ attributes: { fitness: 9 } })
    const fatigued = sufferStress(character, createCondition(), 9).condition
    const option = getAvoidOption(character, fatigued, injury)
    assert.equal(option.possible, false)
    assert.match(option.reason, /Fatigued/)
  })

  it('Book p.291: a Minor NPC cannot avoid at all', () => {
    const option = getAvoidOption(makeCharacter({ npcRules: 'minor' }), createCondition(), injury)
    assert.equal(option.possible, false)
    assert.equal(option.kind, null)
  })

  it('Book p.277: Notable and Major NPCs pay Threat equal to the severity', () => {
    const notable = makeCharacter({ npcRules: 'notable' })
    assert.deepEqual(
      [getAvoidOption(notable, createCondition(), injury, { threat: 3 }).possible, getAvoidOption(notable, createCondition(), injury, { threat: 2 }).possible],
      [true, false],
      'needs Threat equal to the severity',
    )
    assert.equal(getAvoidOption(notable, createCondition(), injury, { threat: 9 }).kind, 'threat')
  })

  it('Book p.277: a Notable NPC may only avoid once per scene', () => {
    const notable = makeCharacter({ npcRules: 'notable' })
    const option = getAvoidOption(notable, createCondition(), injury, { threat: 9, avoidedThisScene: [notable.id] })
    assert.equal(option.possible, false)
    assert.match(option.reason, /once per scene/)
    const major = makeCharacter({ npcRules: 'major' })
    assert.equal(getAvoidOption(major, createCondition(), injury, { threat: 9, avoidedThisScene: [major.id] }).possible, true, 'a Major NPC is not limited')
  })

  it('a Threat-paid avoid costs the character nothing', () => {
    const notable = makeCharacter({ npcRules: 'notable' })
    const { condition } = avoidInjury(notable, createCondition(), injury, 'threat')
    assert.equal(condition.stress, 0)
    assert.equal(condition.injuries.length, 0)
  })
})

describe('Injury, Defeat and Dying', () => {
  it('Book p.291: an Injury Defeats the character', () => {
    const condition = takeHit(makeCharacter(), createCondition(), makeInjury())
    assert.equal(condition.defeated, true)
    assert.equal(condition.injuries.length, 1)
  })

  it('Book p.292: Defeated with a Deadly Injury is Dying', () => {
    const stunned = takeHit(makeCharacter(), createCondition(), makeInjury({ type: 'stun' }))
    assert.equal(isDying(stunned), false)
    const deadly = takeHit(makeCharacter(), createCondition(), makeInjury({ id: 'i2', type: 'deadly' }))
    assert.equal(isDying(deadly), true)
    assert.equal(wouldDieAtSceneEnd(deadly), true)
    assert.equal(wouldDieAtSceneEnd(treatInjury(deadly, 'i2')), false, 'treated counts as medical attention')
  })

  it('Book p.291: a Minor NPC takes no Injury; the hit simply Defeats it', () => {
    const minor = makeCharacter({ npcRules: 'minor' })
    const stunned = takeHit(minor, createCondition(), makeInjury({ type: 'stun' }))
    assert.equal(stunned.defeated, true)
    assert.equal(stunned.injuries.length, 0)
    // Prototype (designer decision, Oct 2026): Stun leaves it unconscious, Deadly kills it.
    assert.equal(minorDefeatText(stunned), 'Unconscious')
    const killed = takeHit(minor, createCondition(), makeInjury({ type: 'deadly' }))
    assert.equal(isDead(killed), true)
    assert.equal(minorDefeatText(killed), 'Dead')
    assert.equal(defeatOutright(createCondition(), makeInjury({ type: 'deadly' })).dead, true)
  })

  it('Book p.292: First Aid ends Defeat and a Stun Injury then wears off; Deadly stays', () => {
    const hurt = takeHit(makeCharacter(), takeHit(makeCharacter(), createCondition(), makeInjury({ id: 's', type: 'stun' })), makeInjury({ id: 'd', type: 'deadly' }))
    const revived = reviveCondition(hurt)
    assert.equal(revived.defeated, false)
    assert.equal(isDying(revived), false, 'no longer Defeated, so no longer Dying')
    assert.equal(revived.injuries.find((injury) => injury.id === 's').recovering, true)
    assert.equal(revived.injuries.find((injury) => injury.id === 'd').recovering, false)

    const { condition, removed } = endOfTurnCondition(revived)
    assert.deepEqual(removed.map((injury) => injury.id), ['s'], 'the Stun Injury is gone at the end of the next turn')
    assert.deepEqual(condition.injuries.map((injury) => injury.id), ['d'])
  })
})

describe('normalizeCondition', () => {
  it('gives an unhurt condition for a character with none', () => {
    assert.deepEqual(normalizeCondition(null), createCondition())
    assert.deepEqual(normalizeCondition(undefined), createCondition())
  })

  it('keeps what is already there', () => {
    const condition = normalizeCondition({ stress: 4, fatigued: true, fatiguedAttribute: 'reason' })
    assert.equal(condition.stress, 4)
    assert.equal(condition.fatigued, true)
    assert.equal(condition.fatiguedAttribute, 'reason')
    assert.deepEqual(condition.injuries, [])
  })

  it('maps an older saved condition onto Defeat and its one Injury', () => {
    const condition = normalizeCondition({ status: 'down', injury: { injuryMode: 'deadly', severity: 3 } })
    assert.equal(condition.defeated, true)
    assert.deepEqual(condition.injuries.map((injury) => [injury.type, injury.severity]), [['deadly', 3]])
    assert.equal(isDying(condition), true)
  })
})
