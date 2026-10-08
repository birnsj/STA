import { useCharacter } from '../character/useCharacter.js'
import {
  getAvailableSpecies,
  getBonusSpecies,
  getRequiredAttributeChoices,
  getSpeciesAbility,
  getSpeciesAbilityGap,
  getSpeciesById,
  getSpeciesRequirements,
  hasSelectionAttributeChoice,
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
  const bonusSpecies = getBonusSpecies(selection)
  if (isMixedHeritage(species) && !bonusSpecies) return 'Choose both parent species and your primary species first.'
  const fromPrimary = isMixedHeritage(species) ? ` (as ${bonusSpecies.name}, your primary species)` : ''
  if (!hasSelectionAttributeChoice(selection)) return fromPrimary ? `Bonuses${fromPrimary}.` : null
  const required = getRequiredAttributeChoices(bonusSpecies)
  return `Choose ${required} attributes to receive +1${fromPrimary} (${selection.attributeBonuses.length}/${required} chosen)`
}

export default function SpeciesScreen({ step, navigation }) {
  const { character, dispatch } = useCharacter()
  const selection = character.species
  const species = selection ? getSpeciesById(selection.id) : null
  const nameSuffix = species ? ` (${species.name})` : ''
  const ability = getSpeciesAbility(selection)
  const abilityGap = getSpeciesAbilityGap(selection)
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
            Choose your species. Captain's Log gives each species a Species Trait and attribute adjustments; Star Trek
            Adventures 2E adds a distinct Species Ability.
            <br />
            All three are assigned automatically when you select a species. You will assign the final Attribute values
            later in the process. The total must equal 56.
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
          {ability && (
            <div className="species-ability">
              <p className="species-ability-head">
                <span className="species-ability-label">Species Ability</span>
                <span className="species-ability-name">{ability.name}</span>
                {ability.source && <span className="source-ref">{ability.source.book}, p.{ability.source.page}</span>}
              </p>
              <p className="species-ability-text">{ability.description}</p>
            </div>
          )}
          {abilityGap && (
            <div className="species-ability">
              <p className="species-ability-head">
                <span className="species-ability-label">Species Ability</span>
                <span className="species-ability-name">{abilityGap.label}</span>
              </p>
              <p className="species-ability-text">{abilityGap.note}</p>
            </div>
          )}
          <div className="species-details-scroll">
            <p>{species?.description ?? 'Select a species above to view its description, traits, and attribute adjustments.'}</p>
            {species && <p className="source-ref">{species.source.book ?? "Captain's Log"}, p.{species.source.page}</p>}
          </div>
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
                onPrimaryChange={(speciesId) => dispatch({ type: 'setSpeciesPrimary', speciesId })}
                onNameChange={(name) => dispatch({ type: 'setNewSpeciesName', name })}
                onDescriptionChange={(description) => dispatch({ type: 'setNewSpeciesDescription', description })}
                onAbilityChange={(changes) => dispatch({ type: 'setNewSpeciesAbility', changes })}
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
                isChoice={hasSelectionAttributeChoice(selection)}
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
