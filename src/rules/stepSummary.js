import summaryCopy from '../data/adaptation/stepSummaries.json'
import creationSteps from '../data/adaptation/creationSteps.json'
import { getSpeciesArt } from './choiceArt.js'
import attributeSource from '../data/source/attributes.json'
import disciplineSource from '../data/source/disciplines.json'
import startingPoints from '../data/source/startingPoints.json'
import { getAttributeContributions, getAttributeTotals, getDisciplineContributions, getDisciplineTotals, sumContributions } from './characterTotals.js'
import { getFocusEntries, getTraitEntries, getValueEntries } from './characterSheet.js'
import { validateCharacter } from './characterValidation.js'
import {
  getSpeciesAbility,
  getSpeciesAbilityGap,
  getSpeciesAbilityLabel,
  getSpeciesById,
  getSpeciesDisplayName,
  isMixedHeritage,
  isNewSpecies,
} from './species.js'
import * as environmentRules from './environment.js'
import * as outlookRules from './earlyOutlook.js'
import * as educationRules from './education.js'
import * as careerRules from './career.js'
import * as historyRules from './careerHistory.js'
import * as finishingRules from './finishingTouches.js'
import { getCardTip, getRankTip, getScoreTip } from './infoTips.js'
import { getConceptHelp, getSectionHelp } from './sectionHelp.js'
import { getRequiredTalentCount, getRequirementSummary, getTalentById, getTalentEntries, getTalentLabel } from './talents.js'
import { getRoleById, getRoleTip } from './roles.js'
import { getUniformColour } from './uniform.js'

// Builds the Step Complete popup content for screens 1-7 from the canonical character. Plain data only:
// the modal renders it and calculates nothing itself.

const STEP_IDS = ['species', 'environment', 'earlyOutlook', 'education', 'career', 'careerHistory', 'finishingTouches']
const stepsById = Object.fromEntries(creationSteps.steps.map((step) => [step.id, step]))
const descriptions = new Map([...attributeSource.attributes, ...disciplineSource.disciplines].map((entry) => [entry.id, entry.description]))
const namesById = new Map([...attributeSource.attributes, ...disciplineSource.disciplines].map((entry) => [entry.id, entry.name]))
const KINDS = {
  attributes: { entries: attributeSource.attributes, start: startingPoints.attributeStart, contributions: getAttributeContributions },
  disciplines: { entries: disciplineSource.disciplines, start: startingPoints.disciplineStart, contributions: getDisciplineContributions },
}

export const hasStepSummary = (stepId) => STEP_IDS.includes(stepId)

export const cite = (pages, book = "Captain's Log") => (pages?.length ? `${book}, ${pages.length > 1 ? 'pp.' : 'p.'}${pages.join(', ')}` : null)
const bookPage = (page) => (page ? cite([page]) : null)
// Entries that name their own book (e.g. Core Rulebook) are cited from it; the rest are Captain's Log.
const sourceCite = (source) => (source?.book && source.page ? `${source.book}, p.${source.page}` : bookPage(source?.page))
const fillPattern = (pattern, id) => (pattern && id ? pattern.replace('{id}', id) : null)
const nameList = (ids) => ids.map((id) => namesById.get(id)).join(', ')
const bonusList = (bonuses) => bonuses.map((bonus) => `${bonus.name} ${bonus.value > 0 ? '+' : ''}${bonus.value}`).join(', ')
const stepTitle = (stepId) => stepsById[stepId].title
// Lifepath order of a contribution; career events come one after the other.
const orderOf = (stepId, slotIndex = null) => STEP_IDS.indexOf(stepId) * 10 + (slotIndex ?? 0)

// ---------- Score changes ----------

// Merges one step's (or one career event's) contributions per score, with before/after and the reason for each part.
function buildScoreChanges(character, kind, fromOrder, toOrder, reasonFor) {
  const { entries, start, contributions } = KINDS[kind]
  const all = contributions(character).map((entry) => ({ ...entry, order: orderOf(entry.stepId, entry.slotIndex) }))
  const before = sumContributions(entries, start, all.filter((entry) => entry.order < fromOrder))
  const rows = new Map()
  for (const entry of all.filter((item) => item.order >= fromOrder && item.order <= toOrder)) {
    const row = rows.get(entry.id) ?? { delta: 0, reasons: [] }
    row.delta += entry.value
    const reason = reasonFor(entry)
    if (reason && !row.reasons.includes(reason)) row.reasons.push(reason)
    rows.set(entry.id, row)
  }
  return entries
    .filter((entry) => rows.get(entry.id)?.delta)
    .map((entry) => {
      const row = rows.get(entry.id)
      return { id: entry.id, name: entry.name, before: before[entry.id], after: before[entry.id] + row.delta, delta: row.delta, reasons: row.reasons, description: descriptions.get(entry.id) }
    })
}

