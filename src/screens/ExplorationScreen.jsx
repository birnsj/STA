import { useCallback, useEffect, useReducer, useState } from 'react'
import { samePosition } from '../combat/battleMap.js'
import { useDisplaySettings, useOpenSettings } from '../settings/DisplaySettingsContext.js'
import ResourceIndicators from '../components/combat/ResourceIndicators.jsx'
import ObjectivesPanel from '../components/combat/ObjectivesPanel.jsx'
import useBeamIn from '../components/combat/useBeamIn.js'
import usePendingObjectHit from '../components/usePendingObjectHit.js'
import ChallengePanel from '../components/exploration/ChallengePanel.jsx'
import CharacterSheetPanel from '../components/exploration/CharacterSheetPanel.jsx'
import CaptainsLogPanel from '../components/exploration/CaptainsLogPanel.jsx'
import InventoryPanel, { InventoryDragGhost } from '../components/exploration/InventoryPanel.jsx'
import useChallengeInteraction from '../components/exploration/useChallengeInteraction.js'
import useItemDrag from '../components/exploration/useItemDrag.js'
import useTalkTo from '../components/exploration/useTalkTo.js'
import useRingMenus from '../components/exploration/useRingMenus.js'
import { MissionIntro, MissionOutro } from '../components/exploration/MissionStory.jsx'
import MissionEndDialogs from '../components/exploration/MissionEndDialogs.jsx'
import useMissionEnding, { useWorldClock } from '../components/exploration/useMissionEnding.js'
import TransporterDialog from '../components/exploration/TransporterDialog.jsx'
import useTransporter from '../components/exploration/useTransporter.js'
import { getPlaytestParty } from '../character/authoredCharacters.js'
import { normalizeCharacterRecord } from '../character/runtimeCharacter.js'
import ConversationPanel from '../components/exploration/ConversationPanel.jsx'
import Board from '../components/exploration/PixiExplorationBoard.jsx'
import { AwarenessPanel, DebugPanel, ScenarioDebugPanel } from '../components/exploration/ExplorationDebugPanels.jsx'
import { ActionsToggle, ExplorationActionButtons, ExplorationPartyBar, FormationPanel } from '../components/exploration/ExplorationPartyBar.jsx'
import {
  destructibleInfo,
  destructibleMenuButtons,
  groundItemInfo,
  groundItemMenuButtons,
  memberMenuButtons,
  npcInfo,
  npcMenuButtons,
  objectInfo,
  objectMenuButtons,
  ringPartyBand,
} from '../components/exploration/explorationRings.js'
import ExplorationSetup from '../components/exploration/ExplorationSetup.jsx'
import useExplorationFootsteps from '../components/exploration/useExplorationFootsteps.js'
import useExplorationKeys from '../components/exploration/useExplorationKeys.js'
import Minimap from '../components/exploration/Minimap.jsx'
import MapFadeIn from '../components/maps/MapFadeIn.jsx'
import '../components/exploration/exploration.css'
import '../components/maps/mapEditor.css'
import awarenessData from '../data/adaptation/exploration/awareness.json'
import WeatherFx from '../effects/WeatherFx.jsx'
import { dispositionName, getNpcs, isHostile, partyHearsWalker } from '../exploration/awareness.js'
import ConfirmDialog from '../components/maps/ConfirmDialog.jsx'
import { challengeFor, getChallengeViews, INTERACT_RANGE, objectivePosition, objectsInReach } from '../exploration/challengeObjects.js'
import { MODE } from '../exploration/combatLink.js'
import { createExplorationState, explorationReducer, npcsInTalkRange } from '../exploration/explorationState.js'
import { objectiveStatus } from '../exploration/missionFlags.js'
import { failedNpcNames, isMissionAccomplished, isMissionFailed } from '../exploration/missionObjectives.js'
import { recommendPartyAction } from '../exploration/partyActions.js'
import { objectFor } from '../world/objects.js'
import { activeHazards, isStanding } from '../world/environment.js'
import { hazardChallengeId, isHazardChallengeId } from '../world/EnvironmentalHazard.js'
import { canAct, getMembers } from '../exploration/partyControl.js'
import { isVisibleToParty } from '../exploration/partyKnowledge.js'
import { bagFreeSlots, groundItemViews } from '../rules/inventory.js'
import { groundItemFor } from '../world/GroundItem.js'
import { weatherFor } from '../maps/mapWeather.js'
import { npcButtonPerformer } from '../exploration/ringParty.js'
import ScanReport from '../components/exploration/ScanReport.jsx'
import { CHARACTER_SCAN_RADIUS, OBJECT_SCAN_RADIUS } from '../components/exploration/scanSweep.js'
import useFadeAfter from '../components/useFadeAfter.js'
import { playRequestSound, playScanSound } from '../audio/uiSounds.js'
import { MAX_SEED } from '../rules/seededRandom.js'
import WorldCombat from './WorldCombat.jsx'
import PerfProfiler from '../dev/PerfProfiler.jsx'
import { withPerf } from '../dev/perfReducer.js'

const reducer = withPerf(explorationReducer)

// An open book, for the Captain's Log button in the minimap's corner.
const LOG_ICON = 'M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5c2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5zM12 6v13'
const SETTINGS_ICON = 'M12 15.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM12 2.5v2.2M12 19.3v2.2M4.8 6.2l1.6 1.5M17.6 16.3l1.6 1.5M4.8 17.8l1.6-1.5M17.6 7.7l1.6-1.5M2.5 12h2.2M19.3 12h2.2'

