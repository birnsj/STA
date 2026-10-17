import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { isPlayerControlled } from '../actors/controllers.js'
import { playBeamOutSound } from '../audio/uiSounds.js'
import { useDisplaySettings } from '../settings/DisplaySettingsContext.js'
import { samePosition, tileKey } from '../combat/battleMap.js'
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
import { buildCombatView } from '../combat/combatView.js'
import { standingObjects } from '../combat/combatEnvironment.js'
import { DEFAULT_ENCOUNTER_ID, getEncounter } from '../combat/encounters.js'
import { autoCombatReducer } from '../combat/autoCombat.js'
import { getCombatantWeapon } from '../combat/weaponSystem.js'
import buildTaskPanel from '../components/combat/buildTaskPanel.js'
import createRingButtons from '../components/combat/ringButtons.js'
import useBattlePacing from '../components/combat/useBattlePacing.js'
import useBeamIn from '../components/combat/useBeamIn.js'
import Battlefield from '../components/combat/PixiBattlefield.jsx'
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
  choiceRing,
  getPartyTurnInfo,
  justFled,
  lastChoice,
  MOVE_TILE_MS,
  nearestOpponentId,
  newSeed,
  plannedChoice,
  SELF_RING_CLOSE_MS,
  turnBanner,
} from '../components/combat/battleHelpers.js'

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
  // Settings > Help Hints off: the hint text goes (the Ambush button that shares its box stays), and How to Play
  // does not open by itself (the How to Play button still works).
  const showHints = useDisplaySettings().helpHints
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
  const [destination, setDestination] = useState(null)
  const [assistAllyId, setAssistAllyId] = useState(null)
  const [hoverTile, setHoverTile] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [ownDebugOpen, setOwnDebugOpen] = useState(false)
  const debugOpen = worldDebugOpen ?? ownDebugOpen
  const toggleDebug = onDebug ?? (() => setOwnDebugOpen(!ownDebugOpen))
  const [followCamera, setFollowCamera] = useState(true)
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
    ambushPreview, ambusher, ambushTargets,
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

  // Object shot: laser first, then Structure / explosion after the beam lands.
  const pendingObjectHit = state.pendingObjectHit
  useEffect(() => {
    if (!pendingObjectHit) return undefined
    const timer = setTimeout(() => dispatch({ type: 'applyPendingObjectHit' }), pendingObjectHit.impactMs / speed)
    return () => clearTimeout(timer)
  }, [pendingObjectHit?.key, pendingObjectHit?.impactMs, speed, dispatch])

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
    canSwitchTo, closeRing, openTask, selectAction, selectPartyMember, fireAttack, setAttackChoice, setDestination, setMode, setRingInfo, setTaskPick, taskPick,
  })

  const ringObject = ringId?.startsWith('object:') ? objects?.marks?.find((mark) => `object:${mark.id}` === ringId && mark.inReach) : null
  // Destructible objects still standing that may be shot (combat/combatEnvironment.js); the ring goes when it's destroyed.
  const destructibleMarks = standingObjects(state).map((record) => ({ id: record.id, name: record.name, position: record.position }))
  const ringDestructible = ringId?.startsWith('destructible:') ? destructibleMarks.find((mark) => `destructible:${mark.id}` === ringId) : null
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
  } else if (ringObject && isPlayerTurn && !state.pending) {
    ring = { position: ringObject.position, buttons: objectRingButtons(ringObject.id), info: null }
  } else if (ringDestructible && isPlayerTurn && !state.pending) {
    ring = { position: ringDestructible.position, buttons: destructibleRingButtons(ringDestructible.id), info: destructibleRingInfo(ringDestructible.id) }
  } else if (auto !== 'off' && !state.outcome) {
    ring = planned ? choiceRing(state, planned, `plan-${state.log.length}`) : choiceRing(state, lastChoice(state))
  }

  // Party bar in the order the party was picked (combatants are stored players first, in pick order).
  const party = Object.values(state.combatants).filter((combatant) => combatant.side === 'player')
  const enemies = Object.values(state.combatants).filter((combatant) => combatant.side !== 'player')
  const partyWeapons = Object.fromEntries(party.map((member) => [member.id, getCombatantWeapon(member, weaponIds[member.id] ?? member.weaponIds[0])]))
  const shownCharacter = (selectedId && state.combatants[selectedId]) || active
  const encounter = getEncounter(state.encounterId)
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
  const followFocus = openingFocus && !state.lastAction ? { key: 'opening', position: openingFocus } : cameraFocus(state, turnKey, active)
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
          onUnitHover={handleUnitHover}
          onRingHover={(entering) => ringId === active.id && hoverSelfRing(entering)}
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
      <TurnOrderStrip state={state} hiddenIds={hiddenIds} />
      {!openingDone && <TurnBanner title={openingBanner.title} subtitle={openingBanner.subtitle} side="start" />}
      {openingDone && banner.title && !state.outcome && <TurnBanner key={banner.key} title={banner.title} subtitle={banner.subtitle} side={banner.side} />}
      {/* Right column matches exploration: Objectives beside the minimap, Momentum/Threat under it, then the fight panels. */}
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
        leading={encounter.objectives?.length ? <ObjectivesPanel objectives={encounter.objectives} complete={state.outcome === 'victory'} /> : null}
      >
        <ResourceIndicators
          momentum={state.resources.momentum}
          threat={state.resources.threat}
          canCancelThreat={isPlayerTurn && !combatActionFor('cancelThreat').unavailableReason(state, active)}
          onCancelThreat={() => dispatch({ type: 'cancelThreat' })}
        />
        <div className="combat-minimap-toolbar" aria-label="Combat controls">
          <button
            type="button"
            className="combat-button is-small"
            aria-pressed={followCamera}
            title={followCamera ? 'The view moves to whoever is acting. Click to stop.' : 'The view stays where you put it. Click or press Space to glide back to whoever is acting.'}
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
            autoTurn={auto !== 'off' && isPlayerControlled(active)}
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
      </Minimap>
      <PartyBar party={party} activeId={active.id} selectedId={selectedId} turnInfo={turnInfo} onSelect={selectPartyMember} recommendation={combatTask?.recommendation ?? null}
        weapons={partyWeapons}
        onCycleWeapon={isPlayerTurn && active.weaponIds.length > 1 ? cycleWeapon : null}
      />
      <div className="combat-bottom-left">
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
        <RollPanel
          state={state}
          speed={auto === 'off' ? 1 : speed}
          playerControls={rollBelongsToPlayer && isPlayerTurn}
          awaitingChoice={rollAwaitsPlayer(state)}
          onReroll={(dieIndex, source) => dispatch({ type: 'reroll', dieIndex, source })}
          onResolve={() => dispatch({ type: 'resolveAttack' })}
        />
        <div className="combat-bottom-row">
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
        </div>
      </div>
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
        beamIn
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