const stepScoreChanges = (character, stepId, kind, reasonFor) =>
  buildScoreChanges(character, kind, orderOf(stepId), orderOf(stepId) + 9, reasonFor)

// ---------- Snapshot ("Your character so far") ----------

function sourceLabel(entry) {
  return entry.stepId === 'careerHistory' ? `Career Event ${entry.slotIndex + 1}` : stepTitle(entry.stepId)
}

// Scores through this step, each with the steps that raised it. Finishing Touches adds its own adjustments.
function snapshotScores(character, kind, stepId) {
  const { entries, start, contributions } = KINDS[kind]
  const upTo = contributions(character).filter((entry) => orderOf(entry.stepId, entry.slotIndex) <= orderOf(stepId) + 9)
  const totals = sumContributions(entries, start, upTo)
  const final = stepId === 'finishingTouches' ? finishingRules.getFinalScores(character, kind) : null
  return entries.map((entry) => {
    const sources = upTo.filter((item) => item.id === entry.id).map((item) => ({ label: sourceLabel(item), value: item.value }))
    if (final && final[entry.id] !== totals[entry.id]) sources.push({ label: stepTitle('finishingTouches'), value: final[entry.id] - totals[entry.id] })
    return { id: entry.id, name: entry.name, score: final ? final[entry.id] : totals[entry.id], start, sources }
  })
}

function buildSnapshot(character, stepId) {
  const reached = (entry) => STEP_IDS.indexOf(entry.stepId) <= STEP_IDS.indexOf(stepId)
  return {
    attributes: snapshotScores(character, 'attributes', stepId),
    disciplines: snapshotScores(character, 'disciplines', stepId),
    values: getValueEntries(character).filter(reached).map((entry) => ({ text: entry.text, source: stepTitle(entry.stepId) })),
    focuses: getFocusEntries(character).filter(reached).map((entry) => ({ text: entry.name, source: sourceLabel(entry) })),
    traits: getTraitEntries(character).filter(reached).map((entry) => ({ text: entry.name, source: stepTitle(entry.stepId) })),
    speciesAbility: getSpeciesAbility(character.species)?.name ?? null,
    talents: getTalentEntries(character).filter(reached).map((entry) => ({ text: entry.label, source: entry.stepTitle })),
  }
}

// ---------- Shared pieces ----------

const valueItem = (value, reason, bookText = null) => (value?.text.trim() ? [{ text: value.text.trim(), reason, bookText, custom: !value.matrixId }] : [])
const focusItem = (focus, reason, bookText = null) => (focus?.name.trim() ? { text: focus.name.trim(), reason, bookText, custom: focus.custom } : null)

function traitItems(species) {
  if (!species) return []
  return species.traits.map((trait) => ({
    text: trait.name,
    reason: 'Your species trait',
    bookText: isNewSpecies(getSpeciesById(species.id)) ? species.description.trim() || null : getSpeciesById(trait.id)?.description ?? null,
  }))
}

function abilityTip(species) {
  const ability = getSpeciesAbility(species)
  if (ability) return { title: ability.name, text: ability.description, source: ability.source ? `${ability.source.book}, p.${ability.source.page}` : null }
  const gap = getSpeciesAbilityGap(species)
  return gap ? { title: 'Species Ability', text: gap.note, source: null } : null
}

function header(stepId) {
  const step = stepsById[stepId]
  const copy = summaryCopy.steps[stepId]
  return { stepId, number: step.number, title: step.title, bookStep: copy.bookStep, grants: copy.grants, grantsSource: cite(copy.pages, copy.book), why: copy.why }
}

const group = (changes) => ({ title: null, text: null, image: null, attributes: [], disciplines: [], values: [], focuses: [], traits: [], talents: [], ...changes })

