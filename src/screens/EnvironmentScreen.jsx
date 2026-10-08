import { useCharacter } from '../character/useCharacter.js'
import {
  getAttributeOptionRule,
  getAttributeOptions,
  getDisciplineOptions,
  getEnvironmentRequirements,
  getEnvironmentValueExamples,
  getOtherSpeciesOptions,
  getSettingById,
  getSettings,
  getValueMatrix,
  isCustomValueAllowed,
  requiresOtherSpecies,
} from '../rules/environment.js'
import { getValuesHeldElsewhere } from '../rules/characterSheet.js'
import { getChoiceArt } from '../rules/choiceArt.js'
import { areAllMet, getLockedSections } from '../rules/requirements.js'
import CardCarousel from '../components/CardCarousel.jsx'
import ChoiceList from '../components/ChoiceList.jsx'
import ValuePicker from '../components/ValuePicker.jsx'
import { getScoreTip } from '../rules/infoTips.js'
import HelpTip from '../components/HelpTip.jsx'
import MechanicsColumn from '../components/MechanicsColumn.jsx'
import ChipGroup from '../components/ChipGroup.jsx'
import Portrait from '../components/Portrait.jsx'
import ScreenFooter from '../components/ScreenFooter.jsx'

const ATTRIBUTE_INSTRUCTIONS = {
  speciesBonus: 'Choose one of your species’ improved Attributes to increase by +1. (You may only choose from the Attributes your species improved.)',
  list: 'Choose one of these Attributes to increase by +1.',
  otherSpeciesBonus: 'Choose the species you were raised among, then one of the Attributes that species improves, to increase by +1.',
}

export default function EnvironmentScreen({ step, navigation }) {
  const { character, dispatch } = useCharacter()
  const { environment } = character
  const requirements = getEnvironmentRequirements(character)
  const locked = getLockedSections(requirements)
  const selectedId = environment.setting?.id
  const activeEntry = getSettingById(selectedId)
  const attributeRule = getAttributeOptionRule(environment)

  const selectEntry = (id) => dispatch({ type: 'selectEnvironmentSetting', settingId: id })

  return (
    <section className="screen environment-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className={`screen-heading${requirements.background ? '' : ' is-missing'}`}><HelpTip helpId={`${step.id}Screen`}>{step.title}</HelpTip></h1>
          <p className="screen-intro">
            Choose the kind of place where you were raised. Your choice gives you one Attribute bonus, one Department bonus, and one Value.
          </p>
        </div>
      </div>

      <CardCarousel
        label="Environments"
        variant={`carousel-environment${requirements.background ? '' : ' is-missing'}`}
        items={getSettings()}
        selectedId={selectedId}
        onSelect={selectEntry}
      />

      <div className="species-details env-details panel">
        <Portrait label={activeEntry?.name} image={getChoiceArt('environment', activeEntry?.id)} className="portrait-detail" />
        <div className="species-details-text">
          <h2 className="species-details-name">{activeEntry?.name ?? 'No environment selected'}</h2>
          <p>{activeEntry?.description ?? 'Select an environment above.'}</p>
          {activeEntry && (
            <p className="source-ref">
              {activeEntry.source.book}, p.{activeEntry.source.page} · Choose one environment.
            </p>
          )}
        </div>
      </div>

      <div className="env-mechanics">
        <MechanicsColumn
          number="1"
          title="Environment Value"
          helpId="environmentValue"
          instruction="Choose a value that reflects the environment and culture you were raised within. Your species’ example values are listed first."
          met={requirements.value}
          locked={locked.value}
        >
          <ValuePicker
            value={environment.value}
            examples={getEnvironmentValueExamples(character)}
            matrix={getValueMatrix()}
            allowCustom={isCustomValueAllowed()}
            onSelectMatrix={(valueId) => dispatch({ type: 'selectEnvironmentMatrixValue', valueId })}
            onCustomChange={(text) => dispatch({ type: 'setEnvironmentCustomValue', text })}
            heldElsewhere={getValuesHeldElsewhere(character, 'environment')}
          />
        </MechanicsColumn>

        <MechanicsColumn
          number="2"
          title="Attribute Bonus"
          helpId="environmentAttribute"
          instruction={attributeRule ? ATTRIBUTE_INSTRUCTIONS[attributeRule.type] : 'Select an environment to see the available Attributes.'}
          instructionLines={4}
          met={requirements.attributeBonus}
          locked={locked.attributeBonus}
        >
          {requiresOtherSpecies(environment) && (
            <div className="raised-among">
              <span className="raised-among-label">Raised among:</span>
              <ChipGroup
                label="Species you were raised among"
                options={getOtherSpeciesOptions(character).map((species) => ({ id: species.id, label: species.name }))}
                value={environment.otherSpecies?.id ?? ''}
                onChange={(speciesId) => dispatch({ type: 'selectEnvironmentOtherSpecies', speciesId })}
                missing={!environment.otherSpecies}
              />
            </div>
          )}
          <ChoiceList
            label="Attribute bonus"
            options={getAttributeOptions(character).map((attribute) => ({ id: attribute.id, label: attribute.name, suffix: '(+1)', tip: getScoreTip(attribute.id) }))}
            selectedId={environment.attributeBonus?.id}
            onSelect={(attributeId) => dispatch({ type: 'selectEnvironmentAttribute', attributeId })}
          />
        </MechanicsColumn>

        <MechanicsColumn
          number="3"
          title="Department Bonus"
          helpId="environmentDiscipline"
          instruction={attributeRule ? 'Choose one of these Departments to increase by +1.' : 'Select an environment to see the available Departments.'}
          instructionLines={2}
          met={requirements.disciplineBonus}
          locked={locked.disciplineBonus}
        >
          <ChoiceList
            label="Department bonus"
            options={getDisciplineOptions(character).map((discipline) => ({ id: discipline.id, label: discipline.name, suffix: '(+1)', tip: getScoreTip(discipline.id) }))}
            selectedId={environment.disciplineBonus?.id}
            onSelect={(disciplineId) => dispatch({ type: 'selectEnvironmentDiscipline', disciplineId })}
          />
        </MechanicsColumn>
      </div>

      <ScreenFooter {...navigation} canGoNext={navigation.canGoNext && areAllMet(requirements)} />
    </section>
  )
}
