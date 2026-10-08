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

function ParentCarousel({ selection, index, genderId, onChange, onPrimaryChange }) {
  const parent = selection.parents[index]
  const isPrimary = Boolean(parent) && parent.id === selection.primarySpeciesId
  const options = getParentOptions(selection, index).map((species) => ({
    id: species.id,
    name: species.name,
    image: getSpeciesArt(species.id, genderId),
  }))
  return (
    <div className="parent-slot">
      <div className="parent-slot-text">
        <span className="parent-slot-label">Parent species {index + 1}{parent ? `: ${parent.name}` : ''}</span>
        {parent && (
          <button
            type="button"
            className={`parent-primary${isPrimary ? ' is-selected' : ''}`}
            aria-pressed={isPrimary}
            title="Your primary species gives your attribute bonuses and Species Ability."
            onClick={() => onPrimaryChange(parent.id)}
          >
            {isPrimary ? 'Primary species' : 'Make primary'}
          </button>
        )}
      </div>
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

export default function SpeciesTraits({ selection, genderId, onParentChange, onPrimaryChange, onNameChange, onDescriptionChange, onAbilityChange }) {
  const species = getSpeciesById(selection.id)

  if (isMixedHeritage(species)) {
    return (
      <div className="species-traits is-mixed">
        <div className="parent-selects">
          {[0, 1].map((index) => (
            <ParentCarousel key={index} selection={selection} index={index} genderId={genderId} onChange={onParentChange} onPrimaryChange={onPrimaryChange} />
          ))}
        </div>
        <div className="mixed-traits">
          {selection.traits.map((trait) => (
            <Trait key={trait.id} name={trait.name} text={getTraitDescription(selection, trait.id)} />
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
        <input
          type="text"
          className="text-field"
          aria-label="Species Ability name"
          placeholder="Species Ability name (required)…"
          value={selection.speciesAbility?.name ?? ''}
          onChange={(event) => onAbilityChange({ name: event.target.value })}
        />
        <textarea
          className="text-field text-area"
          aria-label="Species Ability description"
          placeholder="Describe what your Species Ability does (required)…"
          value={selection.speciesAbility?.description ?? ''}
          onChange={(event) => onAbilityChange({ description: event.target.value })}
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
