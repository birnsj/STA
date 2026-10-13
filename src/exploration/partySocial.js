// Persuade and Intimidate on an NPC from its radial menu (social.json; designer decisions 2026-10-12).
// The opposed roll is the combat one (combat/combatSocial.js, Book Core p.280): the asker's successes, less its own
// Difficulty changes, set the NPC's Difficulty to resist with Control + Command. Out of combat there is no Stress: a win
// or loss moves the NPC's disposition (awareness.json) and changes the Task Checks in its conversation instead.
import combatActionData from '../data/adaptation/combat/actions.json'
import socialData from '../data/adaptation/exploration/social.json'
import { withinEarshot, AUDIBLE_RANGE_TILES } from '../rules/communication.js'
import { checkDicePurchase, npcMomentumToThreat, saveMomentum } from '../rules/missionResources.js'
import { isDefeated } from '../rules/personalCondition.js'
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'
import { prepareTask } from '../rules/taskPreparation.js'
import { resolveStaTask, rollDice } from '../rules/taskResolver.js'
import { dispositionName, EMPTY_RECORD, isDown, isHostile, STATE } from './awareness.js'
import { TASK_SEED_OFFSET } from './challengeObjects.js'
import { addLogEntry } from './missionLog.js'

export const SOCIAL_KINDS = ['persuade', 'intimidate']
const VERBS = { persuade: 'Persuade', intimidate: 'Intimidate' }
const ORDER = socialData.dispositionOrder

// The asker's task (no Difficulty of its own: it sets the NPC's) and the NPC's resist task.
const askTask = (kind) => ({ ...combatActionData.tasks[kind], difficulty: 0 })
const RESIST_TASK = { ...combatActionData.tasks.resistRequest, difficulty: 0 }

const CHECKS = socialData.conversationDifficulty
const clampChecks = (value) => Math.min(CHECKS.max, Math.max(CHECKS.min, value))

// What Persuade and Intimidate have done to the Task Checks in this NPC's conversation: skipped (Intimidated: they
// pass without a roll) and the Difficulty change added to each.
export const checksSkipped = (state, npcId) => Boolean(npcId && state.npcSocial?.[npcId]?.intimidated)
export const checkDifficultyChange = (state, npcId) => (npcId ? (state.npcSocial?.[npcId]?.checkDifficulty ?? 0) : 0)

// Seconds until this member can Persuade or Intimidate again (0 = now).
export const socialCooldown = (state, memberId) => Math.max(0, (state.socialReadyAt?.[memberId] ?? 0) - state.world.time)

// { possible, reason }: whether the member can ask this NPC now.
export function canAskNpc(state, memberId, npcId, kind) {
  const verb = VERBS[kind]
  const member = state.party.members[memberId]
  if (!member || isDefeated(member.condition)) return { possible: false, reason: 'Out of action.' }
  const npc = state.world.npcs[npcId]
  if (!npc || isDown(npc) || npc.fled) return { possible: false, reason: 'Nobody there to ask.' }
  if (!npc.character) return { possible: false, reason: `${npc.name} can't be reasoned with.` }
  if (npc.disposition === 'friendly' && !isHostile(npc)) return { possible: false, reason: `${npc.name} is already friendly.` }
  if (!withinEarshot(member, npc)) return { possible: false, reason: `Out of earshot (more than ${AUDIBLE_RANGE_TILES} tiles).` }
  const wait = socialCooldown(state, memberId)
  if (wait > 0) return { possible: false, reason: `${verb} again in ${Math.ceil(wait)}s.` }
  return { possible: true, reason: null }
}

// The disposition `steps` along dispositionOrder (negative: friendlier), clamped to its ends.
function shiftDisposition(disposition, steps) {
  const index = Math.max(0, ORDER.indexOf(disposition))
  return ORDER[Math.min(ORDER.length - 1, Math.max(0, index + steps))]
}

// Calms the NPC: no fight pending, no confrontation, no search under way. responseType 'combat' (left standing after a
// fight) is cleared too, so its new disposition decides what it does.
const calm = (npc) => ({ ...npc, responseType: null, combatReady: null, response: null, investigation: null })

