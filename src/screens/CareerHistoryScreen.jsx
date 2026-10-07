import { useState } from 'react'
import { useCharacter } from '../character/useCharacter.js'
import {
  getAttributes,
  getCareerEventById,
  getCareerEvents,
  getCareerHistoryRequirements,
  getDisciplines,
  getEventCount,
  getNoviceNote,
  isAttributeChoice,
  isCustomFocusAllowed,
  isDisciplineChoice,
  isEventTakenElsewhere,
  isNoviceCareer,
  isSlotComplete,
  slotKeys,
} from '../rules/careerHistory.js'
import { getFocusesHeldElsewhere } from '../rules/characterSheet.js'
import { getFocusGroups } from '../rules/focuses.js'
import { areAllMet, getLockedSections } from '../rules/requirements.js'
import CardCarousel from '../components/CardCarousel.jsx'
import ChoiceList from '../components/ChoiceList.jsx'
import FocusPicker from '../components/FocusPicker.jsx'
import { getScoreTip } from '../rules/infoTips.js'
import HelpTip from '../components/HelpTip.jsx'
import MechanicsColumn from '../components/MechanicsColumn.jsx'
import Portrait from '../components/Portrait.jsx'
import RequirementTag from '../components/RequirementTag.jsx'
import ScreenFooter from '../components/ScreenFooter.jsx'

// Every option is listed; a fixed book bonus shows as the only (pre-selected) choice.
function bonusOptions(entries, fixedId) {
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.name,
    suffix: '(+1)',
    disabled: fixedId !== null && entry.id !== fixedId,
    tip: getScoreTip(entry.id),
  }))
}

function EventDetails({ event, isNovice, locked }) {
  return (
    <div className={`panel env-column career-event-details${locked ? ' is-locked' : ''}`} inert={locked}>
      <h3 className="env-column-title"><HelpTip helpId="eventDetails">Event Details</HelpTip></h3>
      <div className="env-column-body">
        {event ? (
          <>
            <p className="education-detail-caption">As defined in Captain's Log, p.{event.source.page}:</p>
            <ul className="education-book-rules">
              <li className="education-book-rule"><span className="education-book-label">Attributes:</span> {event.attribute.text}</li>
              <li className="education-book-rule"><span className="education-book-label">Disciplines:</span> {event.discipline.text}</li>
              <li className="education-book-rule"><span className="education-book-label">Focuses:</span> {event.focus.text}</li>
            </ul>
            <p className="education-detail-caption">Consider:</p>
            <ul className="career-event-questions">
              {event.questions.map((question) => <li key={question}>{question}</li>)}
            </ul>
            {isNovice && <p className="source-ref">Novice: {getNoviceNote()}</p>}
          </>
        ) : (
          <p className="education-detail-description">Select a career event to see its effects.</p>
        )}
      </div>
    </div>
  )
}

