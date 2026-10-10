// What a conversation can change in the game (Action nodes and a Task Check's complication consequences). Each type
// lists the fields the editor shows and applies itself to the exploration state; content only ever names a type and
// its values, never code. A new kind of consequence is one more entry here.
import awareness from '../data/adaptation/exploration/awareness.json'
import { addThreat } from '../rules/missionResources.js'
import { applyFlagChange, objectiveFlag } from '../exploration/missionFlags.js'
import { addLogEntry } from '../exploration/missionLog.js'

export const DISPOSITION_IDS = awareness.dispositions.map((disposition) => disposition.id)

// field kinds: text, number, flagOp (missionFlags.js CHANGE_OPS), value (true / false / number / text),
// disposition, objective (an id from the map's objectives), objectiveStatus, challengeObject, challengeState.
export const ACTION_TYPES = [
  {
    id: 'changeFlag',
    label: 'Change flag',
    fields: [
      { key: 'flag', label: 'Flag', kind: 'text' },
      { key: 'op', label: 'Change', kind: 'flagOp' },
      { key: 'value', label: 'Value', kind: 'value' },
    ],
    create: () => ({ type: 'changeFlag', flag: '', op: 'set', value: true }),
    describe: (action) => (action.op === 'clear' ? `Clear ${action.flag}` : action.op === 'add' ? `${action.flag} + ${action.value}` : `${action.flag} = ${action.value}`),
    apply: (state, action) => ({ ...state, scenario: { ...state.scenario, flags: applyFlagChange(state.scenario.flags, action) } }),
  },
  {
    id: 'setDisposition',
    label: 'Change NPC disposition',
    fields: [{ key: 'disposition', label: 'Disposition', kind: 'disposition' }],
    create: () => ({ type: 'setDisposition', disposition: 'friendly' }),
    describe: (action) => `This NPC becomes ${action.disposition}`,
    apply: (state, action, ctx) => {
      const npc = state.world.npcs[action.npcId ?? ctx.npcId]
      if (!npc || !DISPOSITION_IDS.includes(action.disposition)) return state
      return { ...state, world: { ...state.world, npcs: { ...state.world.npcs, [npc.id]: { ...npc, disposition: action.disposition, responseType: null } } } }
    },
  },
  {
    id: 'setObjective',
    label: 'Objective',
    fields: [
      { key: 'objectiveId', label: 'Objective', kind: 'objective' },
      { key: 'status', label: 'Status', kind: 'objectiveStatus' },
    ],
    create: () => ({ type: 'setObjective', objectiveId: '', status: 'active' }),
    describe: (action) => `Objective ${action.objectiveId}: ${action.status}`,
    apply: (state, action) =>
      action.objectiveId ? { ...state, scenario: { ...state.scenario, flags: applyFlagChange(state.scenario.flags, { flag: objectiveFlag(action.objectiveId), op: 'set', value: action.status }) } } : state,
  },
  {
    id: 'setChallengeState',
    label: 'Challenge object state',
    fields: [
      { key: 'objectId', label: 'Object', kind: 'challengeObject' },
      { key: 'state', label: 'State', kind: 'challengeState' },
    ],
    create: () => ({ type: 'setChallengeState', objectId: '', state: '' }),
    describe: (action) => `${action.objectId} becomes ${action.state}`,
    apply: (state, action, ctx) => {
      const object = state.scenario.objects[action.objectId]
      const definition = state.scenario.definitions.find((entry) => entry.id === action.objectId)
      if (!object || !definition?.states[action.state]) return state
      return ctx.refreshMap({ ...state, scenario: { ...state.scenario, objects: { ...state.scenario.objects, [action.objectId]: { ...object, state: action.state } } } })
    },
  },
  {
    id: 'addThreat',
    label: 'Add Threat',
    fields: [{ key: 'amount', label: 'Threat', kind: 'number' }],
    create: () => ({ type: 'addThreat', amount: 1 }),
    describe: (action) => `Add ${action.amount} Threat`,
    apply: (state, action) => ({ ...state, resources: addThreat(state.resources, Number(action.amount) || 0) }),
  },
  {
    id: 'addLogEntry',
    label: "Add Captain's Log entry",
    fields: [{ key: 'text', label: 'Entry', kind: 'text' }],
    create: () => ({ type: 'addLogEntry', text: '' }),
    describe: (action) => `Log: ${action.text}`,
    apply: (state, action) => addLogEntry(state, { kind: 'authored', text: action.text }),
  },
  {
    id: 'startCombat',
    label: 'Start combat',
    fields: [],
    create: () => ({ type: 'startCombat' }),
    describe: () => 'This NPC starts a fight (ends the conversation)',
    // The conversation runtime ends the conversation and starts the fight after the other actions (it needs the
    // combat link, which itself depends on exploration state).
    apply: (state, _action, ctx) => {
      ctx.signals.startCombat = true
      return state
    },
  },
]

export const getActionType = (id) => ACTION_TYPES.find((type) => type.id === id) ?? null
export const describeAction = (action) => getActionType(action.type)?.describe(action) ?? `Unknown action ${action.type}`