// The member asks the NPC. Returns the state with the roll's Momentum saved (and the NPC's as Threat), the cooldown
// started, the NPC's disposition changed, npcSocial[npcId] ({ intimidated, checkDifficulty, last }) updated,
// lastSocial for the screen (provoked: a lost Intimidate on an aggressive NPC, which then attacks; the caller starts
// the fight) and a Captain's Log line. Unchanged when the member can't ask (or the task is impossible for them).
export function askNpc(state, memberId, npcId, kind) {
  if (!SOCIAL_KINDS.includes(kind) || !canAskNpc(state, memberId, npcId, kind).possible) return state
  const member = state.party.members[memberId]
  const npc = state.world.npcs[npcId]
  const context = { traits: state.scenario.traits }
  const asker = prepareTask(member.character, askTask(kind), { ...context, side: 'player', condition: member.condition })
  if (!asker.possible) return state
  const previous = state.npcSocial?.[npcId] ?? {}
  const intimidated = Boolean(previous.intimidated)
  const resist = prepareTask(npc.character, RESIST_TASK, {
    ...context,
    side: 'enemy',
    condition: npc.condition ?? undefined,
    difficultyMod: intimidated ? socialData.intimidatedDifficulty : 0,
    difficultyModLabel: 'Intimidated',
  })

  const key = state.scenario.taskCount
  const random = seededRandomInt(deriveSeed(state.seed, TASK_SEED_OFFSET + key))
  const asked = resolveStaTask({
    leader: { task: asker.task, dice: rollDice(random, checkDicePurchase(state.resources).dice) },
    difficulty: 0,
    ignoreComplications: asker.ignoreComplications,
  })
  // Book p.256: the asker's own Difficulty changes lower the Difficulty it sets.
  const set = asker.task.autoFail ? 0 : Math.max(0, asked.successes - asker.difficulty)
  const difficulty = set + resist.difficulty
  const resisted = set > 0 ? resolveStaTask({ leader: { task: resist.task, dice: rollDice(random) }, difficulty }) : null
  const passed = Boolean(resisted) && !resisted.success

  const momentum = passed ? difficulty - resisted.successes : 0
  const saved = saveMomentum(state.resources, momentum)
  const threat = resisted?.success ? resisted.momentumGenerated : 0
  const resources = threat ? npcMomentumToThreat(saved.resources, threat) : saved.resources

  const before = npc.disposition
  let after = before
  let stoodDown = false
  let provoked = false
  let nextNpc = npc
  let nowIntimidated = intimidated
  let checkDifficulty = previous.checkDifficulty ?? 0
  if (kind === 'persuade' && passed) {
    after = shiftDisposition(before, -socialData.persuadeWinSteps)
    nextNpc = calm({ ...npc, disposition: after })
    checkDifficulty = clampChecks(checkDifficulty + CHECKS.persuadeWin)
  } else if (kind === 'intimidate' && passed) {
    stoodDown = isHostile(npc)
    after = stoodDown ? 'neutral' : shiftDisposition(before, -socialData.intimidateWinSteps)
    nextNpc = calm({ ...npc, disposition: after, ...(stoodDown ? { alertGroupId: null, patrol: null } : {}) })
    nowIntimidated = true
  } else if (kind === 'intimidate') {
    provoked = before === ORDER[ORDER.length - 1]
    after = shiftDisposition(before, socialData.intimidateLossSteps)
    nowIntimidated = false
    checkDifficulty = clampChecks(checkDifficulty + CHECKS.intimidateLoss)
    // It knows exactly who threatened it and where they stand.
    const record = npc.awareness[memberId] ?? EMPTY_RECORD
    nextNpc = {
      ...npc,
      disposition: after,
      awareness: { ...npc.awareness, [memberId]: { ...record, state: STATE.ALERTED, confidence: 1, lastKnownPosition: { ...member.position }, lastSeenTime: state.world.time } },
    }
  }

  const name = npc.name
  const askerName = member.character.name
  const verb = VERBS[kind]
  const outcome = !resisted ? `${name} ignores ${askerName}` : passed ? `${askerName} wins` : `${name} refuses`
  const change = provoked ? `${name} attacks` : stoodDown ? `${name} stands down` : after !== before ? `${name} is now ${dispositionName(after)}` : null
  const lastSocial = { key, memberId, npcId, kind, passed, successes: asked.successes, set, resistSuccesses: resisted?.successes ?? 0, before, after, stoodDown, provoked, momentum, threat }
  const next = {
    ...state,
    resources,
    scenario: { ...state.scenario, taskCount: key + 1 },
    world: { ...state.world, npcs: { ...state.world.npcs, [npcId]: nextNpc } },
    socialReadyAt: { ...state.socialReadyAt, [memberId]: state.world.time + socialData.cooldownSeconds },
    npcSocial: { ...state.npcSocial, [npcId]: { ...previous, intimidated: nowIntimidated, checkDifficulty, last: lastSocial } },
    lastSocial,
  }
  return addLogEntry(next, { kind: 'task', text: `${askerName}: ${verb} ${name}. ${outcome}${change ? `; ${change}` : ''}.` })
}
