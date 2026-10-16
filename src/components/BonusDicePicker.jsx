import { BONUS_DIE_COSTS, bonusDiceCost, checkDicePurchase, defaultMomentumPayment, MAX_BONUS_DICE, MAX_MOMENTUM } from '../rules/missionResources.js'
import { TASK_DICE } from '../rules/taskResolver.js'
import { dicePaymentText, THREAT_EXPLAINED } from './task/taskText.js'

// Buy d20s before a roll (Book: STA 2e Core pp.255, 260): how many bonus dice and what they cost. Paid from the group
// Momentum pool first and the rest by adding Threat (designer decision, 2026-10-15: no splitting the payment by hand).
// value: { bonusDice, momentum }. UI only; the rules are missionResources.js.
export default function BonusDicePicker({ resources, value, onChange, disabled = false }) {
  const check = checkDicePurchase(resources, value)
  const { bonusDice, cost, threatAdded } = check
  const setDice = (count) => onChange({ bonusDice: count, momentum: defaultMomentumPayment(resources, count) })
  const nextCost = BONUS_DIE_COSTS[bonusDice]
  return (
    <div className="bonus-dice">
      <div className="bonus-dice-row">
        <span>Bonus d20s</span>
        <button type="button" className="combat-button is-small" disabled={disabled || bonusDice <= 0} onClick={() => setDice(bonusDice - 1)}>
          &minus;
        </button>
        <b>{bonusDice}</b>
        <button type="button" className="combat-button is-small" disabled={disabled || bonusDice >= MAX_BONUS_DICE} onClick={() => setDice(bonusDice + 1)}>
          +
        </button>
        <span className="bonus-dice-pool">{bonusDice < MAX_BONUS_DICE ? `Next die costs ${nextCost}` : 'Maximum'}</span>
      </div>
      <dl className="bonus-dice-summary">
        <dt>Base</dt>
        <dd>{TASK_DICE}d20</dd>
        <dt>Purchased</dt>
        <dd>+{bonusDice}d20</dd>
        <dt>Rolling</dt>
        <dd className="is-total">{TASK_DICE + bonusDice}d20</dd>
        <dt>Cost</dt>
        <dd>{cost || 'None'}</dd>
      </dl>
      {bonusDice > 0 && (
        <p className={`bonus-dice-threat${threatAdded ? ' is-on' : ''}`} title={THREAT_EXPLAINED}>
          {dicePaymentText(check)}
        </p>
      )}
      <p className="bonus-dice-note" title={THREAT_EXPLAINED}>
        Costs {BONUS_DIE_COSTS.join(', then +')} ({bonusDiceCost(MAX_BONUS_DICE)} for all {MAX_BONUS_DICE}). Group Momentum {resources.momentum}/{MAX_MOMENTUM}; whatever Momentum can&rsquo;t cover gives the enemy that much Threat (now {resources.threat}).
      </p>
      {!check.valid && <p className="task-warning">{check.reason}</p>}
    </div>
  )
}
