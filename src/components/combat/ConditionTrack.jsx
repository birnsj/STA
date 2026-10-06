import { getAttributeName } from '../../character/runtimeCharacter.js'
import { getMaxStress, injuryTypeName, isDead, isDying, minorDefeatText, npcCategoryName } from '../../rules/personalCondition.js'

// A character's personal condition (no HP): STRESS current/max, FATIGUED (and the shut-down attribute), complications,
// each Injury (Stun / Deadly, Severity, treated) and DEFEATED / DYING (a Minor NPC: UNCONSCIOUS / DEAD). svg: the
// compact version drawn over a unit on the battlefield. The Stress bar shows what is left: full when unhurt, draining
// as Stress is taken (designer request, Oct 2026); the number stays the Stress taken.
export default function ConditionTrack({ character, condition, svg = false, showCategory = false }) {
  const max = getMaxStress(character).value
  const { stress, injuries, defeated } = condition
  const dying = isDying(condition)
  if (svg) {
    const width = 30
    const filled = max ? Math.max(0, 1 - stress / max) * width : 0
    return (
      <g className="condition-svg">
        {max > 0 && (
          <>
            <rect className="condition-svg-track" x={-width / 2} y={-2.5} width={width} height={5} rx={2} />
            <rect className={`condition-svg-stress${condition.fatigued ? ' is-fatigued' : ''}`} x={-width / 2} y={-2.5} width={filled} height={5} rx={2} />
          </>
        )}
        {injuries.map((injury, index) => (
          <rect
            key={injury.id}
            className={`condition-svg-injury is-${injury.type}${injury.treated ? ' is-treated' : ''}`}
            x={width / 2 + 3 + index * 7}
            y={-3.5}
            width={6}
            height={7}
            rx={1}
          />
        ))}
      </g>
    )
  }
  return (
    <span className="condition-track">
      {max > 0 ? (
        <span className="stress-meter" title={`Stress ${stress} of ${max}`}>
          <span className="stress-label">Stress</span>
          <span className="stress-bar">
            <span className="stress-fill" style={{ width: `${Math.max(0, 100 - (stress / max) * 100)}%` }} />
          </span>
          <span className="stress-value">
            {stress}/{max}
          </span>
        </span>
      ) : (
        showCategory && <span className="condition-category">{npcCategoryName(character)}: no Stress</span>
      )}
      {injuries.map((injury) => (
        <span key={injury.id} className={`injury-chip is-${injury.type}${injury.treated ? ' is-treated' : ''}`} title={injury.source?.weaponName ? `From ${injury.source.weaponName}` : undefined}>
          {injuryTypeName(injury.type)} {injury.severity}
          {injury.treated && ' · treated'}
          {injury.recovering && ' · wearing off'}
        </span>
      ))}
      {condition.fatigued && (
        <span className="condition-fatigued" title="Book p.277: +1 Difficulty on all tasks, no more Stress; tasks with the shut-down attribute automatically fail.">
          Fatigued{condition.fatiguedAttribute ? ` · ${getAttributeName(condition.fatiguedAttribute)} shut down` : ''}
        </span>
      )}
      {(condition.complications ?? []).map((complication) => (
        <span key={complication.id} className="condition-complication" title="Complication (Stress over the maximum, Book p.276)">
          {complication.name}
        </span>
      ))}
      {defeated && <span className={`condition-defeated${dying || isDead(condition) ? ' is-dying' : ''}`}>{dying ? 'Dying' : minorDefeatText(condition) ?? 'Defeated'}</span>}
    </span>
  )
}