// Who the transporter can beam down: anyone who beamed out, then authored playtest redshirts and saved characters not
// already on the away team. Editor Play uses the redshirts (characters.json playtestParty); they are not saved
// characters, so without this they never appeared in the picker.
function transporterCandidates(party, savedCharacters) {
  const onMission = new Set(party.memberIds)
  const departedIds = new Set((party.departedIds ?? []).filter((id) => !onMission.has(id)))
  const listed = new Set(onMission)
  const candidates = []

  departedIds.forEach((id) => {
    const character = party.members[id]?.character
    if (!character) return
    listed.add(id)
    candidates.push({ character, departed: true })
  })

  getPlaytestParty().forEach((character) => {
    if (!character || listed.has(character.id) || onMission.has(character.id)) return
    listed.add(character.id)
    // Prefer the mission copy (condition) when they beamed out earlier but missed departedIds somehow.
    const prior = party.members[character.id]?.character
    candidates.push({ character: prior ?? character, departed: departedIds.has(character.id) || Boolean(party.members[character.id]) })
  })

  savedCharacters.forEach((entry) => {
    const character = normalizeCharacterRecord(entry.record, { id: entry.id }).character
    if (!character || listed.has(character.id) || onMission.has(character.id) || party.members[character.id]) return
    listed.add(character.id)
    candidates.push({ character, departed: false })
  })

  return candidates
}

