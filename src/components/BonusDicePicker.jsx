import { BONUS_DIE_COSTS, bonusDiceCost, checkDicePurchase, defaultMomentumPayment, MAX_BONUS_DICE, MAX_MOMENTUM } from '../rules/missionResources.js'
import { TASK_DICE } from '../rules/taskResolver.js'

// Buy d20s before a roll (Book: STA 2e Core p.259-260, 263): how many bonus dice, and how the cost is paid, from the
// group Momentum pool or by adding Threat. value: { bonusDice, momentum }. UI only; the rules are missionResources.js.
export default function BonusDicePicker({ resources, value, onChange, disabled = false }) {
  const check = checkDicePurchase(resources, value)
  const { bonusDice, cost, momentum, threatAdded } = check
  const setDice = (count) => onChange({ bonusDice: count, momentum: defaultMomentumPayment(resources, count) })
  const setMomentum = (amount) => onChange({ bonusDice, momentum: amount })
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
        <dd>{cost ? `${cost} (${momentum} Momentum${threatAdded ? ` + ${threatAdded} Threat` : ''})` : 'None'}</dd>
      </dl>
      {bonusDice > 0 && (
        <div className="bonus-dice-row">
          <span>Pay {cost}</span>
          <button type="button" className="combat-button is-small" disabled={disabled || momentum <= 0} onClick={() => setMomentum(momentum - 1)}>
            &minus;
          </button>
          <b>{momentum} Momentum</b>
          <button
            type="button"
            className="combat-button is-small"
            disabled={disabled || momentum >= Math.min(cost, resources.momentum)}
            onClick={() => setMomentum(momentum + 1)}
          >
            +
          </button>
          <span className={`bonus-dice-threat${threatAdded ? ' is-on' : ''}`}>+ {threatAdded} Threat added</span>
        </div>
      )}
      <p className="bonus-dice-note">
        Costs {BONUS_DIE_COSTS.join(', then +')} ({bonusDiceCost(MAX_BONUS_DICE)} for all {MAX_BONUS_DICE}). Group Momentum {resources.momentum}/{MAX_MOMENTUM}; any part not paid in Momentum adds that much Threat (now {resources.threat}).
      </p>
      {!check.valid && <p className="task-warning">{check.reason}</p>}
    </div>
  )
}
