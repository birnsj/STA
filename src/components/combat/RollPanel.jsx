import { getWeapon } from '../../combat/weaponSystem.js'

function Die({ value, targetNumber }) {
  const success = value <= targetNumber
  return <span className={`roll-die${success ? ' is-success' : ' is-fail'}${value === 20 ? ' is-twenty' : ''}`}>{value}</span>
}

// The attack being rolled (with any rerolls still open to the player) or the last attack's result.
// awaitingChoice: the roll would miss and a reroll is open, so it waits for a reroll or No Reroll instead of resolving itself.
export default function RollPanel({ state, playerControls, awaitingChoice, onReroll, onResolve, onSpendMomentumHit }) {
  const roll = state.pending ?? state.result
  if (!roll) return null
  const attacker = state.combatants[roll.attackerId]
  const target = state.combatants[roll.targetId]
  const values = state.pending ? state.pending.dice : roll.dice.map((die) => die.value)
  const { task, cover } = roll
  const pending = Boolean(state.pending)
  const canAimReroll = pending && playerControls && awaitingChoice && state.pending.aimReroll
  const canMomentumReroll = pending && playerControls && awaitingChoice && state.momentum > 0
  const canExtraHit = !pending && playerControls && roll.passed && !roll.extraHit && !roll.closed && state.momentum > 0 && target.status === 'active'

  return (
    <section className={`roll-panel${pending ? ' is-pending' : roll.passed ? ' is-hit' : ' is-miss'}`} aria-live="polite">
      <p className="roll-heading">
        {attacker.character.name} &rsaquo; {target.character.name}
        <span className="roll-weapon"> {getWeapon(roll.weaponId).name}</span>
      </p>
      <p className="roll-task">
        TN {task.targetNumber} &middot; Difficulty {task.difficulty}
        {cover && <span> &middot; Cover roll {cover.dice.join(', ')} ({cover.successes})</span>}
      </p>
      <div className="roll-dice">
        {values.map((value, index) => (
          <div key={index} className="roll-die-slot">
            <Die value={value} targetNumber={task.targetNumber} />
            {canAimReroll && (
              <button type="button" className="roll-reroll" onClick={() => onReroll(index, 'aim')}>
                Aim reroll
              </button>
            )}
            {canMomentumReroll && (
              <button type="button" className="roll-reroll is-momentum" onClick={() => onReroll(index, 'momentum')}>
                Momentum reroll
              </button>
            )}
          </div>
        ))}
        {roll.assist && (
          <div className="roll-die-slot roll-assist" title={`${state.combatants[roll.assist.helperId].character.name}'s assist die (TN ${roll.assist.task.targetNumber})`}>
            <Die value={roll.assist.die} targetNumber={roll.assist.task.targetNumber} />
            <span className="roll-assist-label">Assist</span>
          </div>
        )}
        <div className="roll-outcome">
          {pending ? (
            playerControls && awaitingChoice ? (
              <button type="button" className="roll-resolve" onClick={onResolve}>
                No Reroll
              </button>
            ) : (
              <span className="roll-result-text">Rolling...</span>
            )
          ) : (
            <>
              <span className="roll-result-text">{roll.passed ? 'Hit' : 'Miss'}</span>
              <span className="roll-result-sub">
                {roll.successes} {roll.successes === 1 ? 'success' : 'successes'}
                {roll.momentumGained && ' · Momentum'}
                {roll.threatGained && ' · Threat'}
                {roll.extraHit && ' · +1 Hit'}
              </span>
            </>
          )}
        </div>
      </div>
      {canExtraHit && (
        <button type="button" className="roll-momentum-hit" onClick={onSpendMomentumHit}>
          Spend Momentum: +1 Hit
        </button>
      )}
    </section>
  )
}