function talentTip(slot) {
  const talent = slot ? getTalentById(slot.id) : null
  if (!talent) return getConceptHelp('talent')
  return {
    title: getTalentLabel(slot),
    text: talent.description,
    sections: [{ label: 'Requirements', text: getRequirementSummary(talent) }],
    source: `${talent.source.book}, p.${talent.source.page}`,
  }
}

const talentChoice = (character, stepId) => ({ label: 'Talent', value: getTalentLabel(character.talents?.[stepId]), tip: talentTip(character.talents?.[stepId]) })

function talentItems(character, stepId, reason) {
  const slot = character.talents?.[stepId]
  const talent = slot ? getTalentById(slot.id) : null
  return talent ? [{ text: getTalentLabel(slot), reason, bookText: talent.description }] : []
}

// ---------- Step builders ----------

function speciesSummary(character) {
  const { species } = character
  const definition = getSpeciesById(species.id)
  const name = getSpeciesDisplayName(species)
  const reason = isMixedHeritage(definition)
    ? 'From your primary species\u2019 bonuses'
    : definition.attributeBonus.type === 'fixed'
      ? `${definition.name} species bonus`
      : 'One of the three attributes you chose for your species'
  const choices = [
    { label: 'Species', value: name, tip: getCardTip(definition) },
    { label: 'Gender', value: character.identity.gender?.name, tip: getSectionHelp('speciesGender') },
    ...(species.parents ? [{ label: 'Parents', value: species.parents.filter(Boolean).map((parent) => parent.name).join(' and ') }] : []),
    { label: 'Attribute bonuses', value: bonusList(species.attributeBonuses), tip: getConceptHelp('attribute') },
    { label: species.traits.length > 1 ? 'Species traits' : 'Species trait', value: species.traits.map((trait) => trait.name).join(', '), tip: getConceptHelp('trait') },
    { label: 'Species ability', value: getSpeciesAbilityLabel(species), tip: abilityTip(species) },
  ]
  const meaning = isMixedHeritage(definition)
    ? species.parents.filter(Boolean).map((parent) => ({ title: parent.name, text: getSpeciesById(parent.id).description, source: bookPage(getSpeciesById(parent.id).source.page) }))
    : [{ title: name, text: isNewSpecies(definition) ? species.description.trim() || definition.description : definition.description, source: sourceCite(definition.source) }]
  return {
    image: { src: getSpeciesArt(species.id, character.identity.gender?.id), label: name },
    choices,
    meaning,
    groups: [group({ attributes: stepScoreChanges(character, 'species', 'attributes', () => reason), traits: traitItems(species) })],
  }
}

function environmentAttributeReason(character, entryName) {
  const rule = environmentRules.getAttributeOptionRule(character.environment)
  if (rule?.type === 'speciesBonus') return `${entryName} raises one of your species\u2019 attributes.`
  if (rule?.type === 'otherSpeciesBonus') return `${entryName} raises one of the attributes of the species you were raised among (${character.environment.otherSpecies?.name}).`
  return rule?.attributes ? `${entryName} offers ${nameList(rule.attributes)}.` : null
}

function environmentDisciplineReason(character, entryName) {
  const options = environmentRules.getDisciplineOptions(character)
  return options.length === disciplineSource.disciplines.length ? `${entryName} raises any one department.` : `${entryName} offers ${nameList(options.map((option) => option.id))}.`
}

function environmentSummary(character) {
  const { environment } = character
  const chosen = environmentRules.getChosenEntry(environment)
  const entry = environmentRules.getSettingById(chosen.id)
  const attributeReason = environmentAttributeReason(character, entry.name)
  const disciplineReason = environmentDisciplineReason(character, entry.name)
  return {
    image: { src: fillPattern(summaryCopy.images.environment, entry.id), label: entry.name },
    choices: [
      { label: 'Environment', value: entry.name, tip: getCardTip(entry) },
      ...(environment.otherSpecies
        ? [{ label: 'Raised among', value: environment.otherSpecies.name, tip: getCardTip(getSpeciesById(environment.otherSpecies.id)) }]
        : []),
      { label: 'Attribute', value: bonusList([environment.attributeBonus]), tip: getScoreTip(environment.attributeBonus?.id) },
      { label: 'Department', value: bonusList([environment.disciplineBonus]), tip: getScoreTip(environment.disciplineBonus?.id) },
      { label: 'Value', value: environment.value.text.trim(), tip: getConceptHelp('value') },
    ],
    meaning: [{ title: entry.name, text: entry.description, source: sourceCite(entry.source) }],
    groups: [
      group({
        attributes: stepScoreChanges(character, 'environment', 'attributes', () => attributeReason),
        disciplines: stepScoreChanges(character, 'environment', 'disciplines', () => disciplineReason),
        values: valueItem(environment.value, `From where you were raised: ${entry.name}.`),
      }),
    ],
  }
}

