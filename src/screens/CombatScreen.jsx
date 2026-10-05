import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import actionData from '../data/adaptation/combat/actions.json'
import { samePosition, tileKey } from '../combat/battleMap.js'
import {
  canAct,
  canAfford,
  aimText,
  canAim,
  canAmbush,
  canAssist,
  canMove,
  canSprint,
  getActiveCombatant,
  getAimFocus,
  getAmbusher,
  getAmbushTargets,
  getAssistableAllies,
  getEncounter,
  getHitChance,
  getMovementLeft,
  getOpponents,
  getPathTo,
  getReachable,
  getTurnGroup,
  getTurnGroupRange,
  getTurnOf,
  hasTargetInRange,
  isActive,
  isTurnFinished,
  MAX_HITS,
  previewAmbush,
  previewAttack,
  rollAwaitsPlayer,
  DEFAULT_ENCOUNTER_ID,
} from '../combat/combatState.js'
import { autoCombatReducer, chooseAIStep } from '../combat/autoCombat.js'
import { canTakeCover } from '../combat/coverSystem.js'
import { getMovementTiles, getSprintTiles } from '../combat/movementSystem.js'
import { tileDistance } from '../combat/rangeSystem.js'
import { getInjuryMode, getWeapon } from '../combat/weaponSystem.js'
import { TASK_DICE } from '../rules/taskResolver.js'
import Battlefield from '../components/combat/Battlefield.jsx'
import CombatResultModal from '../components/combat/CombatResultModal.jsx'
import CombatSetup from '../components/combat/CombatSetup.jsx'
import { ActionsPanel, SelectedCharacterPanel, TargetPanel, TaskPanel } from '../components/combat/CombatSidebar.jsx'
import DebugPanel from '../components/combat/DebugPanel.jsx'
import HowToPlay from '../components/combat/HowToPlay.jsx'
import { getCombatHint } from '../combat/combatHints.js'
import ObjectivesPanel from '../components/combat/ObjectivesPanel.jsx'
import PartyBar from '../components/combat/PartyBar.jsx'
import ResourceIndicators from '../components/combat/ResourceIndicators.jsx'
import RollPanel from '../components/combat/RollPanel.jsx'
import TurnOrderStrip from '../components/combat/TurnOrderStrip.jsx'
import AutoCombatControls from '../components/combat/AutoCombatControls.jsx'
import TurnBanner from '../components/combat/TurnBanner.jsx'
import { MAX_SEED } from '../rules/seededRandom.js'
import WeatherFx from '../effects/WeatherFx.jsx'
import { weatherFor } from '../maps/mapWeather.js'

// Presentation delays only (divided by the Auto Combat speed). The combat itself never waits on them.
const AI_STEP_MS = 700
const AI_ROLL_MS = 1100
const MOVE_TILE_MS = 140
// How long Auto Combat shows a party member's chosen button before the action runs.
const AI_CHOICE_MS = 900
const AUTO_END_TURN_MS = 1200
// Longer when the last action's hit offers Momentum +1 Hit, so the offer can be taken before the turn moves on.
const AUTO_END_WITH_OFFER_MS = 3500
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
  if (roll && ['attack', 'reroll', 'resolve', 'momentumHit', 'ambush'].includes(action?.type)) {
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
  // Ending a turn forfeits any AP left, so a finished member shows nothing left.
  const spent = { ap: 0 }
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
  if (active.side === 'player') return { title: `${active.character.name}'s Turn`, subtitle: round, side: 'player' }
  if (newRound || previous.side !== 'enemy') return { title: 'Enemy Turn', subtitle: round, side: 'enemy' }
  return null
}

// The buttons shown around an enemy: one per injury mode of the weapon (each fires), then Aim, Use Item and Info.
const enemyButtonDefs = (weapon) => [
  ...weapon.injuryModes.map((modeId) => ({ id: modeId, label: getInjuryMode(modeId).name, icon: modeId === 'stun' ? 'stun' : 'deadly' })),
  { id: 'aim', label: 'Aim', icon: 'aim' },
  { id: 'useItem', label: 'Use Item', icon: 'useItem' },
  { id: 'info', label: 'Info', icon: 'info' },
]

