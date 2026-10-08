import lengthSource from '../data/source/careerLengths.json'
import assignmentSource from '../data/source/assignments.json'
import rankSource from '../data/source/ranks.json'
import disciplineSource from '../data/source/disciplines.json'
import valuesMatrix from '../data/source/valuesMatrix.json'
import careerAdaptation from '../data/adaptation/career.json'
import { areAllMet } from './requirements.js'
import { isTalentSlotMet } from './talents.js'
import { getRoleById, isRoleEligible } from './roles.js'

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
    // STA 2E role ({ id, name }), separate from the Captain's Log assignment. Its benefit is read from roles.json.
    role: null,
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
// Prototype: a Novice can't take the roles listed in career.json, and nor can a character who can only be No Rank.
export function getAssignmentBlock(character, assignmentId) {
  if (getRankType(character) === 'enlisted' && rankSource.enlistedExcludedAssignments.assignments.includes(assignmentId)) {
    return 'Not for enlisted'
  }
  if (getRankType(character) === 'none' && careerAdaptation.noRankExcludedAssignments.includes(assignmentId)) {
    return 'Not for No Rank'
  }
  if (character.career.length?.id === 'novice' && careerAdaptation.noviceExcludedAssignments.includes(assignmentId)) {
    return 'Not for Novice'
  }
  return null
}

export const isAssignmentAllowed = (character, assignmentId) =>
  Boolean(getAssignmentById(assignmentId)) && !getAssignmentBlock(character, assignmentId)

// Position of a rank within its own ladder (officer or enlisted), lowest first; -1 for No Rank.
function rankPosition(character, rankId) {
  const rank = getRankOptions(character).find((option) => option.id === rankId)
  const ladder = rank?.type === 'enlisted' ? enlistedRanks : rank?.type === 'officer' ? officerRanks : []
  return { type: rank?.type, index: ladder.findIndex((option) => option.id === rankId), ladder }
}

// Core p.127 (Untapped Potential): a Novice's rank is capped at lieutenant (junior grade) / petty officer
// (career.json noviceMaxRank).
export function isAboveNoviceCap(character, rankId) {
  const { type, index, ladder } = rankPosition(character, rankId)
  const capId = careerAdaptation.noviceMaxRank[type]
  if (character.career.length?.id !== 'novice' || !capId) return false
  return index > ladder.findIndex((option) => option.id === capId)
}

// Core p.128 (Veteran): a Veteran holds at least lieutenant commander / chief petty officer (career.json veteranMinRank).
export function isBelowVeteranFloor(character, rankId) {
  const { type, index, ladder } = rankPosition(character, rankId)
  const floorId = careerAdaptation.veteranMinRank[type]
  if (character.career.length?.id !== 'veteran' || !floorId) return false
  return index < ladder.findIndex((option) => option.id === floorId)
}

// Prototype: assignment minimum ranks apply to officer ranks only; the book gives none for enlisted or unranked characters.
// No Rank is never allowed for the assignments in career.json noRankExcludedAssignments (a Diplomat must take a rank).
export function isRankAllowed(character, rankId) {
  const { career } = character
  const rank = getRankOptions(character).find((option) => option.id === rankId)
  if (!career.assignment || !rank || isAboveNoviceCap(character, rankId) || isBelowVeteranFloor(character, rankId)) return false
  if (rank.type === 'none') return !careerAdaptation.noRankExcludedAssignments.includes(career.assignment.id)
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

// ---------- Role (STA 2E) ----------

// Designer decision (career.json roleByAssignment): an assignment with a same-named role sets that role, unchangeable.
export function getRoleFor(assignmentId) {
  const role = getRoleById(careerAdaptation.roleByAssignment[assignmentId])
  return role ? toRef(role) : null
}

// The player picks a role only for an assignment without a matching one (none today).
export const isRoleChoice = (career) => Boolean(career.assignment) && !getRoleFor(career.assignment.id)

export function selectRole(career, roleId) {
  const role = getRoleById(roleId)
  if (!role || !isRoleChoice(career) || !isRoleEligible(roleId)) return career
  return { ...career, role: toRef(role) }
}

// The role an assignment fixes, the player's still-eligible pick for an unmatched assignment, or none.
function settleRole(career) {
  if (!career.assignment) return career.role ? { ...career, role: null } : career
  const fixed = getRoleFor(career.assignment.id)
  if (fixed) return career.role?.id === fixed.id ? career : { ...career, role: fixed }
  return career.role && !isRoleEligible(career.role.id) ? { ...career, role: null } : career
}

// Clears an assignment or rank that Education or Career Length no longer allows (rather than silently keeping it),
// gives characters without a rank their only option, and keeps the role in step with the assignment.
export function reconcileCareer(character) {
  let { career } = character
  if (career.assignment && !isAssignmentAllowed(character, career.assignment.id)) {
    career = { ...career, assignment: null, department: null, rank: null }
  }
  if (career.rank && !isRankAllowed({ ...character, career }, career.rank.id)) career = { ...career, rank: null }
  if (!career.rank && career.assignment && getRankType(character) === 'none') career = { ...career, rank: noRank }
  career = settleRole(career)
  return career === character.career ? character : { ...character, career }
}

export function selectAssignment(character, assignmentId) {
  const { career } = character
  const assignment = getAssignmentById(assignmentId)
  if (!assignment || !isAssignmentAllowed(character, assignmentId)) return career
  // A department chosen for a department-less role survives switching between such roles only.
  const keptChoice = isDepartmentChoice(career) && !getDepartmentFor(assignmentId) ? career.department : null
  // A role picked for an unmatched assignment likewise survives only a switch to another unmatched one.
  const keptRole = isRoleChoice(career) && !getRoleFor(assignmentId) ? career.role : null
  return {
    ...career,
    assignment: toRef(assignment),
    department: getDepartmentFor(assignmentId) ?? keptChoice,
    role: getRoleFor(assignmentId) ?? keptRole,
  }
}

export function selectRank(character, rankId) {
  if (!isRankAllowed(character, rankId)) return character.career
  return { ...character.career, rank: getRankOptions(character).find((option) => option.id === rankId) }
}

// ---------- Requirements ----------

export const isRoleMet = (career) =>
  Boolean(career.role && isRoleEligible(career.role.id) && (isRoleChoice(career) || career.role.id === getRoleFor(career.assignment?.id)?.id))

// In on-screen order: length card, value, assignment (with its department and role), rank.
export function getCareerRequirements(character) {
  const { career } = character
  return {
    length: Boolean(career.length),
    value: Boolean(career.value?.text?.trim()),
    assignment: Boolean(career.assignment && isAssignmentAllowed(character, career.assignment.id)),
    department: Boolean(career.department),
    role: isRoleMet(career),
    rank: Boolean(career.rank && isRankAllowed(character, career.rank.id)),
    talent: isTalentSlotMet(character, 'career'),
  }
}

export const isCareerStepComplete = (character) => areAllMet(getCareerRequirements(character))
