import { getScoreTip } from '../rules/infoTips.js'
import ChipGroup from './ChipGroup.jsx'
import { useInfoTip } from './useInfoTip.js'

// Clicking the chosen discipline again clears it, so the optional move can be undone.
function SwapChips({ label, value, options, onChange }) {
  return (
    <div className="swap-chips">
      <span className="swap-chips-label">{label}</span>
      <ChipGroup
        label={`Move 1 ${label.toLowerCase()}`}
        options={options.map((discipline) => ({ id: discipline.id, label: discipline.name }))}
        value={value ?? ''}
        onChange={onChange}
        clearable
      />
    </div>
  )
}

export default function DisciplinePointPicker({ rows, picks, swapOptions, allowsSwap, onToggleMajor, onToggleMinor, onSwapFrom, onSwapTo }) {
  const tip = useInfoTip()
  return (
    <>
      <div className="point-rows" role="group" aria-label="Department increases">
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
          <span className="swap-label" title="Optional: reduce one department by 1 and add that point to one not already increased">Move 1</span>
          <SwapChips label="From" value={picks.swapFrom} options={swapOptions.from} onChange={onSwapFrom} />
          <SwapChips label="To" value={picks.swapTo} options={swapOptions.to} onChange={onSwapTo} />
        </div>
      )}
    </>
  )
}
