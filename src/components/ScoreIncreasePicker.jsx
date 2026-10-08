import { getScoreTip } from '../rules/infoTips.js'
import { useInfoTip } from './useInfoTip.js'

// One row per score: the score after the limits, a +1 toggle, and the resulting score.
// `rows`: [{ id, name, score, increased, canIncrease, result }]; result is null while limits are unresolved.
// canIncrease false (a +1 would break the limits) disables the toggle.
export default function ScoreIncreasePicker({ label, rows, onToggle }) {
  const tip = useInfoTip()
  return (
    <div className="score-increase-picker" role="group" aria-label={label}>
      {rows.map((row) => (
        <div key={row.id} className={`score-increase-row${row.increased ? ' is-selected' : ''}`} {...tip.bind(getScoreTip(row.id))}>
          <span className="score-increase-name">{row.name}</span>
          <span className="score-increase-score">{row.score}</span>
          <button
            type="button"
            className={`score-increase-toggle${row.increased ? ' is-selected' : ''}`}
            aria-pressed={row.increased}
            aria-label={`${row.increased ? 'Remove' : 'Add'} +1 ${row.name}`}
            disabled={row.canIncrease === false}
            title={row.canIncrease === false ? 'A +1 here would go over the limits.' : undefined}
            onClick={() => onToggle(row.id)}
          >
            +1
          </button>
          <span className="score-increase-result">{row.result ?? '…'}</span>
        </div>
      ))}
      {tip.element}
    </div>
  )
}
