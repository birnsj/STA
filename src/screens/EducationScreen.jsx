import { useCharacter } from '../character/useCharacter.js'
import { getAttributes } from '../rules/species.js'
import {
  canDecreaseAttribute,
  canIncreaseAttribute,
  categoryAllowsSwap,
  getAttributePointsSpent,
  getAttributePointsTotal,
  getCategories,
  getCategoryById,
  getDisciplineRows,
  getDisciplineRules,
  getEducationRequirements,
  getFocusCount,
  getFocusExamples,
  getOptionById,
  getOptions,
  getOptionSummary,
  getRequiredAttributes,
  getSwapOptions,
  getValueMatrix,
  isCustomFocusAllowed,
  isCustomValueAllowed,
} from '../rules/education.js'
import { getFocusesHeldElsewhere, getValuesHeldElsewhere } from '../rules/characterSheet.js'
import { getFocusGroups } from '../rules/focuses.js'
import { areAllMet, getLockedSections } from '../rules/requirements.js'
import AttributePointPicker from '../components/AttributePointPicker.jsx'
import CardCarousel from '../components/CardCarousel.jsx'
import ChoiceList from '../components/ChoiceList.jsx'
import DisciplinePointPicker from '../components/DisciplinePointPicker.jsx'
import HelpTip from '../components/HelpTip.jsx'
import MechanicsColumn from '../components/MechanicsColumn.jsx'
import MultiFocusPicker from '../components/MultiFocusPicker.jsx'
import RequirementTag from '../components/RequirementTag.jsx'
import ScreenFooter from '../components/ScreenFooter.jsx'
import TalentColumn from '../components/TalentColumn.jsx'
import ValuePicker from '../components/ValuePicker.jsx'

// Some book entries state only the restriction and rely on the section's shared rule for the split.
function bookAttributeText(option) {
  const { text } = option.attributes
  return /three points/i.test(text) ? text : `Add three points (+2/+1 or +1/+1/+1). ${text}`
}

function attributeInstruction(education, required) {
  const progress = `(${getAttributePointsSpent(education)}/${getAttributePointsTotal()})`
  const requirement = required.length ? ` Must include ${required.map((attribute) => attribute.name).join(' or ')}.` : ''
  return `Spend 3 points: +2/+1 or +1/+1/+1 ${progress}.${requirement}`
}

function disciplineInstruction(rules, picks) {
  const parts = [`+2 to one, then +1 to ${rules.minorCount === 1 ? 'one other' : 'two others'} (${picks.minors.length}/${rules.minorCount}).`]
  if (rules.mustInclude) parts.push(`Must include ${rules.mustInclude.name}.`)
  if (rules.cap) parts.push(`Max ${rules.cap} at this stage.`)
  return parts.join(' ')
}

function BookRule({ label, text }) {
  return (
    <li className="education-book-rule">
      <span className="education-book-label">{label}:</span> {text}
    </li>
  )
}

