// Challenge-object definitions as authored (a map file's objects, challenges.json) made safe to use: a hand-edited file
// with a missing or malformed part must not crash the editor or the game. repairDefinitions keeps every object it can
// and fills in what's missing, reporting each repair; playableActions drops the actions the game can't run.
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isTile = (value) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
const OUTCOME_KEYS = ['always', 'onSuccess', 'onFailure', 'onComplication']

function repairAction(raw, label, problems) {
  const action = { ...raw, id: String(raw.id), label: typeof raw.label === 'string' ? raw.label : String(raw.id) }
  if (raw.requires !== undefined) {
    if (!isRecord(raw.requires)) {
      problems.push(`${label}: its requires isn't an object; ignored.`)
      delete action.requires
    } else if (raw.requires.states !== undefined && !Array.isArray(raw.requires.states)) {
      problems.push(`${label}: requires.states isn't a list; ignored.`)
      const { states: _states, ...rest } = raw.requires
      action.requires = rest
    }
  }
  if (raw.task !== undefined && !isRecord(raw.task)) {
    problems.push(`${label}: its task isn't an object; removed.`)
    delete action.task
  }
  OUTCOME_KEYS.forEach((key) => {
    if (raw[key] === undefined) return
    if (!Array.isArray(raw[key])) {
      problems.push(`${label}: ${key} isn't a list; removed.`)
      delete action[key]
      return
    }
    const effects = raw[key].filter((effect) => isRecord(effect) && typeof effect.type === 'string')
    if (effects.length < raw[key].length) problems.push(`${label}: ${raw[key].length - effects.length} malformed ${key} effect(s) removed.`)
    action[key] = effects
  })
  return action
}

function repairDefinition(raw, index, problems) {
  if (!isRecord(raw) || raw.id == null || raw.id === '') {
    problems.push(`Object ${index + 1} has no id; left out.`)
    return null
  }
  const id = String(raw.id)
  const definition = { ...raw, id, name: typeof raw.name === 'string' && raw.name ? raw.name : id, type: typeof raw.type === 'string' ? raw.type : '' }
  if (!isTile(raw.position)) {
    problems.push(`${id} has no valid position; placed at 0, 0.`)
    definition.position = [0, 0]
  }
  if (raw.covers !== undefined) {
    const covers = Array.isArray(raw.covers) ? raw.covers.filter(isTile) : []
    if (covers.length !== (Array.isArray(raw.covers) ? raw.covers.length : -1)) problems.push(`${id}: malformed covers removed.`)
    if (covers.length) definition.covers = covers
    else delete definition.covers
  }
  const states = isRecord(raw.states) ? Object.fromEntries(Object.entries(raw.states).filter(([, state]) => isRecord(state))) : {}
  if (!Object.keys(states).length) {
    problems.push(`${id} has no states; given one.`)
    states[typeof raw.state === 'string' && raw.state ? raw.state : 'default'] = { label: '', description: '' }
  }
  definition.states = states
  if (!states[raw.state]) {
    if (raw.state !== undefined) problems.push(`${id} starts in ${raw.state}, which it doesn't have; starts in ${Object.keys(states)[0]}.`)
    definition.state = Object.keys(states)[0]
  }
  const actions = Array.isArray(raw.actions) ? raw.actions : []
  if (raw.actions !== undefined && !Array.isArray(raw.actions)) problems.push(`${id}: actions isn't a list; removed.`)
  definition.actions = actions
    .filter((action, at) => {
      const ok = isRecord(action) && action.id != null && action.id !== ''
      if (!ok) problems.push(`${id}: action ${at + 1} has no id; left out.`)
      return ok
    })
    .map((action) => repairAction(action, `${id}: ${action.label || action.id}`, problems))
  return definition
}

// list: authored definitions (anything). Returns { definitions, problems: [text] }.
export function repairDefinitions(list) {
  const problems = []
  if (!Array.isArray(list)) return { definitions: [], problems: list == null ? [] : ['The objects list isn\u2019t a list; ignored.'] }
  const definitions = list.map((raw, index) => repairDefinition(raw, index, problems)).filter(Boolean)
  return { definitions, problems }
}

// An action the game can run: routine, or a task with an Attribute and a Department.
export const isPlayableAction = (action) => Boolean(action.routine) || Boolean(action.task?.attribute && action.task?.department)
export const playableActions = (definition) => ({ ...definition, actions: definition.actions.filter(isPlayableAction) })
