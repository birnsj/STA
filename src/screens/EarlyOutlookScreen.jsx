import { useState } from 'react'
import { useCharacter } from '../character/CharacterContext.jsx'
import {
  getApproaches,
  getDisciplineOptions,
  getEarlyOutlookRequirements,
  getFocusExamples,
  getOutlookById,
  getOutlooks,
  getPathOptions,
  isApproachAvailable,
  isCustomFocusAllowed,
} from '../rules/earlyOutlook.js'
import { getFocusesHeldElsewhere } from '../rules/characterSheet.js'
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

const TAB_ICONS = { upbringing: '◍', aspiration: '✦', caste: '◈' }

export default function EarlyOutlookScreen({ step, navigation }) {
  const { character, dispatch } = useCharacter()
  const { earlyOutlook } = character
  const [activeApproachId, setActiveApproachId] = useState(earlyOutlook.approach?.id ?? getApproaches()[0].id)

  const outlook = earlyOutlook.outlook ? getOutlookById(earlyOutlook.outlook.id) : null
  const approach = outlook ? getApproaches().find((entry) => entry.id === outlook.approach) : null
  const pathOptions = outlook ? getPathOptions(outlook.id) : []
  const pathChoiceLabel = pathOptions.map((option) => option.name.toLowerCase()).join(' / ')
  const requirements = getEarlyOutlookRequirements(character)
  const locked = getLockedSections(requirements)

  return (
    <section className="screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className={`screen-heading${requirements.outlook ? '' : ' is-missing'}`}><HelpTip helpId={`${step.id}Screen`}>{step.title}</HelpTip></h1>
          <p className="screen-intro">
            Choose your early outlook. This reflects your childhood, formative experiences, and key influences, as defined in Captain's Log.
          </p>
        </div>
      </div>

      <div className="env-tabs outlook-tabs" role="tablist">
        {getApproaches().map((entry) => {
          const isActive = entry.id === activeApproachId
          const isAvailable = isApproachAvailable(character, entry.id)
          const holdsChoice = earlyOutlook.approach?.id === entry.id
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={!isAvailable}
              title={isAvailable ? undefined : entry.restriction}
              className={`env-tab${isActive ? ' is-active' : ''}${isAvailable && !requirements.outlook ? ' is-missing' : ''}`}
              onClick={() => setActiveApproachId(entry.id)}
            >
              <span className="env-tab-icon" aria-hidden="true">{TAB_ICONS[entry.id]}</span>
              <span className="env-tab-text">
                <span className="env-tab-label">{entry.name}</span>
                <span className="env-tab-choice">{holdsChoice ? earlyOutlook.outlook.name : isAvailable ? '\u00a0' : 'Klingon only'}</span>
              </span>
            </button>
          )
        })}
      </div>

      <CardCarousel
        label={`${getApproaches().find((entry) => entry.id === activeApproachId).name} options`}
        variant={`carousel-environment${requirements.outlook ? '' : ' is-missing'}`}
        items={getOutlooks(activeApproachId)}
        selectedId={earlyOutlook.outlook?.id}
        onSelect={(outlookId) => dispatch({ type: 'selectEarlyOutlook', outlookId })}
      />

      <div className="species-details env-details panel">
        <Portrait label={outlook?.name} className="portrait-detail" />
        <div className="species-details-text">
          <h2 className={`species-details-name${requirements.outlook ? '' : ' is-missing'}`}>
            {outlook?.name ?? 'No early outlook selected'}
            {approach && <span className="panel-heading-context"> ({approach.name})</span>}
            <RequirementTag met={requirements.outlook} />
          </h2>
          <p>{outlook?.description ?? 'Select an early outlook above.'}</p>
          {outlook && <p className="source-ref">Captain's Log, p.{outlook.source.page}</p>}
        </div>
      </div>

      {/* Always rendered so choosing an outlook doesn't shift the layout. */}
      <div className="env-mechanics outlook-mechanics">
        <MechanicsColumn
          number="1"
          title="Attribute Bonus"
          helpId="outlookAttribute"
          instruction={outlook ? `${approach.pathPrompt} Each gives different Attribute bonuses.` : 'Select an early outlook above to see the Attribute options.'}
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
          title="Discipline Bonus"
          helpId="outlookDiscipline"
          instruction={outlook ? `Choose one Discipline to increase by +1. Not affected by ${pathChoiceLabel}.` : 'Select an early outlook above to see the available Disciplines.'}
          instructionLines={2}
          met={requirements.disciplineBonus}
          locked={locked.disciplineBonus}
        >
          {outlook && (
            <ChoiceList
              label="Early outlook discipline bonus"
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
          instruction={outlook ? `Choose a book example or Focus Matrix focus${isCustomFocusAllowed() ? ', or write your own' : ''}. Not affected by ${pathChoiceLabel}.` : 'Select an early outlook above to see example Focuses.'}
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
      </div>

      <p className="screen-note panel">
        Note: Your early outlook choice and trait provide the benefits and adjustments defined in Captain's Log.
        <br />
        You will assign Attribute values later in the process. The total must equal 56.
      </p>

      <ScreenFooter {...navigation} canGoNext={navigation.canGoNext && areAllMet(requirements)} />
    </section>
  )
}
