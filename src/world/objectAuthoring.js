// The map editor's Object Editor (screens/ObjectEditorScreen.jsx): pure helpers for authoring a map's challenge objects
// (challenges.json notes describe the definition format). Effects are applied by objectEffects.js.
import attributeData from '../data/source/attributes.json'
import disciplineData from '../data/source/disciplines.json'
import challengesData from '../data/adaptation/exploration/challenges.json'
import { repairDefinitions } from './objectDefinitions.js'

export const OUTCOME_LISTS = [
  { key: 'always', label: 'Always (before the others)' },
  { key: 'onSuccess', label: 'On success' },
  { key: 'onFailure', label: 'On failure' },
  { key: 'onComplication', label: 'On complication (once, pass or fail)' },
]

export const NEUTRALIZE_MODES = [
  { id: 'remove', label: 'Remove' },
  { id: 'reduce', label: 'Reduce' },
  { id: 'stopSpread', label: 'Stop spread' },
  { id: 'disableSource', label: 'Disable source' },
]
const NEUTRALIZE_MODE_IDS = new Set(NEUTRALIZE_MODES.map((entry) => entry.id))
const ATTRIBUTE_IDS = new Set(attributeData.attributes.map((entry) => entry.id))
const DEPARTMENT_IDS = new Set(disciplineData.disciplines.map((entry) => entry.id))

// Each effect type and its fields (kind: text | longText | number | flag | value | flagOp | state | action | boolean | enum | responseType).
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
    fields: [{ key: 'alertGroupId', kind: 'flag', label: 'alert group' }, { key: 'from', kind: 'responseType', label: 'from' }, { key: 'to', kind: 'responseType', label: 'to' }],
    create: () => ({ type: 'setNpcResponse', alertGroupId: '', from: '', to: null }),
  },
  {
    id: 'addTrait',
    label: 'Add trait',
    fields: [{ key: 'name', kind: 'text', label: 'name' }, { key: 'potency', kind: 'number', label: 'potency' }, { key: 'description', kind: 'longText' }],
    create: () => ({ type: 'addTrait', name: '', potency: 1, description: '' }),
  },
  { id: 'removeTrait', label: 'Remove trait', fields: [{ key: 'name', kind: 'text', label: 'name' }], create: () => ({ type: 'removeTrait', name: '' }) },
  { id: 'changePotency', label: 'Change Potency', fields: [{ key: 'name', kind: 'text', label: 'name' }, { key: 'change', kind: 'number', label: 'change' }], create: () => ({ type: 'changePotency', name: '', change: -1 }) },
  {
    id: 'neutralizeHazard',
    label: 'Neutralize hazard',
    fields: [
      { key: 'hazardId', kind: 'flag', label: 'hazard id (blank = this hazard)' },
      { key: 'mode', kind: 'enum', label: 'mode', options: NEUTRALIZE_MODES },
      { key: 'amount', kind: 'number', label: 'amount' },
    ],
    create: () => ({ type: 'neutralizeHazard', mode: 'remove', amount: 1 }),
  },
  { id: 'neutralizeHazardsInRoom', label: 'Neutralize hazards in room', fields: [], create: () => ({ type: 'neutralizeHazardsInRoom' }) },
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

export function duplicateObject(objects, object) {
  const copy = structuredClone(object)
  copy.id = freshId(objects.map((entry) => entry.id), copy.id || 'object')
  copy.name = `${copy.name || copy.id} (copy)`
  return copy
}

export function duplicateAction(object, action) {
  const copy = structuredClone(action)
  copy.id = freshId(object.actions.map((entry) => entry.id), copy.id || 'action')
  copy.label = `${copy.label || copy.id} (copy)`
  return copy
}

export function duplicateState(object, stateId) {
  const state = object.states[stateId]
  if (!state) return object
  const id = freshId(Object.keys(object.states), stateId || 'state')
  return { ...object, states: { ...object.states, [id]: structuredClone(state) } }
}