function earlyOutlookSummary(character) {
  const { earlyOutlook } = character
  const outlook = outlookRules.getOutlookById(earlyOutlook.outlook.id)
  const path = outlookRules.getPathOptions(outlook.id).find((option) => option.id === earlyOutlook.path.id)
  const focus = focusItem(earlyOutlook.focus, `From your ${outlook.name} upbringing.`, outlook.focus.text)
  return {
    image: { src: fillPattern(summaryCopy.images.earlyOutlook, outlook.id), label: outlook.name },
    choices: [
      { label: 'Upbringing', value: outlook.name, tip: getCardTip(outlook) },
      { label: 'Response', value: path.name, tip: path.text ? { title: path.name, text: path.text } : null },
      { label: 'Attributes', value: bonusList(earlyOutlook.attributeBonuses), tip: getConceptHelp('attribute') },
      { label: 'Department', value: bonusList([earlyOutlook.disciplineBonus]), tip: getScoreTip(earlyOutlook.disciplineBonus?.id) },
      { label: 'Focus', value: earlyOutlook.focus.name.trim(), tip: getConceptHelp('focus') },
      talentChoice(character, 'earlyOutlook'),
    ],
    meaning: [
      { title: outlook.name, text: outlook.description, source: sourceCite(outlook.source) },
      { title: `${path.name}`, text: path.text, source: null },
    ],
    groups: [
      group({
        attributes: stepScoreChanges(character, 'earlyOutlook', 'attributes', () => `${path.name}: ${path.text}`),
        disciplines: stepScoreChanges(character, 'earlyOutlook', 'disciplines', () => outlook.disciplineOptions.text),
        focuses: focus ? [focus] : [],
        talents: talentItems(character, 'earlyOutlook', 'Your upbringing talent, chosen on this screen.'),
      }),
    ],
  }
}

function educationDisciplineReason(education, option) {
  const { major, minors, swapFrom, swapTo } = education.disciplinePicks
  return (entry) => {
    if (entry.id === major) return `+2: the major increase from ${option.name}.`
    if (minors.includes(entry.id)) return '+1: one of your other increases.'
    if (entry.id === swapFrom) return `\u22121: moved to ${namesById.get(swapTo)} by the optional swap.`
    if (entry.id === swapTo) return `+1: received from ${namesById.get(swapFrom)} by the optional swap.`
    return `+1: raised automatically alongside your +2 (${option.name}).`
  }
}

function educationSummary(character) {
  const { education } = character
  const option = educationRules.getOptionById(education.option.id)
  const category = educationRules.getCategoryById(option.category)
  const points = educationRules.getAttributePointsTotal()
  return {
    image: { src: fillPattern(summaryCopy.images.education, option.id), label: option.name },
    choices: [
      { label: 'Career Path', value: category.name, tip: getCardTip(category) },
      { label: category.optionLabel, value: option.name, tip: getCardTip(option) },
      { label: 'Trait', value: education.trait?.name, tip: getConceptHelp('trait') },
      { label: 'Attributes', value: bonusList(education.attributeBonuses), tip: getConceptHelp('attribute') },
      { label: 'Departments', value: bonusList(education.disciplineBonuses), tip: getConceptHelp('discipline') },
      { label: 'Focuses', value: education.focuses.map((focus) => focus.name.trim()).join(', '), tip: getConceptHelp('focus') },
      { label: 'Value', value: education.value.text.trim(), tip: getConceptHelp('value') },
      talentChoice(character, 'education'),
    ],
    meaning: [{ title: `${option.name} (${category.name})`, text: option.description, source: cite([option.source.page], option.source.book) }],
    groups: [
      group({
        attributes: stepScoreChanges(character, 'education', 'attributes', (entry) => `You assigned ${entry.value} of your ${points} Career Path attribute points here.`),
        disciplines: stepScoreChanges(character, 'education', 'disciplines', educationDisciplineReason(education, option)),
        focuses: education.focuses.map((focus) => focusItem(focus, `From ${option.name}.`, option.focus.text)).filter(Boolean),
        values: valueItem(education.value, `From your Career Path: ${option.name}.`, option.valueText),
        traits: education.trait ? [{ text: education.trait.name, reason: `Your Career Path trait (${option.name})`, bookText: option.trait.text }] : [],
        talents: talentItems(character, 'education', `Your Career Path talent, chosen on this screen.`),
      }),
    ],
  }
}

