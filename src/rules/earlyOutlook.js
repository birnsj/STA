import { withChoiceArt } from './choiceArt.js'
import outlookSource from '../data/source/earlyOutlooks.json'
import disciplineSource from '../data/source/disciplines.json'
import outlookAdaptation from '../data/adaptation/earlyOutlook.json'
import { areAllMet } from './requirements.js'
import { isBookFocus } from './focuses.js'
import { getAttributes, getOwnSpeciesIds } from './species.js'

const approachesById = new Map(outlookSource.approaches.map((approach) => [approach.id, approach]))
const outlooksById = new Map(outlookSource.outlooks.map((outlook) => [outlook.id, outlook]))
const disciplines = disciplineSource.disciplines
const DISCIPLINE_BONUS_AMOUNT = 1

const toRef = (entry) => ({ id: entry.id, name: entry.name })

export function createEmptyEarlyOutlook() {
  return {
    approach: null,
    outlook: null,
    path: null,
    attributeBonuses: [],
    disciplineBonus: null,
    // { name, custom }: custom is true when the player wrote their own focus instead of a book example.
    focus: null,
  }
}

export const getApproaches = () => outlookAdaptation.approachOrder.map((id) => approachesById.get(id))
export const getApproachById = (id) => approachesById.get(id) ?? null
export const getOutlookById = (id) => outlooksById.get(id) ?? null
export const getOutlooks = (approachId) =>
  withChoiceArt(
    'earlyOutlook',
    outlookSource.outlooks.filter((outlook) => outlook.approach === approachId),
  )
export const isCustomFocusAllowed = () => outlookAdaptation.allowCustomFocus

export function isApproachAvailable(character, approachId) {
  if (approachId !== 'caste') return true
  const { speciesIds, raisedAmongSpeciesIds } = outlookAdaptation.casteEligibility
  const isKlingon = getOwnSpeciesIds(character.species).some((id) => speciesIds.includes(id))
  const raisedAmongKlingons = raisedAmongSpeciesIds.includes(character.environment.otherSpecies?.id)
  return isKlingon || raisedAmongKlingons
}

// Path options (accepted/rebelled, pursued/gave up) merged with this outlook's book text and bonuses.
export function getPathOptions(outlookId) {
  const outlook = getOutlookById(outlookId)
  if (!outlook) return []
  const attributeNames = new Map(getAttributes().map((attribute) => [attribute.id, attribute.name]))
  return getApproachById(outlook.approach).pathOptions.map((option) => ({
    ...option,
    text: outlook.paths[option.id].text,
    attributeBonuses: outlook.paths[option.id].attributes.map((bonus) => ({
      id: bonus.id,
      name: attributeNames.get(bonus.id),
      value: bonus.value,
    })),
  }))
}

export function getDisciplineOptions(outlookId) {
  const rule = getOutlookById(outlookId)?.disciplineOptions
  if (!rule) return []
  if (rule.type === 'any') return disciplines
  return disciplines.filter((discipline) => rule.disciplines.includes(discipline.id))
}

export const getFocusExamples = (outlookId) => getOutlookById(outlookId)?.focus.examples ?? []

// Rebuilds the step from an outlook plus earlier picks, keeping only picks still valid for that outlook.
function buildEarlyOutlook(outlookId, { pathId, disciplineId, focus }) {
  const outlook = getOutlookById(outlookId)
  const path = getPathOptions(outlookId).find((option) => option.id === pathId)
  const discipline = getDisciplineOptions(outlookId).find((option) => option.id === disciplineId)
  const keepFocus = focus && (focus.custom ? isCustomFocusAllowed() : isBookFocus(focus.name, getFocusExamples(outlookId)))

  return {
    approach: toRef(getApproachById(outlook.approach)),
    outlook: toRef(outlook),
    path: path ? toRef(path) : null,
    attributeBonuses: path ? path.attributeBonuses : [],
    disciplineBonus: discipline ? { ...toRef(discipline), value: DISCIPLINE_BONUS_AMOUNT } : null,
    focus: keepFocus ? focus : null,
  }
}

const currentPicks = (earlyOutlook) => ({
  pathId: earlyOutlook.path?.id,
  disciplineId: earlyOutlook.disciplineBonus?.id,
  focus: earlyOutlook.focus,
})

export function selectOutlook(character, outlookId) {
  const outlook = getOutlookById(outlookId)
  if (!outlook || !isApproachAvailable(character, outlook.approach)) return character.earlyOutlook
  // The trait's text and bonuses belong to one outlook, so it is always re-chosen.
  return buildEarlyOutlook(outlookId, { ...currentPicks(character.earlyOutlook), pathId: null })
}

function updatePicks(earlyOutlook, changes) {
  if (!earlyOutlook.outlook) return earlyOutlook
  return buildEarlyOutlook(earlyOutlook.outlook.id, { ...currentPicks(earlyOutlook), ...changes })
}

export const selectPath = (earlyOutlook, pathId) => updatePicks(earlyOutlook, { pathId })
export const selectDiscipline = (earlyOutlook, disciplineId) => updatePicks(earlyOutlook, { disciplineId })
export const selectFocusExample = (earlyOutlook, name) => updatePicks(earlyOutlook, { focus: { name, custom: false } })
export const setCustomFocus = (earlyOutlook, name) =>
  isCustomFocusAllowed() ? updatePicks(earlyOutlook, { focus: { name, custom: true } }) : earlyOutlook

// A species or environment change can make a Klingon caste unavailable; clear the step if so.
export function reconcileEarlyOutlook(character) {
  const approachId = character.earlyOutlook.approach?.id
  if (!approachId || isApproachAvailable(character, approachId)) return character
  return { ...character, earlyOutlook: createEmptyEarlyOutlook() }
}

export function getEarlyOutlookRequirements(character) {
  const { outlook, path, disciplineBonus, focus } = character.earlyOutlook
  return {
    outlook: Boolean(outlook),
    path: Boolean(path),
    disciplineBonus: Boolean(disciplineBonus),
    focus: Boolean(focus?.name.trim()),
  }
}

export const isEarlyOutlookStepComplete = (character) => areAllMet(getEarlyOutlookRequirements(character))
