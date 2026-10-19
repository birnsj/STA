import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { samePosition } from '../combat/battleMap.js'
import { useDisplaySettings, useOpenSettings } from '../settings/DisplaySettingsContext.js'
import ResourceIndicators from '../components/combat/ResourceIndicators.jsx'
import ObjectivesPanel from '../components/combat/ObjectivesPanel.jsx'
import useBeamIn from '../components/combat/useBeamIn.js'
import ChallengePanel from '../components/exploration/ChallengePanel.jsx'
import CharacterSheetPanel from '../components/exploration/CharacterSheetPanel.jsx'
import CaptainsLogPanel from '../components/exploration/CaptainsLogPanel.jsx'
import InventoryPanel, { InventoryDragGhost, inventoryDropAt, syncInventoryGhostPosition } from '../components/exploration/InventoryPanel.jsx'
import { MissionIntro, MissionOutro } from '../components/exploration/MissionStory.jsx'
import MissionEndDialogs from '../components/exploration/MissionEndDialogs.jsx'
import useMissionEnding, { useWorldClock } from '../components/exploration/useMissionEnding.js'
import TransporterDialog from '../components/exploration/TransporterDialog.jsx'
import useTransporter from '../components/exploration/useTransporter.js'
import { getPlaytestParty } from '../character/authoredCharacters.js'
import { normalizeCharacterRecord } from '../character/runtimeCharacter.js'
import ConversationPanel from '../components/exploration/ConversationPanel.jsx'
import { loadConversation } from '../conversation/conversationFiles.js'
import Board from '../components/exploration/PixiExplorationBoard.jsx'
import { AwarenessPanel, DebugPanel, ScenarioDebugPanel } from '../components/exploration/ExplorationDebugPanels.jsx'
import { ActionsToggle, ExplorationActionButtons, ExplorationPartyBar, FormationPanel } from '../components/exploration/ExplorationPartyBar.jsx'
import { destructibleInfo, destructibleMenuButtons, groundItemMenuButtons, memberMenuButtons, npcInfo, npcMenuButtons, objectMenuButtons, ringPartyBand } from '../components/exploration/explorationRings.js'
import ExplorationSetup from '../components/exploration/ExplorationSetup.jsx'
import useExplorationFootsteps from '../components/exploration/useExplorationFootsteps.js'
import useExplorationKeys from '../components/exploration/useExplorationKeys.js'
import Minimap from '../components/exploration/Minimap.jsx'
import MapFadeIn from '../components/maps/MapFadeIn.jsx'
import '../components/exploration/exploration.css'
import '../components/maps/mapEditor.css'
import awarenessData from '../data/adaptation/exploration/awareness.json'
import WeatherFx from '../effects/WeatherFx.jsx'
import { dispositionName, isHostile } from '../exploration/awareness.js'
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
import { getMembers } from '../exploration/partyControl.js'
import { isVisibleToParty } from '../exploration/partyKnowledge.js'
import { bagFreeSlots, canPlaceAt, groundItemViews } from '../rules/inventory.js'
import { weatherFor } from '../maps/mapWeather.js'
import { npcButtonPerformer } from '../exploration/ringParty.js'
import ScanReport from '../components/exploration/ScanReport.jsx'
import { CHARACTER_SCAN_RADIUS } from '../components/exploration/scanSweep.js'
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
  // UI state: { objectId, actionId, performerId } the challenge object whose interaction panel is open, the approach
  // picked on its ring (null: the panel lists them) and the member picked on the ring's party band (null: the selection
  // decides). The party can still move while it's open (designer decision: never pause the players); walking out of
  // reach closes it.
  const [interaction, setInteraction] = useState(null)
  const interactionId = interaction?.objectId ?? null
  // UI state: the approach the open interaction panel is on (lit on the object's ring), and the element of the slot
  // above that ring where the panel puts its Roll button and dice (null: they stay in the panel).
  const [panelActionId, setPanelActionId] = useState(null)
  const [rollSlot, setRollSlot] = useState(null)
  // UI state: the open panel's Roll for the object's ring (ChallengePanel onRollChange), or null.
  const [objectRoll, setObjectRoll] = useState(null)
  const setInteractionId = useCallback(
    (objectId, actionId = null, performerId = null) => setInteraction(objectId ? { objectId, actionId, performerId } : null),
    [],
  )
  // UI state: who is best at the approach being considered in the interaction panel (party card highlight).
  const [recommendation, setRecommendation] = useState(null)
  // The panel recomputes on every world tick (most animation frames); keeping the old object when nothing changed
  // stops each tick from forcing a second render of the whole screen.
  const updateRecommendation = useCallback((next) => {
    setRecommendation((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next))
  }, [])
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
  const [itemDrag, setItemDrag] = useState(null)
  const [placeHover, setPlaceHover] = useState(null)
  const placeHoverRef = useRef(null)
  const placeHelpersRef = useRef(null)
  const inventoryPanelRef = useRef(null)
  const itemDragRef = useRef(null)
  const stopItemDragListenersRef = useRef(null)
  const exploreStateRef = useRef(state)
  // UI state: whether the Captain's Log panel is open.
  const [logOpen, setLogOpen] = useState(false)

  useEffect(() => {
    exploreStateRef.current = state
  }, [state])

  useEffect(() => {
    itemDragRef.current = itemDrag
    document.body.classList.toggle('is-item-dragging', Boolean(itemDrag))
    return () => document.body.classList.remove('is-item-dragging')
  }, [itemDrag])

  const pointerOverInventory = useCallback((clientX, clientY) => {
    const panel = inventoryPanelRef.current?.getBoundingClientRect()
    if (!panel) return false
    return clientX >= panel.left && clientX <= panel.right && clientY >= panel.top && clientY <= panel.bottom
  }, [])

  const updatePlaceHover = useCallback((clientX, clientY, overWorld) => {
    if (!overWorld) {
      if (placeHoverRef.current) {
        placeHoverRef.current = null
        setPlaceHover(null)
      }
      return
    }
    const helpers = placeHelpersRef.current
    const point = helpers?.toTiles?.(clientX, clientY)
    if (!point) {
      if (placeHoverRef.current) {
        placeHoverRef.current = null
        setPlaceHover(null)
      }
      return
    }
    const dragging = itemDragRef.current
    const check = canPlaceAt(exploreStateRef.current, point, {
      excludeInstanceId: dragging?.from?.location === 'ground' ? dragging.instanceId : null,
    })
    // Prefer giving the item to a party member under the pointer (green ring) when their bag has room.
    let dropMemberId = null
    const memberId = helpers?.memberAt?.(clientX, clientY) ?? null
    if (memberId) {
      const member = exploreStateRef.current.party?.members?.[memberId]
      if (member?.character?.inventory && bagFreeSlots(member.character) > 0) dropMemberId = memberId
    }
    const hover = { position: check.position ?? point, valid: check.ok, dropMemberId }
    const prev = placeHoverRef.current
    if (
      prev &&
      prev.valid === hover.valid &&
      prev.dropMemberId === hover.dropMemberId &&
      prev.position.x === hover.position.x &&
      prev.position.y === hover.position.y
    ) {
      return
    }
    placeHoverRef.current = hover
    setPlaceHover(hover)
  }, [])

  const clearItemDrag = useCallback(() => {
    stopItemDragListenersRef.current?.()
    stopItemDragListenersRef.current = null
    setItemDrag(null)
    setPlaceHover(null)
    placeHoverRef.current = null
    itemDragRef.current = null
  }, [])

  // One drag controller for inventory ↔ world: the item follows the pointer until release or Escape.
  const beginItemDrag = useCallback(
    (start) => {
      if (itemDragRef.current) return
      const drag = { ...start, overWorld: !pointerOverInventory(start.clientX, start.clientY) }
      itemDragRef.current = drag
      setItemDrag(drag)
      updatePlaceHover(start.clientX, start.clientY, drag.overWorld)
      syncInventoryGhostPosition(start.clientX, start.clientY)

      // Re-project place preview every frame so a moving camera cannot leave the diamond behind the cursor.
      let rafId = 0
      const tick = () => {
        const current = itemDragRef.current
        if (!current) return
        if (current.overWorld) updatePlaceHover(current.clientX, current.clientY, true)
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)

      const move = (moveEvent) => {
        if (start.pointerId != null && moveEvent.pointerId !== start.pointerId) return
        if (!itemDragRef.current) return
        const overWorld = !pointerOverInventory(moveEvent.clientX, moveEvent.clientY)
        const overChanged = overWorld !== itemDragRef.current.overWorld
        const next = { ...itemDragRef.current, clientX: moveEvent.clientX, clientY: moveEvent.clientY, overWorld }
        itemDragRef.current = next
        // Screen position without a React render — setState every move lagged behind the pointer on a scaled stage.
        syncInventoryGhostPosition(moveEvent.clientX, moveEvent.clientY)
        if (overChanged) setItemDrag(next)
        updatePlaceHover(moveEvent.clientX, moveEvent.clientY, overWorld)
      }

      const teardown = () => {
        cancelAnimationFrame(rafId)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
        stopItemDragListenersRef.current = null
      }

      const end = (endEvent) => {
        if (start.pointerId != null && endEvent.pointerId !== start.pointerId) return
        const current = itemDragRef.current
        teardown()
        if (!current) return
        const cancelled = endEvent.type === 'pointercancel'
        const overWorld = !pointerOverInventory(endEvent.clientX, endEvent.clientY)
        if (overWorld && !cancelled) updatePlaceHover(endEvent.clientX, endEvent.clientY, true)
        const hover = placeHoverRef.current
        const instanceId = current.instanceId
        // Hit-test inventory here: board-started drags never deliver React pointerUp to bag/slot targets.
        const invDrop = !cancelled && !overWorld ? inventoryDropAt(endEvent.clientX, endEvent.clientY) : null
        setItemDrag(null)
        setPlaceHover(null)
        placeHoverRef.current = null
        itemDragRef.current = null
        if (!instanceId || cancelled) return
        if (invDrop) {
          // Same bag → same bag is a no-op; ignore so a tiny drag on the medkit does not feel "stuck".
          const from = current.from
          const sameBag =
            invDrop.kind === 'bag' &&
            from?.location === 'bag' &&
            from.memberId === invDrop.memberId &&
            (invDrop.bagIndex == null || from.bagIndex === invDrop.bagIndex)
          const sameSlot =
            invDrop.kind === 'slot' && from?.location === 'slot' && from.memberId === invDrop.memberId && from.slot === invDrop.slot
          if (!sameBag && !sameSlot) {
            dispatch({
              type: 'transferItem',
              instanceId,
              toMemberId: invDrop.memberId,
              toSlot: invDrop.kind === 'slot' ? invDrop.slot : null,
              toBagIndex: invDrop.kind === 'bag' ? (invDrop.bagIndex ?? null) : null,
            })
          }
          return
        }
        // World drag released over a party figure → that member's bag (same path as inventory party-card drops).
        if (overWorld && hover?.dropMemberId) {
          dispatch({ type: 'transferItem', instanceId, toMemberId: hover.dropMemberId })
          return
        }
        if (overWorld && hover?.valid) dispatch({ type: 'dropItem', instanceId, position: hover.position })
      }

      stopItemDragListenersRef.current = teardown
      window.addEventListener('pointermove', move, { passive: true })
      window.addEventListener('pointerup', end)
      window.addEventListener('pointercancel', end)
    },
    [dispatch, pointerOverInventory, updatePlaceHover],
  )
  // UI state: ground-item ring.
  const [menuGroundItemId, setMenuGroundItemId] = useState(null)
  const members = getMembers(party)
  const inCombat = state.mode === MODE.COMBAT
  useExplorationFootsteps(members, !inCombat)
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
  // UI state: why the last conversation couldn't be opened (its file is missing or broken), or null.
  const [talkError, setTalkError] = useState(null)
  // UI state: { npcId, combatId } the NPC the party is walking over to talk to (and the last fight when asked); the
  // conversation opens once one of them is in reach.
  const [pendingTalk, setPendingTalk] = useState(null)
  const talkTo = useCallback(
    (npc) => {
      loadConversation(npc.conversationId)
        .then((definition) => {
          setTalkError(null)
          setInteraction(null)
          setPendingTalk(null)
          dispatch({ type: 'talk', npcId: npc.id, definition })
        })
        .catch((error) => {
          setPendingTalk(null)
          setTalkError(`${npc.name}: ${error.message}`)
        })
    },
    [dispatch],
  )
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

  // UI state: the party member whose radial menu is open (right-click on them), or null.
  const [menuMemberId, setMenuMemberId] = useState(null)
  // UI state: the NPC whose radial menu is open (left click on them), or null; whether its Info card shows; the NPC
  // whose Attack is waiting for confirmation.
  const [menuNpcId, setMenuNpcId] = useState(null)
  // UI state: the challenge object whose radial menu is open (left click on it while in reach), or null.
  const [menuObjectId, setMenuObjectId] = useState(null)
  // UI state: the destructible object whose Fire ring is open (left click on it), or null.
  const [menuDestructibleId, setMenuDestructibleId] = useState(null)
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
  // Object shot: laser first, then Structure / explosion after the beam lands.
  const pendingObjectHit = state.pendingObjectHit
  useEffect(() => {
    if (!pendingObjectHit || inCombat) return undefined
    const timer = setTimeout(() => dispatch({ type: 'applyPendingObjectHit' }), pendingObjectHit.impactMs)
    return () => clearTimeout(timer)
  }, [pendingObjectHit?.key, pendingObjectHit?.impactMs, inCombat, dispatch])
  const lastSocialKey = state.lastSocial?.key
  const lastSocialKind = state.lastSocial?.kind
  const lastSocialPassed = state.lastSocial?.passed
  useEffect(() => {
    if (lastSocialKey != null) playRequestSound(lastSocialKind, lastSocialPassed)
  }, [lastSocialKey, lastSocialKind, lastSocialPassed])
  // UI state: the scan whose sweep has finished playing, so a fight and back doesn't replay it.
  const [sweptScanKey, setSweptScanKey] = useState(null)
  // Area scan: one ring out to the tricorder radius. NPC scan: a ring around the scanner and one around the NPC.
  // Only the newer of the two plays (both keys count tasks): sweptScanKey holds one key, so playing the older one
  // after the newer would mark the newer unplayed again and the two would take turns for ever.
  const areaScanIsNewer = lastScan != null && (lastTargetScan == null || lastScanKey > lastTargetScanKey)
  const scanPulse =
    areaScanIsNewer
      ? lastScan.origin && sweptScanKey !== lastScanKey
        ? { key: lastScanKey, rings: [{ origin: lastScan.origin, radius: lastScan.radius }], onDone: () => setSweptScanKey(lastScanKey) }
        : null
      : lastTargetScan && sweptScanKey !== lastTargetScanKey
        ? {
            key: lastTargetScanKey,
            rings: [
              { origin: lastTargetScan.origin, radius: CHARACTER_SCAN_RADIUS },
              { origin: lastTargetScan.targetOrigin, radius: CHARACTER_SCAN_RADIUS },
            ],
            onDone: () => setSweptScanKey(lastTargetScanKey),
          }
        : null
  const select = useCallback((id, additive) => dispatch({ type: additive ? 'toggleSelect' : 'select', id }), [dispatch])
  const selectBox = useCallback((ids, additive) => dispatch({ type: 'selectBox', ids, additive }), [dispatch])
  // Right-click opens a member's menu and adds them to the selection; whoever else is selected stays selected.
  const selectedIds = state.party.selectedIds
  const openMenu = (id) => {
    if (!selectedIds.includes(id)) dispatch({ type: 'toggleSelect', id })
    setMenuMemberId(id)
    setMenuNpcId(null)
    setMenuObjectId(null)
    setMenuDestructibleId(null)
    setMenuGroundItemId(null)
  }
  const openNpcMenu = (id) => {
    setMenuNpcId(id)
    setMenuMemberId(null)
    setMenuObjectId(null)
    setMenuDestructibleId(null)
    setMenuGroundItemId(null)
  }
  const openObjectMenu = (id) => {
    setMenuObjectId((current) => (current === id ? null : id))
    setMenuMemberId(null)
    setMenuNpcId(null)
    setMenuDestructibleId(null)
    setMenuGroundItemId(null)
  }
  const openDestructibleMenu = (id) => {
    setMenuDestructibleId((current) => (current === id ? null : id))
    setMenuMemberId(null)
    setMenuNpcId(null)
    setMenuObjectId(null)
    setMenuGroundItemId(null)
  }
  const openGroundItemMenu = (id) => {
    if (itemDragRef.current) return
    setMenuGroundItemId((current) => (current === id ? null : id))
    setMenuMemberId(null)
    setMenuNpcId(null)
    setMenuObjectId(null)
    setMenuDestructibleId(null)
  }

  const startGroundItemDrag = useCallback(
    (instanceId, clientX, clientY, pointerId) => {
      if (state.groundItems?.[instanceId]?.pickable === false) return
      setMenuGroundItemId(null)
      beginItemDrag({
        instanceId,
        from: { location: 'ground', memberId: null },
        clientX,
        clientY,
        pointerId,
      })
    },
    [beginItemDrag, state.groundItems],
  )
  // Pending talk: open the conversation as soon as the walking party brings the NPC within reach. A fight since the
  // request cancels it.
  const pendingTalkNpc = pendingTalk && pendingTalk.combatId === (state.lastCombat?.id ?? null) ? talkable.find((npc) => npc.id === pendingTalk.npcId) : null
  const requestedTalkRef = useRef(null)
  useEffect(() => {
    if (!pendingTalkNpc || requestedTalkRef.current === pendingTalk) return
    requestedTalkRef.current = pendingTalk
    talkTo(pendingTalkNpc)
  }, [pendingTalkNpc, pendingTalk, talkTo])
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
      setInteraction(null)
      setMenuMemberId(null)
      setMenuNpcId(null)
      setMenuObjectId(null)
      setMenuDestructibleId(null)
      setMenuGroundItemId(null)
      setPendingTalk(null)
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
      setMenuMemberId(null)
      setMenuNpcId(null)
      setMenuObjectId(null)
      setMenuDestructibleId(null)
      setMenuGroundItemId(null)
      setPendingTalk(null)
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
      setPendingTalk({ npcId: menuNpc.id, combatId: state.lastCombat?.id ?? null })
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
        if (!button.keepOpen && !['scan', 'persuade', 'intimidate'].includes(button.id)) setMenuNpcId(null)
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
        setMenuMemberId(null)
        button.onClick?.()
      },
    })),
  }
  // An object's ring is chosen in order (designer decision, 2026-10-14): an approach, then who does it (only members
  // within reach, shown once the approach is chosen, picked even when there's only one), then Roll on the outermost arc
  // over them. The next choice pulses.
  const objectAction = openId ? panelActionId : null
  const objectButtons =
    menuObject &&
    objectMenuButtons(
      state,
      menuObject,
      (actionId) => {
        setMenuObjectId(null)
        setRingPick(null)
        setInteractionId(menuObject, actionId)
      },
      objectAction,
    ).map((button) => ({ ...button, pulse: !objectAction && button.enabled }))
  const objectBand = objectAction && objectButtons.length > 0 ? ringPartyBand(state, { objectId: menuObject }, objectButtons, objectAction, pickedId, pickRingMember) : null
  const objectSlices = objectBand?.slices.filter((slice) => slice.available) ?? []
  const objectPicked = objectSlices.some((slice) => slice.picked)
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
    // Once every approach is spent (the panel is still showing the last roll) only the dice stay above the object.
    party: objectBand && {
      ...objectBand,
      slices: objectSlices,
      pulse: !objectPicked,
      roll: objectPicked && objectRoll ? { ...objectRoll, pulse: objectRoll.enabled } : null,
    },
    onButtonHover: hoverRingButton,
    slotRef: openId ? setRollSlot : undefined,
  }
  const groundItemMenu = menuGroundItem && {
    position: menuGroundItem.position,
    buttons: groundItemMenuButtons(state, menuGroundItem.id, {
      pickup: (memberId) => {
        setMenuGroundItemId(null)
        dispatch({ type: 'pickupItem', instanceId: menuGroundItem.id, memberId })
      },
      goTo: () => {
        setMenuGroundItemId(null)
        dispatch({ type: 'moveTo', target: menuGroundItem.position, fresh: true })
      },
    }),
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
      : `Click or hold the left button to move. Click a portrait (or 1-${members.length}) to select one; Shift + click to add or remove. Right-drag a box to select several (Ctrl adds). C: character sheet. I: inventory. L: Captain's Log. Right-click a character for their actions; click someone else to talk to them.`
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
          onInteract={openObjectMenu}
          hazards={hazardChallenges.filter((object) => hazardInReachIds.includes(object.id)).map((object) => ({ id: object.id, position: object.position() }))}
          destructibles={destructibleViews}
          environment={state.environment}
          lastObjectShot={state.lastObjectShot ?? null}
          onDestructible={openDestructibleMenu}
          groundItems={groundViews}
          groundReachableIds={groundReachableIds}
          onGroundItem={openGroundItemMenu}
          onGroundItemDragStart={startGroundItemDrag}
          placingItem={itemDrag?.overWorld ? itemDrag : null}
          placeHover={placeHover}
          onPlaceHover={(hover) => {
            const prev = placeHoverRef.current
            const next = { dropMemberId: prev?.dropMemberId ?? null, ...hover }
            placeHoverRef.current = next
            setPlaceHover(next)
          }}
          placeHelpersRef={placeHelpersRef}
          exploreState={state}
          itemDropMemberId={itemDrag?.overWorld ? placeHover?.dropMemberId ?? null : null}
          itemDragActive={Boolean(itemDrag)}
          debug={debugOpen}
          followCamera={followCamera}
          onCameraPan={stopFollowing}
          onCameraFollow={startFollowing}
          onMove={move}
          onSelect={select}
          onSelectBox={selectBox}
          onOpenMenu={openMenu}
          onOpenNpcMenu={openNpcMenu}
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
          onClose={() => setInteraction(null)}
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
