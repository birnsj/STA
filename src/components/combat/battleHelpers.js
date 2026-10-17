import { chooseAIStep } from '../../combat/autoCombat.js'
import {
  ACTION_TYPE_NAMES,
  actionTypeOf,
  getActiveCombatant,
  getMovementLeft,
  getOpponents,
  getTurnGroupRange,
  getTurnOf,
  isActive,
  isTurnFinished,
} from '../../combat/combatState.js'
import { getMovementTiles, getSprintTiles } from '../../combat/movementSystem.js'
import { tileDistance } from '../../combat/rangeSystem.js'
import { getCombatantWeapon, getInjuryMode, getWeapon } from '../../combat/weaponSystem.js'
import { CHARACTER_SCAN_RADIUS, scanSweepSeconds } from '../exploration/scanSweep.js'
import { MAX_SEED } from '../../rules/seededRandom.js'

// The combat screen's pure helpers: presentation delays, what the camera follows, the party's turn info, banners and the
// button rings Auto Combat shows. Nothing here holds state or renders; Battle (screens/CombatScreen.jsx) calls them.

// Presentation delays only (divided by the Auto Combat speed). The combat itself never waits on them.
const AI_STEP_MS = 700
// Matches the combat-start-banner animation in styles.css.
export const OPENING_BANNER_MS = 2400
const AI_ROLL_MS = 1100
export const MOVE_TILE_MS = 140
// How long Auto Combat shows a party member's chosen button before the action runs.
export const AI_CHOICE_MS = 900
export const AUTO_END_TURN_MS = 1200
// A fleeing enemy's beam-out and the away team's beam-in as a mission starts (match the figures' beam animations,
// maps/pixi/figures.js, and the transporter column, maps/pixi/effects.js).
export const BEAM_OUT_MS = 1600
export const BEAM_IN_MS = 1600
// The same beat the AI's rolls get, so the dice can be read before the result lands.
export const AUTO_RESOLVE_MS = AI_ROLL_MS
// A fight's seed is drawn when it starts (never during render) unless the player typed one in.
export const newSeed = () => Math.floor(Math.random() * MAX_SEED)

// The enemy that fled in the step just taken, while its beam-out plays: only the next turn's ROUND and turn header have
// been logged since, or the flee ended the fight (nothing happens after that). Otherwise null.
export function justFled(state) {
  const action = state.lastAction
  if (action?.type !== 'flee') return null
  const quiet = state.outcome || state.log.slice(action.key + 1).every((entry) => entry.kind === 'round' || entry.kind === 'turn')
  return quiet ? state.combatants[action.actorId] : null
}

// A shot on the battlefield (presentation only): it plays when the roll is resolved, never while the dice are still
// being read, so the attacker's strike, the shot, the hit and the target's fall line up. The weapon leaves SHOT_FIRE_MS
// into the attacker's strike animation; a beam lands at once, a pulse after PULSE_TRAVEL_MS. The next AI step waits
// SHOT_SEQUENCE_MS so the fall and the result label finish before anyone else moves. Divided by the Auto Combat speed.
export const SHOT_ACTIONS = ['resolve', 'counterattack', 'ambush']
export const SHOT_FIRE_MS = 220
const PULSE_TRAVEL_MS = 280
// After the beam is clearly on screen (beams) or the pulse lands — when an object shot's damage / explosion should apply.
// Beams: hold the laser a beat before the boom (not the same frame as the muzzle).
export const objectShotImpactMs = (weapon, side = 'player') => {
  const look = weaponShotLook(side, weapon)
  return look.pulse ? look.impactMs : SHOT_FIRE_MS + 450
}
export const SHOT_SEQUENCE_MS = 1600
// A combat Scan's rings around the scanner and the target (scanSweep.js CHARACTER_SCAN_RADIUS).
export const SCAN_SEQUENCE_MS = Math.ceil(scanSweepSeconds(CHARACTER_SCAN_RADIUS) * 1000)
export { CHARACTER_SCAN_RADIUS }
// Designer request (2026-10-12): every enemy ranged shot is a red pulse with the disruptor sound.
const ENEMY_PULSE = '#ff2e1f'

