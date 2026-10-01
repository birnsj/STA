import { getScoreTip } from '../rules/infoTips.js'
import { useInfoTip } from './useInfoTip.js'

function SwapSelect({ label, value, options, onChange }) {
  return (
    <select className="env-select swap-select" aria-label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">{label}…</option>
      {options.map((discipline) => (
        <option key={discipline.id} value={discipline.id}>{discipline.name}</option>
      ))}
    </select>
  )
}

export default function DisciplinePointPicker({ rows, picks, swapOptions, allowsSwap, onToggleMajor, onToggleMinor, onSwapFrom, onSwapTo }) {
  const tip = useInfoTip()
  return (
    <>
      <div className="point-rows" role="group" aria-label="Discipline increases">
        {rows.map((row) => (
          <div key={row.id} className={`point-row discipline-row${row.after !== row.before ? ' is-selected' : ''}`} {...tip.bind(getScoreTip(row.id))}>
            <span className="point-row-name">{row.name}</span>
            <span className="point-row-total" title="Score after this step">{row.after}</span>
            {row.isMajorOption ? (
              <button
                type="button"
                className={`bonus-toggle${row.isMajor ? ' is-on' : ''}`}
                aria-pressed={row.isMajor}
                disabled={!row.canMajor && !row.isMajor}
                onClick={() => onToggleMajor(row.id)}
              >
                +2
              </button>
            ) : (
              <span className="bonus-toggle-spacer" />
            )}
            {row.isAuto ? (
              <span className="bonus-toggle is-on is-locked" title="Raised automatically">+1</span>
            ) : row.isMinorOption ? (
              <button
                type="button"
                className={`bonus-toggle${row.isMinor ? ' is-on' : ''}`}
                aria-pressed={row.isMinor}
                disabled={!row.canMinor || row.isMajor}
                onClick={() => onToggleMinor(row.id)}
              >
                +1
              </button>
            ) : (
              <span className="bonus-toggle-spacer" />
            )}
          </div>
        ))}
        {tip.element}
      </div>
      {allowsSwap && (
        <div className="swap-row">
          <span className="swap-label" title="Optional: reduce one discipline by 1 and add that point to one not already increased">Move 1</span>
          <SwapSelect label="From" value={picks.swapFrom} options={swapOptions.from} onChange={onSwapFrom} />
          <SwapSelect label="To" value={picks.swapTo} options={swapOptions.to} onChange={onSwapTo} />
        </div>
      )}
    </>
  )
}
