import { useState } from 'react'
import { formatCombatLog } from '../../combat/autoCombat.js'
import { getActiveCombatant, getCombatantList, majorsTaken, statusText as conditionText } from '../../combat/combatState.js'
import { getInjuryMode, getWeapon } from '../../combat/weaponSystem.js'
import { MAX_MOMENTUM } from '../../rules/missionResources.js'
import CharacterInspector from '../CharacterInspector.jsx'

const statusText = (combatant) => `${conditionText(combatant)}${combatant.inCover ? ', in cover' : ''}${combatant.guard ? ', guarded' : ''}`
const formatPosition = (position) => `(${position.x},${position.y})`
const yesNo = (value) => (value == null ? '-' : value ? 'Yes' : 'No')

function DecisionDetails({ state }) {
  const decision = state.lastDecision
  if (!decision) return <p className="debug-empty">No AI decision yet.</p>
  const name = (id) => (id ? state.combatants[id]?.character.name : '-')
  const weapon = decision.weaponId ? getWeapon(decision.weaponId) : null
  return (
    <dl className="debug-grid">
      <dt>Round</dt>
      <dd>{decision.round}</dd>
      <dt>Actor</dt>
      <dd>{name(decision.actorId)}</dd>
      <dt>Decision</dt>
      <dd>{decision.decision}</dd>
      <dt>Reason</dt>
      <dd>{decision.reason}</dd>
      <dt>Target</dt>
      <dd>{name(decision.targetId)}</dd>
      <dt>Weapon</dt>
      <dd>{weapon ? `${weapon.name}${decision.injuryMode ? ` (${getInjuryMode(decision.injuryMode).name})` : ''}` : '-'}</dd>
      <dt>Range</dt>
      <dd>{decision.band ? `${decision.band} (${decision.distance} tiles)` : '-'}</dd>
      <dt>Path</dt>
      <dd>{decision.path ? decision.path.map(formatPosition).join(' > ') : '-'}</dd>
      <dt>Actor cover</dt>
      <dd>{yesNo(decision.actorInCover)}</dd>
      <dt>Target cover</dt>
      <dd>{yesNo(decision.targetInCover)}</dd>
    </dl>
  )
}

function ResourceUsage({ stats }) {
  const { momentum, threat, injuries } = stats
  return (
    <dl className="debug-grid">
      <dt>Attacks</dt>
      <dd>
        {stats.attacks} ({stats.attacksHit} hit)
      </dd>
      <dt>Injuries</dt>
      <dd>
        suffered {injuries.suffered} (Stun {injuries.stun}, Deadly {injuries.deadly}); avoided {injuries.avoided} ({injuries.stressTaken} Stress, {injuries.threatSpent} Threat)
      </dd>
      <dt>Momentum</dt>
      <dd>
        spent: dice {momentum.spentDice}, Direct {momentum.spentDirect}, extra actions {momentum.spentExtraActions}, severity {momentum.spentSeverity}, reroll {momentum.spentReroll}, cancel Threat {momentum.spentCancelThreat}
      </dd>
      <dt>Threat</dt>
      <dd>
        +{threat.fromDeadly} Deadly, +{threat.fromNpcMomentum} NPC Momentum, +{threat.fromDice} dice; -{threat.spentByNpcs} NPC spends, -{threat.cancelled} cancelled
      </dd>
    </dl>
  )
}

