// Scan from a character's radial menu (videogame adaptation; scan.json): the character rolls the party Scan task
// (partyActions.json). Every scan reports the location and environment (locationReport.js); on a success the party also
// learns where every NPC within their tricorder's range is now, as life signs (Party Knowledge, partyKnowledge.js
// revealEntity), walls or not, and how many of them are enemies.
import awarenessData from '../data/adaptation/exploration/awareness.json'
import actionData from '../data/adaptation/exploration/partyActions.json'
import scanData from '../data/adaptation/exploration/scan.json'
import { getEquippedItems } from '../rules/equipment.js'
import { checkDicePurchase, savableMomentum, saveMomentum } from '../rules/missionResources.js'
import { isDefeated } from '../rules/personalCondition.js'
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'
import { prepareTask } from '../rules/taskPreparation.js'
import { resolveStaTask, rollDice } from '../rules/taskResolver.js'
import { getNpcs, isDown } from './awareness.js'
import { TASK_SEED_OFFSET } from './challengeObjects.js'
import { locationReport } from './locationReport.js'
import { revealEntity } from './partyKnowledge.js'

export const SCAN_TASK = actionData.actions.find((action) => action.id === 'scan').task

// The best Scan stat among the character's items (0 without a scanner).
const scanStat = (character) => Math.max(0, ...getEquippedItems(character).map((item) => item.stats.scan ?? 0))

// Tiles the character's scan reaches; 0 when they carry nothing that scans.
export function scanRadius(character) {
  const stat = scanStat(character)
  const reached = Object.entries(scanData.radiusByScanStat)
    .filter(([needed]) => Number(needed) <= stat)
    .map(([, tiles]) => tiles)
  return stat && reached.length ? Math.max(...reached) : 0
}

const ENEMY_DISPOSITIONS = new Set(awarenessData.dispositions.filter((disposition) => disposition.joinsCombat).map((disposition) => disposition.id))
const isEnemy = (npc) => ENEMY_DISPOSITIONS.has(npc.disposition)

// Seconds until this member can scan again (0 = now).
export const scanCooldown = (state, memberId) => Math.max(0, (state.scanReadyAt?.[memberId] ?? 0) - state.world.time)

// { possible, reason }: whether the member can scan now.
export function canScan(state, memberId) {
  const member = state.party.members[memberId]
  if (!member || isDefeated(member.condition)) return { possible: false, reason: 'Out of action.' }
  if (!scanRadius(member.character)) return { possible: false, reason: 'Carries no tricorder.' }
  const wait = scanCooldown(state, memberId)
  if (wait > 0) return { possible: false, reason: `Scan again in ${Math.ceil(wait)}s.` }
  return { possible: true, reason: null }
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// North is up on the minimap (smaller y), east is right (designer decision, 2026-10-09).
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export function compassPoint(from, to) {
  const degrees = (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI
  return COMPASS[Math.round(((degrees + 360) % 360) / 45) % 8]
}

// The member scans. Returns the state with the roll's Momentum saved, the life signs revealed, the cooldown started
// and lastScan: { key, memberId, success, successes, difficulty, radius, found, enemies, enemyContacts, location } for
// the screen (found / enemies: life signs and enemies among them, 0 on a failure; enemyContacts: { direction, distance }
// per enemy from the scanner, nearest first, distance in whole tiles; location: locationReport). Unchanged when the
// member can't scan (or the task is impossible for them).
export function scanArea(state, memberId) {
  if (!canScan(state, memberId).possible) return state
  const member = state.party.members[memberId]
  const prepared = prepareTask(member.character, SCAN_TASK, { traits: state.scenario.traits, side: 'player', condition: member.condition })
  if (!prepared.possible) return state

  const key = state.scenario.taskCount
  const random = seededRandomInt(deriveSeed(state.seed, TASK_SEED_OFFSET + key))
  const result = resolveStaTask({
    leader: { task: prepared.task, dice: rollDice(random, checkDicePurchase(state.resources).dice) },
    difficulty: prepared.difficulty,
    ignoreComplications: prepared.ignoreComplications,
    bonusMomentum: prepared.bonusMomentum,
  })
  const { resources } = saveMomentum(state.resources, savableMomentum(result))

  const radius = scanRadius(member.character)
  const found = result.success ? getNpcs(state.world).filter((npc) => !isDown(npc) && distance(npc.position, member.position) <= radius) : []
  const partyKnowledge = found.reduce(
    (knowledge, npc) => revealEntity(knowledge, npc, { source: 'tricorder', identified: false, time: state.world.time, observerId: memberId }),
    state.partyKnowledge,
  )
  return {
    ...state,
    resources,
    partyKnowledge,
    scenario: { ...state.scenario, taskCount: key + 1 },
    scanReadyAt: { ...state.scanReadyAt, [memberId]: state.world.time + scanData.cooldownSeconds },
    lastScan: {
      key,
      memberId,
      success: result.success,
      successes: result.successes,
      difficulty: prepared.difficulty,
      radius,
      found: found.length,
      enemies: found.filter(isEnemy).length,
      enemyContacts: found
        .filter(isEnemy)
        .map((npc) => ({ direction: compassPoint(member.position, npc.position), distance: Math.round(distance(member.position, npc.position)) }))
        .sort((a, b) => a.distance - b.distance),
      location: locationReport(state.party.map, state.scenario, member.position),
    },
  }
}
