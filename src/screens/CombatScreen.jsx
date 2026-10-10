import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useDisplaySettings } from '../settings/DisplaySettingsContext.js'
import actionData from '../data/adaptation/combat/actions.json'
import { samePosition, tileKey } from '../combat/battleMap.js'
import {
  ACTION_TYPE_NAMES,
  actionTypeOf,
  ADAPTATION_MOMENTUM_SPENDS,
  previewFirstAid,
  previewGuard,
  previewScan,
  previewSocial,
  SOCIAL_KINDS,
  socialChance,
  isScanned,
  scanReport,
  visibleCondition,
  canAfford,
  AIM_TEXT,
  aimRerollsFor,
  awaitingDecision,
  canAim,
  canAmbush,
  canAssist,
  canMove,
  EXTRA_ACTIONS,
  getActiveCombatant,
  getMovementBlock,
  getHitChance,
  getMovementLeft,
  getOpponents,
  getTurnGroup,
  getTurnGroupRange,
  getTurnOf,
  isActive,
  isTurnFinished,
  previewAmbush,
  previewAttack,
  rollAwaitsPlayer,
  COMBAT_TASKS,
} from '../combat/combatState.js'
import { buildCombatView } from '../combat/combatView.js'
import { DEFAULT_ENCOUNTER_ID, getEncounter } from '../combat/encounters.js'
import { recommendPerformers } from '../rules/taskRecommendation.js'
import { prepareAssist } from '../rules/taskPreparation.js'
import { autoCombatReducer, chooseAIStep } from '../combat/autoCombat.js'
import { getMovementTiles, getSprintTiles } from '../combat/movementSystem.js'
import { tileDistance } from '../combat/rangeSystem.js'
import { getCombatantWeapon, getInjuryMode, getWeapon } from '../combat/weaponSystem.js'
import Battlefield from '../components/combat/Battlefield.jsx'
import CombatResultModal from '../components/combat/CombatResultModal.jsx'
import CombatSetup from '../components/combat/CombatSetup.jsx'
import { EndTurnButton, SelectedCharacterPanel, TargetPanel, TaskPanel } from '../components/combat/CombatSidebar.jsx'
import DebugPanel from '../components/combat/DebugPanel.jsx'
import HowToPlay from '../components/combat/HowToPlay.jsx'
import FatigueChoice from '../components/combat/FatigueChoice.jsx'
import InjuryChoice from '../components/combat/InjuryChoice.jsx'
import CounterattackChoice from '../components/combat/CounterattackChoice.jsx'
import { getCombatHint } from '../combat/combatHints.js'
import ObjectivesPanel from '../components/combat/ObjectivesPanel.jsx'
import PartyBar from '../components/combat/PartyBar.jsx'
import ResourceIndicators from '../components/combat/ResourceIndicators.jsx'
import RollPanel from '../components/combat/RollPanel.jsx'
import TurnOrderStrip from '../components/combat/TurnOrderStrip.jsx'
import AutoCombatControls from '../components/combat/AutoCombatControls.jsx'
import TurnBanner from '../components/combat/TurnBanner.jsx'
import useFadeAfter from '../components/useFadeAfter.js'
import MapFadeIn from '../components/maps/MapFadeIn.jsx'
import { MAX_SEED } from '../rules/seededRandom.js'
import WeatherFx from '../effects/WeatherFx.jsx'
import { weatherFor } from '../maps/mapWeather.js'

// Presentation delays only (divided by the Auto Combat speed). The combat itself never waits on them.
const AI_STEP_MS = 700
// Matches the combat-start-banner animation in styles.css.
const OPENING_BANNER_MS = 2400
const AI_ROLL_MS = 1100
const MOVE_TILE_MS = 140
// How long Auto Combat shows a party member's chosen button before the action runs.
const AI_CHOICE_MS = 900
const AUTO_END_TURN_MS = 1200
// The same beat the AI's rolls get, so the dice can be read before the result lands.
const AUTO_RESOLVE_MS = AI_ROLL_MS
// The acting character's own ring opens on mouse-over and closes this long after the mouse leaves both them and the ring,
// so the pointer can cross the gaps between buttons.
const SELF_RING_CLOSE_MS = 350
// A fight's seed is drawn when it starts (never during render) unless the player typed one in.
const newSeed = () => Math.floor(Math.random() * MAX_SEED)

// The delay before the next AI step: long enough to read a roll, or to watch a move finish.
function aiDelay(state) {
  if (state.pending) return AI_ROLL_MS
  // Just after the ambush roll (its log entry, plus the initiative, round and turn entries when spotted): time to read it.
  if (state.lastAction?.type === 'ambush' && state.log.length - state.lastAction.key <= (state.ambush.success ? 1 : 4)) return AI_ROLL_MS * 1.5
  const justMoved = state.lastMove && state.lastMove.key === state.log.length - 1
  return justMoved ? Math.max(AI_STEP_MS, (state.lastMove.path.length - 1) * MOVE_TILE_MS + 300) : AI_STEP_MS
}

// The camera centres on whoever is acting, and on the middle of the line of fire when a shot is fired.
function cameraFocus(state, turnKey, active) {
  // Stays on the shot through rerolls and the result (one attack per turn, so the key is stable until the next action).
  const action = state.lastAction
  const roll = state.pending ?? (state.result?.closed ? null : state.result)
  if (roll && ['attack', 'reroll', 'resolve', 'injury', 'ambush'].includes(action?.type)) {
    const from = state.combatants[roll.attackerId].position
    const to = state.combatants[roll.targetId].position
    return { key: `${turnKey}:shot`, position: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } }
  }
  return { key: `${turnKey}:${state.lastMove?.key ?? ''}`, position: active.position }
}