// Developer transparency: shows the exact numbers the rules used, and why the AI chose each step.
// worldActors (world combat only): { [combatantId]: { disposition, awareness } } from the exploration actors.
export default function DebugPanel({ state, auto, worldActors = null, onClose }) {
  const [copied, setCopied] = useState(false)
  const active = getActiveCombatant(state)
  const roll = state.pending ?? state.result
  const dice = state.pending ? state.pending.dice : roll?.dice.map((die) => die.value)
  const copyLog = async () => {
    await navigator.clipboard.writeText(formatCombatLog(state))
    setCopied(true)
  }
  return (
    <aside className="combat-panel debug-panel" aria-label="Debug">
      <div className="debug-header">
        <h2 className="combat-panel-title">Debug</h2>
        <button type="button" className="debug-close" onClick={onClose}>
          Close
        </button>
      </div>
      <dl className="debug-grid">
        <dt>Seed</dt>
        <dd>{state.seed}</dd>
        <dt>Auto Combat</dt>
        <dd>{auto === 'off' ? 'Off' : auto === 'running' ? 'Running' : 'Paused'}</dd>
        <dt>Round</dt>
        <dd>{state.round}</dd>
        <dt>Active</dt>
        <dd>{active.character.name}</dd>
        <dt>Momentum</dt>
        <dd>
          {state.resources.momentum} / {MAX_MOMENTUM} (this fight: {state.stats.momentum.generated} generated, {state.stats.momentum.saved} saved, {state.stats.momentum.lost} lost)
        </dd>
        <dt>Threat</dt>
        <dd>
          {state.resources.threat} (this fight: +{state.stats.threat.fromDeadly} Deadly, +{state.stats.threat.fromNpcMomentum} NPC Momentum, +{state.stats.threat.fromDice} dice; -{state.stats.threat.cancelled} cancelled, -{state.stats.threat.spentByNpcs} NPC spends)
        </dd>
        {state.outcome && (
          <>
            <dt>Result</dt>
            <dd>{state.outcome === 'victory' ? 'Victory' : 'Defeat'}</dd>
          </>
        )}
      </dl>
      <h3 className="debug-heading">Last AI decision</h3>
      <DecisionDetails state={state} />
      <h3 className="debug-heading">Initiative and condition</h3>
      <ol className="debug-list">
        {getCombatantList(state).map((combatant) => (
          <li key={combatant.id}>
            {combatant.character.name}: Daring {combatant.character.attributes.daring}, Control {combatant.character.attributes.control} &middot; {statusText(combatant)} &middot; Majors this round{' '}
            {majorsTaken(state, combatant.id)}
          </li>
        ))}
      </ol>
      <h3 className="debug-heading">Characters</h3>
      {getCombatantList(state).map((combatant) => (
        <CharacterInspector
          key={combatant.id}
          character={combatant.character}
          condition={combatant.condition}
          actor={{ id: combatant.id, controller: combatant.controller, side: combatant.side, ...worldActors?.[combatant.id] }}
        />
      ))}
      {roll && (
        <>
          <h3 className="debug-heading">{state.pending ? 'Current task' : 'Last task'}</h3>
          <dl className="debug-grid">
            <dt>Attribute</dt>
            <dd>
              {roll.task.attribute.name} {roll.task.attribute.value}
            </dd>
            <dt>Department</dt>
            <dd>
              {roll.task.department.name} {roll.task.department.value}
            </dd>
            <dt>Target number</dt>
            <dd>{roll.task.targetNumber}</dd>
            <dt>Focus</dt>
            <dd>{roll.task.focus ?? 'none'}</dd>
            <dt>Critical range</dt>
            <dd>1-{roll.task.criticalRange}</dd>
            <dt>Complication range</dt>
            <dd>{roll.task.complicationRange > 1 ? `${21 - roll.task.complicationRange}-20` : '20'}</dd>
            <dt>Difficulty</dt>
            <dd>{roll.task.difficulty}</dd>
            <dt>Dice</dt>
            <dd>{dice.join(', ')}</dd>
            {!state.pending && (
              <>
                <dt>Successes</dt>
                <dd>{roll.successes}</dd>
                <dt>Momentum generated</dt>
                <dd>{roll.momentumGenerated}</dd>
                <dt>Complications</dt>
                <dd>{roll.complications}</dd>
                <dt>Result</dt>
                <dd>{roll.passed ? 'Success' : 'Failure'}</dd>
              </>
            )}
            <dt>Rerolls</dt>
            <dd>{roll.rerolls.length ? roll.rerolls.map((reroll) => `${reroll.source} ${reroll.from}->${reroll.to}`).join(', ') : 'none'}</dd>
            <dt>Opposed by</dt>
            <dd>
              {roll.opposition
                ? `${roll.opposition.when}: ${roll.opposition.task.attribute.name} + ${roll.opposition.task.department.name}, rolled ${roll.opposition.dice.map((die) => die.value).join(', ')} vs TN ${roll.opposition.task.targetNumber}: ${roll.opposition.successes} successes`
                : 'No'}
            </dd>
          </dl>
        </>
      )}
      <h3 className="debug-heading">Momentum and Threat usage</h3>
      <ResourceUsage stats={state.stats} />
      <div className="debug-log-header">
        <h3 className="debug-heading">Combat log</h3>
        <button type="button" className="debug-close" onClick={copyLog}>
          {copied ? 'Copied' : 'Copy log'}
        </button>
      </div>
      <div className="debug-log">
        {[...state.log].reverse().map((entry) => (
          <div key={entry.id} className={`debug-log-entry is-${entry.kind}`}>
            {entry.lines.map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  )
}