// During Auto Combat, the buttons a party member's AI choice uses, with the choice lit (display only).
// choice: { actorId, type, targetId, weaponId, injuryMode, allyId } - an AI step about to run, or the action just taken.
function choiceRing(state, choice) {
  const actor = choice && state.combatants[choice.actorId]
  if (!actor || actor.side !== 'player') return null
  const show = (unitId, buttons, chosenId) => ({
    unitId,
    info: null,
    buttons: buttons.map((button) => ({ ...button, enabled: false, active: button.id === chosenId, title: button.id === chosenId ? `${actor.character.name} chose ${button.label}` : button.label })),
  })
  const weapon = getWeapon(choice.weaponId ?? actor.weaponIds[0])
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

function Battle({ state, dispatch, showHelpOnStart, onHelpSeen, partyAI, onPartyAI, enemyAI, onEnemyAI, onRestart, onChangeCharacter, onExit }) {
  const active = getActiveCombatant(state)
  // Auto Combat (UI state): 'off' | 'running' | 'paused'. While on, the AI also plays the party.
  const [auto, setAuto] = useState('off')
  const [speed, setSpeed] = useState(1)
  const aiControlled = active.controller === 'ai' || auto !== 'off'
  const isPlayerTurn = !aiControlled && !state.outcome
  // UI state only: the chosen action, target, weapon, injury mode, move destination, hovered tile, panels and camera follow.
  // chosenMode null = the default (Move while AP is left); 'none' = the player deselected everything.
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
  const [debugOpen, setDebugOpen] = useState(false)
  const [followCamera, setFollowCamera] = useState(true)
  const [helpOpen, setHelpOpen] = useState(showHelpOnStart)
  const closeHelp = () => {
    setHelpOpen(false)
    onHelpSeen()
  }

  const weapon = getWeapon(weaponIds[active.id] ?? active.weaponIds[0])
  const target = targetId && isActive(state.combatants[targetId]) ? state.combatants[targetId] : null

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
    if (active.controller === 'player') setTargetId(nearestOpponentId(state, active))
  }
  if (isPlayerTurn && !target && targetId !== nearestOpponentId(state, active)) setTargetId(nearestOpponentId(state, active))

  // In Auto Combat, a party member's next Attack, Aim or Assist is shown (its button lit) for a beat before it runs.
  const planned = useMemo(() => (auto !== 'off' ? plannedChoice(state, partyAI) : null), [auto, state, partyAI])

  // AI turns (enemies, plus the party during Auto Combat): one step at a time, paced so it can be followed.
  // Paused while How to Play is open or Auto Combat is paused. The step itself is pure (autoCombat.stepAI).
  const hasPlan = Boolean(planned)
  useEffect(() => {
    if (state.outcome || !aiControlled || helpOpen || auto === 'paused') return undefined
    const timer = setTimeout(() => dispatch({ type: 'aiStep', partyAI, enemyAI }), (aiDelay(state) + (hasPlan ? AI_CHOICE_MS : 0)) / speed)
    return () => clearTimeout(timer)
  }, [state, aiControlled, dispatch, helpOpen, auto, speed, hasPlan, partyAI, enemyAI])

  // Move and Sprint share the tile picking; moveKind is whichever of them is selected.
  const moveKind = mode === 'move' || mode === 'sprint' ? mode : null
  const reachable = moveKind && isPlayerTurn ? getReachable(state, active, moveKind) : null
  const pathTarget = destination ?? hoverTile
  const movePath =
    reachable && pathTarget && reachable.has(tileKey(pathTarget)) && !samePosition(pathTarget, active.position) ? getPathTo(state, active, pathTarget, moveKind) : null
  const routeInCover = Boolean(movePath && canTakeCover(state.map, movePath[movePath.length - 1]))
  const preview = mode === 'attack' && target ? previewAttack(state, active.id, target.id, weapon.id) : null
  const ambushPreview = mode === 'ambush' ? previewAmbush(state, ringId) : null
  const ambusher = ambushOpen ? getAmbusher(state) : null
  const ambushTargets = ambushOpen ? getAmbushTargets(state) : []

  const overlay = {
    reachableKeys: reachable ? new Set([...reachable.keys()].filter((key) => key !== tileKey(active.position))) : null,
    pathKeys: movePath ? new Set(movePath.slice(1).map(tileKey)) : null,
    path: movePath,
    shot: preview ? { from: active.position, to: target.position, available: preview.available } : null,
  }

  const targetInRange = hasTargetInRange(state, active.id, weapon.id)
  const assistAllies = isPlayerTurn ? getAssistableAllies(state, active) : []
  const assistAlly = assistAllies.find((ally) => ally.id === assistAllyId) ?? null
  const assistHelperId = state.assists[active.id]
  const assistHelper = assistHelperId && isActive(state.combatants[assistHelperId]) ? state.combatants[assistHelperId] : null
  const availability = {
    move: canMove(state, active),
    sprint: canSprint(state, active),
    assist: canAfford(state, active, 'assist') && assistAllies.length > 0,
    endTurn: canAct(state, active),
  }
  const unavailableReasons = {
    ...(canAfford(state, active, 'assist') && !assistAllies.length ? { assist: 'No party member left to assist: they have all acted or are already assisted this round.' } : {}),
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
  }
  const confirmation = confirmations[mode]
  const confirm = {
    enabled: Boolean(confirmation?.enabled),
    onConfirm: () => {
      confirmation.run()
      setMode(null)
      setDestination(null)
      closeRing()
    },
  }

  // With Move selected (the default), clicking a reachable tile moves there at once.
  // Prototype: a finger has no hover preview, so on touch the first tap shows the path and a second tap on the same
  // tile moves; a mouse click moves at once.
  const handleTileClick = (tile, { touch = false } = {}) => {
    // With buttons shown around a unit, a click on the floor just puts them away (back to Move).
    if (ring || mode === 'ambush') {
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
  const canSwitchTo = (id) => id !== active.id && !state.pending && groupIds.includes(id) && !isTurnFinished(state, id)
  const turnInfo = getPartyTurnInfo(state, active)

  // At 0 AP the turn passes on by itself (to the next Ready member, else to the enemies), after a pause so the result
  // can be read; never waiting for End Turn. A Momentum +1 Hit offer from the last attack gets a longer pause.
  const { result } = state
  const momentumHitOnOffer = Boolean(
    result && state.lastAction?.type === 'resolve' && !result.closed && result.passed && !result.extraHit && state.momentum > 0 && isActive(state.combatants[result.targetId]) && state.combatants[result.attackerId].side === 'player',
  )
  const turnUsedUp = isPlayerTurn && isTurnFinished(state, active.id) && !state.pending
  const autoEndMs = momentumHitOnOffer ? AUTO_END_WITH_OFFER_MS : AUTO_END_TURN_MS
  // Whoever End Turn hands over to: the first unfinished group member after the active one (as in the endTurn reducer).
  const nextMemberId = groupIds.find((id) => id !== active.id && !isTurnFinished(state, id)) ?? null
  useEffect(() => {
    if (!turnUsedUp || helpOpen) return undefined
    const timer = setTimeout(() => dispatch({ type: 'endTurn' }), autoEndMs)
    return () => clearTimeout(timer)
  }, [turnUsedUp, helpOpen, autoEndMs, dispatch])

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

  const canOpenSelfRing = isPlayerTurn && !state.pending && !turnUsedUp
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
          ? `${ambush.ambusher.character.name} ambushes ${enemy.character.name}: TN ${ambush.task.targetNumber}, Difficulty 1, ${percent} chance. Success: 1 Hit. Failure: the Klingons act first.`
          : ambush.reason,
        onClick: () => {
          dispatch({ type: 'ambush', targetId: enemy.id })
          closeRing()
          setMode(null)
        },
      },
    ]
  }

  const aimEffect = aimText(getAimFocus(active))
  const aimTitle = state.turn.aimReroll ? `Aimed: you ${aimEffect}.` : `Aim (1 AP): you ${aimEffect}.`

  const cycleWeapon = () => {
    const index = active.weaponIds.indexOf(weapon.id)
    setWeaponIds({ ...weaponIds, [active.id]: active.weaponIds[(index + 1) % active.weaponIds.length] })
  }

  const enemyRingButtons = (enemy) => {
    const dice = TASK_DICE + (assistHelper ? 1 : 0)
    const attackBlock = !preview?.available ? (preview?.reason ?? 'Not a valid target.') : preview.task.difficulty > dice ? `Needs ${preview.task.difficulty} successes from ${dice} dice: cannot succeed.` : null
    const behaviour = {
      aim: {
        enabled: canAim(state, active),
        active: state.turn.aimReroll,
        title: aimTitle,
        onClick: () => dispatch({ type: 'aim' }),
      },
      useItem: { enabled: false, title: 'Not in this prototype yet' },
      info: { enabled: true, active: ringInfo, title: 'Show Hits, cover and your chance to hit', onClick: () => setRingInfo(!ringInfo) },
    }
    return enemyButtonDefs(weapon).map((button) => ({
      ...button,
      ...(behaviour[button.id] ?? {
        enabled: !attackBlock && canAfford(state, active, 'attack'),
        title: attackBlock ?? `Fire ${weapon.name} set to ${button.label} (1 AP).`,
        onClick: () => dispatch({ type: 'attack', targetId: enemy.id, weaponId: weapon.id, injuryMode: button.id }),
      }),
    }))
  }

  const enemyRingInfo = (enemy) => {
    const rows = [
      ['Hits', `${enemy.hits} / ${MAX_HITS}`],
      ['Cover', enemy.inCover ? 'In cover' : 'No cover'],
    ]
    if (preview?.task) {
      rows.push(['Range', `${preview.band.name}, ${preview.distance} tiles`], ['Your roll', `TN ${preview.task.targetNumber}, Difficulty ${preview.task.difficulty}`])
      if (state.turn.aimReroll) rows.push(['Aimed', preview.task.focus ? `reroll both dice (focus: ${preview.task.focus})` : 'reroll one die'])
      rows.push(['Chance to hit', preview.available ? `${Math.round(getHitChance(state, active.id, preview) * 100)}%` : 'No shot'])
      if (preview.available && enemy.inCover) rows.push(['In cover', 'their roll may lower it'])
    }
    return { title: enemy.character.name, rows }
  }

  const allyRingButtons = (ally) => {
    const name = ally.character.name
    const assistBlock = !canAssist(state, active, ally)
      ? state.assists[ally.id]
        ? `${name} is already being assisted this round.`
        : `${name} has no turn left this round.`
      : canAfford(state, active, 'assist')
        ? null
        : 'No AP left.'
    const buttons = [
      {
        id: 'assist',
        label: 'Assist',
        icon: 'assist',
        enabled: !assistBlock,
        title: assistBlock ?? `Assist (1 AP): ${name}'s next attack this round adds your 1d20.`,
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
        title: `Hand the turn to ${name}; ${active.character.name} keeps any AP left for later this turn.`,
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
        title: availability.move ? 'Move (1 AP): click a highlighted tile to walk there.' : 'Already moved this turn, or no AP left.',
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
          ? `Sprint (1 AP): run up to ${getSprintTiles(active.character)} tiles, before or after Move. Click a highlighted tile.`
          : 'Already sprinted this turn, or no AP left.',
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
        title: unavailableReasons.assist ?? (availability.assist ? 'Assist (1 AP): pick a party member; their next attack this round adds your 1d20.' : 'No AP left.'),
        onClick: () => selectAction('assist'),
      },
      endTurn: {
        enabled: availability.endTurn,
        title: 'End Turn (free): end this character\'s turn with any AP left unused.',
        onClick: () => {
          closeRing()
          dispatch({ type: 'endTurn' })
        },
      },
    }
    return actionData.selfRing.map((id) => {
      const action = actionData.actions.find((entry) => entry.id === id)
      return {
        id,
        label: action.name,
        icon: id,
        ...(behaviour[id] ?? { enabled: false, title: `${action.name}: not in this prototype yet.` }),
      }
    })
  }

  const ringUnit = ringId ? state.combatants[ringId] : null
  const ringShown = isPlayerTurn && ringUnit && isActive(ringUnit) && !state.pending && !turnUsedUp
  let ring = null
  if (ringShown && ringUnit.id === active.id) {
    ring = { unitId: ringUnit.id, buttons: selfRingButtons(), info: null }
  } else if (ringShown && ringUnit.side !== active.side && mode === 'ambush') {
    ring = { unitId: ringUnit.id, buttons: ambushRingButtons(ringUnit), info: null }
  } else if (ringShown && ringUnit.side !== active.side && mode === 'attack' && target?.id === ringUnit.id) {
    ring = { unitId: ringUnit.id, buttons: enemyRingButtons(ringUnit), info: ringInfo ? enemyRingInfo(ringUnit) : null }
  } else if (ringShown && ringUnit.side === active.side && mode === 'assist') {
    ring = { unitId: ringUnit.id, buttons: allyRingButtons(ringUnit), info: null }
  } else if (auto !== 'off' && !state.outcome) {
    ring = choiceRing(state, planned ?? lastChoice(state))
  }

  // Party bar in the order the party was picked (combatants are stored players first, in pick order).
  const party = Object.values(state.combatants).filter((combatant) => combatant.side === 'player')
  const shownCharacter = (selectedId && state.combatants[selectedId]) || active
  const encounter = getEncounter(state.encounterId)
  const rollBelongsToPlayer = Boolean((state.pending ?? state.result) && state.combatants[(state.pending ?? state.result).attackerId].controller === 'player')
  const hint = getCombatHint(state, { planned, mode, preview, ambushPreview, movePath, routeInCover, auto, targetInRange, assistAlly, assistHelper, ringAllyName: ringShown && ringUnit.side === active.side ? ringUnit.character.name : null, nextName: nextMemberId && state.combatants[nextMemberId].character.name })

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
        focus={cameraFocus(state, turnKey, active)}
        followCamera={followCamera}
        onTileClick={handleTileClick}
        onTileHover={setHoverTile}
        onUnitClick={handleUnitClick}
        onUnitHover={handleUnitHover}
        onRingHover={(entering) => ringId === active.id && hoverSelfRing(entering)}
        onRightClick={releaseSelection}
      />
      <WeatherFx fx={weatherFor(state.weather).fx} />
      <div className="combat-top-left">
        <ObjectivesPanel objectives={encounter.objectives} complete={state.outcome === 'victory'} />
        <ResourceIndicators
          momentum={state.momentum}
          threat={state.threat}
          canCancelThreat={isPlayerTurn && !state.pending && state.momentum > 0 && state.threat > 0}
          onCancelThreat={() => dispatch({ type: 'cancelThreat' })}
        />
      </div>
      <TurnOrderStrip state={state} />
      {banner.title && !state.outcome && <TurnBanner key={banner.key} title={banner.title} subtitle={banner.subtitle} side={banner.side} />}
      {hint && (
        <p className={`combat-hint${isPlayerTurn ? ' is-player-turn' : ''}`} aria-live="polite">
          {hint}
          {ambusher && (
            <button
              type="button"
              className={`combat-ambush${mode === 'ambush' ? ' is-selected' : ''}`}
              disabled={!ambushTargets.length}
              title={
                ambushTargets.length
                  ? `Optional, until anyone attacks: ${ambusher.character.name} rolls Control + Security at Difficulty 1 against a Klingon they have a shot at. Success: 1 Hit on that Klingon. Failure: you are spotted; a new round starts and the Klingons act first for the rest of the fight.`
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
        <button type="button" className="combat-button is-small" onClick={() => setDebugOpen(!debugOpen)}>
          Debug
        </button>
        <button type="button" className="combat-button is-small" onClick={onExit}>
          Exit
        </button>
      </div>
      <div className="combat-sidebar">
        <SelectedCharacterPanel combatant={shownCharacter} />
        <ActionsPanel
          availability={isPlayerTurn ? availability : {}}
          unavailableReasons={isPlayerTurn ? unavailableReasons : {}}
          mode={mode}
          weapon={weapon}
          canCycleWeapon={isPlayerTurn && active.weaponIds.length > 1}
          autoEndMs={turnUsedUp && !helpOpen ? autoEndMs : null}
          turn={isPlayerTurn ? state.turn : null}
          movement={isPlayerTurn ? { left: getMovementLeft(state, active), total: getMovementTiles(active.character) } : null}
          onSelect={selectAction}
          onCycleWeapon={cycleWeapon}
        />
        <TargetPanel target={isPlayerTurn ? target : state.combatants[(state.pending ?? state.result)?.targetId] ?? null} />
        <TaskPanel
          mode={mode}
          isPlayerTurn={isPlayerTurn}
          autoTurn={auto !== 'off' && active.controller === 'player'}
          preview={preview}
          movePath={movePath}
          routeInCover={routeInCover}
          movement={{
            left: getMovementLeft(state, active),
            total: getMovementTiles(active.character),
            sprintLeft: getMovementLeft(state, active, 'sprint'),
            sprintTotal: getSprintTiles(active.character),
          }}
          assist={{ allies: assistAllies, allyId: assistAlly?.id ?? null, onAlly: setAssistAllyId, helper: assistHelper }}
          ambush={ambushPreview}
          confirm={confirm}
        />
      </div>
      <PartyBar party={party} activeId={active.id} selectedId={selectedId} turnInfo={turnInfo} onSelect={selectPartyMember} />
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
      <RollPanel
        state={state}
        speed={auto === 'off' ? 1 : speed}
        playerControls={rollBelongsToPlayer && isPlayerTurn}
        awaitingChoice={rollAwaitsPlayer(state)}
        onReroll={(dieIndex, source) => dispatch({ type: 'reroll', dieIndex, source })}
        onResolve={() => dispatch({ type: 'resolveAttack' })}
        onSpendMomentumHit={() => dispatch({ type: 'spendMomentumHit' })}
      />
      {debugOpen && <DebugPanel state={state} auto={auto} onClose={() => setDebugOpen(false)} />}
      {helpOpen && <HowToPlay onClose={closeHelp} />}
      {state.outcome && <CombatResultModal outcome={state.outcome} onRestart={onRestart} onChangeCharacter={onChangeCharacter} onExit={onExit} />}
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
    <Battle
      key={runId}
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
  )
}