function careerSummary(character) {
  const { career } = character
  const length = careerRules.getCareerLengthById(career.length.id)
  const assignment = careerRules.getAssignmentById(career.assignment.id)
  const role = getRoleById(career.role?.id)
  const copy = summaryCopy.steps.career
  return {
    image: { src: careerRules.getCareerLengths().find((entry) => entry.id === length.id)?.image ?? null, label: length.name },
    choices: [
      { label: 'Experience', value: length.name, tip: getCardTip(length) },
      { label: 'Value', value: career.value.text.trim(), tip: getConceptHelp('value') },
      { label: 'Assignment', value: assignment.name, tip: getCardTip(assignment) },
      { label: 'Department', value: career.department?.name, tip: getScoreTip(career.department?.id) },
      { label: 'Rank', value: career.rank?.name, tip: getRankTip(career.rank?.id) ?? getConceptHelp('rank') },
      ...(role ? [{ label: 'Role', value: role.name, tip: getRoleTip(role) }] : []),
      talentChoice(character, 'career'),
    ],
    meaning: [
      { title: length.name, text: length.description, source: sourceCite(length.source) },
      { title: assignment.name, text: assignment.description, source: sourceCite(assignment.source) },
      { title: 'Assignment and rank', text: copy.assignmentNote, source: null },
      ...(role
        ? [{ title: `Role Benefit (${role.name})`, text: `${role.benefit.description} ${copy.roleNote}`, source: `Star Trek Adventures 2E Core Rulebook, p.${role.source.page}` }]
        : []),
      ...(length.id === 'novice' ? [{ title: 'Novice', text: copy.noviceNote, source: null }] : []),
    ],
    groups: [
      group({
        values: valueItem(career.value, `From your career so far: ${length.name}.`, length.valuePrompt),
        talents: talentItems(
          character,
          'career',
          length.id === 'experienced' ? 'Your experience talent, chosen freely.' : `Granted by your Experience: ${length.name}.`,
        ),
      }),
    ],
  }
}

function careerHistorySummary(character) {
  const events = historyRules.getCareerEvents()
  const chosen = character.careerHistory.events.map((slot) => historyRules.getCareerEventById(slot.event.id))
  const groups = character.careerHistory.events.map((slot, index) => {
    const event = chosen[index]
    const order = orderOf('careerHistory', index)
    return group({
      title: `Career Event ${index + 1}`,
      subtitle: event.name,
      image: { src: events.find((entry) => entry.id === event.id)?.image ?? null, label: event.name },
      attributes: buildScoreChanges(character, 'attributes', order, order, () => event.attribute.text),
      disciplines: buildScoreChanges(character, 'disciplines', order, order, () => event.discipline.text),
      focuses: [focusItem(slot.focus, `From ${event.name}.`, event.focus.text)].filter(Boolean),
    })
  })
  return {
    image: null,
    choices: character.careerHistory.events.map((slot, index) => ({ label: `Career Event ${index + 1}`, value: slot.event.name, tip: getCardTip(chosen[index]) })),
    meaning: chosen.map((event) => ({ title: event.name, text: event.description, source: sourceCite(event.source) })),
    groups,
  }
}

// Finishing Touches changes scores through its increases and the limit adjustments, not through contributions.
function finishingScoreChanges(character, kind) {
  const { entries } = finishingRules.getKindInfo(kind)
  const lifepath = kind === 'attributes' ? getAttributeTotals(character) : getDisciplineTotals(character)
  const final = finishingRules.getFinalScores(character, kind)
  const analysis = finishingRules.getLimitAnalysis(character, kind)
  const { max, oneAtMax, reason } = analysis
  const { increases } = character.finishingTouches[kind]
  return entries
    .map((entry) => {
      const reasons = []
      if (analysis.overLimit.includes(entry.id)) {
        if (!oneAtMax) reasons.push(`Reduced to ${max}: ${reason} allows nothing higher.`)
        else if (entry.id === analysis.keeper) {
          if (analysis.raw[entry.id] > max) reasons.push(`Reduced to the maximum of ${max}.`)
        } else {
          reasons.push(`Reduced to ${max - 1}: only one score may be at ${max}.`)
        }
      }
      if (analysis.received[entry.id]) reasons.push(`+${analysis.received[entry.id]}: points moved here from scores over the limit.`)
      if (increases.includes(entry.id)) reasons.push('+1: one of your two Finishing Touches increases, added after the limits.')
      return { id: entry.id, name: entry.name, before: lifepath[entry.id], after: final[entry.id], delta: final[entry.id] - lifepath[entry.id], reasons, description: descriptions.get(entry.id) }
    })
    .filter((row) => row.reasons.length)
}

