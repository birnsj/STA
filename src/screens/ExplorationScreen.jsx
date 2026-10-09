import { useCallback, useEffect, useReducer, useState } from 'react'
import { useDisplaySettings } from '../settings/DisplaySettingsContext.js'
import CharacterInspector from '../components/CharacterInspector.jsx'
import FrameRate from '../components/FrameRate.jsx'
import ResourceIndicators from '../components/combat/ResourceIndicators.jsx'
import ChallengePanel from '../components/exploration/ChallengePanel.jsx'
import CharacterSheetPanel from '../components/exploration/CharacterSheetPanel.jsx'
import ExplorationBoard from '../components/exploration/ExplorationBoard.jsx'
import { ExplorationActionButtons, ExplorationPartyBar, FormationPanel } from '../components/exploration/ExplorationPartyBar.jsx'
import ExplorationSetup from '../components/exploration/ExplorationSetup.jsx'
import useExplorationFootsteps from '../components/exploration/useExplorationFootsteps.js'
import Minimap from '../components/exploration/Minimap.jsx'
import MapFadeIn from '../components/maps/MapFadeIn.jsx'
import '../components/exploration/exploration.css'
import awarenessData from '../data/adaptation/exploration/awareness.json'
import WeatherFx from '../effects/WeatherFx.jsx'
import { alertMethodName, dispositionName, getCharacterAwareness, getCombatReady, getNpcs, isDown, stateName } from '../exploration/awareness.js'
import { getAvailableActions, getChallengeViews, getDefinition, objectsInReach } from '../exploration/challengeObjects.js'
import { compareCombatObject, getCombatDiagnostics, getCombatObjects, MODE, previewCombatObject } from '../exploration/combatLink.js'
import { createExplorationState, explorationReducer } from '../exploration/explorationState.js'
import { getFormation } from '../exploration/formations.js'
import { recommendPartyAction } from '../exploration/partyActions.js'
import { getCohesion, getMembers } from '../exploration/partyControl.js'
import { getEntityKnowledge, isVisibleToParty, KNOWLEDGE } from '../exploration/partyKnowledge.js'
import { weatherFor } from '../maps/mapWeather.js'
import { canScan, scanRadius } from '../exploration/partyScan.js'
import ScanReport from '../components/exploration/ScanReport.jsx'
import useFadeAfter from '../components/useFadeAfter.js'
import { playScanSound } from '../audio/uiSounds.js'
import { conditionSummary, isDefeated, minorDefeatText, normalizeCondition } from '../rules/personalCondition.js'
import { MAX_SEED } from '../rules/seededRandom.js'
import { Battle } from './CombatScreen.jsx'

const ORDER_LABEL = { point: 'Walking', follow: 'Following' }

const OUTCOME_LABEL = { victory: 'Victory', defeat: 'Defeat', ended: 'Ended (debug)' }

const NOT_BUILT = 'Not built yet.'

// A party member's radial menu (right-click on them; designer decision, 2026-10-09): Scan, Use, Switch, Search,
// First Aid, Attack, Interact and Sneak, each for that character only. Use, Search, First Aid and Attack are shown but
// not built yet (they may later act on objects). actions: { scan, switchTo, interact(objectId), sneak }.
function memberMenuButtons(state, member, actions) {
  const up = !isDefeated(member.condition)
  const scan = canScan(state, member.id)
  const radius = scanRadius(member.character)
  const objectId = up ? objectsInReach(state, [member.id]).find((definition) => getAvailableActions(state, definition.id).length)?.id : null
  const name = member.character.name
  const isOnlySelected = state.party.selectedIds.length === 1 && state.party.selectedIds[0] === member.id
  const unbuilt = (id, label, icon) => ({ id, label, icon, enabled: false, title: `${label}: ${NOT_BUILT}` })
  return [
    { id: 'scan', label: 'Scan', icon: 'scan', enabled: scan.possible, title: scan.possible ? `Scan (Reason + Science): location and environment, plus life signs and enemies within ${radius} tiles.` : `Scan: ${scan.reason}`, onClick: actions.scan },
    unbuilt('useItem', 'Use', 'useItem'),
    { id: 'switch', label: 'Switch', icon: 'switch', enabled: up && !isOnlySelected, title: `Switch to ${name}: select them and make them the lead.`, onClick: actions.switchTo },
    unbuilt('search', 'Search', 'search'),
    unbuilt('firstAid', 'First Aid', 'firstAid'),
    unbuilt('attack', 'Attack', 'attack'),
    {
      id: 'interact',
      label: 'Interact',
      icon: 'interact',
      enabled: Boolean(objectId),
      title: objectId ? `Interact: ${getDefinition(state.scenario, objectId).name}` : 'Interact: nothing in reach.',
      onClick: () => actions.interact(objectId),
    },
    { id: 'sneak', label: 'Sneak', icon: 'sneak', enabled: up, active: member.sneaking, title: `Sneak: ${name} crouches and moves slowly, harder to notice.`, onClick: actions.sneak },
  ]
}

