import { getTile } from '../../maps/mapFormat.js'
import TileThumbnail from './TileThumbnail.jsx'

// Visual tile chooser for Generator Editor: single-select or multi-select (checkbox) sprite grid.
export default function TileSpritePicker({
  label,
  hint = null,
  options,
  value,
  onChange,
  multi = false,
  allowNone = false,
  noneLabel = 'None',
  disabled = false,
  emptyText = 'No tiles in this list.',
}) {
  const selected = multi ? new Set(value ?? []) : null
  const current = multi ? null : value || null

  const toggle = (id) => {
    if (disabled) return
    if (!multi) {
      onChange(id)
      return
    }
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  return (
    <div className={`ge-picker${disabled ? ' is-disabled' : ''}`}>
      {label && (
        <div className="ge-picker-head">
          <span className="ce-field-label">{label}</span>
          {!multi && current && <span className="ge-picker-current">{getTile(current).label}</span>}
          {multi && <span className="ge-picker-current">{selected.size} selected</span>}
        </div>
      )}
      {hint && <p className="ce-text">{hint}</p>}
      <div className="ge-picker-grid" role={multi ? 'group' : 'radiogroup'} aria-label={label || 'Tiles'}>
        {allowNone && !multi && (
          <button
            type="button"
            className={`ed-thumb-btn ge-thumb${current == null ? ' is-selected' : ''}`}
            disabled={disabled}
            onClick={() => onChange(null)}
            title={noneLabel}
          >
            <span className="ge-thumb-none">{noneLabel}</span>
          </button>
        )}
        {options.map((tile) => {
          const on = multi ? selected.has(tile.id) : current === tile.id
          return (
            <button
              key={tile.id}
              type="button"
              className={`ed-thumb-btn ge-thumb${on ? ' is-selected' : ''}`}
              disabled={disabled}
              aria-pressed={on}
              title={`${tile.label} (${tile.id})`}
              onClick={() => toggle(tile.id)}
            >
              {multi && (
                <input
                  type="checkbox"
                  className="ge-thumb-check"
                  checked={on}
                  disabled={disabled}
                  readOnly
                  tabIndex={-1}
                  aria-hidden
                />
              )}
              <TileThumbnail tile={tile} className="me-thumb-preview" animate={false} />
              <span className="ed-thumb-label">{tile.label}</span>
            </button>
          )
        })}
        {!options.length && !(allowNone && !multi) && <p className="ce-text ge-picker-empty">{emptyText}</p>}
      </div>
    </div>
  )
}
