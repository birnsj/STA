import { getMaxStress, npcCategoryName } from '../../rules/personalCondition.js'

// A character's Stress (no HP): the meter fills as Stress is taken (empty when unhurt, full at maximum), in red for
// every character (designer request, 2026-10-15); the number is Stress taken / max. The rest of the condition (Injuries,
// Fatigued, complications, Defeated / Dying) is ConditionIcons. svg: the compact version drawn over a unit on the
// battlefield, with a mark per Injury. showCategory: say so for a Minor NPC, who has no Stress.
export default function ConditionTrack({ character, condition, svg = false, showCategory = false }) {
  const max = getMaxStress(character).value
  const { stress, injuries } = condition
  if (svg) {
    const width = 30
    const filled = max ? Math.min(1, Math.max(0, stress / max)) * width : 0
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
  if (!max && !showCategory) return null
  return (
    <span className="condition-track">
      {max > 0 ? (
        <span className="stress-meter" title={`Stress ${stress} of ${max}`}>
          <span className="stress-label">Stress</span>
          <span className="stress-bar">
            <span className={`stress-fill${condition.fatigued ? ' is-fatigued' : ''}`} style={{ width: `${Math.min(100, Math.max(0, (stress / max) * 100))}%` }} />
          </span>
          <span className="stress-value">
            {stress}/{max}
          </span>
        </span>
      ) : (
        <span className="condition-category">{npcCategoryName(character)}: no Stress</span>
      )}
    </span>
  )
}
