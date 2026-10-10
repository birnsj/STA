// Mission flags (videogame adaptation, no book rule): the one store of named world facts for a mission, shared by
// challenge objects, conversations, objectives and encounter logic. It lives in the exploration state
// (scenario.flags, challengeObjects.js), so it survives a fight and every conversation; nothing is saved between
// sessions yet. A flag holds a boolean, a number or a string. A flag never set reads as false, 0 or '' (whichever
// matches the type it is compared with), so `{ powerRestored: true }` requirements written before typed flags behave
// as before.
// Pure data in and out: no JavaScript is ever read from content. Conditions and changes are small objects:
//   condition { flag, op, value }: op 'isTrue' | 'isFalse' | 'equals' | 'notEquals' | 'atLeast' | 'atMost' | 'above' | 'below'
//   change    { flag, op, value }: op 'set' | 'clear' | 'add' (add: numbers only; an unset flag counts as 0)

export const CONDITION_OPS = [
  { id: 'isTrue', label: 'is true', needsValue: false },
  { id: 'isFalse', label: 'is false / not set', needsValue: false },
  { id: 'equals', label: '=', needsValue: true },
  { id: 'notEquals', label: '≠', needsValue: true },
  { id: 'atLeast', label: '≥', needsValue: true },
  { id: 'atMost', label: '≤', needsValue: true },
  { id: 'above', label: '>', needsValue: true },
  { id: 'below', label: '<', needsValue: true },
]

export const CHANGE_OPS = [
  { id: 'set', label: 'set to', needsValue: true },
  { id: 'clear', label: 'clear', needsValue: false },
  { id: 'add', label: 'add', needsValue: true },
]

const unsetAs = (value) => (typeof value === 'number' ? 0 : typeof value === 'string' ? '' : false)

// The flag's value, or the empty value of the type it is being compared with.
export function readFlag(flags, flag, like = false) {
  const value = flags?.[flag]
  return value === undefined || value === null ? unsetAs(like) : value
}

const truthy = (value) => value !== undefined && value !== null && value !== false && value !== 0 && value !== ''

export function checkCondition(flags, condition) {
  if (!condition?.flag) return true
  const { flag, op = 'isTrue', value } = condition
  const current = readFlag(flags, flag, value)
  switch (op) {
    case 'isTrue':
      return truthy(flags?.[flag])
    case 'isFalse':
      return !truthy(flags?.[flag])
    case 'equals':
      return current === value
    case 'notEquals':
      return current !== value
    case 'atLeast':
      return Number(current) >= Number(value)
    case 'atMost':
      return Number(current) <= Number(value)
    case 'above':
      return Number(current) > Number(value)
    case 'below':
      return Number(current) < Number(value)
    default:
      return false
  }
}

// Every condition holds (an empty list always does).
export const checkConditions = (flags, conditions = []) => conditions.every((condition) => checkCondition(flags, condition))

// The flags after one change; the same object when nothing changes.
export function applyFlagChange(flags, change) {
  if (!change?.flag) return flags
  const { flag, op = 'set', value } = change
  if (op === 'clear') {
    if (!(flag in flags)) return flags
    const { [flag]: _cleared, ...rest } = flags
    return rest
  }
  if (op === 'add') {
    const next = Number(readFlag(flags, flag, 0)) + Number(value ?? 0)
    return Number.isFinite(next) ? { ...flags, [flag]: next } : flags
  }
  return flags[flag] === value ? flags : { ...flags, [flag]: value }
}

// Objectives are authored on the map ({ id, title, description }); their progress is a mission flag holding
// 'active' or 'complete', so conditions, challenge objects and conversations can read and change it like any flag.
export const OBJECTIVE_STATUSES = ['active', 'complete']
export const objectiveFlag = (objectiveId) => `objective.${objectiveId}`
export const objectiveStatus = (flags, objectiveId) => {
  const status = flags?.[objectiveFlag(objectiveId)]
  return OBJECTIVE_STATUSES.includes(status) ? status : null
}

// Text typed in an editor field as the value it means: true / false, a number, or the text itself.
export function parseFlagValue(text) {
  if (typeof text !== 'string') return text
  const trimmed = text.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed)
  return trimmed
}

export const flagValueText = (value) => (value === undefined || value === null ? '' : String(value))
