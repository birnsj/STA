// The map editor's Object Editor (screens/ObjectEditorScreen.jsx): pure helpers for authoring a map's challenge objects
// (challenges.json notes describe the definition format). Effects are applied by objectEffects.js.
import { challengeDefinitionsFor } from '../exploration/challengeObjects.js'

export const OUTCOME_LISTS = [
  { key: 'always', label: 'Always (before the others)' },
  { key: 'onSuccess', label: 'On success' },
  { key: 'onFailure', label: 'On failure' },
  { key: 'onComplication', label: 'On complication (once, pass or fail)' },
]

// Each effect type and its fields (kind: text | longText | number | flag | value | flagOp | state | action | boolean).
export const EFFECT_TYPES = [
  { id: 'setState', label: 'Set state', fields: [{ key: 'state', kind: 'state' }], create: (object) => ({ type: 'setState', state: Object.keys(object.states ?? {})[0] ?? '' }) },
  { id: 'setFlag', label: 'Set flag', fields: [{ key: 'flag', kind: 'flag' }, { key: 'value', kind: 'value' }], create: () => ({ type: 'setFlag', flag: '', value: true }) },
  { id: 'changeFlag', label: 'Change flag', fields: [{ key: 'flag', kind: 'flag' }, { key: 'op', kind: 'flagOp' }, { key: 'value', kind: 'value' }], create: () => ({ type: 'changeFlag', flag: '', op: 'add', value: 1 }) },
  { id: 'message', label: 'Message', fields: [{ key: 'text', kind: 'longText' }], create: () => ({ type: 'message', text: '' }) },
  { id: 'addLogEntry', label: "Captain's Log entry", fields: [{ key: 'text', kind: 'longText' }], create: () => ({ type: 'addLogEntry', text: '' }) },
  { id: 'noise', label: 'Noise', fields: [{ key: 'radius', kind: 'number', label: 'radius' }, { key: 'intensity', kind: 'number', label: 'intensity', step: 0.1 }], create: () => ({ type: 'noise', radius: 6, intensity: 0.7 }) },
  {
    id: 'adjustDifficulty',
    label: 'Adjust Difficulty',
    fields: [{ key: 'actionId', kind: 'action' }, { key: 'change', kind: 'number', label: 'change' }, { key: 'label', kind: 'text', label: 'reason' }],
    create: () => ({ type: 'adjustDifficulty', change: -1, label: '' }),
  },
  { id: 'lock', label: 'Lock (no retry)', fields: [{ key: 'seconds', kind: 'number', label: 'seconds' }], create: () => ({ type: 'lock', seconds: 10 }) },
  {
    id: 'revealNpcs',
    label: 'Reveal NPCs',
    fields: [{ key: 'radius', kind: 'number', label: 'radius' }, { key: 'source', kind: 'text', label: 'source' }, { key: 'identified', kind: 'boolean', label: 'identified' }],
    create: () => ({ type: 'revealNpcs', radius: 8, source: 'sensor', identified: false }),
  },
  { id: 'addFact', label: 'Party Knowledge fact', fields: [{ key: 'id', kind: 'flag', label: 'fact id' }, { key: 'text', kind: 'longText' }], create: () => ({ type: 'addFact', id: '', text: '' }) },
  {
    id: 'setNpcResponse',
    label: 'NPC response',
    fields: [{ key: 'alertGroupId', kind: 'flag', label: 'alert group' }, { key: 'from', kind: 'text', label: 'from' }, { key: 'to', kind: 'text', label: 'to' }],
    create: () => ({ type: 'setNpcResponse', alertGroupId: '', from: '', to: '' }),
  },
  {
    id: 'addTrait',
    label: 'Add trait',
    fields: [{ key: 'name', kind: 'text', label: 'name' }, { key: 'potency', kind: 'number', label: 'potency' }, { key: 'description', kind: 'longText' }],
    create: () => ({ type: 'addTrait', name: '', potency: 1, description: '' }),
  },
  { id: 'removeTrait', label: 'Remove trait', fields: [{ key: 'name', kind: 'text', label: 'name' }], create: () => ({ type: 'removeTrait', name: '' }) },
  { id: 'changePotency', label: 'Change Potency', fields: [{ key: 'name', kind: 'text', label: 'name' }, { key: 'change', kind: 'number', label: 'change' }], create: () => ({ type: 'changePotency', name: '', change: -1 }) },
]
export const getEffectType = (id) => EFFECT_TYPES.find((type) => type.id === id) ?? null

export const idText = (text) => text.replace(/[^A-Za-z0-9_-]/g, '')
export function freshId(used, base) {
  const taken = new Set(used)
  let index = 1
  while (taken.has(`${base}${index}`)) index += 1
  return `${base}${index}`
}

export function createObject(objects, map) {
  return {
    id: freshId(objects.map((object) => object.id), 'object'),
    name: 'New Object',
    type: 'console',
    position: [Math.floor(map.width / 2), Math.floor(map.height / 2)],
    state: 'idle',
    states: { idle: { label: 'Idle', description: '' } },
    actions: [],
  }
}

