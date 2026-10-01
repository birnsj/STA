const formatBonuses = (bonuses) => bonuses.map((bonus) => `${bonus.name} +${bonus.value}`).join(', ')

export default function OutlookPathList({ options, selectedId, onSelect }) {
  const selected = options.find((option) => option.id === selectedId)

  return (
    <>
      <div className="choice-list" role="radiogroup" aria-label="Accepted or rebelled">
        {options.map((option) => {
          const isSelected = option.id === selectedId
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`choice${isSelected ? ' is-selected' : ''}`}
              onClick={() => onSelect(option.id)}
            >
              <span className="choice-radio" aria-hidden="true" />
              <span className="choice-label">{option.name}</span>
              <span className="choice-suffix">{formatBonuses(option.attributeBonuses)}</span>
            </button>
          )
        })}
      </div>
      {selected && <p className="outlook-path-text">{selected.text}</p>}
    </>
  )
}