function scoreChecks(character, kind, label) {
  const { entries, total } = finishingRules.getKindInfo(kind)
  const { max, oneAtMax, reason } = finishingRules.getScoreLimits(character, kind)
  const final = finishingRules.getFinalScores(character, kind)
  const sum = entries.reduce((acc, entry) => acc + final[entry.id], 0)
  const atMax = entries.filter((entry) => final[entry.id] === max)
  const over = entries.filter((entry) => final[entry.id] > max)
  const atMaxText = atMax.length ? `${oneAtMax ? 'only ' : ''}${atMax.map((entry) => entry.name).join(', ')} at ${max}` : `none at ${max}`
  return [
    { label: `${label}: ${sum} / ${total}`, ok: sum === total, detail: `The book's finished character totals ${total}.` },
    {
      label: `${label} limits`,
      ok: !over.length && (!oneAtMax || atMax.length <= 1),
      detail: `None above ${max}${reason ? ` (${reason})` : ''}; ${atMaxText}.`,
    },
  ]
}

function countCheck(entries, required, label) {
  const unique = new Set(entries.map((entry) => entry.text.toLowerCase()))
  const duplicates = entries.length - unique.size
  return {
    label: `${label}: ${entries.length} / ${required}`,
    ok: entries.length === required && !duplicates,
    detail: duplicates ? `${duplicates} chosen more than once; Review will ask you to change it.` : `The book's finished character has ${required}.`,
  }
}

function finishingSummary(character) {
  const { finishingTouches, identity } = character
  const book = finishingRules.getBookText()
  const portrait = finishingRules.getPortraitById(identity.portrait?.id)
  const complete = book.completeCharacter
  const issues = validateCharacter(character)
  return {
    image: { src: portrait?.image ?? null, label: identity.name.trim() || portrait?.name, uniform: getUniformColour(character.career.department?.id) },
    choices: [
      { label: 'Final value', value: finishingTouches.value.text.trim(), tip: getConceptHelp('value') },
      { label: 'Attribute increases', value: nameList(finishingTouches.attributes.increases), tip: getConceptHelp('attribute') },
      { label: 'Department increases', value: nameList(finishingTouches.disciplines.increases), tip: getConceptHelp('discipline') },
      talentChoice(character, 'finishingTouches'),
      { label: 'Portrait', value: portrait?.name },
      { label: 'Name', value: identity.name.trim() },
      ...(identity.pronouns.trim() ? [{ label: 'Pronouns', value: identity.pronouns.trim() }] : []),
      ...(identity.age?.trim() ? [{ label: 'Age', value: identity.age.trim() }] : []),
      ...(identity.pastime?.trim() ? [{ label: 'Pastime', value: identity.pastime.trim() }] : []),
    ],
    meaning: [
      { title: 'Final value', text: book.finalValue.text, source: sourceCite(book.finalValue.source) },
      { title: 'Attribute limits, then increases', text: book.attributes.text, source: sourceCite(book.attributes.source) },
      { title: 'Department limits, then increases', text: book.disciplines.text, source: sourceCite(book.disciplines.source) },
    ],
    groups: [
      group({
        attributes: finishingScoreChanges(character, 'attributes'),
        disciplines: finishingScoreChanges(character, 'disciplines'),
        values: valueItem(finishingTouches.value, 'Your final value.', book.finalValue.text),
        talents: talentItems(character, 'finishingTouches', 'Your fourth talent, chosen on this screen.'),
      }),
    ],
    checklist: {
      source: sourceCite(complete.source),
      rows: [
        ...scoreChecks(character, 'attributes', 'Attributes'),
        ...scoreChecks(character, 'disciplines', 'Departments'),
        countCheck(getValueEntries(character), complete.valueCount, 'Values'),
        countCheck(getFocusEntries(character).map((entry) => ({ text: entry.name })), complete.focusCount, 'Focuses'),
        {
          label: `Talents: ${getTalentEntries(character).length} / ${getRequiredTalentCount()}`,
          ok: getTalentEntries(character).length === getRequiredTalentCount(),
          detail: 'Four talents, one each from Upbringing, Career Path, Career and Finishing Touches (Star Trek Adventures 2E Core Rulebook, p.142).',
        },
        {
          label: 'Ready to confirm on Review',
          ok: !issues.length,
          detail: issues.length ? `${issues.length} item${issues.length > 1 ? 's' : ''} still need attention; Review lists them with links.` : 'Every character-creation requirement is met.',
        },
      ],
    },
    closing: summaryCopy.steps.finishingTouches.closing,
  }
}

