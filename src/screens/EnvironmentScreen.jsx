import { useState } from 'react'
import { useCharacter } from '../character/CharacterContext.jsx'
import {
  getAttributeOptionRule,
  getAttributeOptions,
  getConditionById,
  getConditions,
  getDisciplineOptions,
  getEnvironmentRequirements,
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
import Portrait from '../components/Portrait.jsx'
import RequirementTag from '../components/RequirementTag.jsx'
import ScreenFooter from '../components/ScreenFooter.jsx'

const TABS = [
  { id: 'setting', label: 'Environment Setting', icon: '◍' },
  { id: 'condition', label: 'Environment Conditions', icon: '◈' },
]

const ATTRIBUTE_INSTRUCTIONS = {
  speciesBonus: 'Choose one of your species’ improved Attributes to increase by +1. (You may only choose from the Attributes your species improved.)',
  list: 'Choose one of these Attributes to increase by +1.',
  otherSpeciesBonus: 'Choose the species you were raised among, then one of the Attributes that species improves, to increase by +1.',
}

export default function EnvironmentScreen({ step, navigation }) {
  const { character, dispatch } = useCharacter()
  const { environment } = character
  const [activeTab, setActiveTab] = useState(environment.condition ? 'condition' : 'setting')
  const requirements = getEnvironmentRequirements(character)
  const locked = getLockedSections(requirements)
  const isSettingTab = activeTab === 'setting'
  const selectedId = environment[activeTab]?.id
  const activeEntry = isSettingTab ? getSettingById(selectedId) : getConditionById(selectedId)
  const attributeRule = getAttributeOptionRule(environment)

  const selectEntry = (id) =>
    dispatch(isSettingTab ? { type: 'selectEnvironmentSetting', settingId: id } : { type: 'selectEnvironmentCondition', conditionId: id })

  return (
    <section className="screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className={`screen-heading${requirements.background ? '' : ' is-missing'}`}><HelpTip helpId={`${step.id}Screen`}>{step.title}</HelpTip></h1>
          <p className="screen-intro">
            Choose where you were raised or the conditions that shaped your early life. Your choice gives you one Attribute bonus, one Discipline bonus, and one Value.
          </p>
        </div>
      </div>

      <div className="env-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={`env-tab${tab.id === activeTab ? ' is-active' : ''}${environment[tab.id] ? ' has-choice' : ''}${requirements.background ? '' : ' is-missing'}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="env-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="env-tab-text">
              <span className="env-tab-label">{tab.label}</span>
              <span className="env-tab-choice">{environment[tab.id]?.name ?? '\u00a0'}</span>
            </span>
            {environment[tab.id] && <RequirementTag met />}
          </button>
        ))}
      </div>

      <CardCarousel
        label={isSettingTab ? 'Environment settings' : 'Environment conditions'}
        variant={`carousel-environment${requirements.background ? '' : ' is-missing'}`}
        items={isSettingTab ? getSettings() : getConditions()}
        selectedId={selectedId}
        onSelect={selectEntry}
      />

      <div className="species-details env-details panel">
        <Portrait label={activeEntry?.name} image={getChoiceArt('environment', activeEntry?.id)} className="portrait-detail" />
        <div className="species-details-text">
          <h2 className="species-details-name">{activeEntry?.name ?? `No ${isSettingTab ? 'setting' : 'condition'} selected`}</h2>
          <p>{activeEntry?.description ?? `Select an environment ${isSettingTab ? 'setting' : 'condition'} above.`}</p>
          {activeEntry && (
            <p className="source-ref">Captain's Log, p.{activeEntry.source.page} · Choose one Setting or one Condition.</p>
          )}
        </div>
      </div>

      <div className="env-mechanics">
        <MechanicsColumn number="1" title="Environment Value" helpId="environmentValue" instruction="Choose the value that reflects your upbringing." met={requirements.value} locked={locked.value}>
          <ValuePicker
            value={environment.value}
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
          instruction={attributeRule ? ATTRIBUTE_INSTRUCTIONS[attributeRule.type] : 'Select a Setting or Condition to see the available Attributes.'}
          instructionLines={4}
          met={requirements.attributeBonus}
          locked={locked.attributeBonus}
        >
          {requiresOtherSpecies(environment) && (
            <select
              className="env-select"
              aria-label="Species you were raised among"
              value={environment.otherSpecies?.id ?? ''}
              onChange={(event) => dispatch({ type: 'selectEnvironmentOtherSpecies', speciesId: event.target.value || null })}
            >
              {!environment.otherSpecies && <option value="">Raised among…</option>}
              {getOtherSpeciesOptions(character).map((species) => (
                <option key={species.id} value={species.id}>{species.name}</option>
              ))}
            </select>
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
          title="Discipline Bonus"
          helpId="environmentDiscipline"
          instruction={attributeRule ? 'Choose one starting Discipline to increase by +1.' : 'Select a Setting or Condition to see the available Disciplines.'}
          instructionLines={2}
          met={requirements.disciplineBonus}
          locked={locked.disciplineBonus}
        >
          <ChoiceList
            label="Discipline bonus"
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
