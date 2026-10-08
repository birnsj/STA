import { withChoiceArt } from './choiceArt.js'
import outlookSource from '../data/source/earlyOutlooks.json'
import disciplineSource from '../data/source/disciplines.json'
import outlookAdaptation from '../data/adaptation/earlyOutlook.json'
import { areAllMet } from './requirements.js'
import { isBookFocus } from './focuses.js'
import { getAttributes } from './species.js'
import { isTalentSlotMet } from './talents.js'

const outlooksById = new Map(outlookSource.outlooks.map((outlook) => [outlook.id, outlook]))
const disciplines = disciplineSource.disciplines
const DISCIPLINE_BONUS_AMOUNT = 1

const toRef = (entry) => ({ id: entry.id, name: entry.name })

// Core pp.117-119 (Upbringing): one card per Upbringing; the player then picks accepted or rebelled.
export function createEmptyEarlyOutlook() {
  return {
    outlook: null,
    path: null,
    attributeBonuses: [],
    disciplineBonus: null,
    // { name, custom }: custom is true when the player wrote their own focus instead of a book example.
    focus: null,
  }
}

export const getOutlookById = (id) => outlooksById.get(id) ?? null
export const getOutlooks = () => withChoiceArt('earlyOutlook', outlookSource.outlooks)
export const getUpbringingRules = () => ({ grants: outlookSource.grants, pathPrompt: outlookSource.pathPrompt, talent: outlookSource.talent })
export const isCustomFocusAllowed = () => outlookAdaptation.allowCustomFocus

// Path options (accepted / rebelled) merged with this Upbringing's book text and bonuses.
export function getPathOptions(outlookId) {
  const outlook = getOutlookById(outlookId)
  if (!outlook) return []
  const attributeNames = new Map(getAttributes().map((attribute) => [attribute.id, attribute.name]))
  return outlookSource.pathOptions.map((option) => ({
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
  if (!outlook) return character.earlyOutlook
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

// Saves from before the Core Upbringings may hold a removed Aspiration or Caste outlook (cleared) or the old
// approach field (dropped).
export function reconcileEarlyOutlook(character) {
  const { earlyOutlook } = character
  if (earlyOutlook.outlook && !getOutlookById(earlyOutlook.outlook.id)) {
    return { ...character, earlyOutlook: createEmptyEarlyOutlook() }
  }
  if (!('approach' in earlyOutlook)) return character
  const rest = { ...earlyOutlook }
  delete rest.approach
  return { ...character, earlyOutlook: rest }
}

export function getEarlyOutlookRequirements(character) {
  const { outlook, path, disciplineBonus, focus } = character.earlyOutlook
  return {
    outlook: Boolean(outlook),
    path: Boolean(path),
    disciplineBonus: Boolean(disciplineBonus),
    focus: Boolean(focus?.name.trim()),
    talent: isTalentSlotMet(character, 'earlyOutlook'),
  }
}

export const isEarlyOutlookStepComplete = (character) => areAllMet(getEarlyOutlookRequirements(character))
