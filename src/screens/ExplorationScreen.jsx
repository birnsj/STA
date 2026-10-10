import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useDisplaySettings } from '../settings/DisplaySettingsContext.js'
import CharacterInspector from '../components/CharacterInspector.jsx'
import FrameRate from '../components/FrameRate.jsx'
import ResourceIndicators from '../components/combat/ResourceIndicators.jsx'
import ObjectivesPanel from '../components/combat/ObjectivesPanel.jsx'
import ChallengePanel from '../components/exploration/ChallengePanel.jsx'
import CharacterSheetPanel from '../components/exploration/CharacterSheetPanel.jsx'
import CaptainsLogPanel from '../components/exploration/CaptainsLogPanel.jsx'
import ConversationPanel from '../components/exploration/ConversationPanel.jsx'
import { loadConversation } from '../conversation/conversationFiles.js'
import ExplorationBoard from '../components/exploration/ExplorationBoard.jsx'
import { ExplorationActionButtons, ExplorationPartyBar, FormationPanel } from '../components/exploration/ExplorationPartyBar.jsx'
import ExplorationSetup from '../components/exploration/ExplorationSetup.jsx'
import useExplorationFootsteps from '../components/exploration/useExplorationFootsteps.js'
import Minimap from '../components/exploration/Minimap.jsx'
import MapFadeIn from '../components/maps/MapFadeIn.jsx'
import '../components/exploration/exploration.css'
import '../components/maps/mapEditor.css'
import awarenessData from '../data/adaptation/exploration/awareness.json'
import WeatherFx from '../effects/WeatherFx.jsx'
import { alertMethodName, dispositionName, getCharacterAwareness, getCombatReady, getNpcs, isDown, isHostile, STATE, stateName } from '../exploration/awareness.js'
import ConfirmDialog from '../components/maps/ConfirmDialog.jsx'
import { getFaction } from '../rules/factions.js'
import { getEquippedItems } from '../rules/equipment.js'
import { getAvailableActions, getChallengeViews, getDefinition, objectivePosition, objectsInReach } from '../exploration/challengeObjects.js'
import { SCAN_TRAIT } from '../combat/combatScan.js'
import { compareCombatObject, getCombatDiagnostics, getCombatObjects, MODE, previewCombatObject } from '../exploration/combatLink.js'
import { createExplorationState, explorationReducer, npcsInTalkRange } from '../exploration/explorationState.js'
import { objectiveStatus } from '../exploration/missionFlags.js'
import { getFormation } from '../exploration/formations.js'
import { recommendPartyAction } from '../exploration/partyActions.js'
import { getCohesion, getMembers } from '../exploration/partyControl.js'
import { getEntityKnowledge, isVisibleToParty, KNOWLEDGE } from '../exploration/partyKnowledge.js'
import { weatherFor } from '../maps/mapWeather.js'
import { canScan, canScanNpc, scanRadius } from '../exploration/partyScan.js'
import ScanReport from '../components/exploration/ScanReport.jsx'
import useFadeAfter from '../components/useFadeAfter.js'
import { playScanSound } from '../audio/uiSounds.js'
import { conditionSummary, getProtection, isDefeated, minorDefeatText, normalizeCondition } from '../rules/personalCondition.js'
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

// The selected character who would scan this NPC (the lead first): the first who can, else the lead with the reason.
// Returns { member, check } or null when nobody is selected.
function npcScanner(state, npcId) {
  const { party } = state
  const ids = [party.leaderId, ...party.selectedIds.filter((id) => id !== party.leaderId)].filter((id) => party.selectedIds.includes(id))
  if (!ids.length) return null
  const checks = ids.map((id) => ({ member: party.members[id], check: canScanNpc(state, id, npcId) }))
  return checks.find(({ check }) => check.possible) ?? checks[0]
}