// Beam / pulse colour and timing for a weapon fired by a combatant (or exploration shooter).
export function weaponShotLook(attackerSide, weapon, { injuryMode = null, missed = false } = {}) {
  const enemyRanged = attackerSide === 'enemy' && weapon.type === 'ranged'
  const mode = injuryMode ?? weapon.injuryModes[0]
  const colour = enemyRanged ? ENEMY_PULSE : (weapon.beamColors?.[mode] ?? weapon.beamColor ?? null)
  const pulse = Boolean(colour) && (enemyRanged || weapon.shotStyle === 'pulse')
  return {
    weapon,
    injuryMode: mode,
    colour,
    pulse,
    missed,
    sound: enemyRanged ? 'disruptor' : (weapon.attackSound ?? null),
    impactMs: SHOT_FIRE_MS + (pulse ? PULSE_TRAVEL_MS : 0),
  }
}

// The shot state.lastAction shows: { attackerId, targetId?, objectId?, targetPosition?, weapon, colour, pulse,
// missed, impactMs, sound } or null. colour null = no beam (a melee strike flash instead). Attack Object aims at the
// destructible's tile. A failed Ambush shoots nobody.
export function shotOf(state, action) {
  if (!action?.weaponId) return null
  if (action.type === 'attackObject') {
    const attacker = state.combatants[action.actorId]
    const weapon = getWeapon(action.weaponId)
    const record = state.environment?.destructibles?.[action.objectId]
    if (!attacker || !weapon || !record) return null
    return {
      attackerId: attacker.id,
      targetId: null,
      objectId: action.objectId,
      targetPosition: record.position,
      ...weaponShotLook(attacker.side, weapon, { missed: !action.passed }),
    }
  }
  if (!SHOT_ACTIONS.includes(action.type) || !action.targetId) return null
  if (action.type === 'ambush' && !action.passed) return null
  const attacker = state.combatants[action.actorId]
  const weapon = getWeapon(action.weaponId)
  if (!attacker || !weapon) return null
  // A resolved roll keeps its firing mode on state.result; an Ambush fires on Stun when the weapon has it.
  const mode = action.injuryMode ?? (action.type === 'resolve' ? state.result?.injuryMode : null) ?? weapon.injuryModes[0]
  return {
    attackerId: attacker.id,
    targetId: action.targetId,
    ...weaponShotLook(attacker.side, weapon, {
      injuryMode: mode,
      missed: action.type === 'resolve' && !action.passed,
    }),
  }
}

// The delay before the next AI step: long enough to read a roll, watch a move finish or an enemy beam out.
export function aiDelay(state) {
  if (state.pending) return AI_ROLL_MS
  if (justFled(state)) return BEAM_OUT_MS
  // Just after the ambush roll (its log entry, plus the initiative, round and turn entries when spotted): time to read it.
  if (state.lastAction?.type === 'ambush' && state.log.length - state.lastAction.key <= (state.ambush.success ? 1 : 4)) return AI_ROLL_MS * 1.5
  const justMoved = state.lastMove && state.lastMove.key === state.log.length - 1
  return justMoved ? Math.max(AI_STEP_MS, (state.lastMove.path.length - 1) * MOVE_TILE_MS + 300) : AI_STEP_MS
}

// The key of a shot still playing out on screen (useBattlePacing waits SHOT_SEQUENCE_MS once for it), or null.
export const shotKey = (state) => (shotOf(state, state.lastAction) ? state.lastAction.key : null)

// A presentation effect the AI should wait out: a shot, or a Scan's rings. { key, waitMs } or null.
export function pacingEffect(state) {
  const shot = shotKey(state)
  if (shot !== null) return { key: shot, waitMs: SHOT_SEQUENCE_MS }
  if (state.lastAction?.type === 'scan') return { key: state.lastAction.key, waitMs: SCAN_SEQUENCE_MS }
  return null
}

// The camera centres on whoever is acting, and on the middle of the line of fire when a shot is fired.
export function cameraFocus(state, turnKey, active) {
  // Stays on the shot through rerolls and the result (one attack per turn, so the key is stable until the next action).
  const action = state.lastAction
  const roll = state.pending ?? (state.result?.closed ? null : state.result)
  if (roll && ['attack', 'reroll', 'resolve', 'injury', 'ambush'].includes(action?.type)) {
    const from = state.combatants[roll.attackerId].position
    const to = state.combatants[roll.targetId].position
    return { key: `${turnKey}:shot`, position: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } }
  }
  const fled = justFled(state)
  if (fled) return { key: `${turnKey}:fled`, position: fled.position }
  return { key: `${turnKey}:${state.lastMove?.key ?? ''}`, position: active.position }
}

