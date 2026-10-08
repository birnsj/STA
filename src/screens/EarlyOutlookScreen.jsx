import { useCharacter } from '../character/useCharacter.js'
import {
  getDisciplineOptions,
  getEarlyOutlookRequirements,
  getFocusExamples,
  getOutlookById,
  getOutlooks,
  getPathOptions,
  getUpbringingRules,
  isCustomFocusAllowed,
} from '../rules/earlyOutlook.js'
import { getFocusesHeldElsewhere } from '../rules/characterSheet.js'
import { getChoiceArt } from '../rules/choiceArt.js'
import { getFocusGroups } from '../rules/focuses.js'
import { getScoreTip } from '../rules/infoTips.js'
import { areAllMet, getLockedSections } from '../rules/requirements.js'
import CardCarousel from '../components/CardCarousel.jsx'
import ChoiceList from '../components/ChoiceList.jsx'
import FocusPicker from '../components/FocusPicker.jsx'
import HelpTip from '../components/HelpTip.jsx'
import MechanicsColumn from '../components/MechanicsColumn.jsx'
import OutlookPathList from '../components/OutlookPathList.jsx'
import Portrait from '../components/Portrait.jsx'
import RequirementTag from '../components/RequirementTag.jsx'
import ScreenFooter from '../components/ScreenFooter.jsx'
import TalentColumn from '../components/TalentColumn.jsx'

export default function EarlyOutlookScreen({ step, navigation }) {
  const { character, dispatch } = useCharacter()
  const { earlyOutlook } = character

  const outlook = earlyOutlook.outlook ? getOutlookById(earlyOutlook.outlook.id) : null
  const pathOptions = outlook ? getPathOptions(outlook.id) : []
  const pathChoiceLabel = pathOptions.map((option) => option.name.toLowerCase()).join(' / ')
  const requirements = getEarlyOutlookRequirements(character)
  const locked = getLockedSections(requirements)

  return (
    <section className="screen early-outlook-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className={`screen-heading${requirements.outlook ? '' : ' is-missing'}`}><HelpTip helpId={`${step.id}Screen`}>{step.title}</HelpTip></h1>
          <p className="screen-intro">
            Choose your Upbringing: the culture you grew up in, and whether you accepted or rebelled against it.
            <br />
            {getUpbringingRules().grants}
          </p>
        </div>
      </div>

      <CardCarousel
        label="Upbringings"
        variant={`carousel-environment${requirements.outlook ? '' : ' is-missing'}`}
        items={getOutlooks()}
        selectedId={earlyOutlook.outlook?.id}
        onSelect={(outlookId) => dispatch({ type: 'selectEarlyOutlook', outlookId })}
      />

      <div className="species-details env-details panel">
        <Portrait label={outlook?.name} image={getChoiceArt('earlyOutlook', outlook?.id)} className="portrait-detail" />
        <div className="species-details-text">
          <h2 className={`species-details-name${requirements.outlook ? '' : ' is-missing'}`}>
            {outlook?.name ?? 'No Upbringing selected'}
            <RequirementTag met={requirements.outlook} />
          </h2>
          <p>{outlook?.description ?? 'Select an Upbringing above.'}</p>
          {outlook && (
            <p className="source-ref">
              {outlook.source.book}, p.{outlook.source.page}
            </p>
          )}
        </div>
      </div>

      {/* Always rendered so choosing an outlook doesn't shift the layout. */}
      <div className="env-mechanics outlook-mechanics">
        <MechanicsColumn
          number="1"
          title="Attribute Bonus"
          helpId="outlookAttribute"
          instruction={outlook ? `${getUpbringingRules().pathPrompt} Each gives different Attribute bonuses.` : 'Select an Upbringing above to see the Attribute options.'}
          instructionLines={3}
          met={requirements.path}
          locked={locked.path}
        >
          {outlook && (
            <OutlookPathList
              options={pathOptions}
              selectedId={earlyOutlook.path?.id}
              onSelect={(pathId) => dispatch({ type: 'selectEarlyOutlookPath', pathId })}
            />
          )}
        </MechanicsColumn>

        <MechanicsColumn
          number="2"
          title="Department Bonus"
          helpId="outlookDiscipline"
          instruction={outlook ? `Choose one Department to increase by +1. Not affected by ${pathChoiceLabel}.` : 'Select an Upbringing above to see the available Departments.'}
          instructionLines={2}
          met={requirements.disciplineBonus}
          locked={locked.disciplineBonus}
        >
          {outlook && (
            <ChoiceList
              label="Upbringing department bonus"
              options={getDisciplineOptions(outlook.id).map((discipline) => ({ id: discipline.id, label: discipline.name, suffix: '(+1)', tip: getScoreTip(discipline.id) }))}
              selectedId={earlyOutlook.disciplineBonus?.id}
              onSelect={(disciplineId) => dispatch({ type: 'selectEarlyOutlookDiscipline', disciplineId })}
            />
          )}
        </MechanicsColumn>

        <MechanicsColumn
          number="3"
          title="Focus"
          helpId="outlookFocus"
          instruction={outlook ? `Choose a book example or sample focus${isCustomFocusAllowed() ? ', or write your own' : ''}. Not affected by ${pathChoiceLabel}.` : 'Select an Upbringing above to see example Focuses.'}
          instructionLines={3}
          met={requirements.focus}
          locked={locked.focus}
        >
          {outlook && (
            <FocusPicker
              key={outlook.id}
              focus={earlyOutlook.focus}
              groups={getFocusGroups(getFocusExamples(outlook.id))}
              allowCustom={isCustomFocusAllowed()}
              onSelect={(name) => dispatch({ type: 'selectEarlyOutlookFocus', name })}
              onCustomChange={(name) => dispatch({ type: 'setEarlyOutlookCustomFocus', name })}
              heldElsewhere={getFocusesHeldElsewhere(character, 'earlyOutlook')}
            />
          )}
        </MechanicsColumn>

        <TalentColumn number="4" stepId="earlyOutlook" met={requirements.talent} locked={locked.talent} />
      </div>

      <ScreenFooter {...navigation} canGoNext={navigation.canGoNext && areAllMet(requirements)} />
    </section>
  )
}
