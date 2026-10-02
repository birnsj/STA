import { getParentOptions, getSpeciesById, getTraitDescription, isMixedHeritage, isNewSpecies } from '../rules/species.js'
import { getSpeciesArt } from '../rules/choiceArt.js'
import PortraitCarousel from './PortraitCarousel.jsx'

function Trait({ name, text }) {
  return (
    <div className="trait">
      <span className="trait-name">{name}</span>
      {text && <p className="trait-text">{text}</p>}
    </div>
  )
}

function ParentCarousel({ selection, index, genderId, onChange }) {
  const parent = selection.parents[index]
  const options = getParentOptions(selection, index).map((species) => ({
    id: species.id,
    name: species.name,
    image: getSpeciesArt(species.id, genderId),
  }))
  return (
    <div className="parent-slot">
      <span className="parent-slot-label">Parent species {index + 1}{parent ? `: ${parent.name}` : ''}</span>
      <PortraitCarousel
        portraits={options}
        selectedId={parent?.id}
        onSelect={(speciesId) => onChange(index, speciesId)}
        emptyUnknown
        itemLabel={`parent species ${index + 1}`}
        showHint={false}
        className="portrait-parent"
      />
    </div>
  )
}

export default function SpeciesTraits({ selection, genderId, onParentChange, onNameChange, onDescriptionChange }) {
  const species = getSpeciesById(selection.id)

  if (isMixedHeritage(species)) {
    return (
      <div className="species-traits is-mixed">
        <div className="parent-selects">
          <ParentCarousel selection={selection} index={0} genderId={genderId} onChange={onParentChange} />
          <ParentCarousel selection={selection} index={1} genderId={genderId} onChange={onParentChange} />
        </div>
        <div className="mixed-traits">
          {selection.traits.map((trait) => (
            <Trait key={trait.id} name={trait.name} text={getTraitDescription(selection)} />
          ))}
        </div>
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
