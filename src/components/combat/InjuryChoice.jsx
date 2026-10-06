import { getMaxStress, injuryTypeName, STRESS_COMPLICATION } from '../../rules/personalCondition.js'

// Book p.292 Avoid Injury: a party member hit by an attack takes Stress equal to the severity instead of the Injury, or
// accepts the Injury and is Defeated. Book p.276: without room for all of it, the track fills and a complication follows.
// incoming: combat state's { targetId, attackerId, injury, option }.
export default function InjuryChoice({ incoming, target, attacker, onAvoid, onAccept }) {
  const { injury, option } = incoming
  const max = getMaxStress(target.character).value
  const stress = target.condition.stress
  return (
    <div className="combat-modal-backdrop is-injury">
      <div className={`combat-modal injury-choice is-${injury.type}`} role="dialog" aria-modal="true" aria-labelledby="injury-choice-title">
        <h2 id="injury-choice-title" className="combat-modal-title">
          Injury incoming
        </h2>
        <p className="injury-choice-who">
          {attacker ? `${attacker.character.name} hits ${target.character.name}` : `${target.character.name} is hit`}
          {injury.source?.weaponName && ` with ${injury.source.weaponName}`}
        </p>
        <p className="injury-choice-severity">
          {injuryTypeName(injury.type)} &middot; Severity {injury.severity}
        </p>
        {(injury.protection > 0 || injury.addedSeverity > 0) && (
          <p className="injury-choice-detail">
            Weapon {injury.baseSeverity}
            {injury.addedSeverity > 0 && ` + ${injury.addedSeverity} Momentum`}
            {injury.protection > 0 && ` - ${injury.protection} Protection`} (minimum 1)
          </p>
        )}
        <div className="combat-modal-actions injury-choice-actions">
          <button type="button" className="combat-button is-primary" onClick={onAvoid}>
            Avoid Injury
            <span className="injury-choice-sub">
              {option.overflow ? `Needs ${option.cost} Stress; takes ${option.taken}` : `Take ${option.cost} Stress`} &middot; {stress}/{max} &rarr; {stress + option.taken}/{max}
            </span>
            {option.overflow > 0 && <span className="injury-choice-sub">Track full: suffer a complication ({STRESS_COMPLICATION})</span>}
            {stress + option.taken >= max && <span className="injury-choice-sub">Reaches maximum: Fatigued</span>}
          </button>
          <button type="button" className="combat-button is-danger" onClick={onAccept}>
            Accept Injury
            <span className="injury-choice-sub">
              {injuryTypeName(injury.type)} {injury.severity} &middot; Defeated
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