// An NPC's radial menu (left click on an NPC the party can see; designer requests 2026-10-09): Talk, when they have a
// conversation (out of reach, the selected characters walk over first); Scan (one selected character scans them); Info
// (a card beside the ring); Attack; Go To. Persuade, Intimidate, Use Item and First Aid are shown but not built yet.
// actions: { talk, scan, info, attack, goTo }; infoOpen: whether the card is showing.
function npcMenuButtons(state, npc, inTalkRange, infoOpen, actions) {
  const up = !isDown(npc)
  const canTalk = up && Boolean(npc.conversationId)
  const talkTitle = !npc.conversationId ? `${npc.name} has nothing to say.` : !up ? `${npc.name} can't talk now.` : inTalkRange ? `Talk to ${npc.name}.` : `Walk over to ${npc.name} and talk.`
  const scanner = npcScanner(state, npc.id)
  const scanTitle = !scanner ? 'Scan: select a character first.' : scanner.check.possible ? `${scanner.member.character.name} scans ${npc.name} (Reason + Science): condition and equipment.` : `Scan (${scanner.member.character.name}): ${scanner.check.reason}`
  const unbuilt = (id, label, icon) => ({ id, label, icon, enabled: false, title: `${label}: ${NOT_BUILT}` })
  return [
    { id: 'talk', label: 'Talk', icon: 'persuade', enabled: canTalk, title: talkTitle, onClick: actions.talk },
    { id: 'scan', label: 'Scan', icon: 'scan', enabled: Boolean(scanner?.check.possible), title: scanTitle, onClick: () => actions.scan(scanner.member.id) },
    unbuilt('persuade', 'Persuade', 'persuade'),
    unbuilt('intimidate', 'Intimidate', 'intimidate'),
    { id: 'info', label: 'Info', icon: 'info', enabled: true, active: infoOpen, title: infoOpen ? 'Hide what the party knows about them.' : `What the party knows about ${npc.name}.`, onClick: actions.info, keepOpen: true },
    unbuilt('useItem', 'Use Item', 'useItem'),
    unbuilt('firstAid', 'First Aid', 'firstAid'),
    { id: 'attack', label: 'Attack', icon: 'attack', enabled: up, title: up ? `Attack ${npc.name}: starts a fight.` : `${npc.name} is down.`, onClick: actions.attack },
    { id: 'goTo', label: 'Go To', icon: 'move', enabled: true, title: `Walk the selected characters over to ${npc.name}.`, onClick: actions.goTo },
  ]
}

const AWARENESS_ORDER = [STATE.UNAWARE, STATE.SUSPICIOUS, STATE.INVESTIGATING, STATE.ALERTED, STATE.COMBAT_READY]

