import { useEffect, useMemo, useReducer, useState } from 'react'
import { createPortal } from 'react-dom'
import { isPlayerControlled } from '../actors/controllers.js'
import { playBeamOutSound } from '../audio/uiSounds.js'
import { useDisplaySettings, useOpenSettings } from '../settings/DisplaySettingsContext.js'
import { samePosition, tileKey } from '../combat/battleMap.js'
import { canHandTurn, combatRingPartyBand, combatRingPartyView } from '../combat/combatRingParty.js'
import {
  SOCIAL_KINDS,
  awaitingDecision,
  canAmbush,
  canAssist,
  canMove,
  combatActionFor,
  getActiveCombatant,
  isActive,
  isTurnFinished,
  previewAmbush,
  rollAwaitsPlayer,
} from '../combat/combatState.js'
import BonusDicePicker from '../components/BonusDicePicker.jsx'
import { buildCombatView } from '../combat/combatView.js'
import { standingObjects } from '../combat/combatEnvironment.js'
import { DEFAULT_ENCOUNTER_ID } from '../combat/encounters.js'
import { autoCombatReducer } from '../combat/autoCombat.js'
import { getCombatantWeapon } from '../combat/weaponSystem.js'
import buildTaskPanel from '../components/combat/buildTaskPanel.js'
import createRingButtons from '../components/combat/ringButtons.js'
import useBattlePacing from '../components/combat/useBattlePacing.js'
import useBeamIn from '../components/combat/useBeamIn.js'
import usePendingObjectHit from '../components/usePendingObjectHit.js'
import Battlefield from '../components/combat/PixiBattlefield.jsx'
import CombatResultModal from '../components/combat/CombatResultModal.jsx'
import CombatSetup from '../components/combat/CombatSetup.jsx'
import { CombatMatchup, EndTurnButton, TaskPanel } from '../components/combat/CombatSidebar.jsx'
import DebugPanel from '../components/combat/DebugPanel.jsx'
import HowToPlay from '../components/combat/HowToPlay.jsx'
import FatigueChoice from '../components/combat/FatigueChoice.jsx'
import CounterattackChoice from '../components/combat/CounterattackChoice.jsx'
import { getCombatHint } from '../combat/combatHints.js'
import PartyBar from '../components/combat/PartyBar.jsx'
import ResourceIndicators from '../components/combat/ResourceIndicators.jsx'
import RollPanel from '../components/combat/RollPanel.jsx'
import TurnOrderStrip from '../components/combat/TurnOrderStrip.jsx'
import AutoCombatControls from '../components/combat/AutoCombatControls.jsx'
import TurnBanner from '../components/combat/TurnBanner.jsx'
import { minimapKnowledgeForCombat, minimapPartyFromCombat, minimapWorldFromCombat } from '../components/combat/combatMinimap.js'
import Minimap from '../components/exploration/Minimap.jsx'
import useFadeAfter from '../components/useFadeAfter.js'
import MapFadeIn from '../components/maps/MapFadeIn.jsx'
import WeatherFx from '../effects/WeatherFx.jsx'
import PerfProfiler from '../dev/PerfProfiler.jsx'
import { weatherFor } from '../maps/mapWeather.js'
import '../components/exploration/exploration.css'
import {
  aiTurnTask,
  AUTO_END_TURN_MS,
  BEAM_OUT_MS,
  cameraFocus,
  cameraFocusAlongShot,
  choiceRing,
  getPartyTurnInfo,
  justFled,
  lastChoice,
  MOVE_TILE_MS,
  nearestOpponentId,
  newSeed,
  plannedChoice,
  shotAim,
  shotCameraRideMs,
  turnBanner,
} from '../components/combat/battleHelpers.js'

// Minimap corner icons (same strokes as exploration's Formation panel / Captain's Log toggle).
const CAMERA_ICON = 'M4 8h3l2-3h6l2 3h3v11H4zM12 10.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7'
const HELP_ICON = 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9.5 9.2a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.8-1.1 1.8M12 17h.01'
const DEBUG_ICON = 'M9 6a3 3 0 0 1 6 0M8 9h8v6a4 4 0 0 1-8 0zM12 9v10M8 12H4M20 12h-4M8 16l-3 2M16 16l3 2M8 9L5 7M16 9l3-2'
const SETTINGS_ICON = 'M12 15.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM12 2.5v2.2M12 19.3v2.2M4.8 6.2l1.6 1.5M17.6 16.3l1.6 1.5M4.8 17.8l1.6-1.5M17.6 7.7l1.6-1.5M2.5 12h2.2M19.3 12h2.2'
const EXIT_ICON = 'M14 4H5v16h9M10 12h10M16 8l4 4l-4 4'

