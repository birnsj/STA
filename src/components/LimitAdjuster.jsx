import ChoiceList from './ChoiceList.jsx'

// Book p.129 limit step: choose which tied score keeps the maximum, then place each reduced point.
// `keeperOptions`: [{ id, name, score }] when a choice is needed; `rows`: [{ id, name, score, received, canAdd }].
export default function LimitAdjuster({ max, keeperOptions, keeperId, onKeeper, excess, assigned, rows, onAdd, onRemove }) {
  return (
    <div className="limit-adjuster">
      {keeperOptions.length > 0 && (
        <>
          <p className="limit-adjuster-instruction">
            Only one score may be {max}. Choose which keeps {max}; the others drop to {max - 1}.
          </p>
          <ChoiceList
            label={`Score that keeps ${max}`}
            options={keeperOptions.map((option) => ({ id: option.id, label: option.name, suffix: `(${option.score})` }))}
            selectedId={keeperId}
            onSelect={onKeeper}
          />
        </>
      )}
      {excess > 0 && (
        <>
          <p className="limit-adjuster-instruction">
            Give each reduced point to another score ({assigned}/{excess}). None may reach {max}.
          </p>
          <div className="point-rows">
            {rows.map((row) => (
              <div key={row.id} className={`point-row${row.received ? ' is-selected' : ''}`}>
                <span className="point-row-name">{row.name} ({row.score})</span>
                <button type="button" className="point-button" disabled={row.received === 0} onClick={() => onRemove(row.id)} aria-label={`Remove point from ${row.name}`}>−</button>
                <span className="point-row-value">{row.received ? `+${row.received}` : '—'}</span>
                <button type="button" className="point-button" disabled={!row.canAdd} onClick={() => onAdd(row.id)} aria-label={`Add point to ${row.name}`}>+</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
