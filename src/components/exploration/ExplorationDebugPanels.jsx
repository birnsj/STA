// Developer-only panels of exploration (the Debug button): party control, NPC awareness, the scenario, and the link
// to a fight started in the world.
import CharacterInspector from '../CharacterInspector.jsx'
import FrameRate from '../FrameRate.jsx'
import { alertMethodName, dispositionName, getCharacterAwareness, getCombatReady, getNpcs, isDown, stateName } from '../../exploration/awareness.js'
import { getFormation } from '../../exploration/formations.js'
import { getCohesion, getMembers } from '../../exploration/partyControl.js'
import { getEntityKnowledge, KNOWLEDGE } from '../../exploration/partyKnowledge.js'
import { conditionSummary, minorDefeatText, normalizeCondition } from '../../rules/personalCondition.js'

const ORDER_LABEL = { point: 'Walking', follow: 'Following' }

const OUTCOME_LABEL = { victory: 'Victory', defeat: 'Defeat', ended: 'Ended (debug)' }

// Developer-only readout of the party-control state.
export function DebugPanel({ state, mode, lastCombat, onSpacing, onClose }) {
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

// Debug: the scenario's runtime state: challenge objects, flags, facts the party has learned, and the task log
// (whose Momentum is held there until a group pool exists).
export function ScenarioDebugPanel({ scenario, knowledge, views }) {
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

// Developer-only readout of NPC awareness: each NPC's state, what each party member is known to, COMBAT_READY, the
// event log, and test tools (the Noise tool turns the next floor click into a noise instead of a move).
export function AwarenessPanel({ world, party, knowledge, noiseTool, onNoiseTool, onResetNpcs }) {
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
export function CombatLinkPanel({ diagnostics, onForceEnd }) {
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
