// Conversations (videogame adaptation, no book rule): authored node graphs, made in the Dev Edit conversation editor and
// saved as conversations/{id}.json. Nothing about what is said, offered or decided lives in code; the runtime
// (conversationRuntime.js) only walks the graph.
//
// { id, name, start (node id), nodes: [node] }. Every node: { id, type, position: { x, y } (editor layout only) }.
//   npc        NPC Dialogue: { speaker (blank: the NPC's name), text, next }
//   choice     Player Choice: { options: [{ id, text, conditions, next }] }; an option whose conditions fail is not shown
//   check      Task Check: { label, attribute, department, difficulty, focuses: [names], complicationRange,
//              onComplication: [actions], success, failure }, resolved with the shared STA task (partyTaskRoll.js)
//   condition  Condition: { conditions, match: 'all' | 'any', pass, fail }
//   action     Action: { actions: [conversationActions.js actions], next }
//   end        End
// conditions: [missionFlags.js conditions]. A link (next, success, option.next, ...) is a node id or null.
// On disk positions are [x, y]; everything else is as in memory.
import { ATTRIBUTE_IDS, DISCIPLINE_IDS } from '../character/runtimeCharacter.js'
import { ACTION_TYPES } from './conversationActions.js'

export const CONVERSATION_SCHEMA_VERSION = 1

export const NODE_TYPES = [
  { id: 'npc', label: 'NPC Dialogue' },
  { id: 'choice', label: 'Player Choice' },
  { id: 'check', label: 'Task Check' },
  { id: 'condition', label: 'Condition' },
  { id: 'action', label: 'Action' },
  { id: 'end', label: 'End' },
]
export const nodeTypeLabel = (type) => NODE_TYPES.find((entry) => entry.id === type)?.label ?? type

// A new node of a type, with every field it uses.
export function createNode(type, id, position = { x: 0, y: 0 }) {
  const base = { id, type, position }
  switch (type) {
    case 'npc':
      return { ...base, speaker: '', text: '', next: null }
    case 'choice':
      return { ...base, options: [] }
    case 'check':
      return { ...base, label: '', attribute: 'presence', department: 'command', difficulty: 1, focuses: [], complicationRange: 1, onComplication: [], success: null, failure: null }
    case 'condition':
      return { ...base, conditions: [], match: 'all', pass: null, fail: null }
    case 'action':
      return { ...base, actions: [], next: null }
    default:
      return { ...base, type: 'end' }
  }
}

export const createOption = (id) => ({ id, text: '', conditions: [], next: null })

export function createConversation({ id = '', name = 'New Conversation' } = {}) {
  return { id, name, start: 'n1', nodes: [createNode('npc', 'n1', { x: 40, y: 40 })] }
}

// A fresh id not used by any item in the list ('n1', 'n2', ... or 'o1', 'o2', ...).
export function nextId(prefix, items) {
  const used = new Set(items.map((item) => item.id))
  let index = 1
  while (used.has(`${prefix}${index}`)) index += 1
  return `${prefix}${index}`
}

// A node's outgoing links: [{ key, label, target }]. key is 'next', 'success', 'failure', 'pass', 'fail' or
// 'option:{optionId}'.
export function outputsOf(node) {
  switch (node.type) {
    case 'npc':
    case 'action':
      return [{ key: 'next', label: 'Next', target: node.next ?? null }]
    case 'choice':
      return node.options.map((option, index) => ({ key: `option:${option.id}`, label: option.text || `Option ${index + 1}`, target: option.next ?? null }))
    case 'check':
      return [
        { key: 'success', label: 'Success', target: node.success ?? null },
        { key: 'failure', label: 'Failure', target: node.failure ?? null },
      ]
    case 'condition':
      return [
        { key: 'pass', label: 'True', target: node.pass ?? null },
        { key: 'fail', label: 'False', target: node.fail ?? null },
      ]
    default:
      return []
  }
}

// The node with one link pointed at targetId (null removes it).
export function withLink(node, key, targetId) {
  if (key.startsWith('option:')) {
    const optionId = key.slice('option:'.length)
    return { ...node, options: node.options.map((option) => (option.id === optionId ? { ...option, next: targetId } : option)) }
  }
  return { ...node, [key]: targetId }
}

export const getNode = (conversation, id) => conversation.nodes.find((node) => node.id === id) ?? null

// The Task Check a link leads to straight away (through Action nodes only), or null: what a Player Choice option shows
// it will test before the player picks it.
export function checkAhead(conversation, targetId) {
  const seen = new Set()
  let node = targetId ? getNode(conversation, targetId) : null
  while (node?.type === 'action' && !seen.has(node.id)) {
    seen.add(node.id)
    node = node.next ? getNode(conversation, node.next) : null
  }
  return node?.type === 'check' ? node : null
}

