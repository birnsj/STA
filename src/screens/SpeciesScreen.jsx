import { useCharacter } from '../character/CharacterContext.jsx'
import {
  getAvailableSpecies,
  getRequiredAttributeChoices,
  getSpeciesById,
  getSpeciesRequirements,
  hasAttributeChoice,
  isMixedHeritage,
} from '../rules/species.js'
import { getGenders } from '../rules/appearance.js'
import { getSpeciesArt } from '../rules/choiceArt.js'
import { areAllMet, getLockedSections } from '../rules/requirements.js'
import AttributeAdjustments from '../components/AttributeAdjustments.jsx'
import CardCarousel from '../components/CardCarousel.jsx'
import HelpTip from '../components/HelpTip.jsx'
import Portrait from '../components/Portrait.jsx'
import RequirementTag from '../components/RequirementTag.jsx'
import ScreenFooter from '../components/ScreenFooter.jsx'
import SpeciesTraits from '../components/SpeciesTraits.jsx'

function getAttributeInstruction(species, selection) {
  if (!hasAttributeChoice(species)) return null
  const required = getRequiredAttributeChoices(species)
  const progress = `(${selection.attributeBonuses.length}/${required} chosen)`
  if (isMixedHeritage(species)) {
    if (selection.parents.some((parent) => !parent)) return 'Choose both parent species first.'
    return `Choose ${required} different attributes from either parent’s bonuses ${progress}`
  }
  return `Choose ${required} attributes to receive +1 ${progress}`
}

export default function SpeciesScreen({ step, navigation }) {
  const { character, dispatch } = useCharacter()
  const selection = character.species
  const species = selection ? getSpeciesById(selection.id) : null
  const nameSuffix = species ? ` (${species.name})` : ''
  const requirements = getSpeciesRequirements(character)
  const gender = character.identity.gender
  const locked = getLockedSections(requirements)
  const panelClass = (sectionId) =>
    `panel mechanics-panel${locked[sectionId] ? ' is-locked' : requirements[sectionId] ? '' : ' is-missing'}`

  return (
    <section className="screen species-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className={`screen-heading${requirements.species ? '' : ' is-missing'}`}><HelpTip helpId={`${step.id}Screen`}>{step.title}</HelpTip></h1>
          <p className="screen-intro">
            Choose your species. Each species has specific traits and attribute adjustments, as defined in Captain's Log.
            <br />
            Species traits and attribute adjustments are applied automatically when you select this species. You will
            assign the final Attribute values later in the process. The total must equal 56.
          </p>
        </div>
      </div>

      <CardCarousel
        label="Species"
        variant={requirements.species ? '' : 'is-missing'}
        items={getAvailableSpecies(gender?.id)}
        selectedId={selection?.id}
        onSelect={(speciesId) => dispatch({ type: 'selectSpecies', speciesId })}
      />

      <div className="species-details panel">
        <Portrait label={species?.name} image={getSpeciesArt(species?.id, gender?.id)} className="portrait-detail" />
        <div className="species-details-text">
          <h2 className={`species-details-name${requirements.species ? '' : ' is-missing'}`}>
            {species?.name ?? 'No species selected'}
            <RequirementTag met={requirements.species} />
          </h2>
          <p>{species?.description ?? 'Select a species above to view its description, traits, and attribute adjustments.'}</p>
          {species && <p className="source-ref">Captain's Log, p.{species.source.page}</p>}
        </div>
        <div className={`species-gender${requirements.gender ? '' : ' is-missing'}`} inert={locked.gender}>
          <h3 className="species-gender-heading">
            <HelpTip helpId="speciesGender">Gender</HelpTip>
            <RequirementTag met={requirements.gender} />
          </h3>
          <div className="species-gender-options" role="radiogroup" aria-label="Gender">
            {getGenders().map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={gender?.id === option.id}
                className={`species-gender-option${gender?.id === option.id ? ' is-selected' : ''}`}
                onClick={() => dispatch({ type: 'selectGender', genderId: option.id })}
              >
                {option.name}
              </button>
            ))}
          </div>
          <p className="species-gender-note">Sets the portraits offered later. No effect on any rule; pronouns are chosen separately.</p>
        </div>
      </div>

      <div className="species-mechanics">
        <div className={panelClass('traits')} inert={locked.traits}>
          <h3 className="panel-heading">
            <HelpTip helpId="speciesTraits">Species Traits</HelpTip> <span className="panel-heading-context">{nameSuffix}</span>
            <RequirementTag met={requirements.traits} />
          </h3>
          <div className="panel-body">
            {selection && (
              <SpeciesTraits
                selection={selection}
                genderId={gender?.id}
                onParentChange={(index, speciesId) => dispatch({ type: 'setSpeciesParent', index, speciesId })}
                onNameChange={(name) => dispatch({ type: 'setNewSpeciesName', name })}
                onDescriptionChange={(description) => dispatch({ type: 'setNewSpeciesDescription', description })}
              />
            )}
          </div>
        </div>
        <div className={panelClass('attributes')} inert={locked.attributes}>
          <h3 className="panel-heading">
            <HelpTip helpId="speciesAttributes">Attribute Adjustments</HelpTip> <span className="panel-heading-context">{nameSuffix}</span>
            <RequirementTag met={requirements.attributes} />
          </h3>
          <div className="panel-body">
            {species && (
              <AttributeAdjustments
                selection={selection}
                isChoice={hasAttributeChoice(species)}
                instruction={getAttributeInstruction(species, selection)}
                onToggle={(attributeId) => dispatch({ type: 'toggleSpeciesAttribute', attributeId })}
              />
            )}
          </div>
        </div>
      </div>

      <ScreenFooter {...navigation} canGoNext={navigation.canGoNext && areAllMet(requirements)} />
    </section>
  )
}