// Combat started in the exploration world (ExplorationScreen) also passes: onContinue (the result offers only Return to
// Exploration), bystanders (NPCs outside the fight, drawn where they stand), snapMarks (debug: world position -> cell),
// openingFocus (the camera starts on the encounter instead of the first to act), hiddenIds (enemies the party can't
// perceive now: not drawn, not in the turn order, and the camera doesn't follow them), lastKnownMarks, openingBanner
// ({ title, subtitle } shown as the fight starts) and children (drawn over the battle). debugOpen / onDebug: the world's
// own debug toggle, so the one Debug button also opens the world's link readout. beamIn (Load Episode's fights, not
// those started in the world): the away team beams in as the fight starts, and the AI waits for it.
// objects (combat in the world): the challenge objects, { list: [{ definition, actions: [{ action, available, reason,
// cost, affordable }] }] in reach of whoever acts, preview(objectId, actionId) -> { prepared, assist } (the object's own
// task math), recommend(objectId, actionId, memberIds) -> who is best at it (rules/taskRecommendation.js), marks:
// [{ id, name, position, stateLabel, inReach }] to draw }. Their actions dispatch { type: 'interact' }. failedNames
// (combat in the world): the Must survive NPCs in this fight, so the result reads Mission Failed and offers only
// onExitMission. knowledge / environment / doors: optional exploration layer for the combat minimap (WorldCombat).
export function Battle({
  state,
  dispatch,
  showHelpOnStart,
  onHelpSeen,
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
  beamIn = false,
  objects = null,
  debugOpen: worldDebugOpen = null,
  onDebug = null,
  worldActors = null,
  failedNames = [],
  onExitMission = null,
  knowledge = null,
  environment = null,
  doors = [],
  children = null,
}) {
  // Settings > Help Hints off: the hint text goes, and How to Play does not open by itself (the How to Play button still works).
  // partyAI / enemyAI come from Settings (persisted display settings).
  const { helpHints: showHints, cameraFollow, partyAI, enemyAI } = useDisplaySettings()
  const openSettings = useOpenSettings().openSettings
  const active = getActiveCombatant(state)
  // Auto Combat (UI state): 'off' | 'running' | 'paused'. While on, the AI also plays the party.
  const [auto, setAuto] = useState('off')
  const [speed, setSpeed] = useState(1)
  const aiControlled = !isPlayerControlled(active) || auto !== 'off'
  const isPlayerTurn = !aiControlled && !state.outcome
  // UI state only: the chosen action, target, weapon, injury mode, move destination, hovered tile, panels and camera follow.
  // chosenMode null = the default (Move while it is still possible); 'none' = the player deselected everything.
  const [chosenMode, setMode] = useState(null)
  const [minimapOpen, setMinimapOpen] = useState(true)
  const defaultMode = isPlayerTurn && canMove(state, active) ? 'move' : null
  const ambushOpen = isPlayerTurn && canAmbush(state)
  const chosen = chosenMode === 'ambush' && !ambushOpen ? null : chosenMode
  const mode = chosen === 'none' ? null : (chosen ?? defaultMode)
  const [targetId, setTargetId] = useState(null)
  const [weaponIds, setWeaponIds] = useState({})
  // The unit whose action buttons are shown on the map (clicked enemy or party member; `object:<id>` for a challenge
  // object), and whether its Info card is open.
  const [ringId, setRingId] = useState(null)
  const [ringInfo, setRingInfo] = useState(false)
  // Party band on combat rings (like exploration): who is picked, which action button is hovered, slot for bonus dice.
  const [ringPick, setRingPick] = useState(null)
  const [ringHover, setRingHover] = useState(null)
  const [rollSlot, setRollSlot] = useState(null)
  const [destination, setDestination] = useState(null)
  const [assistAllyId, setAssistAllyId] = useState(null)
  const [hoverTile, setHoverTile] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [ownDebugOpen, setOwnDebugOpen] = useState(false)
  const debugOpen = worldDebugOpen ?? ownDebugOpen
  const toggleDebug = onDebug ?? (() => setOwnDebugOpen(!ownDebugOpen))
  const [followCamera, setFollowCamera] = useState(cameraFollow)
  const [helpOpen, setHelpOpen] = useState(showHelpOnStart && showHints)
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
    setRingPick(null)
    setRingHover(null)
    setDicePurchase({ bonusDice: 0, momentum: 0 })
    setTaskPick(null)
    if (isPlayerControlled(active)) setTargetId(nearestOpponentId(state, active))
  }
  if (isPlayerTurn && !target && targetId !== nearestOpponentId(state, active)) setTargetId(nearestOpponentId(state, active))

  // In Auto Combat, a party member's next Attack, Aim or Assist is shown (its button lit) for a beat before it runs.
  const planned = useMemo(() => (auto !== 'off' ? plannedChoice(state, partyAI) : null), [auto, state, partyAI])

  // Everything the HUD shows about this moment: movement range, the attack preview, who can be guarded, treated,
  // directed or assisted, and why an action is closed. Worked out in combat/combatView.js so this screen keeps only its
  // UI state, handlers and layout.
  const {
    moveKind, reachable, movePath, routeInCover, overlay,
    preview, targetAttack, ringAttackRoll, attackBlock, targetInRange, purchase, purchaseCheck,
    ambushPreview,
    assistAllies, assistAlly, assistHelper,
    objectList, guardTargets, firstAidOptions, authority, isCommander, directAllies, directReason,
    extraMinorReason, secondMajorReason, availability, unavailableReasons,
  } = buildCombatView({ state, active, isPlayerTurn, mode, target, weapon, destination, hoverTile, dicePurchase, ringId, ambushOpen, assistAllyId, objectList: objects?.list ?? [] })
  const { combatTask, taskConfirm, taskConfirmLabel } = buildTaskPanel({
    state, dispatch, active, isPlayerTurn, mode, target, attackMode, attackBlock, taskPick, setTaskPick, setMode, setRingInfo, setDicePurchase,
    guardTargets, firstAidOptions, directAllies, directReason, authority, isCommander, objectList, objects, purchase, purchaseCheck,
    // fireAttack is defined further down, so it is looked up when Fire is pressed, not now.
    fireAttack: (enemyId, injuryMode) => fireAttack(enemyId, injuryMode),
  })
  // Keep the ring open so the party band and Roll arc can commit the task (no Task-panel Confirm).
  const openTask = (taskMode, pick = null, { keepObjectRing = null } = {}) => {
    setMode(taskMode)
    setTaskPick(pick)
    setDestination(null)
    setRingHover(null)
    if (keepObjectRing) {
      setRingId(`object:${keepObjectRing}`)
      setRingPick(active.id)
      return
    }
    setRingId(active.id)
    if (taskMode === 'guard') setRingPick(pick ?? active.id)
    else if (taskMode === 'firstAid') setRingPick(pick ?? (firstAidOptions[0] ? `${firstAidOptions[0].target.id}:${firstAidOptions[0].mode}` : null))
    else if (taskMode === 'direct') setRingPick(pick ?? directAllies[0]?.id ?? null)
    else if (taskMode === 'assist') setRingPick(pick ?? (assistAllies.length === 1 ? assistAllies[0].id : null))
    else setRingPick(active.id)
    if (taskMode === 'assist') setAssistAllyId(pick ?? (assistAllies.length === 1 ? assistAllies[0].id : null))
  }
  const closeRing = () => {
    setRingId(null)
    setRingInfo(false)
    setRingPick(null)
    setRingHover(null)
    setRollSlot(null)
  }

  const selectAction = (id) => {
    if (id === 'endTurn') {
      dispatch({ type: 'endTurn' })
      return
    }
    setMode(mode === id ? 'none' : id)
    setDestination(null)
    setAssistAllyId(id === 'assist' && assistAllies.length === 1 ? assistAllies[0].id : null)
    if (id === 'assist') openTask('assist')
    else closeRing()
  }

  const assistTargetId = mode === 'assist' ? (taskPick ?? assistAllyId ?? ringPick) : null
  const moveArmed = (mode === 'move' || mode === 'sprint' || mode == null || mode === 'none') && Boolean(movePath) && Boolean(moveKind)
  const confirmations = {
    move: { enabled: Boolean(movePath) && availability.move, run: () => dispatch({ type: 'move', destination: movePath[movePath.length - 1] }) },
    sprint: { enabled: Boolean(movePath) && availability.sprint, run: () => dispatch({ type: 'sprint', destination: movePath[movePath.length - 1] }) },
    assist: {
      enabled: Boolean(assistTargetId) && canAssist(state, active, state.combatants[assistTargetId]) && availability.assist,
      run: () => dispatch({ type: 'assist', allyId: assistTargetId }),
    },
    ambush: {
      enabled: Boolean(taskPick) && previewAmbush(state, taskPick).available,
      run: () => dispatch({ type: 'ambush', targetId: taskPick }),
    },
    ...(taskConfirm ? { [mode]: taskConfirm } : {}),
  }
  const confirmation = moveArmed ? confirmations[moveKind] : confirmations[mode]
  // Roll arc on the party band commits armed tasks (including Move / Sprint once a path is set).
  const confirm = {
    shown: Boolean(taskConfirm) || mode === 'assist' || mode === 'ambush' || moveArmed,
    enabled: Boolean(confirmation?.enabled),
    label:
      taskConfirmLabel ??
      (mode === 'assist' ? 'Assist' : mode === 'ambush' ? 'Ambush' : moveArmed ? (moveKind === 'sprint' ? 'Sprint' : 'Move') : 'Confirm'),
    onConfirm: () => {
      confirmation?.run()
      setMode(null)
      setDestination(null)
      setTaskPick(null)
      setAssistAllyId(null)
      setRingPick(null)
      if (taskConfirm || mode === 'scan' || mode === 'scanObject' || SOCIAL_KINDS.includes(mode)) setDicePurchase({ bonusDice: 0, momentum: 0 })
      closeRing()
    },
  }

  // Move / Sprint: click a reachable tile to go there (same as the Move/Sprint check arc once a path is set).
  // Touch has no hover path, so the first tap only previews; a second tap on the same tile (or the check arc) commits.
  const handleTileClick = (tile, { touch = false } = {}) => {
    // A non-move ring or armed attack/ambush: floor click dismisses it.
    if (mode === 'ambush' || attackMode || (ringId && ringId !== active.id)) {
      closeRing()
      setMode(null)
      return
    }
    if (!moveKind || !availability[moveKind] || !reachable?.has(tileKey(tile)) || samePosition(tile, active.position)) return
    if (touch && !(destination && samePosition(destination, tile))) {
      setDestination(tile)
      setRingId(active.id)
      setRingInfo(false)
      setRingPick(active.id)
      if (mode !== 'sprint') setMode(moveKind)
      return
    }
    dispatch({ type: moveKind, destination: tile })
    setMode(null)
    setDestination(null)
    closeRing()
  }

  // During the party's turn, picking a party member who can still act hands them the turn.
  const canSwitchTo = (id) => isPlayerTurn && !combatActionFor('selectCombatant').unavailableReason(state, active, { combatantId: id })
  const turnInfo = getPartyTurnInfo(state, active)

  // With both actions used the turn passes on by itself (to the next Ready member, else to the enemies), after a pause so the result
  // can be read; never waiting for End Turn.
  const turnUsedUp = isPlayerTurn && isTurnFinished(state, active.id) && !state.pending && !awaitingDecision(state)
  const autoEndMs = AUTO_END_TURN_MS
  // An extra action (Extra Minor, Second Major) can still be bought: the character's own ring stays available, and the
  // turn waits while it is open.
  const extraBuyable = !extraMinorReason || !secondMajorReason
  const holdingForExtra = turnUsedUp && extraBuyable && ringId === active.id
  const nextMemberId = isPlayerTurn ? combatActionFor('endTurn').nextMember(state, active) : null
  // A rolled player attack resolves on its own after a beat to read the dice, unless it would miss and a reroll is open.
  const autoResolve = isPlayerTurn && Boolean(state.pending) && state.combatants[state.pending.attackerId].side === 'player' && !rollAwaitsPlayer(state)

  const beamPhase = useBeamIn({ enabled: beamIn, held: helpOpen })
  const { openingDone } = useBattlePacing({
    state, dispatch, openingBanner, helpOpen, aiControlled, auto, speed, hasPlan: Boolean(planned), partyAI, enemyAI,
    turnUsedUp, holdingForExtra, autoEndMs, autoResolve, beamingIn: beamPhase !== 'done',
  })

  const selectPartyMember = (id) => {
    if (canSwitchTo(id)) {
      dispatch({ type: 'selectCombatant', combatantId: id })
      setSelectedId(null)
      return
    }
    setSelectedId(id)
  }

  // Party band pick: for performer rings, hand them the turn when they can still act; for Guard / First Aid / Direct /
  // Assist the pick is the target (synced into taskPick for the Roll arc).
  const pickRingMember = (id) => {
    const next = id === ringPick ? null : id
    setRingPick(next)
    if (mode === 'guard' || mode === 'firstAid' || mode === 'direct' || mode === 'assist') {
      setTaskPick(next)
      if (mode === 'assist') setAssistAllyId(next)
      return
    }
    if (next && canHandTurn(state, active, next)) {
      dispatch({ type: 'selectCombatant', combatantId: next })
      setSelectedId(null)
    }
  }

  const canOpenSelfRing = isPlayerTurn && !state.pending && (!turnUsedUp || extraBuyable)

  const hoverRingButton = (buttonId) => setRingHover(buttonId)

  // Party band + Roll arc for the open ring (exploration pattern).
  const buildRingParty = (context, { buttonLabel = null, roll = null, pulseSlices = false } = {}) => {
    const view = combatRingPartyView(state, context)
    const helperId = context.kind === 'enemy' || context.kind === 'self' || context.kind === 'destructible' ? state.assists[active.id] ?? null : null
    const band = combatRingPartyBand(view, {
      pickedId: ringPick,
      onPick: pickRingMember,
      helperId,
      buttonLabel,
    })
    const picked = ringPick && band.slices.some((slice) => slice.id === ringPick && slice.available)
    return {
      ...band,
      pulse: pulseSlices && !picked,
      roll: roll && picked ? { ...roll, pulse: roll.enabled } : roll && !view.members.length ? roll : picked ? roll : null,
    }
  }

  const ringRoll = confirm.shown
    ? {
        icon: moveArmed || (mode === 'interact' && combatTask?.routine) ? 'check' : 'roll',
        label: moveArmed || (mode === 'interact' && combatTask?.routine) ? confirm.label : null,
        title: confirm.enabled ? `${confirm.label}: commit this action.` : `${confirm.label}: not ready.`,
        enabled: confirm.enabled,
        onClick: confirm.onConfirm,
      }
    : null

  // On the player's turn, clicking an enemy or party member shows action buttons around them (a second click puts them
  // away). An enemy becomes the target with its attack previewed; a party member gets Assist / Switch (or their own
  // actions when they are acting).
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
      setSelectedId(id)
      setRingId(ringId === id ? null : id)
      setRingInfo(false)
      return
    }
    if (unit.side === active.side) {
      if (!isPlayerTurn || state.pending || id === active.id) {
        selectPartyMember(id)
        return
      }
      setSelectedId(id)
      const closing = ringId === id
      setRingId(closing ? null : id)
      setRingInfo(false)
      setDestination(null)
      if (closing) {
        setAssistAllyId(null)
        if (mode === 'assist') setMode(null)
        return
      }
      if (canAssist(state, active, unit)) {
        setMode('assist')
        setAssistAllyId(id)
        setTaskPick(id)
        setRingPick(id)
      } else {
        setAssistAllyId(null)
      }
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

  usePendingObjectHit(state.pendingObjectHit, dispatch, { speed })

  const cycleWeapon = () => {
    const index = active.weaponIds.indexOf(weapon.id)
    setWeaponIds({ ...weaponIds, [active.id]: active.weaponIds[(index + 1) % active.weaponIds.length] })
  }

  const fireAttack = (enemyId, injuryMode) => {
    dispatch({ type: 'attack', targetId: enemyId, weaponId: weapon.id, injuryMode, purchase })
    setDicePurchase({ bonusDice: 0, momentum: 0 })
    setAttackChoice(null)
  }

  const { ambushRingButtons, enemyRingButtons, enemyRingInfo, allyRingButtons, selfRingButtons, objectRingButtons, destructibleRingButtons, destructibleRingInfo } = createRingButtons({
    state, dispatch, active, weapon, mode, ringInfo, attackMode, attackBlock, targetAttack, ringAttackRoll, preview, purchase, purchaseCheck,
    availability, unavailableReasons, extraMinorReason, secondMajorReason, directReason, isCommander, firstAidOptions, objectList,
    canSwitchTo, closeRing, openTask, selectPartyMember, fireAttack, setAttackChoice, setDestination, setMode, setRingInfo, setTaskPick, taskPick,
  })

  const ringObject = ringId?.startsWith('object:') ? objects?.marks?.find((mark) => `object:${mark.id}` === ringId && mark.inReach) : null
  // Destructible objects still standing that may be shot (combat/combatEnvironment.js); the ring goes when it's destroyed.
  const destructibleMarks = standingObjects(state).map((record) => ({ id: record.id, name: record.name, position: record.position }))
  const ringDestructible = ringId?.startsWith('destructible:') ? destructibleMarks.find((mark) => `destructible:${mark.id}` === ringId) : null
  const ringUnit = ringId ? state.combatants[ringId] : null
  const ringShown = isPlayerTurn && ringUnit && isActive(ringUnit) && !state.pending && (!turnUsedUp || (extraBuyable && ringUnit.id === active.id))
  let ring = null
  if (ringShown && ringUnit.id === active.id) {
    const buttons = selfRingButtons()
    const armed =
      mode === 'guard' ||
      mode === 'firstAid' ||
      mode === 'direct' ||
      mode === 'assist' ||
      mode === 'interact' ||
      Boolean(attackMode) ||
      moveArmed
    const kind = mode === 'guard' || mode === 'firstAid' || mode === 'direct' || mode === 'assist' ? mode : 'self'
    const hovered = ringHover ?? (moveArmed ? moveKind : armed ? mode : null)
    const button = buttons.find((entry) => entry.id === hovered) ?? buttons.find((entry) => entry.active)
    ring = {
      unitId: ringUnit.id,
      buttons: buttons.map((entry) => ({ ...entry, pulse: !armed && entry.enabled && !entry.active })),
      info: null,
      party: buildRingParty(
        {
          kind,
          buttonId: kind === 'self' ? hovered : null,
          actorId: active.id,
          guardTargets,
          firstAidOptions,
          directAllies,
          assistAllies,
          objects,
        },
        { buttonLabel: button?.label ?? (moveArmed ? confirm.label : null), roll: ringRoll, pulseSlices: armed && !ringPick },
      ),
      onButtonHover: hoverRingButton,
      slotRef: confirm.shown ? setRollSlot : undefined,
    }
  } else if (ringShown && ringUnit.side !== active.side && mode === 'ambush') {
    const buttons = ambushRingButtons(ringUnit)
    ring = {
      unitId: ringUnit.id,
      buttons,
      info: null,
      party: buildRingParty(
        { kind: 'enemy', buttonId: 'ambush', enemyId: ringUnit.id },
        { buttonLabel: 'Ambush', roll: ringRoll, pulseSlices: !ringPick },
      ),
      onButtonHover: hoverRingButton,
      slotRef: confirm.shown ? setRollSlot : undefined,
    }
  } else if (ringShown && ringUnit.side !== active.side && (mode === 'attack' || mode === 'scan' || SOCIAL_KINDS.includes(mode) || mode === 'ambush') && (target?.id === ringUnit.id || mode === 'ambush')) {
    const buttons = enemyRingButtons(ringUnit)
    const hovered = ringHover ?? (mode === 'scan' || SOCIAL_KINDS.includes(mode) ? mode : attackMode)
    const button = buttons.find((entry) => entry.id === hovered) ?? buttons.find((entry) => entry.active)
    const armed = mode === 'scan' || SOCIAL_KINDS.includes(mode) || Boolean(attackMode)
    ring = {
      unitId: ringUnit.id,
      buttons: buttons.map((entry) => ({ ...entry, pulse: !armed && entry.enabled && !entry.active })),
      info: ringInfo ? enemyRingInfo(ringUnit) : null,
      party: buildRingParty(
        { kind: 'enemy', buttonId: hovered, enemyId: ringUnit.id, weaponId: weapon.id },
        { buttonLabel: button?.label ?? null, roll: ringRoll, pulseSlices: armed && !ringPick },
      ),
      onButtonHover: hoverRingButton,
      slotRef: confirm.shown ? setRollSlot : undefined,
    }
  } else if (ringShown && ringUnit.side === active.side && ringUnit.id !== active.id) {
    const buttons = allyRingButtons(ringUnit)
    const assistArmed = mode === 'assist' && (taskPick === ringUnit.id || ringPick === ringUnit.id)
    ring = {
      unitId: ringUnit.id,
      buttons,
      info: null,
      party: buildRingParty(
        { kind: 'assist', assistAllies: [active] },
        { buttonLabel: 'Assist', roll: assistArmed ? ringRoll : null, pulseSlices: false },
      ),
      onButtonHover: hoverRingButton,
      slotRef: assistArmed ? setRollSlot : undefined,
    }
  } else if (ringObject && isPlayerTurn && !state.pending) {
    const buttons = objectRingButtons(ringObject.id)
    const armed = mode === 'interact' && String(taskPick ?? '').startsWith(`${ringObject.id}:`)
    const actionId = armed ? String(taskPick).slice(ringObject.id.length + 1) : ringHover
    const button = buttons.find((entry) => entry.id === actionId) ?? buttons.find((entry) => entry.active)
    ring = {
      position: ringObject.position,
      buttons: buttons.map((entry) => ({ ...entry, pulse: !armed && entry.enabled && !entry.active })),
      info: null,
      party: buildRingParty(
        { kind: 'object', buttonId: actionId, objectId: ringObject.id, objects },
        { buttonLabel: button?.label ?? null, roll: armed ? ringRoll : null, pulseSlices: armed && !ringPick },
      ),
      onButtonHover: hoverRingButton,
      slotRef: armed ? setRollSlot : undefined,
    }
  } else if (ringDestructible && isPlayerTurn && !state.pending) {
    const buttons = destructibleRingButtons(ringDestructible.id)
    const showDestructibleInfo = ringInfo || mode !== 'scanObject'
    const hovered = ringHover ?? (mode === 'scanObject' ? 'scan' : 'fire')
    const button = buttons.find((entry) => entry.id === hovered)
    const armed = mode === 'scanObject' && taskPick === ringDestructible.id
    ring = {
      position: ringDestructible.position,
      buttons: buttons.map((entry) => ({ ...entry, pulse: !armed && entry.id === 'scan' && entry.enabled && !entry.active })),
      info: showDestructibleInfo ? destructibleRingInfo(ringDestructible.id) : null,
      party: buildRingParty(
        { kind: 'destructible', buttonId: hovered, destructibleId: ringDestructible.id, weaponId: weapon.id },
        { buttonLabel: button?.label ?? null, roll: armed ? ringRoll : null, pulseSlices: armed && !ringPick },
      ),
      onButtonHover: hoverRingButton,
      slotRef: armed ? setRollSlot : undefined,
    }
  } else if (auto !== 'off' && !state.outcome) {
    ring = planned ? choiceRing(state, planned, `plan-${state.log.length}`) : choiceRing(state, lastChoice(state))
  }

  // Default the party-band pick when a ring opens; keep taskPick in sync for Guard / First Aid / Direct / Assist.
  useEffect(() => {
    if (!isPlayerTurn || !ringId) return
    if (ringPick != null) return
    if (mode === 'assist' && ringUnit && ringUnit.side === active.side && ringUnit.id !== active.id) {
      setRingPick(ringUnit.id)
      return
    }
    if (mode === 'guard' || mode === 'firstAid' || mode === 'direct') return
    setRingPick(active.id)
  }, [isPlayerTurn, ringId, ringPick, mode, ringUnit, active.id, active.side])
  useEffect(() => {
    if (!isPlayerTurn || !ringPick) return
    if (mode === 'guard' || mode === 'firstAid' || mode === 'direct') {
      if (taskPick !== ringPick) setTaskPick(ringPick)
    }
    if (mode === 'assist') {
      if (assistAllyId !== ringPick) setAssistAllyId(ringPick)
      if (taskPick !== ringPick) setTaskPick(ringPick)
    }
  }, [isPlayerTurn, ringPick, mode, taskPick, assistAllyId])
  useEffect(() => {
    if (!confirm.shown) setRollSlot(null)
  }, [confirm.shown])

  // Party bar in the order the party was picked (combatants are stored players first, in pick order).
  const party = Object.values(state.combatants).filter((combatant) => combatant.side === 'player')
  const enemies = Object.values(state.combatants).filter((combatant) => combatant.side !== 'player')
  const partyWeapons = Object.fromEntries(party.map((member) => [member.id, getCombatantWeapon(member, weaponIds[member.id] ?? member.weaponIds[0])]))
  const minimapParty = minimapPartyFromCombat(party, { selectedId, leaderId: active.id })
  const minimapWorld = minimapWorldFromCombat(enemies, bystanders)
  const minimapKnowledge = minimapKnowledgeForCombat(knowledge, minimapWorld.npcIds)
  const rollBelongsToPlayer = Boolean((state.pending ?? state.result) && isPlayerControlled(state.combatants[(state.pending ?? state.result).attackerId]))
  const hint = hiddenIds?.includes(active.id) ? 'The enemy is acting.' : getCombatHint(state, {
    taskPreview: combatTask?.task?.prepared
      ? { available: combatTask.task.available, reason: combatTask.task.reason, label: combatTask.task.label, task: { difficulty: combatTask.task.prepared.difficulty, targetNumber: combatTask.task.prepared.task.targetNumber } }
      : null,
    directBlock: directReason,
    planned, mode, attackMode, preview, bonusDice: purchase.bonusDice, ambushPreview, movePath, routeInCover, auto, targetInRange, assistAlly, assistHelper, ringAllyName: ringShown && ringUnit.side === active.side ? ringUnit.character.name : null, nextName: nextMemberId && state.combatants[nextMemberId].character.name })
  const hintFaded = useFadeAfter(hint)

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

  const fledNow = justFled(state)
  const activeHidden = Boolean(hiddenIds?.includes(active.id) || (fledNow && hiddenIds?.includes(fledNow.id)))

  // When the last enemy flees, its beam-out plays before the result covers the map.
  const beamOutKey = state.outcome && fledNow ? `${state.seed}:${state.lastAction.key}` : null
  const [beamOutDoneKey, setBeamOutDoneKey] = useState(null)
  const effectSpeed = auto === 'off' ? 1 : speed
  useEffect(() => {
    if (!beamOutKey) return undefined
    const timer = setTimeout(() => setBeamOutDoneKey(beamOutKey), BEAM_OUT_MS / effectSpeed)
    return () => clearTimeout(timer)
  }, [beamOutKey, effectSpeed])
  // Exit Mission on the result (a Load Episode fight): the away team beams up, then back to the menu.
  const [partyBeamingOut, setPartyBeamingOut] = useState(false)
  useEffect(() => {
    if (!partyBeamingOut) return undefined
    playBeamOutSound(BEAM_OUT_MS / 1000)
    const timer = setTimeout(onExit, BEAM_OUT_MS)
    return () => clearTimeout(timer)
  }, [partyBeamingOut, onExit])
  const resultShown = Boolean(state.outcome) && (!beamOutKey || beamOutDoneKey === beamOutKey) && !partyBeamingOut

  // During an unseen enemy's turn the camera stays where it was, so it never points at what the party can't perceive.
  // With follow on, a fired shot rides the beam from the shooter to where it was aimed (presentation only).
  const [shotFocus, setShotFocus] = useState(null)
  const shotKey = shotAim(state)?.key ?? null
  useEffect(() => {
    const aim = shotAim(state)
    if (!followCamera || !aim || activeHidden) {
      setShotFocus(null)
      return undefined
    }
    const track = { ...aim, from: { ...aim.from }, to: { ...aim.to } }
    const started = performance.now()
    const rideMs = shotCameraRideMs(track, effectSpeed)
    let frame = 0
    const tick = (now) => {
      setShotFocus(cameraFocusAlongShot(track, now - started, effectSpeed))
      if (now - started < rideMs) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // Snapshot the aim when the shot begins; restarting mid-flight would snap the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shotKey / followCamera / effectSpeed / activeHidden
  }, [followCamera, shotKey, effectSpeed, activeHidden])
  const baseFocus = openingFocus && !state.lastAction ? { key: 'opening', position: openingFocus } : cameraFocus(state, turnKey, active)
  const followFocus = shotFocus ?? baseFocus
  const [heldFocus, setHeldFocus] = useState(followFocus)
  const focusChanged = heldFocus.key !== followFocus.key || heldFocus.position.x !== followFocus.position.x || heldFocus.position.y !== followFocus.position.y
  if (!activeHidden && focusChanged) setHeldFocus(followFocus)
  const focus = activeHidden ? heldFocus : followFocus

  return (
    <div className="combat-screen">
      <PerfProfiler id="combat.board">
        <Battlefield
          state={state}
          activeId={active.id}
          targetId={isPlayerTurn ? target?.id : (state.pending ?? state.result)?.targetId}
          selectedId={selectedId}
          turnInfo={active.side === 'player' ? turnInfo : {}}
          overlay={overlay}
          ring={ring}
          msPerTile={MOVE_TILE_MS / (auto === 'off' ? 1 : speed)}
          speed={auto === 'off' || partyBeamingOut ? 1 : speed}
          focus={focus}
          followCamera={followCamera}
          onCameraFollow={() => setFollowCamera(true)}
          bystanders={bystanders}
          snapMarks={snapMarks}
          hiddenIds={hiddenIds}
          lastKnownMarks={lastKnownMarks}
          onTileClick={handleTileClick}
          onTileHover={setHoverTile}
          onUnitClick={handleUnitClick}
          onRightClick={releaseSelection}
          beamIn={beamPhase}
          beamOut={partyBeamingOut}
          objectMarks={objects?.marks ?? null}
          onObjectClick={(objectId) => {
            if (!isPlayerTurn) return
            setRingId(ringId === `object:${objectId}` ? null : `object:${objectId}`)
            setRingInfo(false)
          }}
          destructibleMarks={destructibleMarks}
          onDestructibleClick={(objectId) => {
            if (!isPlayerTurn) return
            setRingId(ringId === `destructible:${objectId}` ? null : `destructible:${objectId}`)
          }}
          onStaggerDone={(id) => dispatch({ type: 'clearBlastReact', id })}
        />
      </PerfProfiler>
      <WeatherFx fx={weatherFor(state.weather).fx} follow=".battlefield" />
      <div className="combat-top-center">
        <TurnOrderStrip state={state} hiddenIds={hiddenIds} />
        <CombatMatchup
          attacker={active}
          attackerWeapon={weapon}
          target={isPlayerTurn ? target : state.combatants[(state.pending ?? state.result)?.targetId] ?? null}
        />
      </div>
      {!openingDone && <TurnBanner title={openingBanner.title} subtitle={openingBanner.subtitle} side="start" />}
      {openingDone && banner.title && !state.outcome && <TurnBanner key={banner.key} title={banner.title} subtitle={banner.subtitle} side={banner.side} />}
      {/* Right column: toolbar panel, then minimap, Momentum, Task / End Turn. */}
      <Minimap
        map={state.map}
        party={minimapParty}
        world={minimapWorld}
        knowledge={minimapKnowledge}
        environment={environment}
        doors={doors}
        debug={debugOpen}
        open={minimapOpen}
        onToggle={() => setMinimapOpen(!minimapOpen)}
        toolbarOutside
        cornerButtons={
          <>
            {!state.outcome && (
              <AutoCombatControls
                auto={auto}
                speed={speed}
                onStart={startAuto}
                onStop={() => setAuto('off')}
                onSpeed={setSpeed}
              />
            )}
            <button type="button" className="explore-minimap-toggle" aria-label="Settings" title="Settings" onClick={openSettings}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={SETTINGS_ICON} />
              </svg>
            </button>
            <button
              type="button"
              className="explore-minimap-toggle"
              aria-pressed={followCamera}
              aria-label="Camera"
              title={followCamera ? 'The view moves to whoever is acting. Click to stop.' : 'The view stays where you put it. Click or press Space to glide back to whoever is acting.'}
              onClick={() => setFollowCamera(!followCamera)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={CAMERA_ICON} />
              </svg>
            </button>
            <button type="button" className="explore-minimap-toggle" aria-label="How to Play" title="How to Play" onClick={() => setHelpOpen(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={HELP_ICON} />
              </svg>
            </button>
            <button
              type="button"
              className="explore-minimap-toggle"
              aria-pressed={debugOpen}
              aria-label="Debug"
              title={debugOpen ? 'Hide the debug panel.' : 'Show the debug panel.'}
              onClick={toggleDebug}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={DEBUG_ICON} />
              </svg>
            </button>
            <button type="button" className="explore-minimap-toggle" aria-label="Exit" title="Exit" onClick={onExit}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={EXIT_ICON} />
              </svg>
            </button>
          </>
        }
      >
        <ResourceIndicators
          momentum={state.resources.momentum}
          threat={state.resources.threat}
          canCancelThreat={isPlayerTurn && !combatActionFor('cancelThreat').unavailableReason(state, active)}
          onCancelThreat={() => dispatch({ type: 'cancelThreat' })}
        />
        <div className="combat-sidebar">
          <TaskPanel
            mode={mode}
            isPlayerTurn={isPlayerTurn}
            autoTurn={auto !== 'off' && isPlayerControlled(active)}
            preview={preview}
            movePath={movePath}
            routeInCover={routeInCover}
            assist={{ allies: assistAllies, allyId: assistAlly?.id ?? null, onAlly: setAssistAllyId, helper: assistHelper }}
            ambush={ambushPreview}
            dicePurchase={{ resources: state.resources, value: purchase, onChange: setDicePurchase }}
            combatTask={combatTask}
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
      </Minimap>
      <PartyBar party={party} activeId={active.id} selectedId={selectedId} turnInfo={turnInfo} onSelect={selectPartyMember} recommendation={combatTask?.recommendation ?? null}
        weapons={partyWeapons}
        onCycleWeapon={isPlayerTurn && active.weaponIds.length > 1 ? cycleWeapon : null}
      />
      {rollSlot &&
        confirm.shown &&
        isPlayerTurn &&
        !state.pending &&
        ((mode === 'attack' && preview?.available) ||
          Boolean(combatTask?.task?.available && combatTask.task?.prepared) ||
          mode === 'scan' ||
          mode === 'scanObject' ||
          SOCIAL_KINDS.includes(mode)) &&
        createPortal(
          <BonusDicePicker resources={state.resources} value={purchase} onChange={setDicePurchase} />,
          rollSlot,
        )}
      <div className="combat-bottom-left">
        {hint && showHints && (
          <p className={`combat-hint${isPlayerTurn ? ' is-player-turn' : ''}${hintFaded ? ' is-faded-out' : ''}`} aria-live="polite">
            {hint}
          </p>
        )}
        <RollPanel
          state={state}
          speed={auto === 'off' ? 1 : speed}
          playerControls={rollBelongsToPlayer && isPlayerTurn}
          awaitingChoice={rollAwaitsPlayer(state)}
          onReroll={(dieIndex, source) => dispatch({ type: 'reroll', dieIndex, source })}
          onResolve={() => dispatch({ type: 'resolveAttack' })}
        />
      </div>
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
      {resultShown && <CombatResultModal outcome={state.outcome} onRestart={onRestart} onChangeCharacter={onChangeCharacter} onExit={() => setPartyBeamingOut(true)} onContinue={onContinue} failedNames={failedNames} onExitMission={onExitMission} />}
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
        beamIn
        showHelpOnStart={!helpSeen}
        onHelpSeen={() => setHelpSeen(true)}
        onRestart={() => start(party, fixedSeed, map)}
        onChangeCharacter={() => setPhase('setup')}
        onExit={onExit}
      />
    </MapFadeIn>
  )
}
