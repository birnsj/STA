import { getMaxStress, npcCategoryName } from '../../rules/personalCondition.js'

// A character's Stress (no HP): the meter shows what is left, full when unhurt and draining as Stress is taken
// (designer request, Oct 2026); the number stays the Stress taken. The rest of the condition (Injuries, Fatigued,
// complications, Defeated / Dying) is ConditionIcons. svg: the compact version drawn over a unit on the battlefield,
// with a mark per Injury. showCategory: say so for a Minor NPC, who has no Stress.
export default function ConditionTrack({ character, condition, svg = false, showCategory = false }) {
  const max = getMaxStress(character).value
  const { stress, injuries } = condition
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
  if (!max && !showCategory) return null
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
        <span className="condition-category">{npcCategoryName(character)}: no Stress</span>
      )}
    </span>
  )
}
