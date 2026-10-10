// A conversation running in exploration (videogame adaptation): walks an authored graph (conversationFormat.js) inside
// the exploration state, so every flag, objective, challenge object, disposition and pool it touches is the same one
// the rest of the mission uses. Pure functions of the state; the world keeps its clock while the panel is open.
//
// state.conversation = { definition, npcId, nodeId (the node shown: NPC Dialogue, Player Choice or Task Check),
//   choiceId (the Player Choice offered now, or null), line: { speaker, text } | null (the NPC's latest line),
//   lastCheck: { key, nodeId, label, performerId, prepared, result, messages, bonusDice, momentumSpentOnDice,
//     threatAddedForDice, momentumSaved, momentumLost } (the same fields as a challenge's lastTask) | null,
//   ended (true when a check's outcome ended it: the panel shows the result until closed) } | null.
// Condition and Action nodes run straight through. Reaching an End node, a missing link or a 'startCombat' action
// closes the conversation.
import { getMembers } from '../exploration/partyControl.js'
import { checkCondition } from '../exploration/missionFlags.js'
import { rollPartyTask } from '../exploration/partyTaskRoll.js'
import { isDefeated } from '../rules/personalCondition.js'
import { prepareTask } from '../rules/taskPreparation.js'
import { recommendPerformers } from '../rules/taskRecommendation.js'
import { getActionType } from './conversationActions.js'
import { getNode } from './conversationFormat.js'

// A graph that loops through Condition and Action nodes without stopping is cut off after this many steps.
const MAX_STEPS = 200

const isUp = (member) => !isDefeated(member.condition)

// hooks: what the runtime needs from the exploration layer without importing it (it imports the runtime):
// { refreshMap(state): the world map after a challenge object's state changed, startCombat(state, { triggerNpcId,
// triggerTargetId }) }.
const NO_HOOKS = { refreshMap: (state) => state, startCombat: (state) => state }

// signals: filled in by actions that need the runtime to do something afterwards ({ startCombat }).
function applyActions(state, actions, hooks, npcId, signals) {
  const ctx = { npcId, refreshMap: hooks.refreshMap, signals }
  return actions.reduce((current, action) => getActionType(action.type)?.apply(current, action, ctx) ?? current, state)
}

function close(state, hooks, combat) {
  const npcId = state.conversation?.npcId
  const closed = { ...state, conversation: null }
  if (!combat || !npcId) return closed
  return hooks.startCombat(closed, { triggerNpcId: npcId, triggerTargetId: state.party.leaderId, source: 'CONVERSATION' })
}

// Runs from nodeId until a node that waits for the player.
function advance(state, nodeId, hooks) {
  let current = state
  let id = nodeId
  const signals = {}
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const conversation = current.conversation
    const node = id ? getNode(conversation.definition, id) : null
    if (!node || node.type === 'end') return close(current, hooks, signals.startCombat)
    if (node.type === 'condition') {
      const results = node.conditions.map((condition) => checkCondition(current.scenario.flags, condition))
      id = (node.match === 'any' ? results.some(Boolean) : results.every(Boolean)) ? node.pass : node.fail
      continue
    }
    if (node.type === 'action') {
      current = applyActions(current, node.actions, hooks, conversation.npcId, signals)
      id = node.next
      continue
    }
    if (signals.startCombat) return close(current, hooks, true)
    if (node.type === 'npc') {
      const npc = current.world.npcs[conversation.npcId]
      const next = node.next ? getNode(conversation.definition, node.next) : null
      const line = { speaker: node.speaker?.trim() || npc?.name || 'NPC', text: node.text }
      return { ...current, conversation: { ...conversation, nodeId: node.id, choiceId: next?.type === 'choice' ? next.id : null, line } }
    }
    // A Player Choice keeps the NPC's last line on screen; a Task Check waits for the player to pick who rolls.
    return { ...current, conversation: { ...conversation, nodeId: node.id, choiceId: node.type === 'choice' ? node.id : null } }
  }
  return close(current, hooks, false)
}

// Opens the NPC's conversation (definition: a parsed conversation file). Nothing happens in combat, without a
// definition or for an NPC that is down.
export function startConversation(state, { npcId, definition }, hooks = NO_HOOKS) {
  const npc = state.world.npcs[npcId]
  if (state.combat || state.conversation || !definition || !npc || isDefeated(npc.condition)) return state
  const opened = { ...state, conversation: { definition, npcId, nodeId: null, choiceId: null, line: null, lastCheck: null } }
  return advance(opened, definition.start, hooks)
}