export function createAction(object) {
  return {
    id: freshId(object.actions.map((action) => action.id), 'action'),
    label: 'New Action',
    description: '',
    task: { attribute: 'reason', department: 'engineering', difficulty: 1, focuses: [] },
    actionCost: { exploration: 'free', combat: 'major' },
    onSuccess: [],
    onFailure: [],
  }
}

const mapEffects = (action, change) =>
  Object.fromEntries(OUTCOME_LISTS.filter(({ key }) => action[key]).map(({ key }) => [key, action[key].map(change)]))

// Renames a state everywhere the object refers to it: its starting state, requires.states and setState effects.
export function renameState(object, from, to) {
  if (from === to || !to || object.states[to]) return object
  const states = Object.fromEntries(Object.entries(object.states).map(([id, state]) => [id === from ? to : id, state]))
  const actions = object.actions.map((action) => ({
    ...action,
    ...(action.requires?.states ? { requires: { ...action.requires, states: action.requires.states.map((id) => (id === from ? to : id)) } } : {}),
    ...mapEffects(action, (effect) => (effect.type === 'setState' && effect.state === from ? { ...effect, state: to } : effect)),
  }))
  return { ...object, state: object.state === from ? to : object.state, states, actions }
}

// Renames an action and the Adjust Difficulty effects of the object's actions that name it.
export function renameAction(object, from, to) {
  if (from === to || !to || object.actions.some((action) => action.id === to)) return object
  const actions = object.actions.map((action) => ({
    ...action,
    id: action.id === from ? to : action.id,
    ...mapEffects(action, (effect) => (effect.type === 'adjustDifficulty' && effect.actionId === from ? { ...effect, actionId: to } : effect)),
  }))
  return { ...object, actions }
}

// The map's objectives marked on an object follow it when it's renamed. (Conversations live in their own files and
// are not changed.)
export const renameObjectInObjectives = (objectives, from, to) =>
  objectives.map((objective) => (objective.objectId === from ? { ...objective, objectId: to } : objective))

// Moves an object, its extra tiles (covers) keeping their offsets.
export function moveObject(object, [x, y]) {
  const [dx, dy] = [x - object.position[0], y - object.position[1]]
  return { ...object, position: [x, y], ...(object.covers ? { covers: object.covers.map(([cx, cy]) => [cx + dx, cy + dy]) } : {}) }
}

// The objects the editor works on: the map's own, else challenges.json's, each where the map places it. Saving them
// into the map takes the placements in, so the map's objectPlacements are dropped (the move tool adds new ones).
export const editableObjects = (map) => structuredClone(challengeDefinitionsFor(map))
export const withObjects = (map, objects) => ({ ...map, objects, objectPlacements: {} })

// Problems the author should know about; none stop the map saving.
export function objectWarnings(objects, map) {
  const warnings = []
  const ids = new Set()
  objects.forEach((object) => {
    const label = object.name || object.id || 'An object'
    if (!object.id) warnings.push(`${label} has no id.`)
    else if (ids.has(object.id)) warnings.push(`The id ${object.id} is used twice.`)
    ids.add(object.id)
    const [x, y] = object.position
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) warnings.push(`${label} is off the map.`)
    if (!object.states[object.state]) warnings.push(`${label} starts in ${object.state || 'no state'}, which it doesn't have.`)
    const actionIds = new Set()
    object.actions.forEach((action) => {
      const name = `${label}: ${action.label || action.id || 'an action'}`
      if (!action.id) warnings.push(`${name} has no id.`)
      else if (actionIds.has(action.id)) warnings.push(`${label}: the action id ${action.id} is used twice.`)
      actionIds.add(action.id)
      if (!action.label?.trim()) warnings.push(`${name} has no label.`)
      if (!action.routine && (!action.task?.attribute || !action.task?.department)) warnings.push(`${name} needs an Attribute and a Department, or Routine; until then it is left out of play.`)
      ;(action.requires?.states ?? []).forEach((state) => !object.states[state] && warnings.push(`${name} requires the unknown state ${state}.`))
      OUTCOME_LISTS.forEach(({ key }) =>
        (action[key] ?? []).forEach((effect) => {
          if (!getEffectType(effect.type)) warnings.push(`${name}: unknown effect ${effect.type}.`)
          if (effect.type === 'setState' && !object.states[effect.state]) warnings.push(`${name} sets the unknown state ${effect.state || '(none)'}.`)
          if (effect.type === 'adjustDifficulty' && effect.actionId && !object.actions.some((other) => other.id === effect.actionId))
            warnings.push(`${name} adjusts the unknown action ${effect.actionId}.`)
        }),
      )
    })
  })
  ;(map.objectives ?? []).forEach((objective) => {
    if (objective.objectId && !ids.has(objective.objectId)) warnings.push(`The objective ${objective.title || objective.id} is marked on ${objective.objectId}, which isn't on this map.`)
  })
  return warnings
}