// savedCharacters: the saved characters the transporter can beam down.
function Exploration({ state, dispatch, savedCharacters, onExit, exitLabel }) {
  const { party, world } = state
  const { helpHints: showHints, objectivePulse: pulseObjectives, missionOutro: playOutro, cameraFollow } = useDisplaySettings()
  const { open: settingsOpen, openSettings } = useOpenSettings()
  const [followCamera, setFollowCamera] = useState(cameraFollow)
  const stopFollowing = useCallback(() => setFollowCamera(false), [])
  const startFollowing = useCallback(() => setFollowCamera(true), [])
  const [debugOpen, setDebugOpen] = useState(false)
  const [minimapOpen, setMinimapOpen] = useState(true)
  const [noiseTool, setNoiseTool] = useState(false)
  // UI state: the challenge object whose interaction panel is open, and the panel's own state (see useChallengeInteraction).
  const {
    interaction,
    interactionId,
    openInteraction,
    closeInteraction,
    panelActionId,
    setPanelActionId,
    rollSlot,
    setRollSlot,
    objectRoll,
    setObjectRoll,
    recommendation,
    updateRecommendation,
  } = useChallengeInteraction()
  // UI state: the action button being considered (the party cards show who is best at it).
  const [consideredActionId, setConsideredActionId] = useState(null)
  // UI state: whether the action buttons are showing (the Actions button opens and closes them).
  const [actionsOpen, setActionsOpen] = useState(false)
  // A hidden action can't stay considered, or the party cards would keep highlighting for a button nobody can see.
  const toggleActions = useCallback(() => {
    setActionsOpen((open) => !open)
    setConsideredActionId(null)
  }, [])
  // UI state: whether the character sheet is open (C toggles it); selecting never opens it (designer decision).
  const [sheetOpen, setSheetOpen] = useState(false)
  // UI state: floating inventory (I, also B); position remembered in localStorage.
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [inventoryViewId, setInventoryViewId] = useState(null)
  // UI state: dragging an item between the inventory panel and the world (see useItemDrag).
  const {
    itemDrag,
    placeHover,
    itemDragRef,
    placeHelpersRef,
    inventoryPanelRef,
    beginItemDrag,
    clearItemDrag,
    onBoardPlaceHover,
  } = useItemDrag({ state, dispatch })
  // UI state: whether the Captain's Log panel is open.
  const [logOpen, setLogOpen] = useState(false)

  // UI state: walk-then-pick-up for a ground item (same idea as pendingTalk for NPCs).
  const [pendingPickup, setPendingPickup] = useState(null)
  const members = getMembers(party)
  const inCombat = state.mode === MODE.COMBAT
  useExplorationFootsteps(members, !inCombat)
  useExplorationFootsteps(getNpcs(world).filter((npc) => partyHearsWalker(party.map, members, npc)), !inCombat)
  // The away team beams in as the mission starts; move orders wait until they are all here.
  const beamPhase = useBeamIn()
  const challengeViews = getChallengeViews(state.scenario)
  // The door objects for the minimap; a door is closed while its state puts a tile over the doorway.
  const minimapDoors = challengeViews
    .map((view) => objectFor(state.scenario, view.id))
    .filter((object) => object.definition.type === 'door')
    .map((object) => {
      const doorState = object.runtime(state.scenario).state
      const info = object.definition.states[doorState] ?? {}
      return { id: object.id, name: object.definition.name, stateLabel: info.label ?? doorState, closed: Boolean(info.tile), cells: object.tiles() }
    })
  // Hazards with a Neutralize task (world/EnvironmentalHazard.js), each on its own ring like a challenge object.
  const hazardChallenges = activeHazards(state.environment)
    .filter((region) => region.neutralizable !== false)
    .map((region) => challengeFor(state, hazardChallengeId(region.id)))
    .filter(Boolean)
  const hazardInReachIds = hazardChallenges.filter((object) => object.membersInRange(party).length > 0).map((object) => object.id)
  const inReachIds = [...objectsInReach(state, party.memberIds).map((definition) => definition.id), ...hazardInReachIds]
  // An object whose approaches are all still locked can be clicked too, to see what it would take.
  const reachableIds = inReachIds.filter((id) => challengeFor(state, id).listedActions(state).length > 0)
  const talking = Boolean(state.conversation)
  // A hazard put out by the roll is gone at once; its panel stays to show the result.
  const neutralizedShowing = isHazardChallengeId(interactionId) && state.lastTask?.objectId === interactionId && !challengeFor(state, interactionId)
  const openId = !talking && interactionId && (inReachIds.includes(interactionId) || neutralizedShowing) ? interactionId : null
  // Destructible objects the party can fire on (world/environment.js), each with a Fire ring.
  const destructibleViews = Object.values(state.environment?.destructibles ?? {})
    .filter((record) => isStanding(record) && record.attackable)
    .map((record) => ({ id: record.id, name: record.name, position: record.position }))
  // An object's panel or a conversation is open: other rings and the action buttons stay closed meanwhile.
  const panelOpen = Boolean(openId) || talking
  const talkable = talking ? [] : npcsInTalkRange(state, party.memberIds)
  // UI state: talking to an NPC, now or once the party has walked over (see useTalkTo).
  const { talkError, talkTo, talkWhenInReach, cancelPendingTalk } = useTalkTo({ state, dispatch, talkable, onOpened: closeInteraction })
  const knownObjectives = (party.map.objectives ?? [])
    .map((objective) => ({ ...objective, position: objectivePosition(party.map, objective), status: objectiveStatus(state.scenario.flags, objective.id) }))
    .filter(({ status }) => status)
  // The objects the active objectives are on: their tags pulse on the map (Settings > Pulse Objective Tag).
  const objectiveObjectIds = new Set(knownObjectives.filter((objective) => objective.status === 'active' && objective.objectId).map((objective) => objective.objectId))
  // UI state: the Objectives panel's Show all, which adds the objectives not started yet (greyed).
  const [showAllObjectives, setShowAllObjectives] = useState(false)
  const objectives = (party.map.objectives ?? [])
    .map(({ id, title }) => {
      const status = objectiveStatus(state.scenario.flags, id)
      return { id, text: title || id, complete: status === 'complete', pending: !status }
    })
    .filter((objective) => showAllObjectives || !objective.pending)
  const hasPendingObjectives = (party.map.objectives ?? []).some(({ id }) => !objectiveStatus(state.scenario.flags, id))

  // Mission Accomplished, Exit Mission, Beam Out and the outro (useMissionEnding.js); the world stops at the end.
  const ending = useMissionEnding({ state, dispatch, inCombat, talking })
  const { beaming, outro } = ending
  // With the outro off in Settings, beaming everyone out leaves the mission as the outro's exit button would.
  useEffect(() => {
    if (outro && !playOutro) onExit()
  }, [outro, playOutro, onExit])
  useWorldClock(dispatch, !ending.paused && !settingsOpen)
  // UI state: the transporter's picker is open (the last fight's id when opened; a fight since closes it).
  const beamIn = useTransporter(dispatch)
  const [transporterFor, setTransporterFor] = useState(null)
  const fightId = state.lastCombat?.id ?? 0
  const transporterOpen = transporterFor === fightId && !inCombat
  const canBeamIn = beamPhase === 'done' && !beaming && !ending.paused
  const openTransporter = useCallback(() => setTransporterFor(fightId), [fightId, setTransporterFor])

  // UI state: the one radial menu that is open, as the id for each kind (null when another kind is open): a party member
  // (right-click on them), an NPC (left click), a challenge object (left click while in reach), a destructible (its Fire
  // ring) or a ground item.
  const {
    menuMemberId,
    menuNpcId,
    menuObjectId,
    menuDestructibleId,
    menuGroundItemId,
    showMemberMenu,
    showNpcMenu,
    toggleObjectMenu,
    toggleDestructibleMenu,
    toggleGroundItemMenu,
    closeMenu,
    closeAllMenus,
  } = useRingMenus()
  // UI state: whether the open NPC's Info card shows; the NPC whose Attack is waiting for confirmation.
  const [npcInfoOpen, setNpcInfoOpen] = useState(false)
  const [confirmAttackId, setConfirmAttackId] = useState(null)
  // UI state, for the open NPC or object ring (ringKey): the button last hovered and the member picked on its party band.
  // Opening another ring starts both afresh.
  const [ringHover, setRingHover] = useState(null)
  const [ringPick, setRingPick] = useState(null)
  // UI state: who opens fire once an Attack is confirmed, and who was picked to answer the checks of the conversation
  // last opened from Talk (null: the best for each check).
  const [confirmAttackerId, setConfirmAttackerId] = useState(null)
  const [talkPickedId, setTalkPickedId] = useState(null)
  // UI state: the last scan whose report the player closed (lastScan.key).
  const [closedScanKey, setClosedScanKey] = useState(null)
  const lastScan = state.lastScan
  const lastScanKey = lastScan?.key
  const lastTargetScan = state.lastTargetScan
  const lastTargetScanKey = lastTargetScan?.key
  useEffect(() => {
    if (lastScanKey != null) playScanSound()
  }, [lastScanKey])
  useEffect(() => {
    if (lastTargetScanKey != null) playScanSound()
  }, [lastTargetScanKey])
  usePendingObjectHit(state.pendingObjectHit, dispatch, { enabled: !inCombat })
  const lastSocialKey = state.lastSocial?.key
  const lastSocialKind = state.lastSocial?.kind
  const lastSocialPassed = state.lastSocial?.passed
  useEffect(() => {
    if (lastSocialKey != null) playRequestSound(lastSocialKind, lastSocialPassed)
  }, [lastSocialKey, lastSocialKind, lastSocialPassed])
  // UI state: the scan whose sweep has finished playing, so a fight and back doesn't replay it.
  const [sweptScanKey, setSweptScanKey] = useState(null)
  // Area scan: one ring out to the tricorder radius. NPC scan: a small ring on the scanner and on the NPC.
  // Challenge / destructible Scan: big tricorder ring around the scanner, smaller ring on the object.
  // Only the newer of the two plays (both keys count tasks): sweptScanKey holds one key, so playing the older one
  // after the newer would mark the newer unplayed again and the two would take turns for ever.
  const areaScanIsNewer = lastScan != null && (lastTargetScan == null || lastScanKey > lastTargetScanKey)
  const targetScanRings = (() => {
    if (!lastTargetScan?.origin || !lastTargetScan.targetOrigin) return null
    if (lastTargetScan.objectId) {
      return [
        { origin: lastTargetScan.origin, radius: lastTargetScan.radius ?? CHARACTER_SCAN_RADIUS },
        { origin: lastTargetScan.targetOrigin, radius: OBJECT_SCAN_RADIUS },
      ]
    }
    return [
      { origin: lastTargetScan.origin, radius: CHARACTER_SCAN_RADIUS },
      { origin: lastTargetScan.targetOrigin, radius: CHARACTER_SCAN_RADIUS },
    ]
  })()
  const scanPulse =
    areaScanIsNewer
      ? lastScan.origin && sweptScanKey !== lastScanKey
        ? { key: lastScanKey, rings: [{ origin: lastScan.origin, radius: lastScan.radius }], onDone: () => setSweptScanKey(lastScanKey) }
        : null
      : lastTargetScan && sweptScanKey !== lastTargetScanKey && targetScanRings
        ? { key: lastTargetScanKey, rings: targetScanRings, onDone: () => setSweptScanKey(lastTargetScanKey) }
        : null
  const select = useCallback((id, additive) => dispatch({ type: additive ? 'toggleSelect' : 'select', id }), [dispatch])
  const selectBox = useCallback((ids, additive) => dispatch({ type: 'selectBox', ids, additive }), [dispatch])
  // Right-click opens a member's menu and adds them to the selection; whoever else is selected stays selected.
  const selectedIds = state.party.selectedIds
  const openMenu = (id) => {
    if (!selectedIds.includes(id)) dispatch({ type: 'toggleSelect', id })
    showMemberMenu(id)
  }
  // Left-click a ground item: walk the selected party over and pick it up when in reach (pendingPickup).
  // Right-click still opens the Pick Up / Go To ring (PixiExplorationBoard).
  const openGroundItemMenu = (id) => {
    if (itemDragRef.current) return
    toggleGroundItemMenu(id)
  }

  const groundPickupMemberId = useCallback(
    (instanceId) => {
      const ground = state.groundItems?.[instanceId]
      if (!ground || ground.pickable === false) return null
      // Prefer someone who will receive the moveTo order (the selection, else the lead).
      const movers = (party.selectedIds?.length ? party.selectedIds : [party.leaderId]).filter(Boolean)
      const ordered = [...new Set([party.leaderId, ...movers])].filter((id) => movers.includes(id))
      return (
        ordered.find((id) => {
          const member = party.members[id]
          return member && canAct(member) && bagFreeSlots(member.character) > 0
        }) ?? null
      )
    },
    [party.leaderId, party.members, party.selectedIds, state.groundItems],
  )

  const requestPickupGroundItem = useCallback(
    (instanceId) => {
      if (itemDragRef.current || beamPhase !== 'done') return
      const memberId = groundPickupMemberId(instanceId)
      if (!memberId) return
      const ground = state.groundItems?.[instanceId]
      if (!ground) return
      closeAllMenus()
      cancelPendingTalk()
      const member = party.members[memberId]
      if (groundItemFor(instanceId).inPickupRange({ groundItems: state.groundItems }, member.position)) {
        setPendingPickup(null)
        dispatch({ type: 'pickupItem', instanceId, memberId })
        return
      }
      dispatch({ type: 'moveTo', target: ground.position, fresh: true })
      setPendingPickup({ instanceId, memberId, combatId: state.lastCombat?.id ?? null })
    },
    [beamPhase, cancelPendingTalk, closeAllMenus, dispatch, groundPickupMemberId, itemDragRef, party.members, state.groundItems, state.lastCombat?.id],
  )

  const startGroundItemDrag = useCallback(
    (instanceId, clientX, clientY, pointerId) => {
      if (state.groundItems?.[instanceId]?.pickable === false) return
      closeMenu('groundItem')
      setPendingPickup(null)
      beginItemDrag({
        instanceId,
        from: { location: 'ground', memberId: null },
        clientX,
        clientY,
        pointerId,
      })
    },
    [beginItemDrag, closeMenu, state.groundItems],
  )
  // Pending pickup: once the chosen character reaches the item, put it in their bag. A fight since the request cancels it.
  // The request is dropped here, once and for good, as soon as it can no longer be met. Deriving that while rendering
  // would revive a cancelled pickup if the character recovers or the item reappears.
  /* eslint-disable react/set-state-in-effect -- reacting to the walking party's position, which only changes over time */
  useEffect(() => {
    if (!pendingPickup) return
    if (pendingPickup.combatId !== (state.lastCombat?.id ?? null)) {
      setPendingPickup(null)
      return
    }
    const ground = state.groundItems?.[pendingPickup.instanceId]
    if (!ground || ground.pickable === false) {
      setPendingPickup(null)
      return
    }
    const member = party.members[pendingPickup.memberId]
    if (!member || !canAct(member) || bagFreeSlots(member.character) < 1) {
      setPendingPickup(null)
      return
    }
    if (!groundItemFor(pendingPickup.instanceId).inPickupRange({ groundItems: state.groundItems }, member.position)) return
    setPendingPickup(null)
    dispatch({ type: 'pickupItem', instanceId: pendingPickup.instanceId, memberId: pendingPickup.memberId })
  }, [dispatch, party.members, pendingPickup, state.groundItems, state.lastCombat?.id])
  /* eslint-enable react/set-state-in-effect */
  const setLeader = useCallback((id) => dispatch({ type: 'setLeader', id }), [dispatch])
  const setFormation = useCallback((formationId) => dispatch({ type: 'setFormation', formationId }), [dispatch])
  const regroup = useCallback(() => dispatch({ type: 'regroup' }), [dispatch])
  // With several selected, the sheet shows the first of them.
  const sheetMember = sheetOpen && !debugOpen && party.selectedIds.length > 0 ? party.members[party.selectedIds[0]] : null
  const inventoryMemberId = inventoryViewId && party.members[inventoryViewId] ? inventoryViewId : party.selectedIds[0] ?? party.leaderId
  const groundViews = groundItemViews(state, { hideInstanceId: itemDrag?.instanceId ?? null })
  const groundReachableIds = groundViews
    .filter((view) => getMembers(party).some((member) => Math.hypot(member.position.x - view.position.x, member.position.y - view.position.y) <= INTERACT_RANGE))
    .map((view) => view.id)

  useExplorationKeys({
    memberIds: party.memberIds,
    onPick: select,
    onEscape: () => {
      if (itemDragRef.current) {
        clearItemDrag()
        return
      }
      closeInteraction()
      closeAllMenus()
      cancelPendingTalk()
      setPendingPickup(null)
      setLogOpen(false)
      setInventoryOpen(false)
      if (talking) dispatch({ type: 'conversationLeave' })
    },
    onSheet: () => setSheetOpen((open) => !open),
    onInventory: () => {
      setInventoryOpen((open) => !open)
      setInventoryViewId((id) => id ?? party.selectedIds[0] ?? party.leaderId)
    },
    onLog: () => setLogOpen((open) => !open),
  })

  const move = (target, fresh) => {
    if (fresh) {
      closeAllMenus()
      cancelPendingTalk()
      setPendingPickup(null)
    }
    if (beamPhase !== 'done') return
    if (!noiseTool) {
      dispatch({ type: 'moveTo', target, fresh })
      return
    }
    if (!fresh) return
    dispatch({ type: 'emitNoise', noise: { position: target, ...awarenessData.debugNoise, source: 'debug' } })
    setNoiseTool(false)
  }

  // Out of reach, the selected characters stop about a tile short of the NPC, on the side the lead comes from.
  const walkToNpc = (npc) => {
    const leader = party.members[party.leaderId]
    const dx = leader.position.x - npc.position.x
    const dy = leader.position.y - npc.position.y
    const length = Math.hypot(dx, dy)
    const target = length > 1.2 ? { x: npc.position.x + (dx / length) * 1.2, y: npc.position.y + (dy / length) * 1.2 } : leader.position
    dispatch({ type: 'moveTo', target, fresh: true })
  }
  const menuNpc = menuNpcId && !inCombat && !panelOpen && (debugOpen || isVisibleToParty(state.partyKnowledge, menuNpcId)) ? world.npcs[menuNpcId] : null
  // The object's ring stays up while its interaction panel is open, with the Roll button and the dice above it.
  const menuObject = openId ?? (menuObjectId && !inCombat && !panelOpen && reachableIds.includes(menuObjectId) ? menuObjectId : null)
  // Where an open hazard ring sits; kept for one put out while its panel still shows the result.
  const menuHazard = isHazardChallengeId(menuObject) ? challengeFor(state, menuObject) : null
  const [hazardAnchor, setHazardAnchor] = useState(null)
  if (menuHazard && (hazardAnchor?.id !== menuHazard.id || !samePosition(hazardAnchor.position, menuHazard.position()))) {
    setHazardAnchor({ id: menuHazard.id, position: menuHazard.position() })
  }
  // The Fire ring goes once the object is destroyed.
  const menuDestructible = menuDestructibleId && !inCombat && !panelOpen ? (destructibleViews.find((view) => view.id === menuDestructibleId) ?? null) : null
  const menuGroundItem =
    menuGroundItemId && !inCombat && !panelOpen ? (groundViews.find((view) => view.id === menuGroundItemId) ?? null) : null
  const ringKey = menuNpc
    ? `npc:${menuNpc.id}`
    : menuObject
      ? `object:${menuObject}`
      : menuDestructible
        ? `destructible:${menuDestructible.id}`
        : menuGroundItem
          ? `ground:${menuGroundItem.id}`
          : null
  const hoveredRingButton = ringHover?.key === ringKey ? ringHover.buttonId : null
  const pickedId = ringPick?.key === ringKey ? ringPick.memberId : null
  const hoverRingButton = (buttonId) => setRingHover({ key: ringKey, buttonId })
  const pickRingMember = (memberId) => setRingPick({ key: ringKey, memberId: memberId === pickedId ? null : memberId })
  const attackNpc = (npc, attackerId) =>
    dispatch({ type: 'attackNpc', npcId: npc.id, targetId: attackerId ?? (party.selectedIds.includes(party.leaderId) ? party.leaderId : party.selectedIds[0]) })
  const npcActions = menuNpc && {
    talk: () => {
      setTalkPickedId(pickedId)
      if (talkable.some((npc) => npc.id === menuNpc.id)) return talkTo(menuNpc)
      walkToNpc(menuNpc)
      talkWhenInReach(menuNpc.id)
    },
    // The card opens to show the result.
    scan: (memberId) => {
      dispatch({ type: 'scanNpc', memberId, npcId: menuNpc.id })
      setNpcInfoOpen(true)
    },
    persuade: (memberId) => {
      dispatch({ type: 'askNpc', memberId, npcId: menuNpc.id, kind: 'persuade' })
      setNpcInfoOpen(true)
    },
    intimidate: (memberId) => {
      dispatch({ type: 'askNpc', memberId, npcId: menuNpc.id, kind: 'intimidate' })
      setNpcInfoOpen(true)
    },
    info: () => setNpcInfoOpen((open) => !open),
    // Attacking someone who wouldn't fight anyway asks first.
    attack: () => {
      const attackerId = npcButtonPerformer(state, menuNpc.id, 'attack', pickedId)
      if (isHostile(menuNpc)) return attackNpc(menuNpc, attackerId)
      setConfirmAttackId(menuNpc.id)
      setConfirmAttackerId(attackerId)
    },
    goTo: () => walkToNpc(menuNpc),
  }
  const npcButtons =
    menuNpc &&
    npcMenuButtons(state, menuNpc, talkable.some((npc) => npc.id === menuNpc.id), npcInfoOpen, npcActions, pickedId).map((button) => ({
      ...button,
      onClick: () => {
        // Scan, Persuade and Intimidate keep the ring up so the card beside it shows the result.
        if (!button.keepOpen && !['scan', 'persuade', 'intimidate'].includes(button.id)) closeMenu('npc')
        button.onClick?.()
      },
    }))
  // Party band: only members within interact range of the NPC (ringParty.js); slices with no shot at a task stay
  // visible but unavailable.
  const npcBand = menuNpc ? ringPartyBand(state, { npcId: menuNpc.id }, npcButtons, hoveredRingButton, pickedId, pickRingMember) : null
  const npcMenu = menuNpc && {
    npcId: menuNpc.id,
    info: npcInfoOpen ? npcInfo(state, menuNpc) : null,
    buttons: npcButtons,
    party: npcBand,
    onButtonHover: hoverRingButton,
  }
  const confirmAttackNpc = confirmAttackId && !inCombat ? world.npcs[confirmAttackId] : null
  const menuMember = menuMemberId && !inCombat && party.memberIds.includes(menuMemberId) && !party.members[menuMemberId].beaming ? party.members[menuMemberId] : null
  const memberMenu = menuMember && {
    memberId: menuMember.id,
    buttons: memberMenuButtons(state, menuMember, {
      scan: () => dispatch({ type: 'scan', memberId: menuMember.id }),
      switchTo: () => select(menuMember.id, false),
      inventory: () => {
        setInventoryViewId(menuMember.id)
        setInventoryOpen(true)
      },
      sneak: () => dispatch({ type: 'toggleSneakFor', id: menuMember.id }),
      beamOut: () => ending.askBeamOut(menuMember.id),
    }).map((button) => ({
      ...button,
      onClick: () => {
        closeMenu('member')
        button.onClick?.()
      },
    })),
  }
  // An object's ring is chosen in order (designer decision, 2026-10-14): an approach, then who does it (only members
  // within reach, shown once the approach is chosen, picked even when there's only one), then Roll on the outermost arc
  // over them. Scan uses the party band while hovered (like a destructible). The next approach choice pulses.
  const objectAction = openId ? panelActionId : null
  const objectButtons =
    menuObject &&
    objectMenuButtons(
      state,
      menuObject,
      {
        open: (actionId) => {
          closeMenu('object')
          setRingPick(null)
          openInteraction(menuObject, actionId)
        },
        scan: (memberId) => dispatch({ type: 'scanChallenge', memberId, objectId: menuObject }),
      },
      objectAction,
      pickedId,
    ).map((button) => ({
      ...button,
      pulse: !objectAction && button.enabled && button.id !== 'scan',
    }))
  const objectBandHover = objectAction ?? (hoveredRingButton === 'scan' ? 'scan' : null)
  const objectBand =
    objectButtons?.length > 0 && objectBandHover
      ? ringPartyBand(state, { objectId: menuObject }, objectButtons, objectBandHover, pickedId, pickRingMember)
      : null
  const objectSlices = objectBand?.slices.filter((slice) => slice.available) ?? []
  const objectPicked = objectBandHover === 'scan' ? false : objectSlices.some((slice) => slice.picked)
  // A destructible's ring: Fire (band ranks who has the best shot), Scan (hazards / countermeasures), plus Sabotage and
  // Defuse (not built yet). The ring stays up after a shot or scan so the player can act again.
  const destructibleButtons =
    menuDestructible &&
    destructibleMenuButtons(
      state,
      menuDestructible.id,
      {
        fire: (memberId) => dispatch({ type: 'fireOnObject', memberId, objectId: menuDestructible.id }),
        scan: (memberId) => dispatch({ type: 'scanDestructible', memberId, objectId: menuDestructible.id }),
      },
      pickedId,
    )
  const destructibleBand = menuDestructible
    ? ringPartyBand(state, { destructibleId: menuDestructible.id }, destructibleButtons, hoveredRingButton ?? 'fire', pickedId, pickRingMember)
    : null
  const destructibleHover = hoveredRingButton ?? 'fire'
  const destructibleMenu = menuDestructible && {
    position: menuDestructible.position,
    buttons: destructibleButtons,
    info: destructibleInfo(state, menuDestructible.id),
    // Fire: only members with a shot. Scan: only those in tricorder range who can scan now.
    party: destructibleBand && {
      ...destructibleBand,
      slices: destructibleBand.slices.filter((slice) => (destructibleHover === 'fire' || destructibleHover === 'scan' ? slice.available : true)),
    },
    onButtonHover: hoverRingButton,
  }
  const objectMenu = menuObject && {
    objectId: menuObject,
    // A hazard's ring opens on its anchor tile (the board only knows the challenge objects' positions).
    ...(isHazardChallengeId(menuObject) && hazardAnchor?.id === menuObject ? { position: hazardAnchor.position } : {}),
    buttons: objectButtons,
    info: objectInfo(state, menuObject),
    // Once every approach is spent (the panel is still showing the last roll) only the dice stay above the object.
    party: objectBand && {
      ...objectBand,
      slices: objectSlices,
      pulse: objectBandHover !== 'scan' && !objectPicked,
      roll: objectBandHover !== 'scan' && objectPicked && objectRoll ? { ...objectRoll, pulse: objectRoll.enabled } : null,
    },
    onButtonHover: hoverRingButton,
    slotRef: openId ? setRollSlot : undefined,
  }
  // Name tags hide while that object's ring is open (pointer often stays over the prop).
  const hiddenTagIds = [
    ...(menuObject && !isHazardChallengeId(menuObject) ? [menuObject] : []),
    ...(menuGroundItem ? [menuGroundItem.id, `ground:${menuGroundItem.id}`] : []),
  ]
  const groundItemButtons =
    menuGroundItem &&
    groundItemMenuButtons(
      state,
      menuGroundItem.id,
      // These run only when a ring button is clicked; requestPickupGroundItem reads a ref then, never while rendering.
      // eslint-disable-next-line react/refs -- click handlers, not render-time reads
      {
        scan: (memberId) => dispatch({ type: 'scanGroundItem', memberId, instanceId: menuGroundItem.id }),
        pickup: (memberId) => {
          closeMenu('groundItem')
          if (memberId) {
            const member = party.members[memberId]
            if (member && groundItemFor(menuGroundItem.id).inPickupRange(state, member.position)) {
              setPendingPickup(null)
              dispatch({ type: 'pickupItem', instanceId: menuGroundItem.id, memberId })
              return
            }
          }
          requestPickupGroundItem(menuGroundItem.id)
        },
        goTo: () => {
          closeMenu('groundItem')
          setPendingPickup(null)
          dispatch({ type: 'moveTo', target: menuGroundItem.position, fresh: true })
        },
      },
      pickedId,
    )
  const groundItemBand =
    menuGroundItem && hoveredRingButton === 'scan'
      ? ringPartyBand(state, { groundItemId: menuGroundItem.id }, groundItemButtons, 'scan', pickedId, pickRingMember)
      : null
  const groundItemMenu = menuGroundItem && {
    position: menuGroundItem.position,
    buttons: groundItemButtons,
    info: groundItemInfo(state, menuGroundItem.id),
    party: groundItemBand && {
      ...groundItemBand,
      slices: groundItemBand.slices.filter((slice) => slice.available),
    },
    onButtonHover: hoverRingButton,
  }
  // The report waits for the sweep to reach the edge of the scan, and its fade timer starts when it appears.
  const scanSwept = !scanPulse
  const scanFaded = useFadeAfter(scanSwept ? lastScanKey : null)
  const scanShown = Boolean(lastScan) && scanSwept && closedScanKey !== lastScan.key
  const hint = talking
    ? 'In conversation: Escape leaves. You can still move; the world keeps moving.'
    : openId
    ? 'Interacting: Escape closes the panel; walking out of reach closes it too. The world keeps moving.'
    : noiseTool
      ? 'Noise tool: click the floor to make a noise there.'
      : `Click or hold the left button to move. Click a ground item to walk over and pick it up; drag it to carry it. Click a portrait (or 1-${members.length}) to select one; Shift + click to add or remove. Right-drag a box to select several (Ctrl adds). C: character sheet. I: inventory. L: Captain's Log. Right-click a character for their actions; click someone else to talk to them.`
  const hintFaded = useFadeAfter(hint)

  if (inCombat) return <WorldCombat key={state.link.id} state={state} dispatch={dispatch} debugOpen={debugOpen} onDebug={() => setDebugOpen(!debugOpen)} onExit={onExit} onExitMission={ending.exitMissionFromFight} />
  if (outro) {
    if (!playOutro) return null
    return <MissionOutro map={party.map} time={world.time} entries={state.missionLog?.entries ?? []} result={isMissionFailed(state) ? 'failed' : isMissionAccomplished(state) ? 'accomplished' : 'abandoned'} failedNames={failedNpcNames(state)} exitLabel={exitLabel} onDone={onExit} />
  }
  return (
    <div className="combat-screen exploration-screen">
      <PerfProfiler id="exploration.board">
        <Board
          state={party}
          world={world}
          knowledge={state.partyKnowledge}
          challenges={challengeViews.map((view) => ({ ...view, tiles: objectFor(state.scenario, view.id).tiles(), objective: pulseObjectives && objectiveObjectIds.has(view.id) }))}
          reachableIds={reachableIds}
          onInteract={toggleObjectMenu}
          hazards={hazardChallenges.filter((object) => hazardInReachIds.includes(object.id)).map((object) => ({ id: object.id, position: object.position() }))}
          destructibles={destructibleViews}
          environment={state.environment}
          lastObjectShot={state.lastObjectShot ?? null}
          onDestructible={toggleDestructibleMenu}
          groundItems={groundViews}
          groundReachableIds={groundReachableIds}
          onGroundItem={requestPickupGroundItem}
          onGroundItemMenu={openGroundItemMenu}
          onGroundItemDragStart={startGroundItemDrag}
          placingItem={itemDrag?.overWorld ? itemDrag : null}
          placeHover={placeHover}
          onPlaceHover={onBoardPlaceHover}
          placeHelpersRef={placeHelpersRef}
          exploreState={state}
          itemDropMemberId={itemDrag?.overWorld ? placeHover?.dropMemberId ?? null : null}
          itemDragActive={Boolean(itemDrag)}
          hiddenTagIds={hiddenTagIds}
          debug={debugOpen}
          followCamera={followCamera}
          onCameraPan={stopFollowing}
          onCameraFollow={startFollowing}
          onMove={move}
          onSelect={select}
          onSelectBox={selectBox}
          onOpenMenu={openMenu}
          onOpenNpcMenu={showNpcMenu}
          onStaggerDone={(id) => dispatch({ type: 'clearBlastReact', id })}
          menu={memberMenu || npcMenu || objectMenu || destructibleMenu || groundItemMenu}
          beamIn={beamPhase}
          scanPulse={scanPulse}
        />
      </PerfProfiler>
      {scanShown && (
        <ScanReport scan={lastScan} faded={scanFaded} scannerName={party.members[lastScan.memberId]?.character.name ?? 'Scan'} onClose={() => setClosedScanKey(lastScan.key)} />
      )}
      <WeatherFx fx={weatherFor(party.map.weather).fx} follow=".exploration-board" />
      <div className="explore-messages">
        {!panelOpen && talkError && (
          <div className="challenge-prompts">
            <span className="task-warning">{talkError}</span>
          </div>
        )}
        {/* Settings > Help Hints off hides it, except while the debug noise tool waits for a click. */}
        {(showHints || noiseTool) && <p className={`combat-hint is-player-turn${hintFaded ? ' is-faded-out' : ''}`}>{hint}</p>}
      </div>
      {talking && (
        <ConversationPanel
          key={`${state.conversation.npcId}:${state.conversation.definition.id}`}
          state={state}
          dispatch={dispatch}
          defaultPerformerId={party.selectedIds[0] ?? party.leaderId}
          pickedPerformerId={talkPickedId}
          onRecommend={updateRecommendation}
          dev={debugOpen}
        />
      )}
      {confirmAttackNpc && (
        <ConfirmDialog
          title={`Attack ${confirmAttackNpc.name}?`}
          message={`${confirmAttackNpc.name} is ${dispositionName(confirmAttackNpc.disposition).toLowerCase()}. Attacking turns them hostile and starts a fight, and anyone still standing afterwards stays hostile.`}
          confirmLabel="Attack"
          onConfirm={() => {
            setConfirmAttackId(null)
            attackNpc(confirmAttackNpc, confirmAttackerId)
          }}
          onCancel={() => setConfirmAttackId(null)}
        />
      )}
      {sheetMember && <CharacterSheetPanel character={sheetMember.character} condition={sheetMember.condition} className="is-on-map" onClose={() => setSheetOpen(false)} />}
      {inventoryOpen && !inCombat && (
        <InventoryPanel
          state={state}
          members={members}
          viewedId={inventoryMemberId}
          onViewMember={setInventoryViewId}
          onClose={() => setInventoryOpen(false)}
          drag={itemDrag}
          panelRef={inventoryPanelRef}
          onDragStart={beginItemDrag}
        />
      )}
      <InventoryDragGhost drag={itemDrag} state={state} placeHelpersRef={placeHelpersRef} />
      {logOpen && (
        <CaptainsLogPanel map={party.map} time={world.time} objectives={knownObjectives} entries={state.missionLog?.entries ?? []} onClose={() => setLogOpen(false)} />
      )}
      <Minimap map={party.map} party={party} world={world} knowledge={state.partyKnowledge} environment={state.environment} objectives={knownObjectives.filter((objective) => objective.status === 'active' && objective.position)} doors={minimapDoors} scanPulse={scanPulse} debug={debugOpen} open={minimapOpen} onToggle={() => setMinimapOpen(!minimapOpen)}
        toolbarOutside
        cornerButtons={
          <>
            <button type="button" className="explore-minimap-toggle" aria-label="Settings" title="Settings" onClick={openSettings}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={SETTINGS_ICON} />
              </svg>
            </button>
            <button type="button" className="explore-minimap-toggle" aria-pressed={logOpen} aria-label="Captain's Log" title="Captain's Log: briefing, objectives and mission log (L)" onClick={() => setLogOpen(!logOpen)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={LOG_ICON} />
              </svg>
            </button>
          </>
        }
        leading={
          (objectives.length > 0 || hasPendingObjectives) ? (
            <ObjectivesPanel objectives={objectives} showAll={hasPendingObjectives ? showAllObjectives : undefined} onShowAll={() => setShowAllObjectives(!showAllObjectives)} />
          ) : null
        }
      >
        <ResourceIndicators momentum={state.resources.momentum} threat={state.resources.threat} />
        <ActionsToggle open={actionsOpen} onToggle={toggleActions} />
      </Minimap>
      <ExplorationPartyBar
        members={members}
        selectedIds={party.selectedIds}
        leaderId={party.leaderId}
        onSelect={select}
        onSetLeader={setLeader}
        recommendation={panelOpen ? recommendation : recommendPartyAction(members, consideredActionId, state.scenario.traits)}
      />
      {/* An object's stats and log: between the minimap and the menu buttons. */}
      {openId && (
        <ChallengePanel
          key={`${openId}:${interaction.actionId ?? ''}`}
          state={state}
          objectId={openId}
          initialActionId={interaction.actionId}
          pickedPerformerId={pickedId ?? interaction.performerId}
          rollSlot={rollSlot}
          onRollChange={setObjectRoll}
          onActionChange={setPanelActionId}
          dispatch={dispatch}
          onClose={closeInteraction}
          onRecommend={updateRecommendation}
          dev={debugOpen}
        />
      )}
      {/* The Formation panel stays while a challenge or conversation is open (that panel ends above it). */}
      <div className="explore-bottom-right">
        {!panelOpen && actionsOpen && <ExplorationActionButtons consideredId={consideredActionId} onConsider={setConsideredActionId} />}
        <FormationPanel
          formationId={party.formationId}
          onFormation={setFormation}
          onRegroup={regroup}
          followCamera={followCamera}
          onFollowCamera={setFollowCamera}
          debugOpen={debugOpen}
          onDebug={setDebugOpen}
          inventoryOpen={inventoryOpen}
          onInventory={() => {
            setInventoryOpen((open) => !open)
            setInventoryViewId((id) => id ?? party.selectedIds[0] ?? party.leaderId)
          }}
          onTransporter={canBeamIn ? openTransporter : null}
          onExitMission={beaming ? null : ending.askExitMission}
        />
      </div>
      {transporterOpen && canBeamIn && (
        <TransporterDialog
          candidates={transporterCandidates(party, savedCharacters)}
          onBeamIn={(characters) => {
            setTransporterFor(null)
            beamIn(characters)
          }}
          onCancel={() => setTransporterFor(null)}
        />
      )}
      {debugOpen && (
        <div className="explore-debug-column">
          <DebugPanel state={party} mode={state.mode} lastCombat={state.lastCombat} onSpacing={(spacing) => dispatch({ type: 'setSpacing', spacing })} onClose={() => setDebugOpen(false)} />
          <AwarenessPanel world={world} party={party} knowledge={state.partyKnowledge} noiseTool={noiseTool} onNoiseTool={() => setNoiseTool(!noiseTool)} onResetNpcs={() => dispatch({ type: 'resetNpcs' })} />
          <ScenarioDebugPanel scenario={state.scenario} knowledge={state.partyKnowledge} views={challengeViews} />
        </div>
      )}
      <MissionEndDialogs state={state} ending={ending} />
    </div>
  )
}

// Exploration prototype: the away team on an episode's map, with party selection and formation movement, and NPCs
// that perceive and react to them. mapId: the episode chosen in Load Episode.
export default function ExplorationScreen({ savedCharacters, mapId, onBack, onExit }) {
  // UI state: the chosen away team (RuntimeCharacters) and the running exploration. Never saved or exported.
  const [team, setTeam] = useState([])
  const [state, dispatch] = useReducer(reducer, null)
  const [phase, setPhase] = useState('setup')
  const playIntro = useDisplaySettings().missionIntro

  if (phase === 'setup' || !state) {
    return (
      <ExplorationSetup
        savedCharacters={savedCharacters}
        initialParty={team}
        mapId={mapId}
        onBack={onBack}
        onStart={(members, map) => {
          setTeam(members)
          dispatch({ type: 'reset', map, characters: members, seed: Math.floor(Math.random() * MAX_SEED) })
          setPhase(playIntro ? 'intro' : 'explore')
        }}
      />
    )
  }
  // The map isn't mounted until the intro is closed, so the world (and the beam-in) starts then.
  if (phase === 'intro') return <MissionIntro map={state.party.map} onBegin={() => setPhase('explore')} />
  return (
    <MapFadeIn>
      <Exploration state={state} dispatch={dispatch} savedCharacters={savedCharacters} onExit={onExit} exitLabel="Return to Menu" />
    </MapFadeIn>
  )
}

// The map editor's Play: a ready-made away team (RuntimeCharacters) on the open map, straight into exploration with no
// setup screen. onExit returns to the editor.
export function ExplorationPlaytest({ map, characters, savedCharacters = [], enemiesActive, onExit }) {
  const [state, dispatch] = useReducer(reducer, null, () =>
    createExplorationState(map, characters, Math.floor(Math.random() * MAX_SEED), { enemiesActive }),
  )
  // UI state: whether the Captain's Log intro is still showing (never, with it off in Settings).
  const playIntro = useDisplaySettings().missionIntro
  const [intro, setIntro] = useState(playIntro)
  if (intro) return <MissionIntro map={state.party.map} onBegin={() => setIntro(false)} />
  return (
    <MapFadeIn>
      <Exploration state={state} dispatch={dispatch} savedCharacters={savedCharacters} onExit={onExit} exitLabel="Return to Editor" />
    </MapFadeIn>
  )
}
