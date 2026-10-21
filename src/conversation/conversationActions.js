// What a conversation can change in the game (Action nodes and a Task Check's complication consequences). Each type
// lists the fields the editor shows and applies itself to the exploration state; content only ever names a type and
// its values, never code. A new kind of consequence is one more entry here.
import awareness from '../data/adaptation/exploration/awareness.json'
import { addThreat } from '../rules/missionResources.js'
import { applyFlagChange, objectiveFlag } from '../exploration/missionFlags.js'
import { defaultInfluenceRadius, INFLUENCE_EFFECTS, INFLUENCE_FILTERS, INFLUENCE_ORIGINS, influenceNearby } from '../exploration/influence.js'
import { adjustNpcChecks, setNpcIntimidated, standNpcDown } from '../exploration/partySocial.js'
import { scopedFlag } from './conversationScope.js'
import { addLogEntry } from '../exploration/missionLog.js'
import { objectFor } from '../world/objects.js'

export const DISPOSITION_IDS = awareness.dispositions.map((disposition) => disposition.id)

// field kinds: text, number, optionalNumber (blank = null), boolean, select (field.options: [{ id, label }]), flagOp (missionFlags.js CHANGE_OPS),
// value (true / false / number / text), disposition, objective (an id from the map's objectives), objectiveStatus,
// challengeObject, challengeState.
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
    // {npc} and {group} in the flag name resolve to the NPC being talked to (conversationScope.js).
    apply: (state, action, ctx) => ({
      ...state,
      scenario: { ...state.scenario, flags: applyFlagChange(state.scenario.flags, { ...action, flag: scopedFlag(action.flag, ctx?.npcId, state.world.npcs[ctx?.npcId]) }) },
    }),
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
    id: 'standDown',
    label: 'NPC stands down',
    fields: [
      { key: 'disposition', label: 'Becomes', kind: 'disposition' },
      { key: 'leaveGroup', label: 'Leaves its alert group', kind: 'boolean' },
    ],
    create: () => ({ type: 'standDown', disposition: 'neutral', leaveGroup: false }),
    describe: (action) => `This NPC stands down and becomes ${action.disposition}${action.leaveGroup ? ' and leaves its group' : ''}`,
    // Like an Intimidate win on a hostile NPC (partySocial.js): no fight pending, no search under way.
    apply: (state, action, ctx) => standNpcDown(state, ctx.npcId, { disposition: action.disposition, leaveGroup: Boolean(action.leaveGroup) }),
  },
  {
    id: 'setIntimidated',
    label: 'NPC Intimidated',
    fields: [{ key: 'intimidated', label: 'Intimidated', kind: 'boolean' }],
    create: () => ({ type: 'setIntimidated', intimidated: true }),
    describe: (action) => (action.intimidated ? 'This NPC is Intimidated: its Task Checks pass without a roll' : 'This NPC is no longer Intimidated'),
    apply: (state, action, ctx) => setNpcIntimidated(state, ctx.npcId, action.intimidated),
  },
  {
    id: 'adjustCheckDifficulty',
    label: 'NPC check Difficulty',
    fields: [{ key: 'amount', label: 'Change', kind: 'number' }],
    create: () => ({ type: 'adjustCheckDifficulty', amount: 1 }),
    describe: (action) => `Task Checks with this NPC ${action.amount < 0 ? 'easier' : 'harder'} by ${Math.abs(action.amount)}`,
    apply: (state, action, ctx) => adjustNpcChecks(state, ctx.npcId, action.amount),
  },
  {
    id: 'influenceNearby',
    label: 'Influence nearby NPCs',
    fields: [
      { key: 'effect', label: 'Effect', kind: 'select', options: INFLUENCE_EFFECTS },
      { key: 'filter', label: 'Who (required)', kind: 'select', options: INFLUENCE_FILTERS },
      { key: 'filterId', label: 'Group or faction id (for a named group or faction)', kind: 'text' },
      { key: 'radius', label: "Radius in tiles (blank: this NPC's own, else the default)", kind: 'optionalNumber' },
      { key: 'origin', label: 'Measured from', kind: 'select', options: INFLUENCE_ORIGINS },
      { key: 'tileX', label: 'Tile x (for a tile origin)', kind: 'number' },
      { key: 'tileY', label: 'Tile y (for a tile origin)', kind: 'number' },
      { key: 'needsSight', label: 'Only those who can see the origin', kind: 'boolean' },
      { key: 'includeSpeaker', label: 'Includes this NPC', kind: 'boolean' },
    ],
    create: () => ({ type: 'influenceNearby', effect: 'standDown', filter: 'sameGroup', filterId: '', radius: null, origin: 'speaker', tileX: 0, tileY: 0, needsSight: false, includeSpeaker: false }),
    describe: (action) => {
      const who = action.filter === 'sameGroup' ? "this NPC's group" : action.filter === 'group' ? `group ${action.filterId || '?'}` : `faction ${action.filterId || '?'}`
      const effect = INFLUENCE_EFFECTS.find((entry) => entry.id === action.effect)
      return `${effect?.label ?? action.effect}: ${who} within ${action.radius > 0 ? `${action.radius} tiles` : `${defaultInfluenceRadius} tiles (or this NPC's own radius)`}`
    },
    apply: (state, action, ctx) => influenceNearby(state, ctx.npcId, { ...action, tile: action.origin === 'tile' ? { x: Number(action.tileX), y: Number(action.tileY) } : null }),
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
    apply: (state, action, ctx) => objectFor(state.scenario, action.objectId)?.setState(state, action.state, ctx.refreshMap) ?? state,
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
