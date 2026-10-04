import { useEffect, useState } from 'react'
import { canAimReroll } from '../../combat/combatState.js'
import { getWeapon } from '../../combat/weaponSystem.js'

// Presentation only: a freshly rolled die flicks through random numbers before stopping on the value the rules already
// rolled (seeded, in combatState). Divided by the Auto Combat speed so it stops before the result is shown.
const ROLL_MS = 550
const FACE_MS = 35

// Mounted again (new key) for every new roll or reroll, so each one rolls once.
function Die({ value, targetNumber, speed = 1 }) {
  const [face, setFace] = useState(((value * 7) % 20) + 1)
  const [rolling, setRolling] = useState(true)
  useEffect(() => {
    const tick = setInterval(() => setFace(Math.floor(Math.random() * 20) + 1), FACE_MS)
    const land = setTimeout(() => {
      clearInterval(tick)
      setRolling(false)
    }, ROLL_MS / speed)
    return () => {
      clearInterval(tick)
      clearTimeout(land)
    }
  }, [speed])
  if (rolling) return <span className="roll-die is-rolling">{face}</span>
  const success = value <= targetNumber
  return <span className={`roll-die${success ? ' is-success' : ' is-fail'}${value === 20 ? ' is-twenty' : ''}`}>{value}</span>
}

// The attack being rolled (with any rerolls still open to the player) or the last attack's result.
// awaitingChoice: the roll would miss and a reroll is open, so it waits for a reroll or No Reroll instead of resolving itself.
export default function RollPanel({ state, speed = 1, playerControls, awaitingChoice, onReroll, onResolve, onSpendMomentumHit }) {
  const roll = state.pending ?? state.result
  if (!roll) return null
  const ambush = roll.kind === 'ambush'
  // One id per attack (the attack count only changes when a new attack is rolled), plus rerolls per die.
  const rollId = ambush ? 'ambush' : state.stats.attacks
  const dieKey = (index) => `${rollId}-${index}-${roll.rerolls.filter((reroll) => reroll.index === index).length}`
  const attacker = state.combatants[roll.attackerId]
  const target = state.combatants[roll.targetId]
  const values = state.pending ? state.pending.dice : roll.dice.map((die) => die.value)
  const { task, cover } = roll
  const pending = Boolean(state.pending)
  const aimRerollOpen = (index) =>
    pending && playerControls && awaitingChoice && values[index] > task.targetNumber && canAimReroll(state.pending, index)
  const canMomentumReroll = pending && playerControls && awaitingChoice && state.momentum > 0
  const canExtraHit = !pending && !ambush && playerControls && roll.passed && !roll.extraHit && !roll.closed && state.momentum > 0 && target.status === 'active'

  return (
    <section className={`roll-panel${pending ? ' is-pending' : roll.passed ? ' is-hit' : ' is-miss'}`} aria-live="polite">
      <p className="roll-heading">
        {ambush && 'Ambush: '}
        {attacker.character.name} &rsaquo; {target.character.name}
        {!ambush && <span className="roll-weapon"> {getWeapon(roll.weaponId).name}</span>}
      </p>
      <p className="roll-task">
        TN {task.targetNumber} &middot; Difficulty {task.difficulty}
        {roll.rerolls
          .filter((reroll) => reroll.source === 'focus')
          .map((reroll) => (
            <span key={reroll.index}>
              {' '}
              &middot; {task.focus} reroll {reroll.from} &rarr; {reroll.to}
            </span>
          ))}
        {cover && <span> &middot; Cover roll {cover.dice.join(', ')} ({cover.successes})</span>}
      </p>
      <div className="roll-dice">
        {values.map((value, index) => (
          <div key={index} className="roll-die-slot">
            <Die key={dieKey(index)} value={value} targetNumber={task.targetNumber} speed={speed} />
            {aimRerollOpen(index) && (
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
            <Die key={`${rollId}-assist`} value={roll.assist.die} targetNumber={roll.assist.task.targetNumber} speed={speed} />
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
              <span className="roll-result-text">{ambush ? (roll.passed ? 'Ambushed: 1 Hit' : 'Spotted: Klingons act first') : roll.passed ? 'Hit' : 'Miss'}</span>
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
