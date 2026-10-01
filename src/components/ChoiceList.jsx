import { useInfoTip } from './useInfoTip.js'

// `option.tip` ({ title, text, note?, source? }) adds a hover info box.
export default function ChoiceList({ label, options, selectedId, onSelect }) {
  const tip = useInfoTip()
  return (
    <div className="choice-list" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const isSelected = option.id === selectedId
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={option.disabled}
            title={option.tip ? undefined : option.title}
            className={`choice${isSelected ? ' is-selected' : ''}`}
            onClick={() => onSelect(option.id)}
            {...tip.bind(option.tip)}
          >
            <span className="choice-radio" aria-hidden="true" />
            <span className="choice-label">{option.label}</span>
            {option.suffix && <span className="choice-suffix">{option.suffix}</span>}
          </button>
        )
      })}
      {tip.element}
    </div>
  )
}