const BUILDERS = {
  species: speciesSummary,
  environment: environmentSummary,
  earlyOutlook: earlyOutlookSummary,
  education: educationSummary,
  career: careerSummary,
  careerHistory: careerHistorySummary,
  finishingTouches: finishingSummary,
}

// Call only when the step is complete; every builder assumes the step's required choices exist.
export function buildStepSummary(stepId, character) {
  return {
    ...header(stepId),
    checklist: null,
    closing: null,
    ...BUILDERS[stepId](character),
    cumulative: { text: summaryCopy.cumulative.text, source: cite(summaryCopy.cumulative.pages) },
    concepts: Object.fromEntries(
      Object.entries(summaryCopy.concepts).map(([id, concept]) => [
        id,
        { ...concept, source: concept.book ? `${concept.book}, pp.${concept.pages.join(', ')}` : cite(concept.pages) },
      ]),
    ),
    snapshot: buildSnapshot(character, stepId),
  }
}

// ---------- Change detection ----------

// The completed choice set for each step. Typed text is left out (only "custom" is recorded) so editing a name or a
// custom value never re-opens the popup; picking a different card, bonus, focus, or matrix value does.
const valueKey = (value) => (value ? (value.matrixId ?? 'custom') : null)
const focusKey = (focus) => (focus ? (focus.custom ? 'custom' : focus.name) : null)
// Picks are stored in click order; sorting means un-ticking and re-ticking the same pick is not a "change".
const asSet = (list) => [...list].sort()
const scoreStepKey = (step) => [asSet(step.increases), step.keepAtMax, asSet(step.redistribution)]
const talentKey = (slot) => (slot ? [slot.id, slot.choice?.id ?? null] : null)

const SIGNATURES = {
  species: ({ species, identity }) => [
    species?.id,
    identity.gender?.id,
    species?.parents?.map((parent) => parent?.id),
    asSet(species?.attributeBonuses.map((bonus) => bonus.id) ?? []),
  ],
  environment: ({ environment: e }) => [e.setting?.id, e.otherSpecies?.id, e.attributeBonus?.id, e.disciplineBonus?.id, valueKey(e.value)],
  earlyOutlook: ({ earlyOutlook: o, talents }) => [o.outlook?.id, o.path?.id, o.disciplineBonus?.id, focusKey(o.focus), talentKey(talents?.earlyOutlook)],
  education: ({ education: e, talents }) => {
    const { major, minors, swapFrom, swapTo } = e.disciplinePicks
    return [e.option?.id, e.attributeBonuses, [major, asSet(minors), swapFrom, swapTo], asSet(e.focuses.map(focusKey)), valueKey(e.value), talentKey(talents?.education)]
  },
  career: ({ career: c, talents }) => [c.length?.id, c.assignment?.id, c.department?.id, c.rank?.id, valueKey(c.value), talentKey(talents?.career)],
  careerHistory: ({ careerHistory }) => careerHistory.events.map((slot) => slot && [slot.event.id, slot.attributeBonus?.id, slot.disciplineBonus?.id, focusKey(slot.focus)]),
  finishingTouches: ({ finishingTouches: f, identity, talents }) => [
    scoreStepKey(f.attributes),
    scoreStepKey(f.disciplines),
    valueKey(f.value),
    identity.portrait?.id,
    talentKey(talents?.finishingTouches),
  ],
}

export function getStepSignature(stepId, character) {
  return JSON.stringify(SIGNATURES[stepId](character))
}
