import { getWeapon } from '../../combat/weaponSystem.js'
import { project } from '../../maps/iso.js'
import { injuryTypeName, minorDefeatText } from '../../rules/personalCondition.js'
import { CHARACTER_SCAN_RADIUS, SHOT_FIRE_MS, shotOf } from './battleHelpers.js'

// The effects on the combat board for state.lastAction, as items for the Pixi scene (maps/pixi/effects.js): what the
// acting character just did, the shot, and the result on the target. Ids include the action's key, so each new action
// replays its effects once. A shot (battleHelpers shotOf) fires SHOT_FIRE_MS into the attacker's strike and the hit
// label waits until it lands; all divided by the Auto Combat speed. Presentation only.

// Shots leave from and land on a figure's chest, this far above its tile centre.
const UNIT_HEAD = 30

const ACTION_LABELS = { flee: 'Beams Out', move: 'Move', sprint: 'Sprint', aim: 'Aim', direct: 'Direct', cancelThreat: 'Cancel Threat', extraMinor: 'Extra Minor', secondMajor: 'Second Major', counterattack: 'Counterattack' }
const TASK_LABELS = { guard: ['Guard', 'Guard failed'], firstAid: ['First Aid', 'First Aid failed'], interact: ['Task', 'Task failed'] }

function actionLabel(action) {
  if (action.type === 'attack' || action.type === 'attackObject') return getWeapon(action.weaponId)?.name ?? 'Fire'
  if (action.type === 'reroll') return { aim: 'Aim Reroll', assist: 'Student of War Reroll' }[action.source] ?? 'Momentum Reroll'
  if (action.type === 'move' && action.inCover) return 'Move to Cover'
  if (action.type === 'sprint' && action.inCover) return 'Sprint to Cover'
  if (TASK_LABELS[action.type]) return action.passed === false ? TASK_LABELS[action.type][1] : TASK_LABELS[action.type][0]
  return ACTION_LABELS[action.type] ?? null
}

// What a hit did to the target: an Injury waiting for Avoid Injury, avoided (Stress taken), or Defeated (a Minor NPC:
// Unconscious or Dead, target condition).
function resultLabel(action, target) {
  if (action.type === 'resolve' && !action.passed) return 'Miss'
  const defeated = minorDefeatText(target?.condition) ?? 'Defeated'
  if (action.type === 'injury') return action.avoided ? 'Injury avoided' : defeated
  const injury = action.injury ? `${injuryTypeName(action.injury.type)} ${action.injury.severity}` : 'Hit'
  if (action.awaiting) return `${injury}: Avoid?`
  if (action.removed) return `${injury}: ${defeated}`
  return `${injury}: avoided`
}

// Where a missed shot ends: past the target and off to one side, so it visibly goes wide.
function wideOf(from, to) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  return { x: to.x + (dx / length) * 40 - (dy / length) * 18, y: to.y + (dy / length) * 40 + (dx / length) * 18 }
}

const raised = (point) => ({ x: point.x, y: point.y - UNIT_HEAD })

// positionOf(combatant): where the board shows them (mid-walk included). hiddenIds: combatants not shown.
export function actionEffectItems(state, { positionOf, msPerTile, speed, hiddenIds }) {
  const action = state.lastAction
  if (!action || hiddenIds?.includes(action.actorId)) return []
  const actor = state.combatants[action.actorId]
  const target = action.targetId ? state.combatants[action.targetId] : null
  const shot = shotOf(state, action)
  const key = action.key
  const from = actor && project(positionOf(actor))
  const to = target
    ? project(positionOf(target))
    : shot?.targetPosition
      ? project(shot.targetPosition)
      : null
  const delayMs = SHOT_FIRE_MS / speed
  const items = []
  if (shot && from && to && shot.colour) {
    const end = shot.missed ? wideOf(from, to) : to
    const kind = shot.pulse ? 'pulseShot' : 'beamShot'
    items.push({ id: `shot-${key}`, kind, from: raised(from), end: raised(end), hit: shot.missed ? null : raised(to), colour: shot.colour, delayMs, speed })
  }
  if (shot && from && to && !shot.colour && !shot.missed) items.push({ id: `strike-${key}`, kind: 'strike', at: raised(to), delayMs, speed })
  if (action.type === 'scan') {
    if (actor) items.push({ id: `scan-a-${key}`, kind: 'scan', origin: positionOf(actor), radius: CHARACTER_SCAN_RADIUS, speed })
    if (target) items.push({ id: `scan-t-${key}`, kind: 'scan', origin: positionOf(target), radius: CHARACTER_SCAN_RADIUS, speed })
  }
  if (action.type === 'flee' && from) items.push({ id: `flee-${key}`, kind: 'transporter', position: from, direction: 'out', speed })
  const label = actionLabel(action)
  if (label && from) items.push({ id: `label-${key}`, kind: 'label', centre: from, msPerTile, text: label, style: 'action', delayMs: 0, speed })
  if (['resolve', 'injury', 'counterattack'].includes(action.type) && target && to) {
    const style = action.type === 'resolve' && !action.passed ? 'miss' : 'hit'
    items.push({ id: `result-${key}`, kind: 'label', centre: to, msPerTile, text: resultLabel(action, target), style, delayMs: shot ? shot.impactMs / speed : 0, speed })
  }
  return items
}