export function reorderObjects(objects, from, to) {
  if (from === to || from < 0 || to < 0 || from >= objects.length || to >= objects.length) return objects
  const next = [...objects]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// Toggle an extra cover tile (not the object's own position). Clicking again removes it.
export function toggleCover(object, [x, y]) {
  const [ox, oy] = object.position
  if (x === ox && y === oy) return object
  const covers = object.covers ?? []
  const has = covers.some(([cx, cy]) => cx === x && cy === y)
  const next = has ? covers.filter(([cx, cy]) => !(cx === x && cy === y)) : [...covers, [x, y]]
  return { ...object, covers: next.length ? next : undefined }
}

// Adopt library defs if needed, then replace one object by id.
export function updateMapObject(map, objectId, change) {
  const objects = editableObjects(map)
  const next = objects.map((object) => (object.id === objectId ? change(object) : object))
  return withObjects(map, next)
}

// Challenge object ids named by conversation Action / Task Check nodes (setChallengeState).
export function challengeObjectIdsInConversation(record) {
  const ids = new Set()
  for (const node of record?.nodes ?? []) {
    for (const action of [...(node.actions ?? []), ...(node.onComplication ?? [])]) {
      if (action?.type === 'setChallengeState' && action.objectId) ids.add(action.objectId)
    }
  }
  return [...ids]
}

export function conversationObjectWarnings(objects, conversations = []) {
  const ids = new Set(objects.map((object) => object.id).filter(Boolean))
  const warnings = []
  for (const conversation of conversations) {
    const label = conversation.name || conversation.id
    for (const objectId of challengeObjectIdsInConversation(conversation.record ?? conversation)) {
      if (!ids.has(objectId)) warnings.push(`Conversation ${label} names challenge object ${objectId}, which isn't on this map.`)
    }
  }
  return warnings
}

const mapEffects = (action, change) =>
  Object.fromEntries(OUTCOME_LISTS.filter(({ key }) => action[key]).map(({ key }) => [key, action[key].map(change)]))

// Removes a state without stranding the object: a removed starting state falls back to the first remaining one, and the
// state leaves every requires.states (an emptied list is dropped, as the editor shows it as "(any)"). setState effects
// that named it stay, for objectWarnings to flag. The last state can't be removed.
export function removeState(object, id) {
  const remaining = Object.entries(object.states).filter(([other]) => other !== id)
  if (!object.states[id] || !remaining.length) return object
  const actions = object.actions.map((action) => {
    if (!action.requires?.states?.includes(id)) return action
    const { states, ...requires } = action.requires
    const kept = states.filter((other) => other !== id)
    return { ...action, requires: kept.length ? { ...requires, states: kept } : requires }
  })
  return { ...object, state: object.state === id ? remaining[0][0] : object.state, states: Object.fromEntries(remaining), actions }
}

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

// Same resolution as challengeDefinitionsFor, kept here so mapFormat can import objectWarnings without a cycle
// through exploration/challengeObjects → environment → mapFormat.
function definitionsForEditor(map) {
  const list = map.objects ?? challengesData.maps[map.id] ?? challengesData.maps[map.name] ?? []
  const definitions = repairDefinitions(list).definitions
  const placements = map.objectPlacements ?? {}
  return definitions.map((definition) => {
    const placed = placements[definition.id]
    if (!placed) return definition
    const [dx, dy] = [placed.x - definition.position[0], placed.y - definition.position[1]]
    if (!dx && !dy) return definition
    const inside = ([x, y]) => x >= 0 && y >= 0 && x < map.width && y < map.height
    return {
      ...definition,
      position: [placed.x, placed.y],
      ...(definition.covers ? { covers: definition.covers.map(([x, y]) => [x + dx, y + dy]).filter(inside) } : {}),
    }
  })
}

// The objects the editor works on: the map's own, else challenges.json's, each where the map places it. Saving them
// into the map takes the placements in, so the map's objectPlacements are dropped (the move tool adds new ones).
export const editableObjects = (map) => structuredClone(definitionsForEditor(map))
export const withObjects = (map, objects) => ({ ...map, objects, objectPlacements: {} })

export function challengeMapWarnings(map, options) {
  return objectWarnings(definitionsForEditor(map), map, options)
}

// Problems the author should know about; none stop the map saving.
export function objectWarnings(objects, map, { conversations = [] } = {}) {
  const warnings = []
  const ids = new Set()
  objects.forEach((object) => {
    const label = object.name || object.id || 'An object'
    if (!object.id) warnings.push(`${label} has no id.`)
    else if (ids.has(object.id)) warnings.push(`The id ${object.id} is used twice.`)
    ids.add(object.id)
    const [x, y] = object.position ?? []
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= map.width || y >= map.height) warnings.push(`${label} is off the map.`)
    if (!object.states?.[object.state]) warnings.push(`${label} starts in ${object.state || 'no state'}, which it doesn't have.`)
    const actionIds = new Set()
    ;(object.actions ?? []).forEach((action) => {
      const name = `${label}: ${action.label || action.id || 'an action'}`
      if (!action.id) warnings.push(`${name} has no id.`)
      else if (actionIds.has(action.id)) warnings.push(`${label}: the action id ${action.id} is used twice.`)
      actionIds.add(action.id)
      if (!action.label?.trim()) warnings.push(`${name} has no label.`)
      if (action.routine && (action.always?.length ?? 0) > 0) {
        warnings.push(`${name}: Routine ignores Always effects at runtime.`)
      }
      if (!action.routine && (!action.task?.attribute || !action.task?.department)) {
        warnings.push(`${name} needs an Attribute and a Department, or Routine; until then it is left out of play.`)
      }
      const task = action.task
      if (task && !action.routine) {
        if (task.attribute && !ATTRIBUTE_IDS.has(task.attribute)) warnings.push(`${name}: unknown Attribute “${task.attribute}”.`)
        if (task.department && !DEPARTMENT_IDS.has(task.department)) warnings.push(`${name}: unknown Department “${task.department}”.`)
        if (Number.isFinite(task.difficulty) && (task.difficulty < 0 || task.difficulty > 5)) {
          warnings.push(`${name}: Difficulty ${task.difficulty} is out of range (0–5).`)
        }
        const equipment = task.equipment
        if (equipment) {
          if (!equipment.label?.trim()) warnings.push(`${name}: equipment needs a label.`)
          const without = equipment.without
          if (without != null && without !== 'impossible' && !Number.isFinite(without?.difficulty)) {
            warnings.push(`${name}: equipment.without must be “impossible” or { difficulty }.`)
          }
        }
        ;(task.traitRules ?? []).forEach((rule, index) => {
          if (!rule?.trait) warnings.push(`${name}: trait rule ${index + 1} needs a trait name.`)
          if (rule?.impossible && rule.difficulty != null) warnings.push(`${name}: trait rule “${rule.trait}” cannot be both impossible and a Difficulty change.`)
        })
      }
      ;(action.requires?.states ?? []).forEach((state) => !object.states[state] && warnings.push(`${name} requires the unknown state ${state}.`))
      OUTCOME_LISTS.forEach(({ key }) =>
        (action[key] ?? []).forEach((effect) => {
          if (!getEffectType(effect.type)) warnings.push(`${name}: unknown effect ${effect.type}.`)
          if (effect.type === 'setState' && !object.states[effect.state]) warnings.push(`${name} sets the unknown state ${effect.state || '(none)'}.`)
          if (effect.type === 'adjustDifficulty' && effect.actionId && !object.actions.some((other) => other.id === effect.actionId)) {
            warnings.push(`${name} adjusts the unknown action ${effect.actionId}.`)
          }
          if (effect.type === 'neutralizeHazard' && effect.mode && !NEUTRALIZE_MODE_IDS.has(effect.mode)) {
            warnings.push(`${name}: unknown neutralize mode “${effect.mode}”.`)
          }
        }),
      )
    })
  })
  ;(map.objectives ?? []).forEach((objective) => {
    if (objective.objectId && !ids.has(objective.objectId)) warnings.push(`The objective ${objective.title || objective.id} is marked on ${objective.objectId}, which isn't on this map.`)
  })
  warnings.push(...conversationObjectWarnings(objects, conversations))
  return warnings
}