// Turn status of each active party member this round, for the party bar and the map:
// during the party's group turn each member is acting / ready / done with their used actions; once the group has
// finished (enemy turns later in the round) every member who acted is shown as done.
export function getPartyTurnInfo(state, active) {
  if (state.outcome) return {}
  const { start, ids } = getTurnGroupRange(state)
  // Ending a turn forfeits any actions left, so a finished member shows nothing left.
  const spent = { major: 0, minor: 0 }
  const movement = (id, left, sprintLeft = 0) => ({
    left,
    total: getMovementTiles(state.combatants[id].character),
    sprintLeft,
    sprintTotal: getSprintTiles(state.combatants[id].character),
  })
  if (active.side === 'player') {
    return Object.fromEntries(
      ids.map((id) => {
        const finished = isTurnFinished(state, id)
        return [
          id,
          {
            state: finished ? 'done' : id === active.id ? 'acting' : 'ready',
            turn: finished ? spent : getTurnOf(state, id),
            movement: finished ? movement(id, 0) : movement(id, getMovementLeft(state, state.combatants[id]), getMovementLeft(state, state.combatants[id], 'sprint')),
          },
        ]
      }),
    )
  }
  return Object.fromEntries(
    state.order
      .slice(0, start)
      .filter((id) => state.combatants[id].side === 'player' && isActive(state.combatants[id]))
      .map((id) => [id, { state: 'done', turn: spent, movement: movement(id, 0) }]),
  )
}

// The banner shown when control changes: each party member's turn, "Enemy Turn" once when the enemies take over, and
// the round number when a new round begins. null = no banner for this turn (the next enemy in the same enemy phase).
export function turnBanner(state, previous) {
  const active = getActiveCombatant(state)
  const newRound = !previous || previous.round !== state.round
  const round = newRound ? `Round ${state.round}` : null
  if (state.directed) return { title: `${active.character.name}: Directed`, subtitle: `by ${state.combatants[state.directed.commanderId].character.name}`, side: 'player' }
  if (active.side === 'player') return { title: `${active.character.name}'s Turn`, subtitle: round, side: 'player' }
  if (newRound || previous.side !== 'enemy') return { title: 'Enemy Turn', subtitle: round, side: 'enemy' }
  return null
}

// A task's short label under a ring button: what it uses ("Control + Security") and its numbers ("TN 13 Â· D2").
// task: a prepared task with its final difficulty; opposed: the defender's roll can still change the Difficulty ("D2+").
export const taskDetails = (task, { opposed = false, showDifficulty = true } = {}) => [
  `${task.attribute.name} + ${task.department.name}`,
  `TN ${task.targetNumber}${showDifficulty ? ` Â· D${task.difficulty}${opposed ? '+' : ''}` : ''}`,
]

// What a firing mode does, shown in its button's tooltip: the attacker's roll (when known), the weapon's Severity, and +1 Threat
// for a mode that escalates (a party member's Deadly attack, charged when the attack resolves: combatState resolveAttack).
export const attackModeDetails = (weapon, modeId, roll = null) => [
  ...(roll ? taskDetails(roll.task, { opposed: roll.opposed }) : []),
  `Severity ${weapon.severity}`,
  ...(getInjuryMode(modeId).generatesThreat ? ['+1 Threat'] : []),
]
// What the acting AI decided this round and the task it is rolling (or just rolled), for the Task panel in Auto Combat.
// An earlier roll by the same character shows only while it matches this round's decision.
export function aiTurnTask(state, active) {
  const decision = state.lastDecision?.actorId === active.id && state.lastDecision.round === state.round ? state.lastDecision : null
  const pending = state.pending?.attackerId === active.id ? state.pending : null
  const result = state.result?.attackerId === active.id && decision?.targetId && state.result.targetId === decision.targetId ? state.result : null
  const roll = pending ?? result
  const weapon = decision?.weaponId ? getWeapon(decision.weaponId) : null
  return {
    actorName: active.character.name,
    decision: decision?.decision ?? null,
    reason: decision?.reason ?? null,
    targetName: state.combatants[decision?.targetId ?? roll?.targetId]?.character.name ?? null,
    weaponName: weapon ? `${weapon.name}${decision.injuryMode ? ` (${getInjuryMode(decision.injuryMode).name})` : ''}` : null,
    task: roll?.task ?? null,
  }
}