export default function CareerHistoryScreen({ step, navigation }) {
  const { character, dispatch } = useCharacter()
  const history = character.careerHistory
  const [chosenSlot, setChosenSlot] = useState(0)
  const requirements = getCareerHistoryRequirements(character)
  const locked = getLockedSections(requirements)

  // Falls back to the first event if the chosen tab has become locked (e.g. after the character is cleared).
  const activeSlot = locked[slotKeys(chosenSlot).event] ? 0 : chosenSlot
  const keys = slotKeys(activeSlot)
  const slot = history.events[activeSlot]
  const event = getCareerEventById(slot?.event.id)
  const completedCount = history.events.filter((_, index) => isSlotComplete(requirements, index)).length
  const dispatchSlot = (action) => dispatch({ ...action, slotIndex: activeSlot })
  const heldElsewhere = getFocusesHeldElsewhere(character, 'careerHistory', activeSlot)

  const carouselItems = getCareerEvents().map((entry) => {
    const takenBy = history.events.findIndex((other, index) => index !== activeSlot && other?.event.id === entry.id)
    return { ...entry, disabled: isEventTakenElsewhere(history, activeSlot, entry.id), tag: takenBy >= 0 ? `Event ${takenBy + 1}` : null }
  })
  const eventCard = carouselItems.find((entry) => entry.id === event?.id)

  return (
    <section className="screen career-history-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className={`screen-heading${requirements[slotKeys(0).event] ? '' : ' is-missing'}`}><HelpTip helpId={`${step.id}Screen`}>{step.title}</HelpTip></h1>
          <p className="screen-intro">
            Choose {getEventCount()} defining career events ({completedCount}/{getEventCount()} complete). Each increases one Attribute by 1, one Discipline by 1, and gives one Focus, as defined in Captain's Log.
          </p>
        </div>
      </div>

      <div className="env-tabs" role="tablist">
        {history.events.map((entry, index) => {
          const tabKeys = slotKeys(index)
          const complete = isSlotComplete(requirements, index)
          const isLocked = locked[tabKeys.event]
          return (
            <button
              key={tabKeys.event}
              type="button"
              role="tab"
              aria-selected={index === activeSlot}
              disabled={isLocked}
              className={`env-tab${index === activeSlot ? ' is-active' : ''}${entry ? ' has-choice' : ''}${complete || isLocked ? '' : ' is-missing'}`}
              onClick={() => setChosenSlot(index)}
            >
              <span className="env-tab-icon" aria-hidden="true">{index + 1}</span>
              <span className="env-tab-text">
                <span className="env-tab-label">Career Event {index + 1} of {getEventCount()}</span>
                <span className="env-tab-choice">{entry?.event.name ?? '\u00a0'}</span>
              </span>
              <RequirementTag met={complete} />
            </button>
          )
        })}
      </div>

      <CardCarousel
        label={`Career events for event ${activeSlot + 1}`}
        variant={`carousel-environment${requirements[keys.event] ? '' : ' is-missing'}`}
        items={carouselItems}
        selectedId={event?.id ?? null}
        onSelect={(eventId) => dispatchSlot({ type: 'selectCareerEvent', eventId })}
      />

      <div className="species-details env-details panel">
        <Portrait label={event?.name} image={eventCard?.image} className="portrait-detail" />
        <div className="species-details-text">
          <h2 className="species-details-name">{event?.name ?? `No event ${activeSlot + 1} selected`}</h2>
          <p>{event?.description ?? `Select career event ${activeSlot + 1} above.`}</p>
          {event && <p className="source-ref">Captain's Log, p.{event.source.page} · d20 roll {event.roll}</p>}
        </div>
      </div>

      <div className="env-mechanics career-mechanics career-history-mechanics">
        <MechanicsColumn
          number="1"
          title="Attribute"
          helpId="eventAttribute"
          instruction={event ? (isAttributeChoice(event) ? 'Choose any one Attribute (+1).' : 'Set by this event (+1).') : 'Select a career event to see its Attribute.'}
          instructionLines={2}
          met={requirements[keys.attribute]}
          locked={locked[keys.attribute]}
        >
          {event && (
            <ChoiceList
              label="Career event attribute"
              options={bonusOptions(getAttributes(), event.attribute.id)}
              selectedId={slot.attributeBonus?.id}
              onSelect={(attributeId) => dispatchSlot({ type: 'selectCareerEventAttribute', attributeId })}
            />
          )}
        </MechanicsColumn>

        <MechanicsColumn
          number="2"
          title="Discipline"
          helpId="eventDiscipline"
          instruction={event ? (isDisciplineChoice(event) ? 'Choose any one Discipline (+1).' : 'Set by this event (+1).') : 'Select a career event to see its Discipline.'}
          instructionLines={2}
          met={requirements[keys.discipline]}
          locked={locked[keys.discipline]}
        >
          {event && (
            <ChoiceList
              label="Career event discipline"
              options={bonusOptions(getDisciplines(), event.discipline.id)}
              selectedId={slot.disciplineBonus?.id}
              onSelect={(disciplineId) => dispatchSlot({ type: 'selectCareerEventDiscipline', disciplineId })}
            />
          )}
        </MechanicsColumn>

        <MechanicsColumn
          number="3"
          title="Focus"
          helpId="eventFocus"
          instruction={event ? `${event.focus.examples.length ? 'Book example, ' : ''}Focus Matrix${isCustomFocusAllowed() ? ', or your own' : ''}.` : 'Select a career event to choose its Focus.'}
          instructionLines={2}
          met={requirements[keys.focus]}
          locked={locked[keys.focus]}
        >
          {event && (
            <FocusPicker
              key={`${activeSlot}-${event.id}`}
              focus={slot.focus}
              groups={getFocusGroups(event.focus.examples)}
              allowCustom={isCustomFocusAllowed()}
              onSelect={(name) => dispatchSlot({ type: 'selectCareerEventFocus', name })}
              onCustomChange={(name) => dispatchSlot({ type: 'setCareerEventCustomFocus', name })}
              heldElsewhere={heldElsewhere}
            />
          )}
        </MechanicsColumn>

        <EventDetails event={event} isNovice={isNoviceCareer(character)} locked={locked[keys.event]} />
      </div>

      <ScreenFooter {...navigation} canGoNext={navigation.canGoNext && areAllMet(requirements)} />
    </section>
  )
}
