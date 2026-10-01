import lengthSource from '../data/source/careerLengths.json'
import assignmentSource from '../data/source/assignments.json'
import rankSource from '../data/source/ranks.json'
import disciplineSource from '../data/source/disciplines.json'
import valuesMatrix from '../data/source/valuesMatrix.json'
import careerAdaptation from '../data/adaptation/career.json'
import { areAllMet } from './requirements.js'

const lengthsById = new Map(lengthSource.lengths.map((length) => [length.id, length]))
const assignmentsById = new Map(assignmentSource.assignments.map((assignment) => [assignment.id, assignment]))
const disciplinesById = new Map(disciplineSource.disciplines.map((discipline) => [discipline.id, discipline]))
const rankOrder = rankSource.ranks.map((rank) => rank.id)

const toRef = (entry) => ({ id: entry.id, name: entry.name })

export function createEmptyCareer() {
  return {
    length: null,
    value: null,
    assignment: null,
    department: null,
    rank: null,
  }
}

export const getCareerLengths = () =>
  lengthSource.lengths.map((length) => ({ ...length, image: careerAdaptation.lengthArt[length.id] ?? null }))
export const getCareerLengthById = (lengthId) => lengthsById.get(lengthId) ?? null
export const getAssignments = () => assignmentSource.assignments
export const getAssignmentById = (assignmentId) => assignmentsById.get(assignmentId) ?? null
export const getRanks = () => rankSource.ranks
export const getRankById = (rankId) => rankSource.ranks.find((rank) => rank.id === rankId) ?? null
export const getDepartmentById = (departmentId) => disciplinesById.get(departmentId) ?? null
export const getValueMatrix = () => valuesMatrix.values
export const isCustomValueAllowed = () => careerAdaptation.allowCustomValue

// ---------- Career length and value ----------

// The value belongs to the chosen length (its prompt differs), so a new length starts with no value.
export function selectLength(career, lengthId) {
  const length = getCareerLengthById(lengthId)
  if (!length) return career
  return { ...career, length: toRef(length), value: null }
}

export function selectMatrixValue(career, valueId) {
  const entry = getValueMatrix().find((value) => value.id === valueId)
  if (!career.length || !entry) return career
  return { ...career, value: { text: entry.text, matrixId: entry.id } }
}

export function setCustomValue(career, text) {
  if (!career.length || !isCustomValueAllowed()) return career
  return { ...career, value: { text, matrixId: null } }
}

// ---------- Rank type (from Education) ----------

// 'officer' | 'enlisted' | 'none' | 'optional' (officer ranks or No Rank). See career.json rankTypeByEducation.
export function getRankType(character) {
  const { categories, options, default: fallback } = careerAdaptation.rankTypeByEducation
  const { category, option } = character.education
  return options[option?.id] ?? categories[category?.id] ?? fallback
}

const officerRanks = rankSource.ranks.map((rank) => ({ ...toRef(rank), type: 'officer' }))
const enlistedRanks = rankSource.enlistedRanks.map((rank) => ({ ...toRef(rank), type: 'enlisted' }))
const noRank = { ...careerAdaptation.noRank, type: 'none' }

// Lowest first.
export function getRankOptions(character) {
  switch (getRankType(character)) {
    case 'enlisted':
      return enlistedRanks
    case 'none':
      return [noRank]
    case 'optional':
      return [noRank, ...officerRanks]
    default:
      return officerRanks
  }
}

// ---------- Assignment and rank ----------

// Book p.132: the commanding officer must be at least a commander; executive officer, chief engineer,
// chief of security, and chief medical officer at least a lieutenant (junior grade).
export function getMinimumRank(assignmentId) {
  return getRankById(getAssignmentById(assignmentId)?.minimumRank ?? rankOrder[0])
}

