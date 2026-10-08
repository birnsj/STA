import { getCombatantWeapon, getInjuryMode } from '../../combat/weaponSystem.js'

// Book p.290 Counterattack: a party member who won an opposed attack may spend 2 Momentum to inflict an Injury on the
// attacker in return (Stun or Deadly chosen now, Book p.292; Deadly adds 1 Threat). No roll; the attacker may still
// Avoid Injury. offer: combat state's pendingCounterattack { defenderId, attackerId, weaponId, injuryModes, cost }.
export default function CounterattackChoice({ offer, defender, attacker, momentum, onCounter, onDecline }) {
  const weapon = getCombatantWeapon(defender, offer.weaponId)
  return (
    <div className="combat-modal-backdrop is-injury">
      <div className="combat-modal injury-choice" role="dialog" aria-modal="true" aria-labelledby="counterattack-choice-title">
        <h2 id="counterattack-choice-title" className="combat-modal-title">
          Counterattack?
        </h2>
        <p className="injury-choice-who">
          {defender.character.name} beat {attacker.character.name}&rsquo;s attack
        </p>
        <p className="injury-choice-detail">
          Spend {offer.cost} Momentum (group pool {momentum}) to strike back with {weapon.name}: an Injury of Severity {weapon.severity}, no roll.
        </p>
        <div className="combat-modal-actions injury-choice-actions">
          {offer.injuryModes.map((modeId) => {
            const mode = getInjuryMode(modeId)
            return (
              <button key={modeId} type="button" className={`combat-button ${modeId === 'deadly' ? 'is-danger' : 'is-primary'}`} onClick={() => onCounter(modeId)}>
                Counterattack: {mode.name}
                <span className="injury-choice-sub">
                  {offer.cost} Momentum{mode.generatesThreat && ' · Threat +1'}
                </span>
              </button>
            )
          })}
          <button type="button" className="combat-button" onClick={onDecline}>
            Don&rsquo;t Counterattack
            <span className="injury-choice-sub">Keep the Momentum</span>
          </button>
        </div>
      </div>
    </div>
  )
}