export default function EducationScreen({ step, navigation }) {
  const { character, dispatch } = useCharacter()
  const { education } = character

  const option = getOptionById(education.option?.id)
  const category = getCategoryById(option?.category ?? getCategories()[0].id)
  const disciplineRules = option ? getDisciplineRules(option.id) : null
  const optionLabel = category.optionLabel
  const requirements = getEducationRequirements(character)
  const locked = getLockedSections(requirements)

  return (
    <section className="screen education-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className={`screen-heading${requirements.option ? '' : ' is-missing'}`}><HelpTip helpId={`${step.id}Screen`}>{step.title}</HelpTip></h1>
          <p className="screen-intro">
            Choose your education. This reflects your formal training and academic background, as defined in Captain's Log.
            <br />
            Your education provides the benefits defined in Captain's Log. Final Attribute values are assigned later (total must equal 56).
          </p>
        </div>
      </div>

      <CardCarousel
        label="Education"
        variant={`carousel-environment education-carousel${requirements.option ? '' : ' is-missing'}`}
        items={getCategories()}
        selectedId={option?.category ?? null}
        onSelect={(categoryId) => dispatch({ type: 'selectEducationCategory', categoryId })}
      />

      <div className="species-mechanics education-lower">
        <div className={`panel mechanics-panel education-options${requirements.option ? '' : ' is-missing'}`}>
          <h3 className="panel-heading">
            <HelpTip helpId="educationOptions">Education {optionLabel}s</HelpTip> <span className="panel-heading-context">({category.name})</span>
            <RequirementTag met={requirements.option} />
          </h3>
          <div className="panel-body">
            <p className="attribute-instruction education-list-instruction">
              Select the {optionLabel.toLowerCase()} that best fits your education.
              {categoryAllowsSwap(category.id) && ` All ${optionLabel.toLowerCase()}s allow an optional discipline swap.`}
            </p>
            <ChoiceList
              label={`Education ${optionLabel.toLowerCase()}s`}
              options={getOptions(category.id).map((entry) => ({ id: entry.id, label: entry.name, suffix: getOptionSummary(entry.id) }))}
              selectedId={option?.id}
              onSelect={(optionId) => dispatch({ type: 'selectEducation', optionId })}
            />
          </div>
        </div>

        <div className="panel mechanics-panel education-details">
          <h3 className="panel-heading">
            <HelpTip helpId="educationDetails">{optionLabel} Details</HelpTip> {option && <span className="panel-heading-context">({option.name})</span>}
          </h3>
          <div className="panel-body">
            {option && (
              <>
                <p className="education-detail-description">{option.description}</p>
                <p className="education-detail-caption">As defined in Captain's Log, p.{option.source.page}:</p>
                <ul className="education-book-rules">
                  <BookRule label="Value" text={option.valueText} />
                  <BookRule label="Attributes" text={bookAttributeText(option)} />
                  <BookRule label="Disciplines" text={option.disciplines.text} />
                  <BookRule label="Focuses" text={option.focus.text} />
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Always rendered so choosing an option doesn't shift the layout. */}
      <div className="env-mechanics education-mechanics">
        <MechanicsColumn
          number="1"
          title="Attributes"
          helpId="educationAttributes"
          instruction={option ? attributeInstruction(education, getRequiredAttributes(option.id)) : `Select an education ${optionLabel.toLowerCase()} to assign Attribute points.`}
          instructionLines={3}
          met={requirements.attributes}
          locked={locked.attributes}
        >
          {option && (
            <AttributePointPicker
              attributes={getAttributes()}
              bonuses={education.attributeBonuses}
              canIncrease={(attributeId) => canIncreaseAttribute(education, attributeId)}
              canDecrease={(attributeId) => canDecreaseAttribute(education, attributeId)}
              onIncrease={(attributeId) => dispatch({ type: 'increaseEducationAttribute', attributeId })}
              onDecrease={(attributeId) => dispatch({ type: 'decreaseEducationAttribute', attributeId })}
            />
          )}
        </MechanicsColumn>

        <MechanicsColumn
          number="2"
          title="Disciplines"
          helpId="educationDisciplines"
          instruction={option ? disciplineInstruction(disciplineRules, education.disciplinePicks) : `Select an education ${optionLabel.toLowerCase()} to see its Disciplines.`}
          instructionLines={2}
          met={requirements.disciplines}
          locked={locked.disciplines}
        >
          {option && (
            <DisciplinePointPicker
              rows={getDisciplineRows(character)}
              picks={education.disciplinePicks}
              swapOptions={getSwapOptions(character)}
              allowsSwap={disciplineRules.allowsSwap}
              onToggleMajor={(disciplineId) => dispatch({ type: 'toggleEducationMajorDiscipline', disciplineId })}
              onToggleMinor={(disciplineId) => dispatch({ type: 'toggleEducationMinorDiscipline', disciplineId })}
              onSwapFrom={(disciplineId) => dispatch({ type: 'setEducationSwapFrom', disciplineId })}
              onSwapTo={(disciplineId) => dispatch({ type: 'setEducationSwapTo', disciplineId })}
            />
          )}
        </MechanicsColumn>

        <MechanicsColumn
          number="3"
          title="Focuses"
          helpId="educationFocuses"
          instruction={option ? `Choose ${getFocusCount()} (${education.focuses.length}/${getFocusCount()}): examples, Focus Matrix${isCustomFocusAllowed() ? ', or your own' : ''}.` : `Select an education ${optionLabel.toLowerCase()} to see example Focuses.`}
          instructionLines={3}
          met={requirements.focuses}
          locked={locked.focuses}
        >
          {option && (
            <MultiFocusPicker
              key={option.id}
              focuses={education.focuses}
              groups={getFocusGroups(getFocusExamples(option.id))}
              allowCustom={isCustomFocusAllowed()}
              onToggle={(name) => dispatch({ type: 'toggleEducationFocus', name })}
              onAddCustom={(name) => dispatch({ type: 'addEducationCustomFocus', name })}
              onRemove={(name) => dispatch({ type: 'removeEducationFocus', name })}
              heldElsewhere={getFocusesHeldElsewhere(character, 'education')}
            />
          )}
        </MechanicsColumn>

        {/* Picks are remembered per option (choiceMemory.js), so a value chosen before an option would be lost. */}
        <MechanicsColumn
          number="4"
          title="Value"
          helpId="educationValue"
          instruction={option ? 'Choose the value you gained from your education, or write your own.' : `Select an education ${optionLabel.toLowerCase()} to choose a Value.`}
          instructionLines={2}
          met={requirements.value}
          locked={locked.value}
        >
          {option && (
            <ValuePicker
              value={education.value}
              matrix={getValueMatrix()}
              allowCustom={isCustomValueAllowed()}
              onSelectMatrix={(valueId) => dispatch({ type: 'selectEducationMatrixValue', valueId })}
              onCustomChange={(text) => dispatch({ type: 'setEducationCustomValue', text })}
              heldElsewhere={getValuesHeldElsewhere(character, 'education')}
            />
          )}
        </MechanicsColumn>

        <TalentColumn number="5" stepId="education" met={requirements.talent} locked={locked.talent} />
      </div>

      <ScreenFooter {...navigation} canGoNext={navigation.canGoNext && areAllMet(requirements)} />
    </section>
  )
}