// Why an assignment can't be taken, or null. Book p.132: enlisted never get CO or XO.
// Prototype: a Novice can't take the roles listed in career.json.
export function getAssignmentBlock(character, assignmentId) {
  if (getRankType(character) === 'enlisted' && rankSource.enlistedExcludedAssignments.assignments.includes(assignmentId)) {
    return 'Not for enlisted'
  }
  if (character.career.length?.id === 'novice' && careerAdaptation.noviceExcludedAssignments.includes(assignmentId)) {
    return 'Not for Novice'
  }
  return null
}

export const isAssignmentAllowed = (character, assignmentId) =>
  Boolean(getAssignmentById(assignmentId)) && !getAssignmentBlock(character, assignmentId)

// Prototype: a Novice's rank is capped (career.json noviceMaxRank). Ranks are listed lowest first.
export function isAboveNoviceCap(character, rankId) {
  const rank = getRankOptions(character).find((option) => option.id === rankId)
  const capId = careerAdaptation.noviceMaxRank[rank?.type]
  if (character.career.length?.id !== 'novice' || !capId) return false
  const ids = (rank.type === 'enlisted' ? enlistedRanks : officerRanks).map((option) => option.id)
  return ids.indexOf(rankId) > ids.indexOf(capId)
}

// Prototype: minimum ranks apply to officer ranks only; the book gives none for enlisted or unranked characters.
export function isRankAllowed(character, rankId) {
  const { career } = character
  const rank = getRankOptions(character).find((option) => option.id === rankId)
  if (!career.assignment || !rank || isAboveNoviceCap(character, rankId)) return false
  if (rank.type !== 'officer') return true
  return rankOrder.indexOf(rankId) >= rankOrder.indexOf(getMinimumRank(career.assignment.id).id)
}

export function getDepartmentFor(assignmentId) {
  const department = getDepartmentById(getAssignmentById(assignmentId)?.department)
  return department ? toRef(department) : null
}

export const getDepartments = () => disciplineSource.disciplines

// Book p.92 says to choose a department. Prototype: it comes from the assignment, and the player picks one
// only when the book gives that assignment none (Communications Officer).
export const isDepartmentChoice = (career) => Boolean(career.assignment) && !getDepartmentFor(career.assignment.id)

export function selectDepartment(career, departmentId) {
  const department = getDepartmentById(departmentId)
  if (!department || !isDepartmentChoice(career)) return career
  return { ...career, department: toRef(department) }
}

// Clears an assignment or rank that Education or Career Length no longer allows (rather than silently keeping it),
// and gives characters without a rank their only option.
export function reconcileCareer(character) {
  let { career } = character
  if (career.assignment && !isAssignmentAllowed(character, career.assignment.id)) {
    career = { ...career, assignment: null, department: null, rank: null }
  }
  if (career.rank && !isRankAllowed({ ...character, career }, career.rank.id)) career = { ...career, rank: null }
  if (!career.rank && career.assignment && getRankType(character) === 'none') career = { ...career, rank: noRank }
  return career === character.career ? character : { ...character, career }
}

export function selectAssignment(character, assignmentId) {
  const { career } = character
  const assignment = getAssignmentById(assignmentId)
  if (!assignment || !isAssignmentAllowed(character, assignmentId)) return career
  // A department chosen for a department-less role survives switching between such roles only.
  const keptChoice = isDepartmentChoice(career) && !getDepartmentFor(assignmentId) ? career.department : null
  return { ...career, assignment: toRef(assignment), department: getDepartmentFor(assignmentId) ?? keptChoice }
}

export function selectRank(character, rankId) {
  if (!isRankAllowed(character, rankId)) return character.career
  return { ...character.career, rank: getRankOptions(character).find((option) => option.id === rankId) }
}

// ---------- Requirements ----------

// In on-screen order: length card, value, assignment (with its department), rank.
export function getCareerRequirements(character) {
  const { career } = character
  return {
    length: Boolean(career.length),
    value: Boolean(career.value?.text?.trim()),
    assignment: Boolean(career.assignment && isAssignmentAllowed(character, career.assignment.id)),
    department: Boolean(career.department),
    rank: Boolean(career.rank && isRankAllowed(character, career.rank.id)),
  }
}

export const isCareerStepComplete = (character) => areAllMet(getCareerRequirements(character))