// Turn status of each active party member this round, for the party bar and the map:
// during the party's group turn each member is acting / ready / done with their used actions; once the group has
// finished (enemy turns later in the round) every member who acted is shown as done.
function getPartyTurnInfo(state, active) {
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
function turnBanner(state, previous) {
  const active = getActiveCombatant(state)
  const newRound = !previous || previous.round !== state.round
  const round = newRound ? `Round ${state.round}` : null
  if (state.directed) return { title: `${active.character.name}: Directed`, subtitle: `by ${state.combatants[state.directed.commanderId].character.name}`, side: 'player' }
  if (active.side === 'player') return { title: `${active.character.name}'s Turn`, subtitle: round, side: 'player' }
  if (newRound || previous.side !== 'enemy') return { title: 'Enemy Turn', subtitle: round, side: 'enemy' }
  return null
}

// A task's short label under a ring button: what it uses ("Control + Security") and its numbers ("TN 13 · D2").
// task: a prepared task with its final difficulty; opposed: the defender's roll can still change the Difficulty ("D2+").
const taskDetails = (task, { opposed = false, showDifficulty = true } = {}) => [
  `${task.attribute.name} + ${task.department.name}`,
  `TN ${task.targetNumber}${showDifficulty ? ` · D${task.difficulty}${opposed ? '+' : ''}` : ''}`,
]

// What a firing mode does, shown under its button: the attacker's roll (when known), the weapon's Severity, and +1 Threat
// for a mode that escalates (a party member's Deadly attack, charged when the attack resolves: combatState resolveAttack).
const attackModeDetails = (weapon, modeId, roll = null) => [
  ...(roll ? taskDetails(roll.task, { opposed: roll.opposed }) : []),
  `Severity ${weapon.severity}`,
  ...(getInjuryMode(modeId).generatesThreat ? ['+1 Threat'] : []),
]
// What the acting AI decided this round and the task it is rolling (or just rolled), for the Task panel in Auto Combat.
// An earlier roll by the same character shows only while it matches this round's decision.
function aiTurnTask(state, active) {
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

const attackModeName = (weapon, modeId) => `${weapon.name}: ${getInjuryMode(modeId).name} (Severity ${weapon.severity}${getInjuryMode(modeId).generatesThreat ? ', +1 Threat' : ''})`

// The buttons shown around an enemy: one per injury mode of the weapon (each fires), then Aim, Use Item, Scan, Persuade
// and Intimidate.
// roll: { task, opposed } the attack would use, for the button labels (null = labels without it).
const enemyButtonDefs = (weapon, roll = null) => [
  ...weapon.injuryModes.map((modeId) => ({ id: modeId, label: getInjuryMode(modeId).name, details: attackModeDetails(weapon, modeId, roll), icon: modeId === 'stun' ? 'stun' : 'deadly' })),
  { id: 'aim', label: 'Aim', icon: 'aim' },
  { id: 'useItem', label: 'Use Item', icon: 'useItem' },
  { id: 'scan', label: 'Scan', icon: 'scan' },
  { id: 'persuade', label: 'Persuade', icon: 'persuade' },
  { id: 'intimidate', label: 'Intimidate', icon: 'intimidate' },
]

const typeName = (actionId) => ACTION_TYPE_NAMES[actionTypeOf(actionId)]

// During Auto Combat, the buttons a party member's AI choice uses, with the choice lit (display only).
// choice: { actorId, type, targetId, weaponId, injuryMode, allyId } - an AI step about to run, or the action just taken.
// pressKey: set for a step about to run, so its button is shown being pressed (once per key) before it happens.
function choiceRing(state, choice, pressKey = null) {
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
  return null
}

// The party's next AI step in Auto Combat, when it is one that shows buttons (so it can be shown before it runs).
function plannedChoice(state, partyAI) {
  if (state.outcome || state.pending) return null
  const active = getActiveCombatant(state)
  if (active.side !== 'player') return null
  const step = chooseAIStep(state, { partyAI })
  return ['attack', 'aim', 'assist'].includes(step.type) ? { ...step, actorId: active.id } : null
}

// The action just taken, for the buttons to stay up while its dice roll.
function lastChoice(state) {
  const action = state.lastAction
  if (!action) return null
  const decision = state.lastDecision?.actorId === action.actorId ? state.lastDecision : null
  return action.type === 'aim' ? { ...action, targetId: decision?.targetId, weaponId: decision?.weaponId } : action
}

function nearestOpponentId(state, combatant) {
  const opponents = getOpponents(state, combatant).sort((a, b) => tileDistance(combatant.position, a.position) - tileDistance(combatant.position, b.position))
  return opponents[0]?.id ?? null
}

// Combat started in the exploration world (ExplorationScreen) also passes: onContinue (the result offers only Return to
// Exploration), bystanders (NPCs outside the fight, drawn where they stand), snapMarks (debug: world position -> cell),
// openingFocus (the camera starts on the encounter instead of the first to act), hiddenIds (enemies the party can't
// perceive now: not drawn, not in the turn order, and the camera doesn't follow them), lastKnownMarks, openingBanner
// ({ title, subtitle } shown as the fight starts) and children (drawn over the battle). debugOpen / onDebug: the world's
// own debug toggle, so the one Debug button also opens the world's link readout.
// objects (combat in the world): the challenge objects, { list: [{ definition, actions: [{ action, available, reason,
// cost, affordable }] }] in reach of whoever acts, preview(objectId, actionId) -> { prepared, assist } (the object's own
// task math), marks: [{ id, name, position, stateLabel, inReach }] to draw }. Their actions dispatch { type: 'interact' }.
export function Battle({
  state,
  dispatch,
  showHelpOnStart,
  onHelpSeen,
  partyAI,
  onPartyAI,
  enemyAI,
  onEnemyAI,
  onRestart,
  onChangeCharacter,
  onExit,
  onContinue = null,
  bystanders = [],
  snapMarks = null,
  openingFocus = null,
  hiddenIds = null,
  lastKnownMarks = null,
  openingBanner = null,
  objects = null,
  debugOpen: worldDebugOpen = null,
  onDebug = null,
  worldActors = null,
  children = null,
}) {
  // Settings > Help Hints off: the hint text goes (the Ambush button that shares its box stays).
  const showHints = useDisplaySettings().helpHints
  const active = getActiveCombatant(state)
  // The opening banner plays before anything else: the AI waits and the first turn banner follows it.
  const [openingDone, setOpeningDone] = useState(!openingBanner)
  useEffect(() => {
    if (openingDone) return undefined
    const timer = setTimeout(() => setOpeningDone(true), OPENING_BANNER_MS)
    return () => clearTimeout(timer)
  }, [openingDone])
  // Auto Combat (UI state): 'off' | 'running' | 'paused'. While on, the AI also plays the party.
  const [auto, setAuto] = useState('off')
  const [speed, setSpeed] = useState(1)
  const aiControlled = active.controller === 'ai' || auto !== 'off'
  const isPlayerTurn = !aiControlled && !state.outcome
  // UI state only: the chosen action, target, weapon, injury mode, move destination, hovered tile, panels and camera follow.
  // chosenMode null = the default (Move while it is still possible); 'none' = the player deselected everything.
  const [chosenMode, setMode] = useState(null)
  const defaultMode = isPlayerTurn && canMove(state, active) ? 'move' : null
  const ambushOpen = isPlayerTurn && canAmbush(state)
  const chosen = chosenMode === 'ambush' && !ambushOpen ? null : chosenMode
  const mode = chosen === 'none' ? null : (chosen ?? defaultMode)
  const [targetId, setTargetId] = useState(null)
  const [weaponIds, setWeaponIds] = useState({})
  // The unit whose action buttons are shown on the map (clicked enemy or party member), and whether its Info card is open.
  const [ringId, setRingId] = useState(null)
  const [ringInfo, setRingInfo] = useState(false)
  const [destination, setDestination] = useState(null)
  const [assistAllyId, setAssistAllyId] = useState(null)
  const [hoverTile, setHoverTile] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [ownDebugOpen, setOwnDebugOpen] = useState(false)
  const debugOpen = worldDebugOpen ?? ownDebugOpen
  const toggleDebug = onDebug ?? (() => setOwnDebugOpen(!ownDebugOpen))
  const [followCamera, setFollowCamera] = useState(true)
  const [helpOpen, setHelpOpen] = useState(showHelpOnStart)
  // Bonus d20s to buy for the next attack (Buy d20s): { bonusDice, momentum paid }; reset each turn and after each attack.
  const [dicePurchase, setDicePurchase] = useState({ bonusDice: 0, momentum: 0 })
  // What the Guard / First Aid / Direct / object task is aimed at (a combatant id, "id:revive", or "objectId:actionId").
  const [taskPick, setTaskPick] = useState(null)
  // The firing mode (an injury mode id) picked from the acting character's ring for the next attack; it rides on the
  // attack when it is fired and never changes the weapon itself.
  const [attackChoice, setAttackChoice] = useState(null)
  const closeHelp = () => {
    setHelpOpen(false)
    onHelpSeen()
  }

  const weapon = getCombatantWeapon(active, weaponIds[active.id] ?? active.weaponIds[0])
  const target = targetId && isActive(state.combatants[targetId]) ? state.combatants[targetId] : null
  const attackMode = mode === 'attack' && attackChoice && weapon.injuryModes.includes(attackChoice) ? attackChoice : null
  if (attackChoice && !attackMode) setAttackChoice(null)

  // Each turn starts on the default action (Move) with the nearest enemy targeted.
  // The active id is part of the key because a spotted ambush reorders initiative, which can leave turnIndex unchanged.
  const turnKey = `${state.round}:${state.turnIndex}:${active.id}`
  const [shownTurn, setShownTurn] = useState(() => ({ key: turnKey, round: state.round, side: active.side }))
  const [banner, setBanner] = useState(() => ({ key: turnKey, ...turnBanner(state, null) }))
  if (shownTurn.key !== turnKey) {
    setShownTurn({ key: turnKey, round: state.round, side: active.side })
    const next = turnBanner(state, shownTurn)
    if (next) setBanner({ key: turnKey, ...next })
    setMode(null)
    setDestination(null)
    setRingId(null)
    setRingInfo(false)
    setDicePurchase({ bonusDice: 0, momentum: 0 })
    setTaskPick(null)
    if (active.controller === 'player') setTargetId(nearestOpponentId(state, active))
  }
  if (isPlayerTurn && !target && targetId !== nearestOpponentId(state, active)) setTargetId(nearestOpponentId(state, active))

  // In Auto Combat, a party member's next Attack, Aim or Assist is shown (its button lit) for a beat before it runs.
  const planned = useMemo(() => (auto !== 'off' ? plannedChoice(state, partyAI) : null), [auto, state, partyAI])

  // AI turns (enemies, plus the party during Auto Combat): one step at a time, paced so it can be followed.
  // Paused while How to Play is open, the opening banner plays or Auto Combat is paused. The step itself is pure
  // (autoCombat.stepAI).
  const hasPlan = Boolean(planned)
  useEffect(() => {
    if (state.outcome || !aiControlled || helpOpen || !openingDone || auto === 'paused') return undefined
    // An Injury on a party member waits for the player's Avoid Injury choice, a new Fatigue for the attribute choice, a
    // won opposed attack for the Counterattack choice (outside Auto Combat).
    if (awaitingDecision(state) && auto === 'off') return undefined
    const timer = setTimeout(() => dispatch({ type: 'aiStep', partyAI, enemyAI, partyAuto: auto !== 'off' }), (aiDelay(state) + (hasPlan ? AI_CHOICE_MS : 0)) / speed)
    return () => clearTimeout(timer)
  }, [state, aiControlled, dispatch, helpOpen, openingDone, auto, speed, hasPlan, partyAI, enemyAI])

  // Everything the HUD shows about this moment: movement range, the attack preview, who can be guarded, treated,
  // directed or assisted, and why an action is closed. Worked out in combat/combatView.js so this screen keeps only its
  // UI state, handlers and layout.
  const {
    moveKind, reachable, movePath, routeInCover, overlay,
    preview, targetAttack, ringAttackRoll, attackBlock, targetInRange, purchase, purchaseCheck,
    ambushPreview, ambusher, ambushTargets,
    assistAllies, assistAlly, assistHelper,
    objectList, guardTargets, firstAidOptions, authority, isCommander, directAllies, directReason,
    extraMinorReason, secondMajorReason, availability, unavailableReasons,
  } = buildCombatView({ state, active, isPlayerTurn, mode, target, weapon, destination, hoverTile, dicePurchase, ringId, ambushOpen, assistAllyId, objectList: objects?.list ?? [] })
  const describeAssist = (assist) =>
    assist && { name: state.combatants[assist.helperId].character.name, label: assist.via === 'direct' ? 'Direct: Control + Command' : 'Assist', task: assist.task }
  const fromPreview = (task, focusOptions = []) => ({ label: task.label, cost: typeName(task.kind), prepared: task.prepared, assist: describeAssist(task.assist), available: task.available, reason: task.reason, focusOptions })
  let combatTask = null
  let taskConfirm = null
  let taskConfirmLabel = null
  if (isPlayerTurn && mode === 'guard') {
    const guardId = taskPick ?? active.id
    const task = previewGuard(state, active.id, guardId)
    combatTask = {
      intro: actionData.actions.find((entry) => entry.id === 'guard').description,
      picker: { label: 'Who to guard', options: guardTargets.map((unit) => ({ id: unit.id, label: unit.id === active.id ? 'Yourself' : unit.character.name })), value: guardId, onPick: setTaskPick },
      task: fromPreview(task, COMBAT_TASKS.guard.focuses),
    }
    taskConfirm = { enabled: task.available && purchaseCheck.valid, run: () => dispatch({ type: 'guard', targetId: guardId, purchase }) }
  }
  if (isPlayerTurn && mode === 'firstAid') {
    const pick = taskPick ?? (firstAidOptions[0] ? `${firstAidOptions[0].target.id}:${firstAidOptions[0].mode}` : null)
    // "targetId:mode", where a treat mode is itself "treat:<injury id>".
    const split = pick ? pick.indexOf(':') : -1
    const [aidTargetId, aidMode] = pick ? [pick.slice(0, split), pick.slice(split + 1)] : [null, null]
    const task = pick ? previewFirstAid(state, active.id, aidTargetId, aidMode) : null
    combatTask = {
      intro: actionData.actions.find((entry) => entry.id === 'firstAid').description,
      picker: {
        label: 'Who to treat',
        options: firstAidOptions.map((option) => ({
          id: `${option.target.id}:${option.mode}`,
          label: `${option.label} (Difficulty ${option.difficulty})`,
          title: option.injury ? `Treat Injury = Difficulty ${option.difficulty} (its severity). Treated: no penalty, still an Injury.` : 'Revive = Difficulty 2. No longer Defeated; the Injury stays.',
        })),
        value: pick,
        onPick: setTaskPick,
      },
      task: task ? fromPreview(task, COMBAT_TASKS.firstAidRevive.focuses) : { reason: 'Nobody within Reach needs First Aid.' },
    }
    taskConfirm = { enabled: Boolean(task?.available) && purchaseCheck.valid, run: () => dispatch({ type: 'firstAid', targetId: aidTargetId, mode: aidMode, purchase }) }
  }
  if (isPlayerTurn && mode === 'scan' && target) {
    const task = previewScan(state, active.id, target.id)
    combatTask = {
      intro: actionData.actions.find((entry) => entry.id === 'scan').description,
      task: fromPreview(task, COMBAT_TASKS.scan.focuses),
    }
    taskConfirm = {
      enabled: task.available && purchaseCheck.valid,
      run: () => {
        dispatch({ type: 'scan', targetId: target.id, purchase })
        setMode('attack')
        setRingInfo(true)
      },
    }
    taskConfirmLabel = 'Scan'
  }
  if (isPlayerTurn && SOCIAL_KINDS.includes(mode) && target) {
    const task = previewSocial(state, active.id, target.id, mode)
    const { resist } = task
    const name = target.character.name
    const lowered = task.penalty ? ` less ${task.penalty} (${task.prepared.difficultyLines.map((line) => line.label).join(', ')})` : ''
    const resistExtra = resist.extra ? `, then +${resist.extra} (${resist.prepared.difficultyLines.map((line) => line.label).join(', ')})` : ''
    combatTask = {
      intro: actionData.actions.find((entry) => entry.id === mode).description,
      // The asker's own Difficulty changes lower the Difficulty it sets (Book p.256), so the panel shows them in the note.
      task: fromPreview({ ...task, prepared: { ...task.prepared, difficulty: 0, difficultyLines: [] } }, COMBAT_TASKS[mode].focuses),
      note: `Opposed: your successes${lowered} set the Difficulty${resistExtra}. ${name} resists with ${resist.task.attribute.name} + ${resist.task.department.name} (TN ${resist.task.targetNumber}). Chance it gives way: ${Math.round(socialChance(task, purchaseCheck.dice) * 100)}%.`,
    }
    taskConfirm = {
      enabled: task.available && purchaseCheck.valid,
      run: () => {
        dispatch({ type: mode, targetId: target.id, purchase })
        setDicePurchase({ bonusDice: 0, momentum: 0 })
        setMode('attack')
      },
    }
    taskConfirmLabel = actionData.actions.find((entry) => entry.id === mode).name
  }
  if (isPlayerTurn && mode === 'direct' && isCommander) {
    const allyId = taskPick ?? directAllies[0]?.id ?? null
    combatTask = {
      intro: `Authority: ${authority.reason}. Spend 1 Momentum (pool ${state.resources.momentum}): the ally takes one Major action at once, and ${active.character.name} assists it with Control + Command.`,
      picker: { label: 'Ally to direct', options: directAllies.map((ally) => ({ id: ally.id, label: ally.character.name })), value: allyId, onPick: setTaskPick },
      task: directReason ? { reason: directReason } : null,
    }
    taskConfirm = { enabled: !directReason && Boolean(allyId), run: () => dispatch({ type: 'direct', allyId }) }
  }
  if (isPlayerTurn && mode === 'interact') {
    const entries = objectList.flatMap(({ definition, actions }) => actions.map((entry) => ({ definition, ...entry })))
    const firstOpen = entries.find((entry) => entry.available && entry.affordable) ?? entries[0]
    const pick = taskPick ?? (firstOpen ? `${firstOpen.definition.id}:${firstOpen.action.id}` : null)
    const chosen = entries.find((entry) => `${entry.definition.id}:${entry.action.id}` === pick) ?? null
    const objectPreview = chosen ? objects.preview(chosen.definition.id, chosen.action.id) : null
    const prepared = objectPreview?.prepared ?? null
    const block = !chosen
      ? 'Nothing in reach.'
      : !chosen.available
        ? chosen.reason
        : !chosen.affordable
          ? `No ${ACTION_TYPE_NAMES[chosen.cost]} action left.`
          : prepared && !prepared.possible
            ? prepared.blockers.join('; ')
            : null
    combatTask = {
      intro: chosen?.action.description ?? null,
      picker: {
        label: 'Object action',
        options: entries.map((entry) => ({
          id: `${entry.definition.id}:${entry.action.id}`,
          label: `${entry.definition.name}: ${entry.action.label} (${ACTION_TYPE_NAMES[entry.cost]}${entry.action.kind === 'createTrait' ? ', Create Trait' : ''})`,
          title: entry.available ? entry.action.description : entry.reason,
        })),
        value: pick,
        onPick: setTaskPick,
      },
      task: prepared
        ? { label: chosen.action.label, cost: ACTION_TYPE_NAMES[chosen.cost], prepared, assist: describeAssist(objectPreview.assist), available: !block, reason: block, focusOptions: chosen.action.task?.focuses ?? [] }
        : { reason: block },
      routine: Boolean(chosen) && !prepared,
      note: chosen && !prepared && block ? block : null,
      // Guidance only: who in the party (with the action's cost still left this round) has the best odds at this task.
      recommendation: prepared
        ? recommendPerformers(
            Object.values(state.combatants)
              .filter((c) => c.side === 'player' && isActive(c) && !isTurnFinished(state, c.id) && getTurnOf(state, c.id)[chosen.cost] > 0)
              .map((c) => ({ id: c.id, prepared: objects.compare(chosen.definition.id, chosen.action.id, c.id).prepared })),
          )
        : null,
      nameOf: (id) => state.combatants[id]?.character.name ?? id,
    }
    taskConfirm = {
      enabled: Boolean(chosen) && !block && (!prepared || purchaseCheck.valid),
      run: () => dispatch({ type: 'interact', objectId: chosen.definition.id, actionId: chosen.action.id, purchase: prepared ? purchase : undefined }),
    }
    taskConfirmLabel = prepared ? 'Attempt' : 'Use'
  }
  if (isPlayerTurn && attackMode) {
    taskConfirm = { enabled: Boolean(target) && !attackBlock && canAfford(state, active, 'attack'), run: () => fireAttack(target.id, attackMode) }
    taskConfirmLabel = 'Fire'
  }
  const openTask = (taskMode, pick = null) => {
    setMode(taskMode)
    setTaskPick(pick)
    setDestination(null)
    closeRing()
  }
  const closeRing = () => {
    setRingId(null)
    setRingInfo(false)
  }

  const selectAction = (id) => {
    if (id === 'endTurn') {
      dispatch({ type: 'endTurn' })
      return
    }
    setMode(mode === id ? 'none' : id)
    setDestination(null)
    setAssistAllyId(id === 'assist' && assistAllies.length === 1 ? assistAllies[0].id : null)
    closeRing()
  }

  const confirmations = {
    move: { enabled: Boolean(movePath) && availability.move, run: () => dispatch({ type: 'move', destination: movePath[movePath.length - 1] }) },
    sprint: { enabled: Boolean(movePath) && availability.sprint, run: () => dispatch({ type: 'sprint', destination: movePath[movePath.length - 1] }) },
    assist: { enabled: Boolean(assistAlly) && availability.assist, run: () => dispatch({ type: 'assist', allyId: assistAlly.id }) },
    ...(taskConfirm ? { [mode]: taskConfirm } : {}),
  }
  const confirmation = confirmations[mode]
  // Move and Sprint commit by clicking a tile, so Confirm is only shown for a task being set up (or Assist's ally pick).
  const confirm = {
    shown: Boolean(taskConfirm) || mode === 'assist',
    enabled: Boolean(confirmation?.enabled),
    onConfirm: () => {
      confirmation.run()
      setMode(null)
      setDestination(null)
      setTaskPick(null)
      if (taskConfirm) setDicePurchase({ bonusDice: 0, momentum: 0 })
      closeRing()
    },
  }

  // With Move selected (the default), clicking a reachable tile moves there at once.
  // Prototype: a finger has no hover preview, so on touch the first tap shows the path and a second tap on the same
  // tile moves; a mouse click moves at once.
  const handleTileClick = (tile, { touch = false } = {}) => {
    // With buttons shown around a unit, or a firing mode chosen, a click on the floor just puts them away (back to Move).
    if (ring || mode === 'ambush' || attackMode) {
      closeRing()
      setMode(null)
      return
    }
    if (!moveKind || !availability[moveKind] || !reachable?.has(tileKey(tile)) || samePosition(tile, active.position)) return
    if (touch && !(destination && samePosition(destination, tile))) {
      setDestination(tile)
      return
    }
    dispatch({ type: moveKind, destination: tile })
    setMode(null)
    setDestination(null)
    closeRing()
  }

  // During the party's turn, picking a party member who can still act hands them the turn.
  const groupIds = isPlayerTurn ? getTurnGroup(state) : []
  const canSwitchTo = (id) => id !== active.id && !state.pending && !state.directed && groupIds.includes(id) && !isTurnFinished(state, id)
  const turnInfo = getPartyTurnInfo(state, active)

  // With both actions used the turn passes on by itself (to the next Ready member, else to the enemies), after a pause so the result
  // can be read; never waiting for End Turn.
  const turnUsedUp = isPlayerTurn && isTurnFinished(state, active.id) && !state.pending && !awaitingDecision(state)
  const autoEndMs = AUTO_END_TURN_MS
  // An extra action (Extra Minor, Second Major) can still be bought: the character's own ring stays available, and the
  // turn waits while it is open.
  const extraBuyable = !extraMinorReason || !secondMajorReason
  const holdingForExtra = turnUsedUp && extraBuyable && ringId === active.id
  // Whoever End Turn hands over to: the first unfinished group member after the active one (as in the endTurn reducer).
  const nextMemberId = groupIds.find((id) => id !== active.id && !isTurnFinished(state, id)) ?? null
  useEffect(() => {
    if (!turnUsedUp || helpOpen || holdingForExtra) return undefined
    const timer = setTimeout(() => dispatch({ type: 'endTurn' }), autoEndMs)
    return () => clearTimeout(timer)
  }, [turnUsedUp, helpOpen, holdingForExtra, autoEndMs, dispatch])

  // A rolled player attack resolves on its own after a beat to read the dice, unless it would miss and a reroll is open.
  const autoResolve = isPlayerTurn && Boolean(state.pending) && state.combatants[state.pending.attackerId].side === 'player' && !rollAwaitsPlayer(state)
  useEffect(() => {
    if (!autoResolve || helpOpen) return undefined
    const timer = setTimeout(() => dispatch({ type: 'resolveAttack' }), AUTO_RESOLVE_MS)
    return () => clearTimeout(timer)
  }, [autoResolve, helpOpen, dispatch, state.pending])

  const selectPartyMember = (id) => {
    if (canSwitchTo(id)) {
      dispatch({ type: 'selectCombatant', combatantId: id })
      setSelectedId(null)
      return
    }
    setSelectedId(id)
  }

  const canOpenSelfRing = isPlayerTurn && !state.pending && (!turnUsedUp || extraBuyable)
  const selfRingCloseTimer = useRef(null)
  // True while the ring was opened by mouse-over, so the click that usually follows doesn't toggle it shut.
  const hoverOpenedRef = useRef(false)
  const cancelSelfRingClose = () => clearTimeout(selfRingCloseTimer.current)
  useEffect(() => () => clearTimeout(selfRingCloseTimer.current), [])
  const hoverSelfRing = (entering) => {
    cancelSelfRingClose()
    if (entering) return
    selfRingCloseTimer.current = setTimeout(() => {
      hoverOpenedRef.current = false
      setRingId((current) => (current === active.id ? null : current))
    }, SELF_RING_CLOSE_MS)
  }
  const handleUnitHover = (id, entering) => {
    if (id !== active.id) return
    if (entering && canOpenSelfRing) {
      cancelSelfRingClose()
      if (ringId !== id) hoverOpenedRef.current = true
      setRingId(id)
      setRingInfo(false)
      return
    }
    if (ringId === id) hoverSelfRing(entering)
  }

  // On the player's turn, clicking an enemy or another party member shows action buttons around them (a second click
  // puts them away). The enemy becomes the target with its attack previewed; a party member is picked for Assist.
  const handleUnitClick = (id) => {
    const unit = state.combatants[id]
    const toggleRing = (ringMode) => {
      const closing = ringId === id
      setRingId(closing ? null : id)
      setRingInfo(false)
      setMode(closing ? null : ringMode)
      setDestination(null)
      return !closing
    }
    // Clicking the acting character shows their own actions around them; the current action (Move) stays selected.
    if (id === active.id && canOpenSelfRing) {
      cancelSelfRingClose()
      setSelectedId(id)
      const keepHoverOpened = hoverOpenedRef.current
      hoverOpenedRef.current = false
      setRingId(ringId === id && !keepHoverOpened ? null : id)
      setRingInfo(false)
      return
    }
    if (unit.side === active.side) {
      const offersActions = isPlayerTurn && !state.pending && id !== active.id && (canAssist(state, active, unit) || canSwitchTo(id))
      if (!offersActions) {
        selectPartyMember(id)
        return
      }
      setSelectedId(id)
      const opened = toggleRing('assist')
      setAssistAllyId(opened && canAssist(state, active, unit) ? id : null)
      return
    }
    setSelectedId(id)
    if (!isPlayerTurn) return
    setTargetId(id)
    // Choosing whom to ambush: the Klingon shows only the Ambush button, and the mode stays on Ambush.
    if (mode === 'ambush') {
      setRingId(ringId === id ? null : id)
      setRingInfo(false)
      return
    }
    toggleRing('attack')
  }

  const startAmbush = () => {
    setMode(mode === 'ambush' ? 'none' : 'ambush')
    setDestination(null)
    closeRing()
  }

  useEffect(() => {
    if (mode !== 'ambush') return undefined
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      setMode(null)
      setRingId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  const ambushRingButtons = (enemy) => {
    const ambush = previewAmbush(state, enemy.id)
    const percent = `${Math.round(ambush.chance * 100)}%`
    return [
      {
        id: 'ambush',
        label: `Ambush (free) ${percent}`,
        icon: 'ambush',
        enabled: ambush.available,
        title: ambush.available
          ? `${ambush.ambusher.character.name} ambushes ${enemy.character.name}: TN ${ambush.task.targetNumber}, Difficulty 1, ${percent} chance. Success: an automatic hit (an Injury). Failure: the Klingons act first.`
          : ambush.reason,
        onClick: () => {
          dispatch({ type: 'ambush', targetId: enemy.id })
          closeRing()
          setMode(null)
        },
      },
    ]
  }

  const aimEffect = aimRerollsFor(weapon) > 1 ? `may reroll up to two dice on the next attack this turn (${weapon.name} is Accurate)` : AIM_TEXT
  const aimTitle = state.turn.aimReroll ? `Aimed: you ${aimEffect}.` : `Aim (${typeName('aim')} action): you ${aimEffect}.`

  const cycleWeapon = () => {
    const index = active.weaponIds.indexOf(weapon.id)
    setWeaponIds({ ...weaponIds, [active.id]: active.weaponIds[(index + 1) % active.weaponIds.length] })
  }

  const fireAttack = (enemyId, injuryMode) => {
    dispatch({ type: 'attack', targetId: enemyId, weaponId: weapon.id, injuryMode, purchase })
    setDicePurchase({ bonusDice: 0, momentum: 0 })
    setAttackChoice(null)
  }

  // Scan shows what is in plain view at once; on an enemy not yet scanned it also sets up the Scan task (Confirm rolls it).
  // Once scanned, it only shows and hides the card, which then holds everything the scan found.
  const scanButton = (enemy) => {
    const scanned = isScanned(state, enemy.id)
    const setUp = mode === 'scan' && ringInfo
    const scanTask = !scanned && previewScan(state, active.id, enemy.id)
    return {
      enabled: true,
      active: ringInfo,
      ...(scanTask ? { details: taskDetails(scanTask.task) } : {}),
      title: scanned
        ? 'Show what the scan found: Protection, weapons and tactics.'
        : `Scan (${typeName('scan')} action): Reason + Science, Difficulty ${scanTask.task.difficulty}. Success shows its Protection, weapons and tactics for the rest of the fight.`,
      onClick: () => {
        if (scanned || setUp) {
          setRingInfo(!ringInfo)
          if (setUp) setMode('attack')
          return
        }
        setMode('scan')
        setTaskPick(enemy.id)
        setRingInfo(true)
      },
    }
  }

  // Persuade / Intimidate set up the task on this enemy (Confirm rolls it); pressing the lit button again cancels.
  const socialButton = (enemy, kind) => {
    const task = previewSocial(state, active.id, enemy.id, kind)
    const setUp = mode === kind
    return {
      enabled: task.available || setUp,
      active: setUp,
      details: [`${task.task.attribute.name} + ${task.task.department.name}`, `TN ${task.task.targetNumber}`],
      title: task.available ? `${actionData.actions.find((entry) => entry.id === kind).description} (${typeName(kind)} action)` : task.reason,
      onClick: () => {
        setMode(setUp ? 'attack' : kind)
        setTaskPick(enemy.id)
        setRingInfo(false)
      },
    }
  }

  const enemyRingButtons = (enemy) => {
    const behaviour = {
      persuade: socialButton(enemy, 'persuade'),
      intimidate: socialButton(enemy, 'intimidate'),
      aim: {
        enabled: canAim(state, active),
        active: state.turn.aimReroll,
        title: aimTitle,
        onClick: () => dispatch({ type: 'aim' }),
      },
      useItem: { enabled: false, active: false, title: 'Use Item: not built yet.', onClick: undefined },
      scan: scanButton(enemy),
    }
    const shot = enemy.id === targetAttack?.target.id ? targetAttack : previewAttack(state, active.id, enemy.id, weapon.id)
    return enemyButtonDefs(weapon, { task: shot.task, opposed: Boolean(shot.opposition) }).map((button) => ({
      ...button,
      ...(behaviour[button.id] ?? {
        enabled: !attackBlock && canAfford(state, active, 'attack'),
        active: attackMode === button.id,
        title: attackBlock ?? `Fire ${attackModeName(weapon, button.id)} (${typeName('attack')} action)${purchase.bonusDice ? `, rolling ${purchaseCheck.dice}d20` : ''}.`,
        onClick: () => fireAttack(enemy.id, button.id),
      }),
    }))
  }

  const enemyRingInfo = (enemy) => {
    const rows = [
      ['Condition', visibleCondition(state, enemy)],
      ['Cover', enemy.inCover ? 'In cover' : 'No cover'],
    ]
    const report = isScanned(state, enemy.id) ? scanReport(state, active, enemy) : null
    if (report) rows.push(...report.rows)
    else rows.push(['Scan', 'Not scanned'])
    if (preview?.injuries) preview.injuries.forEach((injury) => rows.push([`On a hit (${getInjuryMode(injury.type).name})`, `Severity ${injury.severity}${injury.protection ? ` (Protection ${injury.protection})` : ''}`]))
    if (preview?.task) {
      rows.push(['Range', `${preview.band.name}, ${preview.distance} tiles`], ['Your roll', `TN ${preview.task.targetNumber}, Difficulty ${preview.task.difficulty}`])
      if (state.turn.aimReroll) rows.push(['Aimed', aimRerollsFor(preview.weapon) > 1 ? 'reroll up to two dice (Accurate)' : 'reroll one die'])
      if (purchase.bonusDice) rows.push(['Dice', `${purchaseCheck.dice}d20 (${purchase.bonusDice} bought)`])
      rows.push(['Chance to hit', preview.available ? `${Math.round(getHitChance(state, active.id, preview, { bonusDice: purchase.bonusDice }) * 100)}%` : 'No shot'])
      if (preview.available && preview.opposition) rows.push([preview.opposition.when === 'targetInCover' ? 'In cover' : 'Defends', 'their opposed roll is counted in the chance'])
    }
    return { title: enemy.character.name, rows, tips: report?.tips ?? [] }
  }

  const allyRingButtons = (ally) => {
    const name = ally.character.name
    const assistBlock = !canAssist(state, active, ally)
      ? state.assists[ally.id]
        ? `${name} is already being assisted this round.`
        : `${name} has no turn left this round.`
      : canAfford(state, active, 'assist')
        ? null
        : 'No Major action left.'
    const buttons = [
      {
        id: 'assist',
        label: 'Assist',
        icon: 'assist',
        enabled: !assistBlock,
        title: assistBlock ?? `Assist (Major action): ${name}'s next task this round adds your 1d20.`,
        onClick: () => {
          dispatch({ type: 'assist', allyId: ally.id })
          closeRing()
          setMode(null)
        },
      },
    ]
    if (canSwitchTo(ally.id)) {
      buttons.push({
        id: 'switch',
        label: 'Switch',
        icon: 'switch',
        enabled: true,
        title: `Hand the turn to ${name}; ${active.character.name} keeps any actions left for later this turn.`,
        onClick: () => {
          closeRing()
          setMode(null)
          selectPartyMember(ally.id)
        },
      })
    }
    return buttons
  }

  const selfRingButtons = () => {
    const behaviour = {
      move: {
        enabled: availability.move,
        active: mode === 'move',
        title: availability.move ? 'Move (Minor action): click a highlighted tile to walk there.' : (getMovementBlock(state, active, 'move') ?? 'No tile to move to.'),
        onClick: () => {
          setMode('move')
          setDestination(null)
          closeRing()
        },
      },
      sprint: {
        enabled: availability.sprint,
        active: mode === 'sprint',
        title: availability.sprint
          ? `Sprint (Major action): run up to ${getSprintTiles(active.character)} tiles; no Move this turn after it. Click a highlighted tile.`
          : (getMovementBlock(state, active, 'sprint') ?? 'No tile to sprint to.'),
        onClick: () => {
          setMode('sprint')
          setDestination(null)
          closeRing()
        },
      },
      aim: {
        enabled: canAim(state, active),
        active: state.turn.aimReroll,
        title: aimTitle,
        onClick: () => dispatch({ type: 'aim' }),
      },
      assist: {
        enabled: availability.assist,
        title: unavailableReasons.assist ?? (availability.assist ? 'Assist (Major action): pick a party member; their next task this round adds your 1d20.' : 'No Major action left.'),
        onClick: () => selectAction('assist'),
      },
      guard: {
        enabled: canAfford(state, active, 'guard'),
        active: mode === 'guard',
        title: canAfford(state, active, 'guard') ? 'Guard (Major action): Insight + Security; attacks against you, or an ally within Reach, get +1 Difficulty.' : 'No Major action left.',
        onClick: () => openTask('guard'),
      },
      firstAid: {
        enabled: canAfford(state, active, 'firstAid'),
        active: mode === 'firstAid',
        title: canAfford(state, active, 'firstAid') ? 'First Aid (Major action): Daring + Medicine on an ally within Reach.' : 'No Major action left.',
        onClick: () => openTask('firstAid'),
      },
      direct: {
        enabled: !directReason,
        active: mode === 'direct',
        title: directReason ?? 'Direct (Major action, 1 Momentum): an ally takes one Major action now; you assist with Control + Command.',
        onClick: () => openTask('direct'),
      },
      interact: {
        enabled: objectList.some(({ actions }) => actions.some((entry) => entry.available && entry.affordable)),
        active: mode === 'interact',
        title: `Use an object in reach: ${objectList.map(({ definition }) => definition.name).join(', ')}.`,
        onClick: () => openTask('interact'),
      },
      extraMinor: {
        enabled: !extraMinorReason,
        title: extraMinorReason ?? `Extra Minor (${EXTRA_ACTIONS.extraMinorCost} Momentum, pool ${state.resources.momentum}): one more minor action this turn (once per turn; not a minor action already taken).`,
        onClick: () => dispatch({ type: 'buyExtraMinor' }),
      },
      secondMajor: {
        enabled: !secondMajorReason,
        title:
          secondMajorReason ??
          `Second Major (${EXTRA_ACTIONS.secondMajorCost} Momentum, pool ${state.resources.momentum}): one more major action this turn; its task is +${EXTRA_ACTIONS.secondMajorDifficulty} Difficulty.`,
        onClick: () => dispatch({ type: 'buySecondMajor' }),
      },
      endTurn: {
        enabled: availability.endTurn,
        title: state.directed ? 'Pass on the directed action (the Momentum stays spent).' : 'End Turn (free): end this character\'s turn with any actions left unused.',
        onClick: () => {
          closeRing()
          dispatch({ type: 'endTurn' })
        },
      },
    }
    // Contextual actions appear only when there is something to do: someone within Reach to treat, the authority to
    // Direct, an object in reach, an extra action that can be bought now.
    const notNow = { firstAid: !firstAidOptions.length, direct: !isCommander, interact: !objectList.length, extraMinor: Boolean(extraMinorReason), secondMajor: Boolean(secondMajorReason) }
    // Attack: one button per firing mode the weapon's data allows (Stun, Deadly or both). Picking one only chooses the
    // mode; the attack is fired at the target from the task panel (or the enemy's own buttons).
    const attackButtons = () => {
      const affordable = canAfford(state, active, 'attack')
      return weapon.injuryModes.map((modeId) => ({
        id: `attack-${modeId}`,
        label: getInjuryMode(modeId).name,
        details: attackModeDetails(weapon, modeId, ringAttackRoll),
        icon: modeId === 'stun' ? 'stun' : 'deadly',
        tone: modeId,
        enabled: affordable,
        active: attackMode === modeId,
        title: affordable ? `Attack with ${attackModeName(weapon, modeId)} (${typeName('attack')} action): then pick the target and Fire.` : 'No Major action left.',
        onClick: () => {
          const leaving = attackMode === modeId
          setAttackChoice(leaving ? null : modeId)
          setMode(leaving ? null : 'attack')
          setDestination(null)
          closeRing()
        },
      }))
    }
    // The roll a task button would make, under its label; the task panel explains it in full.
    const preparedDetails = (prepared) => taskDetails({ ...prepared.task, difficulty: prepared.difficulty })
    const details = {
      guard: () => preparedDetails(previewGuard(state, active.id, active.id).prepared),
      firstAid: () => preparedDetails(previewFirstAid(state, active.id, firstAidOptions[0].target.id, firstAidOptions[0].mode).prepared),
      direct: () => taskDetails(prepareAssist(active.character, COMBAT_TASKS.directAssist, active.condition).task, { showDifficulty: false }),
    }
    return actionData.selfRing.filter((id) => !notNow[id]).flatMap((id) => {
      if (id === 'attack') return attackButtons()
      const action = actionData.actions.find((entry) => entry.id === id)
      return {
        id,
        label: action.name,
        icon: id,
        ...(details[id] ? { details: details[id]() } : {}),
        ...(behaviour[id] ?? { enabled: false, title: `${action.name}: not in this prototype yet.` }),
      }
    })
  }

  const ringUnit = ringId ? state.combatants[ringId] : null
  const ringShown = isPlayerTurn && ringUnit && isActive(ringUnit) && !state.pending && (!turnUsedUp || (extraBuyable && ringUnit.id === active.id))
  let ring = null
  if (ringShown && ringUnit.id === active.id) {
    ring = { unitId: ringUnit.id, buttons: selfRingButtons(), info: null }
  } else if (ringShown && ringUnit.side !== active.side && mode === 'ambush') {
    ring = { unitId: ringUnit.id, buttons: ambushRingButtons(ringUnit), info: null }
  } else if (ringShown && ringUnit.side !== active.side && (mode === 'attack' || mode === 'scan' || SOCIAL_KINDS.includes(mode)) && target?.id === ringUnit.id) {
    ring = { unitId: ringUnit.id, buttons: enemyRingButtons(ringUnit), info: ringInfo ? enemyRingInfo(ringUnit) : null }
  } else if (ringShown && ringUnit.side === active.side && mode === 'assist') {
    ring = { unitId: ringUnit.id, buttons: allyRingButtons(ringUnit), info: null }
  } else if (auto !== 'off' && !state.outcome) {
    ring = planned ? choiceRing(state, planned, `plan-${state.log.length}`) : choiceRing(state, lastChoice(state))
  }

  // Party bar in the order the party was picked (combatants are stored players first, in pick order).
  const party = Object.values(state.combatants).filter((combatant) => combatant.side === 'player')
  const partyWeapons = Object.fromEntries(party.map((member) => [member.id, getCombatantWeapon(member, weaponIds[member.id] ?? member.weaponIds[0])]))
  const shownCharacter = (selectedId && state.combatants[selectedId]) || active
  const encounter = getEncounter(state.encounterId)
  const rollBelongsToPlayer = Boolean((state.pending ?? state.result) && state.combatants[(state.pending ?? state.result).attackerId].controller === 'player')
  const hint = hiddenIds?.includes(active.id) ? 'The enemy is acting.' : getCombatHint(state, {
    taskPreview: combatTask?.task?.prepared
      ? { available: combatTask.task.available, reason: combatTask.task.reason, label: combatTask.task.label, task: { difficulty: combatTask.task.prepared.difficulty, targetNumber: combatTask.task.prepared.task.targetNumber } }
      : null,
    directBlock: directReason,
    planned, mode, attackMode, preview, bonusDice: purchase.bonusDice, ambushPreview, movePath, routeInCover, auto, targetInRange, assistAlly, assistHelper, ringAllyName: ringShown && ringUnit.side === active.side ? ringUnit.character.name : null, nextName: nextMemberId && state.combatants[nextMemberId].character.name })
  // The hint fades after a while; the Ambush button sharing its box stays, so with one offered only the text goes.
  const hintFaded = useFadeAfter(hint)
  const hintTextShown = showHints && !(hintFaded && ambusher)

  // Right-click on the battlefield releases the selection: no action chosen, no planned move, no inspected character.
  const releaseSelection = () => {
    setMode('none')
    setDestination(null)
    setSelectedId(null)
    closeRing()
  }

  const startAuto = () => {
    setMode(null)
    setDestination(null)
    setAuto('running')
  }

  // During an unseen enemy's turn the camera stays where it was, so it never points at what the party can't perceive.
  const activeHidden = Boolean(hiddenIds?.includes(active.id))
  const followFocus = openingFocus && !state.lastAction ? { key: 'opening', position: openingFocus } : cameraFocus(state, turnKey, active)
  const [heldFocus, setHeldFocus] = useState(followFocus)
  const focusChanged = heldFocus.key !== followFocus.key || heldFocus.position.x !== followFocus.position.x || heldFocus.position.y !== followFocus.position.y
  if (!activeHidden && focusChanged) setHeldFocus(followFocus)
  const focus = activeHidden ? heldFocus : followFocus

  return (
    <div className="combat-screen">
      <Battlefield
        state={state}
        activeId={active.id}
        targetId={isPlayerTurn ? target?.id : (state.pending ?? state.result)?.targetId}
        selectedId={selectedId}
        turnInfo={active.side === 'player' ? turnInfo : {}}
        overlay={overlay}
        ring={ring}
        msPerTile={MOVE_TILE_MS / (auto === 'off' ? 1 : speed)}
        speed={auto === 'off' ? 1 : speed}
        focus={focus}
        followCamera={followCamera}
        bystanders={bystanders}
        snapMarks={snapMarks}
        hiddenIds={hiddenIds}
        lastKnownMarks={lastKnownMarks}
        onTileClick={handleTileClick}
        onTileHover={setHoverTile}
        onUnitClick={handleUnitClick}
        onUnitHover={handleUnitHover}
        onRingHover={(entering) => ringId === active.id && hoverSelfRing(entering)}
        onRightClick={releaseSelection}
        objectMarks={objects?.marks ?? null}
        onObjectClick={(objectId) => {
          const entry = objectList.find(({ definition }) => definition.id === objectId)
          const open = entry?.actions.find((action) => action.available && action.affordable) ?? entry?.actions[0]
          if (open) openTask('interact', `${objectId}:${open.action.id}`)
        }}
      />
      <WeatherFx fx={weatherFor(state.weather).fx} follow=".battlefield" />
      <div className="combat-top-left">
        <ObjectivesPanel objectives={encounter.objectives} complete={state.outcome === 'victory'} />
        <ResourceIndicators
          momentum={state.resources.momentum}
          threat={state.resources.threat}
          canCancelThreat={ADAPTATION_MOMENTUM_SPENDS && isPlayerTurn && !state.pending && state.resources.momentum > 0 && state.resources.threat > 0}
          onCancelThreat={() => dispatch({ type: 'cancelThreat' })}
        />
      </div>
      <TurnOrderStrip state={state} hiddenIds={hiddenIds} />
      {!openingDone && <TurnBanner title={openingBanner.title} subtitle={openingBanner.subtitle} side="start" />}
      {openingDone && banner.title && !state.outcome && <TurnBanner key={banner.key} title={banner.title} subtitle={banner.subtitle} side={banner.side} />}
      {hint && (showHints || ambusher) && (
        <p className={`combat-hint${isPlayerTurn ? ' is-player-turn' : ''}${hintTextShown ? '' : ' is-controls-only'}${hintFaded && !ambusher ? ' is-faded-out' : ''}`} aria-live="polite">
          {hintTextShown && hint}
          {ambusher && (
            <button
              type="button"
              className={`combat-ambush${mode === 'ambush' ? ' is-selected' : ''}`}
              disabled={!ambushTargets.length}
              title={
                ambushTargets.length
                  ? `Optional, until anyone attacks: ${ambusher.character.name} rolls Control + Security at Difficulty 1 against a Klingon they have a shot at. Success: an automatic hit (an Injury) on that Klingon. Failure: you are spotted; a new round starts and the Klingons act first for the rest of the fight.`
                  : `${ambusher.character.name} has no shot at any Klingon yet (out of range or no line of fire). Move ${ambusher.character.name} closer without attacking to set up an ambush; any attack, by either side, ends the chance.`
              }
              onClick={startAmbush}
            >
              Ambush: {ambusher.character.name}, TN {previewAmbush(state, null).task.targetNumber}
              {!ambushTargets.length && ' (no shot yet: move closer)'}
            </button>
          )}
        </p>
      )}
      <div className="combat-top-right">
        <button
          type="button"
          className="combat-button is-small"
          aria-pressed={followCamera}
          title={followCamera ? 'The view moves to whoever is acting. Click to stop.' : 'The view stays where you put it. Click to follow whoever is acting.'}
          onClick={() => setFollowCamera(!followCamera)}
        >
          Camera: {followCamera ? 'Follow' : 'Free'}
        </button>
        <button type="button" className="combat-button is-small" onClick={() => setHelpOpen(true)}>
          How to Play
        </button>
        <button type="button" className="combat-button is-small" aria-pressed={debugOpen} onClick={toggleDebug}>
          Debug
        </button>
        <button type="button" className="combat-button is-small" onClick={onExit}>
          Exit
        </button>
      </div>
      <div className="combat-sidebar">
        <SelectedCharacterPanel combatant={shownCharacter} />
        <TargetPanel target={isPlayerTurn ? target : state.combatants[(state.pending ?? state.result)?.targetId] ?? null} />
        <TaskPanel
          mode={mode}
          isPlayerTurn={isPlayerTurn}
          autoTurn={auto !== 'off' && active.controller === 'player'}
          preview={preview}
          movePath={movePath}
          routeInCover={routeInCover}
          assist={{ allies: assistAllies, allyId: assistAlly?.id ?? null, onAlly: setAssistAllyId, helper: assistHelper }}
          ambush={ambushPreview}
          confirm={confirm}
          dicePurchase={{ resources: state.resources, value: purchase, onChange: setDicePurchase }}
          combatTask={combatTask}
          confirmLabel={taskConfirmLabel}
          attackMode={attackMode}
          dev={debugOpen ? { actorName: active.character.name, purchase: purchaseCheck } : null}
          rolling={Boolean(state.pending)}
          aiTurn={auto !== 'off' && !isPlayerTurn && !state.outcome ? aiTurnTask(state, active) : null}
        />
        <EndTurnButton
          enabled={isPlayerTurn && availability.endTurn}
          autoEndMs={turnUsedUp && !helpOpen ? autoEndMs : null}
          onEnd={() => selectAction('endTurn')}
        />
      </div>
      <div className="combat-bottom-left">
        <RollPanel
          state={state}
          speed={auto === 'off' ? 1 : speed}
          playerControls={rollBelongsToPlayer && isPlayerTurn}
          awaitingChoice={rollAwaitsPlayer(state)}
          onReroll={(dieIndex, source) => dispatch({ type: 'reroll', dieIndex, source })}
          onResolve={() => dispatch({ type: 'resolveAttack' })}
        />
        <PartyBar party={party} activeId={active.id} selectedId={selectedId} turnInfo={turnInfo} onSelect={selectPartyMember} recommendation={combatTask?.recommendation ?? null}
          weapons={partyWeapons}
          onCycleWeapon={isPlayerTurn && active.weaponIds.length > 1 ? cycleWeapon : null}
        />
      </div>
      {!state.outcome && (
        <AutoCombatControls
          auto={auto}
          speed={speed}
          partyAI={partyAI}
          onPartyAI={onPartyAI}
          enemyAI={enemyAI}
          onEnemyAI={onEnemyAI}
          onStart={startAuto}
          onPause={() => setAuto('paused')}
          onResume={() => setAuto('running')}
          onStop={() => setAuto('off')}
          onSpeed={setSpeed}
        />
      )}
      {state.incomingInjury && auto === 'off' && !state.outcome && (
        <InjuryChoice
          incoming={state.incomingInjury}
          target={state.combatants[state.incomingInjury.targetId]}
          attacker={state.combatants[state.incomingInjury.attackerId] ?? null}
          onAvoid={() => dispatch({ type: 'injuryDecision', avoid: true })}
          onAccept={() => dispatch({ type: 'injuryDecision', avoid: false })}
        />
      )}
      {state.pendingCounterattack && auto === 'off' && !state.outcome && (
        <CounterattackChoice
          offer={state.pendingCounterattack}
          defender={state.combatants[state.pendingCounterattack.defenderId]}
          attacker={state.combatants[state.pendingCounterattack.attackerId]}
          momentum={state.resources.momentum}
          onCounter={(injuryMode) => dispatch({ type: 'counterattackDecision', accept: true, injuryMode })}
          onDecline={() => dispatch({ type: 'counterattackDecision', accept: false })}
        />
      )}
      {state.pendingFatigue && auto === 'off' && !state.outcome && (
        <FatigueChoice combatant={state.combatants[state.pendingFatigue.combatantId]} onChoose={(attribute) => dispatch({ type: 'chooseFatigueAttribute', attribute })} />
      )}
      {debugOpen && <DebugPanel state={state} auto={auto} worldActors={worldActors} onClose={toggleDebug} />}
      {helpOpen && <HowToPlay onClose={closeHelp} />}
      {state.outcome && <CombatResultModal outcome={state.outcome} onRestart={onRestart} onChangeCharacter={onChangeCharacter} onExit={onExit} onContinue={onContinue} />}
      {children}
    </div>
  )
}

// mapId: the episode's map, chosen in Load Episode.
export default function CombatScreen({ savedCharacters, mapId, onExit }) {
  // UI state: the chosen party (RuntimeCharacters) and the running combat. Never saved or exported.
  const [party, setParty] = useState([])
  // fixedSeed: the seed typed on the setup screen (null = a new random seed every fight). runId remounts Battle per fight.
  const [fixedSeed, setFixedSeed] = useState(null)
  // The parsed map file the fight is on, kept for Restart.
  const [map, setMap] = useState(null)
  const [runId, setRunId] = useState(0)
  const [state, dispatch] = useReducer(autoCombatReducer, null)
  const [phase, setPhase] = useState('setup')
  // How to Play opens by itself only for the first fight after opening Load Episode.
  const [helpSeen, setHelpSeen] = useState(false)
  // Test options kept across Restart, so AIs can be compared on the same seed.
  const [partyAI, setPartyAI] = useState('classic')
  const [enemyAI, setEnemyAI] = useState('classic')

  const start = (members, seed, chosenMap) => {
    setParty(members)
    setFixedSeed(seed)
    setMap(chosenMap)
    setRunId(runId + 1)
    dispatch({ type: 'restart', options: { encounterId: DEFAULT_ENCOUNTER_ID, map: chosenMap, players: members, seed: seed ?? newSeed() } })
    setPhase('battle')
  }

  if (phase === 'setup' || !state) {
    return (
      <CombatSetup savedCharacters={savedCharacters} initialParty={party} initialSeed={fixedSeed} mapId={mapId} onStart={start} onExit={onExit} />
    )
  }
  return (
    // A new key per fight remounts the battle and fades its map in again.
    <MapFadeIn key={runId}>
      <Battle
        state={state}
        dispatch={dispatch}
        showHelpOnStart={!helpSeen}
        onHelpSeen={() => setHelpSeen(true)}
        partyAI={partyAI}
        onPartyAI={setPartyAI}
        enemyAI={enemyAI}
        onEnemyAI={setEnemyAI}
        onRestart={() => start(party, fixedSeed, map)}
        onChangeCharacter={() => setPhase('setup')}
        onExit={onExit}
      />
    </MapFadeIn>
  )
}
