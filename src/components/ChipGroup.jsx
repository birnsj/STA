// A row of small pill buttons used instead of dropdowns: one option is on at a time; they wrap in narrow columns.
// options: [{ id, label, title?, disabled? }]. clearable: clicking the chosen chip again calls onChange('').
// missing: pulses the chips (like other unfinished inputs) until one is chosen.
export default function ChipGroup({ label, options, value, onChange, clearable = false, missing = false, className = '' }) {
  return (
    <div className={`chip-group${missing ? ' is-missing' : ''}${className ? ` ${className}` : ''}`} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            title={option.title || undefined}
            className={`chip${selected ? ' is-on' : ''}`}
            onClick={() => onChange(selected && clearable ? '' : option.id)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