export const attackModeName = (weapon, modeId) => `${weapon.name}: ${getInjuryMode(modeId).name} (Severity ${weapon.severity}${getInjuryMode(modeId).generatesThreat ? ', +1 Threat' : ''})`

// The buttons shown around an enemy: one per injury mode of the weapon (each fires), then Aim, Use Item, Scan, Persuade
// and Intimidate.
// roll: { task, opposed } the attack would use, for the button labels (null = labels without it).
export const enemyButtonDefs = (weapon, roll = null) => [
  ...weapon.injuryModes.map((modeId) => ({ id: modeId, label: getInjuryMode(modeId).name, details: attackModeDetails(weapon, modeId, roll), icon: modeId === 'stun' ? 'stun' : 'deadly' })),
  { id: 'aim', label: 'Aim', icon: 'aim' },
  { id: 'useItem', label: 'Use Item', icon: 'useItem' },
  { id: 'scan', label: 'Scan', icon: 'scan' },
  { id: 'persuade', label: 'Persuade', icon: 'persuade' },
  { id: 'intimidate', label: 'Intimidate', icon: 'intimidate' },
]

export const typeName = (actionId) => ACTION_TYPE_NAMES[actionTypeOf(actionId)]

// During Auto Combat, the buttons a party member's AI choice uses, with the choice lit (display only).
// choice: { actorId, type, targetId, weaponId, injuryMode, allyId } - an AI step about to run, or the action just taken.
// pressKey: set for a step about to run, so its button is shown being pressed (once per key) before it happens.
export function choiceRing(state, choice, pressKey = null) {
  const actor = choice && state.combatants[choice.actorId]
  if (!actor || actor.side !== 'player') return null
  const show = (unitId, buttons, chosenId) => ({
    unitId,
    info: null,
    buttons: buttons.map((button) => ({
      ...button,
      enabled: false,
      active: button.id === chosenId,
      pressed: button.id === chosenId ? pressKey : null,
      title: button.id === chosenId ? `${actor.character.name} chose ${button.label}` : button.label,
    })),
  })
  const weapon = getCombatantWeapon(actor, choice.weaponId ?? actor.weaponIds[0])
  if (choice.type === 'attack') return show(choice.targetId, enemyButtonDefs(weapon), choice.injuryMode)
  if (choice.type === 'aim' && choice.targetId) return show(choice.targetId, enemyButtonDefs(weapon), 'aim')
  if (choice.type === 'assist') return show(choice.allyId, [{ id: 'assist', label: 'Assist', icon: 'assist' }], 'assist')
  if (['scan', 'persuade', 'intimidate'].includes(choice.type) && choice.targetId) return show(choice.targetId, enemyButtonDefs(weapon), choice.type)
  const support = SUPPORT_BUTTONS[choice.type]
  const unitId = choice.allyId ?? choice.targetId
  if (support && unitId) return show(unitId, [{ id: choice.type, ...support }], choice.type)
  return null
}

// The single button shown on the ally (or self) an AI party member Guards, gives First Aid to or Directs.
const SUPPORT_BUTTONS = {
  guard: { label: 'Guard', icon: 'guard' },
  firstAid: { label: 'First Aid', icon: 'firstAid' },
  direct: { label: 'Direct', icon: 'direct' },
}
const SHOWN_CHOICES = ['attack', 'aim', 'assist', 'scan', 'persuade', 'intimidate', ...Object.keys(SUPPORT_BUTTONS)]

// The party's next AI step in Auto Combat, when it is one that shows buttons (so it can be shown before it runs).
export function plannedChoice(state, partyAI) {
  if (state.outcome || state.pending) return null
  const active = getActiveCombatant(state)
  if (active.side !== 'player') return null
  const step = chooseAIStep(state, { partyAI })
  return SHOWN_CHOICES.includes(step.type) ? { ...step, actorId: active.id } : null
}

// The action just taken, for the buttons to stay up while its dice roll.
export function lastChoice(state) {
  const action = state.lastAction
  if (!action) return null
  const decision = state.lastDecision?.actorId === action.actorId ? state.lastDecision : null
  return action.type === 'aim' ? { ...action, targetId: decision?.targetId, weaponId: decision?.weaponId } : action
}

export function nearestOpponentId(state, combatant) {
  const opponents = getOpponents(state, combatant).sort((a, b) => tileDistance(combatant.position, a.position) - tileDistance(combatant.position, b.position))
  return opponents[0]?.id ?? null
}