// Developer-only readout of the party-control state.
function DebugPanel({ state, mode, lastCombat, onSpacing, onClose }) {
  const formation = getFormation(state.formationId)
  return (
    <div className="combat-panel explore-debug-panel">
      <p className="combat-panel-title">Party Debug</p>
      <dl className="explore-debug-facts">
        <FrameRate />
        <dt>Game mode</dt>
        <dd>{mode}</dd>
        {lastCombat && (
          <>
            <dt>Last combat</dt>
            <dd>
              #{lastCombat.id} {OUTCOME_LABEL[lastCombat.outcome]}, {lastCombat.rounds} {lastCombat.rounds === 1 ? 'round' : 'rounds'}
            </dd>
          </>
        )}
        <dt>Formation</dt>
        <dd>{formation.name}</dd>
        <dt>Spacing</dt>
        <dd>
          <input type="range" min="0.6" max="2" step="0.1" value={state.spacing} onChange={(event) => onSpacing(Number(event.target.value))} /> {state.spacing.toFixed(1)}
        </dd>
        <dt>Party</dt>
        <dd>{getCohesion(state) === 'grouped' ? 'Grouped' : 'Separated'}</dd>
      </dl>
      <table className="explore-debug-table">
        <tbody>
          {getMembers(state).map((member) => (
            <tr key={member.id}>
              <td>
                {member.id === state.leaderId ? '\u2605 ' : ''}
                {member.character.name}
              </td>
              <td>{state.selectedIds.includes(member.id) ? 'Selected' : ''}</td>
              <td>
                {member.position.x.toFixed(2)}, {member.position.y.toFixed(2)}
              </td>
              <td>
                {member.condition && `${conditionSummary(member.character, normalizeCondition(member.condition))}, `}
                {member.order ? ORDER_LABEL[member.order.type] : 'Idle'}
                {member.order?.type === 'follow' && ` ${state.members[member.order.leaderId].character.name}, slot ${member.order.slot + 1}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="combat-button is-small" onClick={onClose}>
        Close
      </button>
    </div>
  )
}

const EVENT_LABEL = {
  AWARENESS_CHANGED: 'awareness',
  CONFRONTATION_READY: 'CONFRONTATION_READY',
  OBSERVING: 'observing',
  ALARM_RAISED: 'raised the alarm',
  COMBAT_READY: 'COMBAT_READY',
  INVESTIGATION_STARTED: 'investigating',
  INVESTIGATION_ENDED: 'found nothing',
  NOISE: 'noise',
  NOISE_HEARD: 'heard a noise',
  FOOTSTEPS_HEARD: 'heard footsteps',
  GROUP_ALERT: 'group alert',
  GROUP_ALERT_RECEIVED: 'received group alert',
}

function describeEvent(event, world, party) {
  const npc = world.npcs[event.npcId]?.name
  const target = event.targetId ? (party.members[event.targetId]?.character.name ?? event.targetId) : null
  const parts = [npc, EVENT_LABEL[event.type] ?? event.type]
  if (event.type === 'AWARENESS_CHANGED') parts.push(`${stateName(event.from)} \u2192 ${stateName(event.to)}`)
  if (event.type === 'GROUP_ALERT') parts.push(`${event.groupId} (${alertMethodName(event.method)})`)
  if (event.type === 'GROUP_ALERT_RECEIVED') parts.push(`(${alertMethodName(event.method)})`)
  if (event.type === 'INVESTIGATION_STARTED') parts.push(`(${event.reason})`)
  if (target) parts.push(`\u2013 ${target}`)
  return parts.filter(Boolean).join(' ')
}

// Developer-only readout of NPC awareness: each NPC's state, what each party member is known to, COMBAT_READY, the
// event log, and test tools (the Noise tool turns the next floor click into a noise instead of a move).
// Debug: the scenario's runtime state: challenge objects, flags, facts the party has learned, and the task log
// (whose Momentum is held there until a group pool exists).
function ScenarioDebugPanel({ scenario, knowledge, views }) {
  const flags = Object.entries(scenario.flags)
  const facts = Object.entries(knowledge.facts ?? {})
  return (
    <div className="combat-panel explore-awareness-panel">
      <p className="combat-panel-title">Scenario</p>
      <table className="explore-debug-table">
        <tbody>
          {views.map((view) => (
            <tr key={view.id}>
              <td>{view.name}</td>
              <td>{view.stateLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="explore-debug-heading">Flags</p>
      <p className="explore-debug-line">{flags.length ? flags.map(([flag, value]) => `${flag}: ${value}`).join(', ') : 'None set'}</p>
      <p className="explore-debug-heading">Party knowledge facts</p>
      <ul className="explore-debug-list">
        {facts.length ? facts.map(([id, fact]) => <li key={id}>{fact.text}</li>) : <li>None</li>}
      </ul>
      <p className="explore-debug-heading">Task log</p>
      <ul className="explore-debug-list">
        {scenario.log.length
          ? scenario.log.slice(-6).map((entry) => (
              <li key={entry.key}>
                {entry.objectId}.{entry.actionId}: {entry.routine ? 'routine' : entry.success ? `success, Momentum ${entry.momentumGenerated}` : 'failure'}
                {entry.complications ? `, ${entry.complications} complication` : ''}
              </li>
            ))
          : <li>No tasks yet</li>}
      </ul>
    </div>
  )
}

function AwarenessPanel({ world, party, knowledge, noiseTool, onNoiseTool, onResetNpcs }) {
  const combatReady = getCombatReady(world)
  const name = (id) => party.members[id]?.character.name ?? id
  return (
    <div className="combat-panel explore-awareness-panel">
      <p className="combat-panel-title">NPC Awareness</p>
      {combatReady.map((entry) => (
        <p key={entry.npcId} className="explore-combat-ready">
          COMBAT_READY: {world.npcs[entry.npcId].name} vs {name(entry.targetId)}
        </p>
      ))}
      <table className="explore-debug-table">
        <tbody>
          {getNpcs(world).map((npc) => (
            <tr key={npc.id}>
              <td>{npc.name}</td>
              <td>{dispositionName(npc.disposition)}</td>
              <td className={`npc-state is-${npc.state.toLowerCase().replace('_', '-')}`}>{isDown(npc) ? (minorDefeatText(npc.condition) ?? 'Down') : stateName(npc.state)}
                {!isDown(npc) && npc.hearing?.level > 0 ? ` (hears ${Math.round(npc.hearing.level * 100)}%)` : ''}
              </td>
              <td>{npc.focusId ? name(npc.focusId) : '-'}</td>
              <td>{npc.alertGroupId ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="explore-debug-heading">Characters</p>
      {party.memberIds.map((id) => (
        <CharacterInspector key={id} character={party.members[id].character} condition={party.members[id].condition} actor={{ id, controller: 'player' }} />
      ))}
      {getNpcs(world).filter((npc) => npc.character).map((npc) => (
        <CharacterInspector key={npc.id} character={npc.character} condition={npc.condition} actor={{ id: npc.id, controller: npc.controller, disposition: dispositionName(npc.disposition), awareness: stateName(npc.state) }} />
      ))}
      <p className="explore-debug-heading">Known to</p>
      <ul className="explore-debug-list">
        {party.memberIds.map((id) => {
          const known = getCharacterAwareness(world, id).filter((entry) => entry.state !== 'UNAWARE' && !isDown(world.npcs[entry.npcId]))
          return (
            <li key={id}>
              {name(id)}: {known.length ? known.map((entry) => `${entry.name} ${stateName(entry.state)}${entry.visible ? ' (sees)' : ''}`).join(', ') : 'nobody'}
            </li>
          )
        })}
      </ul>
      <p className="explore-debug-heading">Party knowledge</p>
      <ul className="explore-debug-list">
        {getNpcs(world).map((npc) => {
          const entry = getEntityKnowledge(knowledge, npc.id)
          return (
            <li key={npc.id}>
              {npc.name}: {entry.state}
              {entry.observerIds.length ? ` by ${entry.observerIds.map(name).join(', ')}` : ''}
              {entry.state === KNOWLEDGE.KNOWN ? `, last seen ${pointText(entry.lastKnownPosition)}` : ''}
            </li>
          )
        })}
      </ul>
      <p className="explore-debug-heading">Each member sees</p>
      <ul className="explore-debug-list">
        {party.memberIds.map((id) => (
          <li key={id}>
            {name(id)}: {knowledge.sightings[id]?.length ? knowledge.sightings[id].map((npcId) => world.npcs[npcId].name).join(', ') : 'nobody'}
          </li>
        ))}
      </ul>
      <p className="explore-debug-heading">Events</p>
      <ul className="explore-debug-list explore-debug-events">
        {world.events
          .filter((event) => event.type !== 'NOISE_HEARD')
          .slice(-7)
          .reverse()
          .map((event, i) => (
            <li key={`${event.time}-${i}`}>
              {event.time.toFixed(1)}s {describeEvent(event, world, party)}
            </li>
          ))}
      </ul>
      <div className="explore-debug-buttons">
        <button type="button" className="combat-button is-small" aria-pressed={noiseTool} onClick={onNoiseTool} title="The next floor click makes a noise there instead of moving.">
          Noise Tool
        </button>
        <button type="button" className="combat-button is-small" onClick={onResetNpcs}>
          Reset NPCs
        </button>
      </div>
    </div>
  )
}

const cellText = (cell) => (cell ? `(${cell.x},${cell.y})` : '-')
const pointText = (point) => (point ? `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})` : '-')

// Developer-only readout of a fight started in the world: how it started, who joined and why, where everyone stood
// and which cell they fight from, and what each enemy knows of each party member.
function CombatLinkPanel({ diagnostics, onForceEnd }) {
  const d = diagnostics
  return (
    <div className="combat-panel world-combat-debug-panel">
      <p className="combat-panel-title">Combat Link</p>
      <dl className="explore-debug-facts">
        <dt>Game mode</dt>
        <dd>
          {d.mode} (fight #{d.combatId})
        </dd>
        <dt>Trigger</dt>
        <dd>
          {d.trigger.npc} vs {d.trigger.target} ({d.trigger.source})
        </dd>
      </dl>
      <p className="explore-debug-heading">Enemies in the fight</p>
      <ul className="explore-debug-list">
        {d.participants.map((entry) => (
          <li key={entry.id}>
            {entry.name}: {entry.reason}
            {entry.round > 1 ? ` (round ${entry.round})` : ''}
          </li>
        ))}
      </ul>
      <p className="explore-debug-heading">Party: world position, cell, snap</p>
      <table className="explore-debug-table">
        <tbody>
          {d.party.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.name}</td>
              <td>{pointText(entry.world)}</td>
              <td>{cellText(entry.cell)}</td>
              <td>{entry.snap === null ? '-' : entry.snap.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="explore-debug-heading">What each enemy knows</p>
      <ul className="explore-debug-list">
        {d.knowledge.map((npc) => (
          <li key={npc.npcId}>
            {npc.name}:{' '}
            {npc.entries
              .map((entry) => (entry.known ? `${entry.name} known (${entry.source})` : `${entry.name} unknown${entry.lastKnownPosition ? `, last seen ${cellText(entry.lastKnownPosition)}` : ''}`))
              .join('; ')}
          </li>
        ))}
      </ul>
      <p className="explore-debug-heading">What the away team knows</p>
      <ul className="explore-debug-list">
        {d.partyView.map((entry) => (
          <li key={entry.id}>
            {entry.name}: {entry.state}
            {entry.observers.length ? ` by ${entry.observers.join(', ')}` : ''}
            {entry.state === 'KNOWN' ? `, last seen ${pointText(entry.lastKnownPosition)}` : ''}
          </li>
        ))}
      </ul>
      <p className="explore-debug-heading">Nearby, not fighting</p>
      <ul className="explore-debug-list">
        {d.nearby.length ? d.nearby.map((npc) => <li key={npc.id}>{`${npc.name}: ${npc.down ? 'Down' : stateName(npc.state)}`}</li>) : <li>Nobody</li>}
      </ul>
      <p className="explore-debug-heading">Snaps (world to cell)</p>
      <ul className="explore-debug-list">
        {d.snaps.map((snap) => (
          <li key={snap.id}>
            {snap.name}: {pointText(snap.from)} to {cellText(snap.cell)}, {snap.distance.toFixed(2)}
          </li>
        ))}
      </ul>
      <div className="explore-debug-buttons">
        <button type="button" className="combat-button is-small" onClick={onForceEnd} title="Ends the fight now without a result, as if it had finished (developer tool).">
          End Combat (debug)
        </button>
      </div>
    </div>
  )
}

// Combat Type 1 over the same world: the exploration view is swapped for the combat battlefield on the same map, with
// everyone where they stood. Exploration stays frozen underneath until the result's Return to Exploration.
function WorldCombat({ state, dispatch, debugOpen, onDebug, onExit }) {
  const { combat, link, world } = state
  // Test options for Auto Combat, as on the Combat Type 1 screen.
  const [partyAI, setPartyAI] = useState('classic')
  const [enemyAI, setEnemyAI] = useState('classic')
  const combatDispatch = useCallback((action) => dispatch({ type: 'combat', action }), [dispatch])
  // The battlefield shows only what the away team sees; enemies it has lost leave a marker where last seen.
  const knowledge = state.partyKnowledge
  const hiddenIds = Object.values(combat.combatants)
    .filter((unit) => unit.side === 'enemy' && !isVisibleToParty(knowledge, unit.id))
    .map((unit) => unit.id)
  const lastKnownMarks = getNpcs(world)
    .map((npc) => ({ npc, entry: getEntityKnowledge(knowledge, npc.id) }))
    .filter(({ entry }) => entry.state === KNOWLEDGE.KNOWN)
    .map(({ npc, entry }) => ({ id: npc.id, position: entry.lastKnownPosition, label: debugOpen ? npc.name : entry.identified ? null : 'Life sign' }))
  const bystanders = getNpcs(world)
    .filter((npc) => !link.npcIds.includes(npc.id) && npc.character && isVisibleToParty(knowledge, npc.id))
    .map((npc) => ({ id: npc.id, character: npc.character, position: npc.position, facing: { x: Math.cos(npc.heading), y: Math.sin(npc.heading) }, condition: normalizeCondition(npc.condition) }))
  const trigger = combat.combatants[link.trigger.npcId]
  const target = combat.combatants[link.trigger.targetId]
  const openingFocus = trigger && target ? { x: (trigger.position.x + target.position.x) / 2, y: (trigger.position.y + target.position.y) / 2 } : (trigger?.position ?? null)
  const [openingBanner] = useState(() => ({
    title: 'Combat',
    subtitle: !target ? null : trigger && isVisibleToParty(knowledge, trigger.id) ? `${trigger.character.name} engages ${target.character.name}` : `${target.character.name} has been spotted`,
  }))
  const diagnostics = debugOpen ? getCombatDiagnostics(state) : null
  // The same challenge objects as in exploration, usable by whoever acts (combatLink.js runs them).
  const objectList = getCombatObjects(state)
  const objects = {
    list: objectList,
    preview: (objectId, actionId) => previewCombatObject(state, objectId, actionId),
    compare: (objectId, actionId, performerId) => compareCombatObject(state, objectId, actionId, performerId),
    marks: getChallengeViews(state.scenario).map((view) => ({
      id: view.id,
      name: view.name,
      position: view.position,
      stateLabel: view.stateLabel,
      inReach: objectList.some((entry) => entry.definition.id === view.id),
    })),
  }
  return (
    <Battle
      objects={objects}
      state={combat}
      dispatch={combatDispatch}
      showHelpOnStart={false}
      onHelpSeen={() => {}}
      partyAI={partyAI}
      onPartyAI={setPartyAI}
      enemyAI={enemyAI}
      onEnemyAI={setEnemyAI}
      onExit={onExit}
      onContinue={() => dispatch({ type: 'endCombat' })}
      bystanders={bystanders}
      hiddenIds={hiddenIds}
      lastKnownMarks={lastKnownMarks}
      openingBanner={openingBanner}
      snapMarks={diagnostics?.snaps ?? null}
      openingFocus={openingFocus}
      debugOpen={debugOpen}
      onDebug={onDebug}
      worldActors={debugOpen ? Object.fromEntries(getNpcs(world).map((npc) => [npc.id, { disposition: dispositionName(npc.disposition), awareness: stateName(npc.state) }])) : null}
    >
      {diagnostics && (
        <div className="world-combat-debug">
          <CombatLinkPanel diagnostics={diagnostics} onForceEnd={() => dispatch({ type: 'endCombat' })} />
        </div>
      )}
    </Battle>
  )
}

function Exploration({ state, dispatch, onChangeParty, onExit }) {
  const { party, world } = state
  const [followCamera, setFollowCamera] = useState(true)
  const [debugOpen, setDebugOpen] = useState(false)
  const [noiseTool, setNoiseTool] = useState(false)
  const showHints = useDisplaySettings().helpHints
  // UI state: the challenge object whose interaction panel is open. Move orders wait while it's open.
  const [interactionId, setInteractionId] = useState(null)
  // UI state: who is best at the approach being considered in the interaction panel (party card highlight).
  const [recommendation, setRecommendation] = useState(null)
  // The panel recomputes on every world tick (most animation frames); keeping the old object when nothing changed
  // stops each tick from forcing a second render of the whole screen.
  const updateRecommendation = useCallback((next) => {
    setRecommendation((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next))
  }, [])
  // UI state: the action button being considered (the party cards show who is best at it).
  const [consideredActionId, setConsideredActionId] = useState(null)
  // UI state: whether the character sheet is open (I toggles it); selecting never opens it (designer decision).
  const [sheetOpen, setSheetOpen] = useState(false)
  const members = getMembers(party)
  const inCombat = state.mode === MODE.COMBAT
  useExplorationFootsteps(members, !inCombat)
  const challengeViews = getChallengeViews(state.scenario)
  const inReachIds = objectsInReach(state, party.memberIds).map((definition) => definition.id)
  const reachableIds = inReachIds.filter((id) => getAvailableActions(state, id).length > 0)
  const openId = interactionId && inReachIds.includes(interactionId) ? interactionId : null

  // The world runs in real time: one movement step per animation frame.
  useEffect(() => {
    let frame
    let last = performance.now()
    const step = (now) => {
      dispatch({ type: 'tick', seconds: (now - last) / 1000 })
      last = now
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [dispatch])

  // UI state: the party member whose radial menu is open (right-click on them), or null.
  const [menuMemberId, setMenuMemberId] = useState(null)
  // UI state: the last scan whose report the player closed (lastScan.key).
  const [closedScanKey, setClosedScanKey] = useState(null)
  const lastScan = state.lastScan
  const lastScanKey = lastScan?.key
  useEffect(() => {
    if (lastScanKey != null) playScanSound()
  }, [lastScanKey])
  const select = useCallback((id, additive) => dispatch({ type: additive ? 'toggleSelect' : 'select', id }), [dispatch])
  const selectBox = useCallback((ids, additive) => dispatch({ type: 'selectBox', ids, additive }), [dispatch])
  // Right-click opens a member's menu and adds them to the selection; whoever else is selected stays selected.
  const selectedIds = state.party.selectedIds
  const openMenu = useCallback(
    (id) => {
      if (!selectedIds.includes(id)) dispatch({ type: 'toggleSelect', id })
      setMenuMemberId(id)
    },
    [dispatch, selectedIds],
  )
  const setLeader = useCallback((id) => dispatch({ type: 'setLeader', id }), [dispatch])
  const setFormation = useCallback((formationId) => dispatch({ type: 'setFormation', formationId }), [dispatch])
  const regroup = useCallback(() => dispatch({ type: 'regroup' }), [dispatch])
  const toggleSneak = useCallback(() => dispatch({ type: 'toggleSneak' }), [dispatch])
  const allSneaking = party.selectedIds.length > 0 && party.selectedIds.every((id) => party.members[id].sneaking)
  // With several selected, the sheet shows the first of them.
  const sheetMember = sheetOpen && !debugOpen && party.selectedIds.length > 0 ? party.members[party.selectedIds[0]] : null

  // Number keys 1-n pick party members (Shift adds / removes), like clicking their portraits.
  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      const index = Number(event.code.replace('Digit', '')) - 1
      if (!event.code.startsWith('Digit') || !(index >= 0 && index < party.memberIds.length)) return
      select(party.memberIds[index], event.shiftKey)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [party.memberIds, select])

  // E interacts with the nearest object in reach; Escape closes the panel; C toggles sneak for the selected characters;
  // I opens or closes the character sheet.
  const firstReachable = reachableIds[0] ?? null
  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      if (event.code === 'Escape') {
        setInteractionId(null)
        setMenuMemberId(null)
      }
      if (event.code === 'KeyE' && firstReachable) setInteractionId((open) => open ?? firstReachable)
      if (event.code === 'KeyC' && !event.repeat && !event.ctrlKey && !event.metaKey) toggleSneak()
      if (event.code === 'KeyI' && !event.repeat && !event.ctrlKey && !event.metaKey) setSheetOpen((open) => !open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [firstReachable, toggleSneak])

  const move = useCallback(
    (target, fresh) => {
      if (fresh) setMenuMemberId(null)
      if (openId) return
      if (!noiseTool) {
        dispatch({ type: 'moveTo', target, fresh })
        return
      }
      if (!fresh) return
      dispatch({ type: 'emitNoise', noise: { position: target, ...awarenessData.debugNoise, source: 'debug' } })
      setNoiseTool(false)
    },
    [dispatch, noiseTool, openId],
  )

  const menuMember = menuMemberId && !inCombat ? party.members[menuMemberId] : null
  const menu = menuMember && {
    memberId: menuMember.id,
    buttons: memberMenuButtons(state, menuMember, {
      scan: () => dispatch({ type: 'scan', memberId: menuMember.id }),
      switchTo: () => select(menuMember.id, false),
      interact: (objectId) => {
        select(menuMember.id, false)
        setInteractionId(objectId)
      },
      sneak: () => dispatch({ type: 'toggleSneakFor', id: menuMember.id }),
    }).map((button) => ({
      ...button,
      onClick: () => {
        setMenuMemberId(null)
        button.onClick?.()
      },
    })),
  }
  const scanFaded = useFadeAfter(lastScanKey)
  const scanShown = Boolean(lastScan) && closedScanKey !== lastScan.key
  const hint = openId
    ? 'Interacting: move orders wait until the panel is closed (Escape). The world keeps moving.'
    : noiseTool
      ? 'Noise tool: click the floor to make a noise there.'
      : `Click or hold the left button to move. Click a portrait (or 1-${members.length}) to select one; Shift + click to add or remove. Right-drag a box to select several (Ctrl adds). C: sneak. I: character sheet. Right-click a character for their actions.`
  const hintFaded = useFadeAfter(hint)

  if (inCombat) return <WorldCombat key={state.link.id} state={state} dispatch={dispatch} debugOpen={debugOpen} onDebug={() => setDebugOpen(!debugOpen)} onExit={onExit} />

  return (
    <div className="combat-screen exploration-screen">
      <ExplorationBoard
        state={party}
        world={world}
        knowledge={state.partyKnowledge}
        challenges={challengeViews}
        reachableIds={reachableIds}
        onInteract={setInteractionId}
        debug={debugOpen}
        followCamera={followCamera}
        onMove={move}
        onSelect={select}
        onSelectBox={selectBox}
        onOpenMenu={openMenu}
        menu={menu}
      />
      {scanShown && (
        <ScanReport scan={lastScan} faded={scanFaded} scannerName={party.members[lastScan.memberId]?.character.name ?? 'Scan'} onClose={() => setClosedScanKey(lastScan.key)} />
      )}
      <WeatherFx fx={weatherFor(party.map.weather).fx} follow=".exploration-board" />
      <div className="combat-top-left">
        <ResourceIndicators momentum={state.resources.momentum} threat={state.resources.threat} />
      </div>
      {/* Settings > Help Hints off hides it, except while the debug noise tool waits for a click. */}
      {(showHints || noiseTool) && <p className={`combat-hint is-player-turn${hintFaded ? ' is-faded-out' : ''}`}>{hint}</p>}
      {!openId && reachableIds.length > 0 && (
        <div className="challenge-prompts">
          {reachableIds.map((id, index) => (
            <button key={id} type="button" className="combat-button is-small is-primary" onClick={() => setInteractionId(id)}>
              Interact: {getDefinition(state.scenario, id).name}
              {index === 0 ? ' (E)' : ''}
            </button>
          ))}
        </div>
      )}
      {openId && (
        <ChallengePanel
          key={openId}
          state={state}
          objectId={openId}
          defaultPerformerId={party.selectedIds[0] ?? party.leaderId}
          dispatch={dispatch}
          onClose={() => setInteractionId(null)}
          onRecommend={updateRecommendation}
          dev={debugOpen}
        />
      )}
      <div className="combat-top-right">
        <button
          type="button"
          className="combat-button is-small"
          aria-pressed={followCamera}
          title={followCamera ? 'The view follows the lead character. Click to stop.' : 'The view stays where you put it. Click to follow the lead character.'}
          onClick={() => setFollowCamera(!followCamera)}
        >
          Camera: {followCamera ? 'Follow' : 'Free'}
        </button>
        <button type="button" className="combat-button is-small" aria-pressed={debugOpen} onClick={() => setDebugOpen(!debugOpen)}>
          Debug
        </button>
        {onChangeParty && (
          <button type="button" className="combat-button is-small" onClick={onChangeParty}>
            Away Team
          </button>
        )}
        <button type="button" className="combat-button is-small" onClick={onExit}>
          Exit
        </button>
      </div>
      {sheetMember && <CharacterSheetPanel character={sheetMember.character} condition={sheetMember.condition} className="is-on-map" onClose={() => setSheetOpen(false)} />}
      {!openId && <Minimap map={party.map} party={party} world={world} knowledge={state.partyKnowledge} debug={debugOpen} />}
      <ExplorationPartyBar
        members={members}
        selectedIds={party.selectedIds}
        leaderId={party.leaderId}
        onSelect={select}
        onSetLeader={setLeader}
        recommendation={openId ? recommendation : recommendPartyAction(members, consideredActionId, state.scenario.traits)}
      />
      {!openId && (
        <div className="explore-bottom-right">
          <ExplorationActionButtons consideredId={consideredActionId} onConsider={setConsideredActionId} />
          <FormationPanel formationId={party.formationId} onFormation={setFormation} onRegroup={regroup} sneaking={allSneaking} onSneak={toggleSneak} />
        </div>
      )}
      {debugOpen && (
        <div className="explore-debug-column">
          <DebugPanel state={party} mode={state.mode} lastCombat={state.lastCombat} onSpacing={(spacing) => dispatch({ type: 'setSpacing', spacing })} onClose={() => setDebugOpen(false)} />
          <AwarenessPanel world={world} party={party} knowledge={state.partyKnowledge} noiseTool={noiseTool} onNoiseTool={() => setNoiseTool(!noiseTool)} onResetNpcs={() => dispatch({ type: 'resetNpcs' })} />
          <ScenarioDebugPanel scenario={state.scenario} knowledge={state.partyKnowledge} views={challengeViews} />
        </div>
      )}
    </div>
  )
}

// Exploration prototype: the away team on an episode's map, with party selection and formation movement, and NPCs
// that perceive and react to them. mapId: the episode chosen in Load Episode.
export default function ExplorationScreen({ savedCharacters, mapId, onBack, onExit }) {
  // UI state: the chosen away team (RuntimeCharacters) and the running exploration. Never saved or exported.
  const [team, setTeam] = useState([])
  const [state, dispatch] = useReducer(explorationReducer, null)
  const [phase, setPhase] = useState('setup')

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
          setPhase('explore')
        }}
      />
    )
  }
  return (
    <MapFadeIn>
      <Exploration state={state} dispatch={dispatch} onChangeParty={() => setPhase('setup')} onExit={onExit} />
    </MapFadeIn>
  )
}

// The map editor's Play: a ready-made away team (RuntimeCharacters) on the open map, straight into exploration with no
// setup screen. onExit returns to the editor.
export function ExplorationPlaytest({ map, characters, enemiesActive, onExit }) {
  const [state, dispatch] = useReducer(explorationReducer, null, () =>
    createExplorationState(map, characters, Math.floor(Math.random() * MAX_SEED), { enemiesActive }),
  )
  return <Exploration state={state} dispatch={dispatch} onChangeParty={null} onExit={onExit} />
}