// The card beside an NPC's ring: what the party can see, plus their condition and equipment once a scan has succeeded.
function npcInfo(state, npc) {
  const { character } = npc
  const factionName = (npc.faction && npc.faction !== character.faction?.id ? getFaction(npc.faction)?.name : character.faction?.name) ?? 'Unknown'
  const noticed = state.party.memberIds.map((id) => npc.awareness[id]?.state ?? STATE.UNAWARE).sort((a, b) => AWARENESS_ORDER.indexOf(b) - AWARENESS_ORDER.indexOf(a))[0]
  const rows = [
    ['Species', character.species?.name || 'Unknown'],
    ['Faction', factionName],
    ['Disposition', dispositionName(npc.disposition)],
    ['Noticed you', isDown(npc) ? 'Down' : stateName(noticed ?? STATE.UNAWARE)],
  ]
  const scan = state.npcScans?.[npc.id]
  const tips = []
  if (scan?.success) {
    const condition = normalizeCondition(npc.condition)
    rows.push(['Condition', conditionSummary(character, condition) || 'Unhurt'])
    rows.push(['Protection', `Stun ${getProtection(character, { injuryType: 'stun' }).value} / Deadly ${getProtection(character, { injuryType: 'deadly' }).value}`])
    const gear = getEquippedItems(character).map((item) => item.name)
    rows.push(['Equipment', gear.length ? gear.join(', ') : 'None'])
    tips.push(`Scanned by ${state.party.members[scan.memberId]?.character.name ?? 'the away team'}.`)
    tips.push(`In a fight it starts scanned, with the trait ${SCAN_TRAIT.name}: your attacks on it are easier.`)
  } else if (scan) {
    tips.push('Scan failed: no clear readings. Scan again to retry.')
  } else {
    tips.push('Scan them for their condition and equipment.')
  }
  return { title: npc.name, rows, tips }
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
    .map((npc) => ({ id: npc.id, character: npc.character, position: npc.position, facing: { x: Math.cos(npc.heading), y: Math.sin(npc.heading) }, condition: normalizeCondition(npc.condition), hostile: isHostile(npc) }))
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
  // UI state: whether the Captain's Log panel is open.
  const [logOpen, setLogOpen] = useState(false)
  const members = getMembers(party)
  const inCombat = state.mode === MODE.COMBAT
  useExplorationFootsteps(members, !inCombat)
  const challengeViews = getChallengeViews(state.scenario)
  const inReachIds = objectsInReach(state, party.memberIds).map((definition) => definition.id)
  const reachableIds = inReachIds.filter((id) => getAvailableActions(state, id).length > 0)
  const talking = Boolean(state.conversation)
  const openId = !talking && interactionId && inReachIds.includes(interactionId) ? interactionId : null
  // Either panel holds move orders and takes the right-hand side.
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
          setInteractionId(null)
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
  const objectives = knownObjectives.map(({ id, title, status }) => ({ id, text: title || id, complete: status === 'complete' }))

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
  // UI state: the NPC whose radial menu is open (left click on them), or null; whether its Info card shows; the NPC
  // whose Attack is waiting for confirmation.
  const [menuNpcId, setMenuNpcId] = useState(null)
  const [npcInfoOpen, setNpcInfoOpen] = useState(false)
  const [confirmAttackId, setConfirmAttackId] = useState(null)
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
      setMenuNpcId(null)
    },
    [dispatch, selectedIds],
  )
  const openNpcMenu = useCallback((id) => {
    setMenuNpcId(id)
    setMenuMemberId(null)
  }, [])
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

  // Escape closes the panel or leaves the conversation; C toggles sneak for the selected characters; I opens or closes
  // the character sheet; L the Captain's Log.
  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      if (event.code === 'Escape') {
        setInteractionId(null)
        setMenuMemberId(null)
        setMenuNpcId(null)
        setPendingTalk(null)
        setLogOpen(false)
        if (talking) dispatch({ type: 'conversationLeave' })
      }
      if (event.code === 'KeyC' && !event.repeat && !event.ctrlKey && !event.metaKey) toggleSneak()
      if (event.code === 'KeyI' && !event.repeat && !event.ctrlKey && !event.metaKey) setSheetOpen((open) => !open)
      if (event.code === 'KeyL' && !event.repeat && !event.ctrlKey && !event.metaKey) setLogOpen((open) => !open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [talking, dispatch, toggleSneak])

  const move = useCallback(
    (target, fresh) => {
      if (fresh) {
        setMenuMemberId(null)
        setMenuNpcId(null)
        setPendingTalk(null)
      }
      if (panelOpen) return
      if (!noiseTool) {
        dispatch({ type: 'moveTo', target, fresh })
        return
      }
      if (!fresh) return
      dispatch({ type: 'emitNoise', noise: { position: target, ...awarenessData.debugNoise, source: 'debug' } })
      setNoiseTool(false)
    },
    [dispatch, noiseTool, panelOpen],
  )

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
  const attackNpc = (npc) => dispatch({ type: 'attackNpc', npcId: npc.id, targetId: party.selectedIds.includes(party.leaderId) ? party.leaderId : party.selectedIds[0] })
  const npcMenu = menuNpc && {
    npcId: menuNpc.id,
    info: npcInfoOpen ? npcInfo(state, menuNpc) : null,
    buttons: npcMenuButtons(state, menuNpc, talkable.some((npc) => npc.id === menuNpc.id), npcInfoOpen, {
      talk: () => {
        if (talkable.some((npc) => npc.id === menuNpc.id)) return talkTo(menuNpc)
        walkToNpc(menuNpc)
        setPendingTalk({ npcId: menuNpc.id, combatId: state.lastCombat?.id ?? null })
      },
      // The card opens to show the result.
      scan: (memberId) => {
        dispatch({ type: 'scanNpc', memberId, npcId: menuNpc.id })
        setNpcInfoOpen(true)
      },
      info: () => setNpcInfoOpen((open) => !open),
      // Attacking someone who wouldn't fight anyway asks first.
      attack: () => (isHostile(menuNpc) ? attackNpc(menuNpc) : setConfirmAttackId(menuNpc.id)),
      goTo: () => walkToNpc(menuNpc),
    }).map((button) => ({
      ...button,
      onClick: () => {
        if (!button.keepOpen && button.id !== 'scan') setMenuNpcId(null)
        button.onClick?.()
      },
    })),
  }
  const confirmAttackNpc = confirmAttackId && !inCombat ? world.npcs[confirmAttackId] : null
  const menuMember = menuMemberId && !inCombat ? party.members[menuMemberId] : null
  const memberMenu = menuMember && {
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
  const hint = talking
    ? 'In conversation: move orders wait until it ends (Escape leaves). The world keeps moving.'
    : openId
    ? 'Interacting: move orders wait until the panel is closed (Escape). The world keeps moving.'
    : noiseTool
      ? 'Noise tool: click the floor to make a noise there.'
      : `Click or hold the left button to move. Click a portrait (or 1-${members.length}) to select one; Shift + click to add or remove. Right-drag a box to select several (Ctrl adds). C: sneak. I: character sheet. L: Captain's Log. Right-click a character for their actions; click someone else to talk to them.`
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
        onOpenNpcMenu={openNpcMenu}
        menu={memberMenu || npcMenu}
      />
      {scanShown && (
        <ScanReport scan={lastScan} faded={scanFaded} scannerName={party.members[lastScan.memberId]?.character.name ?? 'Scan'} onClose={() => setClosedScanKey(lastScan.key)} />
      )}
      <WeatherFx fx={weatherFor(party.map.weather).fx} follow=".exploration-board" />
      <div className="combat-top-left">
        <ResourceIndicators momentum={state.resources.momentum} threat={state.resources.threat} />
        {objectives.length > 0 && <ObjectivesPanel objectives={objectives} />}
      </div>
      {/* Settings > Help Hints off hides it, except while the debug noise tool waits for a click. */}
      {(showHints || noiseTool) && <p className={`combat-hint is-player-turn${hintFaded ? ' is-faded-out' : ''}`}>{hint}</p>}
      {!panelOpen && (reachableIds.length > 0 || talkable.length > 0 || talkError) && (
        <div className="challenge-prompts">
          {reachableIds.map((id) => (
            <button key={id} type="button" className="combat-button is-small is-primary" onClick={() => setInteractionId(id)}>
              Interact: {getDefinition(state.scenario, id).name}
            </button>
          ))}
          {talkable.map((npc) => (
            <button key={npc.id} type="button" className="combat-button is-small is-primary" onClick={() => talkTo(npc)}>
              Talk: {npc.name}
            </button>
          ))}
          {talkError && <span className="task-warning">{talkError}</span>}
        </div>
      )}
      {talking && (
        <ConversationPanel
          key={`${state.conversation.npcId}:${state.conversation.definition.id}`}
          state={state}
          dispatch={dispatch}
          defaultPerformerId={party.selectedIds[0] ?? party.leaderId}
          onRecommend={updateRecommendation}
          dev={debugOpen}
        />
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
        <button type="button" className="combat-button is-small" aria-pressed={logOpen} title="Briefing, objectives and mission log (L)" onClick={() => setLogOpen(!logOpen)}>
          Captain&apos;s Log
        </button>
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
      {confirmAttackNpc && (
        <ConfirmDialog
          title={`Attack ${confirmAttackNpc.name}?`}
          message={`${confirmAttackNpc.name} is ${dispositionName(confirmAttackNpc.disposition).toLowerCase()}. Attacking turns them hostile and starts a fight, and anyone still standing afterwards stays hostile.`}
          confirmLabel="Attack"
          onConfirm={() => {
            setConfirmAttackId(null)
            attackNpc(confirmAttackNpc)
          }}
          onCancel={() => setConfirmAttackId(null)}
        />
      )}
      {sheetMember && <CharacterSheetPanel character={sheetMember.character} condition={sheetMember.condition} className="is-on-map" onClose={() => setSheetOpen(false)} />}
      {logOpen && (
        <CaptainsLogPanel map={party.map} time={world.time} objectives={knownObjectives} entries={state.missionLog?.entries ?? []} onClose={() => setLogOpen(false)} />
      )}
      {!panelOpen && <Minimap map={party.map} party={party} world={world} knowledge={state.partyKnowledge} objectives={knownObjectives.filter((objective) => objective.status === 'active' && objective.position)} debug={debugOpen} />}
      <ExplorationPartyBar
        members={members}
        selectedIds={party.selectedIds}
        leaderId={party.leaderId}
        onSelect={select}
        onSetLeader={setLeader}
        recommendation={panelOpen ? recommendation : recommendPartyAction(members, consideredActionId, state.scenario.traits)}
      />
      {!panelOpen && (
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
