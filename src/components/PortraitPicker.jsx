import Portrait from './Portrait.jsx'

// Grid of portrait presets; each image is an ordinary replaceable file. uniform: the shirt colour they all wear.
export default function PortraitPicker({ portraits, selectedId, onSelect, uniform = null }) {
  return (
    <div className="portrait-picker" role="listbox" aria-label="Portrait presets">
      {portraits.map((portrait) => {
        const isSelected = portrait.id === selectedId
        return (
          <button
            key={portrait.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            className={`portrait-picker-option${isSelected ? ' is-selected' : ''}`}
            onClick={() => onSelect(portrait.id)}
          >
            <Portrait label={portrait.name} image={portrait.image} uniform={uniform} className="portrait-preset" />
          </button>
        )
      })}
    </div>
  )
}