// The conversation with a node removed and every link to it cleared (the start moves to the first node left).
export function removeNode(conversation, nodeId) {
  const nodes = conversation.nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => outputsOf(node).reduce((current, output) => (output.target === nodeId ? withLink(current, output.key, null) : current), node))
  const start = conversation.start === nodeId ? (nodes[0]?.id ?? null) : conversation.start
  return { ...conversation, nodes, start }
}

const toPosition = (value) => (Array.isArray(value) ? { x: Number(value[0]) || 0, y: Number(value[1]) || 0 } : { x: Number(value?.x) || 0, y: Number(value?.y) || 0 })
const list = (value) => (Array.isArray(value) ? value : [])
const link = (value) => (typeof value === 'string' && value ? value : null)

function parseNode(raw) {
  const node = createNode(raw.type, String(raw.id), toPosition(raw.position))
  switch (node.type) {
    case 'npc':
      return { ...node, speaker: raw.speaker ?? '', text: raw.text ?? '', next: link(raw.next) }
    case 'choice':
      return { ...node, options: list(raw.options).map((option) => ({ id: String(option.id), text: option.text ?? '', conditions: list(option.conditions), next: link(option.next) })) }
    case 'check':
      return {
        ...node,
        label: raw.label ?? '',
        attribute: raw.attribute ?? node.attribute,
        department: raw.department ?? node.department,
        difficulty: Number.isFinite(raw.difficulty) ? raw.difficulty : node.difficulty,
        focuses: list(raw.focuses),
        complicationRange: Number.isFinite(raw.complicationRange) ? raw.complicationRange : 1,
        onComplication: list(raw.onComplication),
        success: link(raw.success),
        failure: link(raw.failure),
      }
    case 'condition':
      return { ...node, conditions: list(raw.conditions), match: raw.match === 'any' ? 'any' : 'all', pass: link(raw.pass), fail: link(raw.fail) }
    case 'action':
      return { ...node, actions: list(raw.actions), next: link(raw.next) }
    default:
      return node
  }
}

// id: the file name the conversation was loaded from.
export function parseConversation(file, id) {
  const nodes = list(file?.nodes).filter((raw) => raw?.id != null).map(parseNode)
  return { id, name: file?.name || id, start: link(file?.start) ?? nodes[0]?.id ?? null, nodes }
}

export function serializeConversation(conversation) {
  return {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    name: conversation.name,
    start: conversation.start,
    nodes: conversation.nodes.map(({ position, ...node }) => ({ ...node, position: [Math.round(position.x), Math.round(position.y)] })),
  }
}

const ACTION_IDS = new Set(ACTION_TYPES.map((type) => type.id))

// Warnings only (a conversation can be saved in any state): broken or missing links, empty text, incomplete checks,
// unknown actions and nodes the start can never reach.
export function validateConversation(conversation) {
  const warnings = []
  const ids = new Set(conversation.nodes.map((node) => node.id))
  if (!conversation.nodes.length) warnings.push('No nodes.')
  if (!ids.has(conversation.start)) warnings.push('No start node.')
  const actionsOf = (node) => [...(node.actions ?? []), ...(node.onComplication ?? [])]
  for (const node of conversation.nodes) {
    const name = `${nodeTypeLabel(node.type)} ${node.id}`
    for (const output of outputsOf(node)) {
      if (output.target && !ids.has(output.target)) warnings.push(`${name}: "${output.label}" leads to a missing node.`)
      if (!output.target) warnings.push(`${name}: "${output.label}" leads nowhere (the conversation ends there).`)
    }
    if (node.type === 'npc' && !node.text.trim()) warnings.push(`${name} has no text.`)
    if (node.type === 'choice' && !node.options.length) warnings.push(`${name} has no options.`)
    if (node.type === 'choice' && node.options.some((option) => !option.text.trim())) warnings.push(`${name} has an option with no text.`)
    if (node.type === 'check' && (!ATTRIBUTE_IDS.includes(node.attribute) || !DISCIPLINE_IDS.includes(node.department))) warnings.push(`${name} needs an attribute and a department.`)
    for (const action of actionsOf(node)) if (!ACTION_IDS.has(action.type)) warnings.push(`${name}: unknown action "${action.type}".`)
  }
  const reached = new Set()
  const queue = ids.has(conversation.start) ? [conversation.start] : []
  while (queue.length) {
    const id = queue.pop()
    if (reached.has(id) || !ids.has(id)) continue
    reached.add(id)
    queue.push(...outputsOf(getNode(conversation, id)).map((output) => output.target).filter(Boolean))
  }
  for (const node of conversation.nodes) if (!reached.has(node.id)) warnings.push(`${nodeTypeLabel(node.type)} ${node.id} can never be reached from the start.`)
  return warnings
}