// The Player Choice options the player may pick now (their conditions met).
export function availableOptions(state) {
  const conversation = state.conversation
  const choice = conversation?.choiceId ? getNode(conversation.definition, conversation.choiceId) : null
  if (!choice) return []
  return choice.options.filter((option) => option.conditions.every((condition) => checkCondition(state.scenario.flags, condition)))
}

export function chooseOption(state, optionId, hooks = NO_HOOKS) {
  const option = availableOptions(state).find((candidate) => candidate.id === optionId)
  if (!option) return state
  return advance({ ...state, conversation: { ...state.conversation, lastCheck: null } }, option.next, hooks)
}

// From an NPC Dialogue line with no choice after it.
export function continueConversation(state, hooks = NO_HOOKS) {
  const conversation = state.conversation
  const node = conversation && getNode(conversation.definition, conversation.nodeId)
  if (node?.type !== 'npc' || conversation.choiceId) return state
  return advance({ ...state, conversation: { ...conversation, lastCheck: null } }, node.next, hooks)
}

export const leaveConversation = (state) => (state.conversation ? { ...state, conversation: null } : state)

// The Task Check the conversation waits on, or null.
export function currentCheck(state) {
  const conversation = state.conversation
  const node = conversation && getNode(conversation.definition, conversation.nodeId)
  return node?.type === 'check' ? node : null
}

// The task spec a check node asks for (taskPreparation.js), so a check reads characters exactly like a challenge does.
export const checkSpec = (node) => ({ attribute: node.attribute, department: node.department, difficulty: node.difficulty, focuses: node.focuses, complicationRange: node.complicationRange })

// Who may answer a check: every away team member able to act.
export const checkCandidates = (state) => getMembers(state.party).filter(isUp)

// The character math before the roll for one party member (prepareTask's result).
export function previewCheck(state, node, performerId) {
  const member = state.party.members[performerId]
  return prepareTask(member.character, checkSpec(node), { traits: state.scenario.traits, side: 'player', condition: member.condition })
}

// Who is best placed to answer a check (rules/taskRecommendation.js): a highlight, never a restriction.
export const recommendCheck = (state, node) => recommendPerformers(checkCandidates(state).map((member) => ({ id: member.id, prepared: previewCheck(state, node, member.id) })))

// Rolls the waiting check for performerId: purchase (optional) { bonusDice, momentum } buys bonus d20s like any task.
// Applies the complication consequences if any complication remains, then follows Success or Failure.
export function rollCheck(state, { performerId, purchase = { bonusDice: 0, momentum: 0 } }, hooks = NO_HOOKS) {
  const node = currentCheck(state)
  if (!node || !checkCandidates(state).some((member) => member.id === performerId)) return state
  const prepared = previewCheck(state, node, performerId)
  const roll = rollPartyTask(state, { prepared, purchase })
  if (!roll) return state
  const { result } = roll
  const key = state.scenario.taskCount
  let next = roll.state
  const signals = {}
  if (result.complications) next = applyActions(next, node.onComplication, hooks, state.conversation.npcId, signals)
  const lastCheck = {
    key,
    nodeId: node.id,
    label: node.label,
    performerId,
    prepared,
    result,
    messages: [],
    bonusDice: roll.purchase.bonusDice,
    momentumSpentOnDice: roll.purchase.momentum ?? 0,
    threatAddedForDice: roll.purchase.threatAdded ?? 0,
    momentumSaved: roll.saving.saved,
    momentumLost: roll.saving.lost,
  }
  next = { ...next, conversation: { ...next.conversation, lastCheck } }
  if (signals.startCombat) return close(next, hooks, true)
  const advanced = advance(next, result.success ? node.success : node.failure, hooks)
  if (advanced.conversation) return { ...advanced, conversation: { ...advanced.conversation, lastCheck } }
  if (advanced.combat) return advanced
  // The conversation ends here: the panel stays open on the roll's result until the player closes it.
  return { ...advanced, conversation: { ...next.conversation, nodeId: null, choiceId: null, ended: true } }
}
