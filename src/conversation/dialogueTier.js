// Soft authoring guideline (designer decision, 2026-10-20): conversation complexity follows the talking NPC's
// npcRules category, mimicking the book's story roles (Core p.291 extras / named actors / credits). Soft only —
// save and Talk still work. Combat rules for the same field are unchanged (personalCondition.js).
//
//   minor              → one NPC Dialogue then End (no choices, checks, conditions, actions)
//   notable, supporting → Dialogue + Player Choice + End
//   major, main, null   → full graph (as now); null is full character rules via npcRulesFor
const NODE_TYPE_LABELS = {
  npc: 'NPC Dialogue',
  choice: 'Player Choice',
  check: 'Task Check',
  condition: 'Condition',
  action: 'Action',
  end: 'End',
}
const nodeTypeLabel = (type) => NODE_TYPE_LABELS[type] ?? type

export const DIALOGUE_TIERS = [
  { id: 'minor', label: 'Minor', rank: 1 },
  { id: 'notable', label: 'Notable', rank: 2 },
  { id: 'major', label: 'Major', rank: 3 },
]

const TIER_RANK = Object.fromEntries(DIALOGUE_TIERS.map((tier) => [tier.id, tier.rank]))
export const dialogueTierLabel = (tier) => DIALOGUE_TIERS.find((entry) => entry.id === tier)?.label ?? tier

// The dialogue depth an NPC's rules allow. Supporting matches Notable; Full character rules (main) and unset match Major.
export function dialogueTierOf(npcRules) {
  switch (npcRules) {
    case 'minor':
      return 'minor'
    case 'notable':
    case 'supporting':
      return 'notable'
    case 'major':
    case 'main':
    default:
      return 'major'
  }
}

const MAJOR_NODE_TYPES = new Set(['check', 'condition', 'action'])

// The lowest tier that may author this graph (from its node types and Minor's one-line shape).
export function requiredDialogueTier(conversation) {
  const types = new Set((conversation?.nodes ?? []).map((node) => node.type))
  if ([...types].some((type) => MAJOR_NODE_TYPES.has(type))) return 'major'
  if (types.has('choice')) return 'notable'
  const lines = (conversation?.nodes ?? []).filter((node) => node.type === 'npc')
  if (lines.length > 1) return 'notable'
  return 'minor'
}

function overComplexityReasons(conversation, allowedTier) {
  const allowed = TIER_RANK[allowedTier] ?? TIER_RANK.major
  const reasons = []
  const nodes = conversation?.nodes ?? []
  const typeCounts = new Map()
  for (const node of nodes) typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1)

  if (allowed < TIER_RANK.major) {
    for (const type of MAJOR_NODE_TYPES) {
      const count = typeCounts.get(type) ?? 0
      if (count) reasons.push(`${count} ${nodeTypeLabel(type)} node${count === 1 ? '' : 's'}`)
    }
  }
  if (allowed < TIER_RANK.notable) {
    const choices = typeCounts.get('choice') ?? 0
    if (choices) reasons.push(`${choices} Player Choice node${choices === 1 ? '' : 's'}`)
    const lines = typeCounts.get('npc') ?? 0
    if (lines > 1) reasons.push(`${lines} NPC Dialogue nodes (Minor is one line then End)`)
  }
  return reasons
}

export function conversationFitsDialogueTier(conversation, allowedTier) {
  return overComplexityReasons(conversation, allowedTier).length === 0
}

// Soft warnings for the Conversation Editor: what tier this graph needs, and why.
export function dialogueTierWarnings(conversation) {
  if (!conversation?.nodes?.length) return []
  const required = requiredDialogueTier(conversation)
  if (required === 'minor') {
    return ['Dialogue depth: Minor — one NPC Dialogue then End. Soft guideline: fits any NPC rules.']
  }
  if (required === 'notable') {
    const reasons = overComplexityReasons(conversation, 'minor')
    return [
      `Dialogue depth: Notable — ${reasons.join('; ') || 'has Player Choices'}. Soft guideline: Notable, Supporting, Major or Full character rules (not Minor).`,
    ]
  }
  const reasons = overComplexityReasons(conversation, 'notable')
  return [
    `Dialogue depth: Major — ${reasons.join('; ') || 'uses full graph nodes'}. Soft guideline: Major or Full character rules NPCs only.`,
  ]
}

// Soft warning when a linked conversation is too complex for an NPC's rules (Npc Inspector).
export function dialogueMismatchWarning(conversation, npcRules, { conversationId = null } = {}) {
  if (!conversation) return null
  const allowed = dialogueTierOf(npcRules)
  const reasons = overComplexityReasons(conversation, allowed)
  if (!reasons.length) return null
  const name = conversationId || conversation.id || conversation.name || 'this conversation'
  return `${name} needs ${dialogueTierLabel(requiredDialogueTier(conversation))} dialogue depth (${reasons.join('; ')}); this NPC's rules allow ${dialogueTierLabel(allowed)}. Soft guideline only.`
}
