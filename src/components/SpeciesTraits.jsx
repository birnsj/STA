import { getParentOptions, getSpeciesById, getTraitDescription, isMixedHeritage, isNewSpecies } from '../rules/species.js'
import Portrait from './Portrait.jsx'

function Trait({ name, text }) {
  return (
    <div className="trait">
      <span className="trait-name">{name}</span>
      {text && <p className="trait-text">{text}</p>}
    </div>
  )
}

function ParentSelect({ selection, index, onChange }) {
  const parent = selection.parents[index]
  return (
    <div className="parent-slot">
      <select
        className="env-select"
        aria-label={`Parent species ${index + 1}`}
        value={parent?.id ?? ''}
        onChange={(event) => onChange(index, event.target.value || null)}
      >
        <option value="">Parent species {index + 1}…</option>
        {getParentOptions(selection, index).map((species) => (
          <option key={species.id} value={species.id}>{species.name}</option>
        ))}
      </select>
      <Portrait className="portrait-parent" label={parent?.name} unknown={!parent} />
    </div>
  )
}

export default function SpeciesTraits({ selection, onParentChange, onNameChange, onDescriptionChange }) {
  const species = getSpeciesById(selection.id)

  if (isMixedHeritage(species)) {
    return (
      <div className="species-traits">
        <div className="parent-selects">
          <ParentSelect selection={selection} index={0} onChange={onParentChange} />
          <ParentSelect selection={selection} index={1} onChange={onParentChange} />
        </div>
        {selection.traits.map((trait) => (
          <Trait key={trait.id} name={trait.name} text={getTraitDescription(selection)} />
        ))}
      </div>
    )
  }

  if (isNewSpecies(species)) {
    return (
      <div className="species-traits">
        <input
          type="text"
          className="text-field"
          aria-label="New species name"
          placeholder="Species name (becomes your species trait)…"
          value={selection.customName}
          onChange={(event) => onNameChange(event.target.value)}
        />
        <textarea
          className="text-field text-area"
          aria-label="New species description"
          placeholder="Describe what sets your species apart…"
          value={selection.description}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </div>
    )
  }

  return (
    <div className="species-traits">
      {selection.traits.map((trait) => (
        <Trait key={trait.id} name={trait.name} text={species.description} />
      ))}
    </div>
  )
}
