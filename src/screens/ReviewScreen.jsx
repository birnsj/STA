import { useCharacter } from '../character/CharacterContext.jsx'
import creationSteps from '../data/adaptation/creationSteps.json'
import { getCareerLengths } from '../rules/career.js'
import { getCareerEvents } from '../rules/careerHistory.js'
import { getChosenEntry } from '../rules/environment.js'
import { getFocusEntries, getTraitEntries, getValueEntries } from '../rules/characterSheet.js'
import { validateCharacter } from '../rules/characterValidation.js'
import { getFinalScores, getKindInfo, getPortraitById, getRequiredFocusCount, getRequiredValueCount } from '../rules/finishingTouches.js'
import { getCardTip, getScoreTip } from '../rules/infoTips.js'
import { getSpeciesDisplayName } from '../rules/species.js'
import { getChoiceArt } from '../rules/choiceArt.js'
import { getEquippedItems, getItemStatLines } from '../rules/equipment.js'
import AutofillButton from '../components/AutofillButton.jsx'
import ClearButton from '../components/ClearButton.jsx'
import ExportButton from '../components/ExportButton.jsx'
import HelpTip from '../components/HelpTip.jsx'
import Portrait from '../components/Portrait.jsx'
import { useInfoTip } from '../components/useInfoTip.js'

const EMPTY = '—'
// Prototype: posting is chosen with the ship (not yet built), so Review states that instead of inventing one.
const POSTING_TEXT = 'Not yet assigned (ship creation)'
const stepTitles = Object.fromEntries(creationSteps.steps.map((step) => [step.id, step.title]))

const formatOutlook = ({ outlook, path }) => outlook && (path ? `${outlook.name} (${path.name})` : outlook.name)

function ReviewPanel({ title, helpId, count, className = '', children }) {
  return (
    <section className={`panel review-panel ${className}`}>
      <h2 className="panel-heading">
        <HelpTip helpId={helpId}>{title}</HelpTip>
        {count && (
          <span className={`review-heading-count${count.have === count.required ? '' : ' is-invalid'}`}>
            {count.have} / {count.required}
          </span>
        )}
      </h2>
      <div className="review-panel-body">{children}</div>
    </section>
  )
}

function Fields({ rows }) {
  return (
    <dl className="review-fields">
      {rows.map(({ label, value }) => (
        <div key={label} className="review-field">
          <dt>{label}</dt>
          <dd title={value || undefined}>{value || EMPTY}</dd>
        </div>
      ))}
    </dl>
  )
}

function ScorePanel({ title, helpId, kind, character }) {
  const { entries, max, total } = getKindInfo(kind)
  const scores = getFinalScores(character, kind)
  const sum = scores ? entries.reduce((acc, entry) => acc + scores[entry.id], 0) : null
  const tip = useInfoTip()
  return (
    <ReviewPanel title={title} helpId={helpId}>
      <ul className="review-scores">
        {entries.map((entry) => (
          <li key={entry.id} className={`review-score${scores?.[entry.id] === max ? ' is-max' : ''}`} {...tip.bind(getScoreTip(entry.id))}>
            <span>{entry.name}</span>
            <strong>{scores ? scores[entry.id] : EMPTY}</strong>
          </li>
        ))}
        {tip.element}
      </ul>
      <p className={`review-total${sum === total ? '' : ' is-invalid'}`}>
        Total {sum ?? EMPTY} / {total} · Max {max}
      </p>
    </ReviewPanel>
  )
}

function CareerEvents({ careerHistory }) {
  const eventsById = new Map(getCareerEvents().map((event) => [event.id, event]))
  const tip = useInfoTip()
  return (
    <ol className="review-events">
      {careerHistory.events.map((slot, index) => (
        <li key={index} className="review-event" {...tip.bind(getCardTip(eventsById.get(slot?.event.id)))}>
          <Portrait label={slot?.event.name} image={eventsById.get(slot?.event.id)?.image} className="portrait-review-thumb" />
          <div>
            <p className="review-event-name">
              <span className="review-label">Career Event {index + 1}:</span> {slot?.event.name ?? EMPTY}
            </p>
            {slot && (
              <p className="review-event-effects">
                {slot.attributeBonus?.name ?? EMPTY} +1 · {slot.disciplineBonus?.name ?? EMPTY} +1 · Focus: {slot.focus?.name || EMPTY}
              </p>
            )}
          </div>
        </li>
      ))}
      {tip.element}
    </ol>
  )
}

function SourcedList({ items }) {
  return (
    <ol className="review-list">
      {items.map((item, index) => (
        <li key={`${item.text}-${index}`}>
          <span className="review-list-text" title={item.text}>{item.text}</span>
          <span className="review-list-source">{stepTitles[item.stepId]}</span>
        </li>
      ))}
    </ol>
  )
}

// Stats are videogame prototype tuning (see items.json), not Captain's Log rules.
function EquipmentList({ items }) {
  return (
    <ul className="review-items">
      {items.map((item) => {
        const stats = getItemStatLines(item)
        return (
          <li key={item.id} className="review-item">
            <img className="review-item-icon" src={item.icon} alt="" draggable={false} />
            <div className="review-item-text">
              <p className="review-item-name">
                {item.name}
                {stats.length > 0 && (
                  <span className="review-item-stats">{stats.map((stat) => `${stat.label} ${stat.value}`).join(' · ')}</span>
                )}
              </p>
              <p className="review-item-description" title={item.description}>{item.description}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function ValidationPanel({ issues, confirmedAt, onGoToStep }) {
  if (confirmedAt) {
    return (
      <ReviewPanel title="Status" helpId="reviewStatus" className="review-status is-confirmed">
        <p className="review-status-message">Character confirmed.</p>
        <p className="review-status-note">Confirmed {new Date(confirmedAt).toLocaleString()}. Ship creation and play are not built yet.</p>
      </ReviewPanel>
    )
  }
  if (!issues.length) {
    return (
      <ReviewPanel title="Status" helpId="reviewStatus" className="review-status is-valid">
        <p className="review-status-message">Meets all Captain's Log requirements.</p>
        <p className="review-status-note">Confirm the character to finish creation.</p>
      </ReviewPanel>
    )
  }
  return (
    <ReviewPanel title={`Needs Attention (${issues.length})`} helpId="reviewStatus" className="review-status is-invalid">
      <ul className="review-issues">
        {issues.map((issue, index) => (
          <li key={index} className="review-issue">
            <span>{issue.message}</span>
            <button type="button" className="review-issue-link" onClick={() => onGoToStep(issue.stepId)}>
              Edit {issue.stepTitle} →
            </button>
          </li>
        ))}
      </ul>
    </ReviewPanel>
  )
}

export default function ReviewScreen({ navigation }) {
  const { character } = useCharacter()
  const { species, environment, earlyOutlook, education, career, careerHistory, identity } = character
  const issues = validateCharacter(character)
  const portrait = getPortraitById(identity.portrait?.id)
  const speciesName = getSpeciesDisplayName(species)
  const traits = getTraitEntries(character)
  const values = getValueEntries(character)
  const focuses = getFocusEntries(character).map((focus) => ({ stepId: focus.stepId, text: focus.name }))
  const lengthArt = getCareerLengths().find((length) => length.id === career.length?.id)?.image
  const serviceLine = [career.rank?.name, career.department?.name].filter(Boolean).join(' ◆ ')

  return (
    <section className="screen review-screen">
      <div className="review-grid">
        <div className="review-identity-column">
          <Portrait label={identity.name.trim() || speciesName} image={portrait?.fullBody ?? portrait?.image} className="portrait-review" />
          <div className="review-nameplate">
            <p className="review-name">{identity.name.trim() || 'Unnamed'}</p>
            <p className="review-service">{serviceLine || EMPTY}</p>
          </div>
          <ValidationPanel issues={issues} confirmedAt={character.confirmedAt} onGoToStep={navigation.onGoToStep} />
        </div>

        <ReviewPanel title="Identity" helpId="reviewIdentity" className="review-area-identity">
          <Fields
            rows={[
              { label: 'Name', value: identity.name.trim() },
              { label: 'Gender', value: identity.gender?.name },
              { label: 'Pronouns', value: identity.pronouns.trim() },
              { label: 'Species', value: speciesName },
              { label: 'Species Trait', value: traits.map((trait) => trait.name).join(', ') },
              { label: 'Portrait', value: portrait?.name },
            ]}
          />
        </ReviewPanel>

        <ReviewPanel title="Origin & Early Life" helpId="reviewOrigin" className="review-area-origin">
          <div className="review-with-image">
            <Portrait
              label={getChosenEntry(environment)?.name}
              image={getChoiceArt('environment', getChosenEntry(environment)?.id)}
              className="portrait-review-thumb"
            />
            <Fields
              rows={[
                environment.condition
                  ? { label: 'Condition', value: environment.condition.name }
                  : { label: 'Setting', value: environment.setting?.name },
                ...(environment.otherSpecies ? [{ label: 'Raised Among', value: environment.otherSpecies.name }] : []),
                { label: 'Early Outlook', value: formatOutlook(earlyOutlook) },
              ]}
            />
          </div>
        </ReviewPanel>

        <div className="review-area-attributes">
          <ScorePanel title="Attributes" helpId="reviewAttributes" kind="attributes" character={character} />
        </div>
        <div className="review-area-disciplines">
          <ScorePanel title="Disciplines" helpId="reviewDisciplines" kind="disciplines" character={character} />
        </div>

        <ReviewPanel title="Education" helpId="reviewEducation" className="review-area-education">
          <div className="review-with-image">
            <Portrait label={education.option?.name} image={getChoiceArt('education', education.option?.id)} className="portrait-review-thumb" />
            <Fields
              rows={[
                { label: 'Education', value: education.option?.name },
                { label: 'Category', value: education.category?.name },
              ]}
            />
          </div>
        </ReviewPanel>

        <ReviewPanel title="Career" helpId="reviewCareer" className="review-area-career">
          <div className="review-with-image">
            <Portrait label={career.length?.name} image={lengthArt} className="portrait-review-thumb" />
            <Fields
              rows={[
                { label: 'Career Length', value: career.length?.name },
                { label: 'Assignment', value: career.assignment?.name },
                { label: 'Department', value: career.department?.name },
                { label: 'Rank', value: career.rank?.name },
                { label: 'Posting', value: POSTING_TEXT },
              ]}
            />
          </div>
        </ReviewPanel>

        <ReviewPanel title="Career Events" helpId="reviewEvents" className="review-area-history">
          <CareerEvents careerHistory={careerHistory} />
        </ReviewPanel>

        <ReviewPanel title="Values" helpId="reviewValues" count={{ have: values.length, required: getRequiredValueCount() }} className="review-area-values">
          <SourcedList items={values} />
        </ReviewPanel>

        <ReviewPanel title="Focuses" helpId="reviewFocuses" count={{ have: focuses.length, required: getRequiredFocusCount() }} className="review-area-focuses">
          <SourcedList items={focuses} />
        </ReviewPanel>

        <ReviewPanel title="Traits" helpId="reviewTraits" className="review-area-traits">
          <ul className="review-traits">
            {traits.map((trait) => (
              <li key={trait.id}>
                <span className="review-label">{trait.name}</span>
                <span className="review-trait-text" title={trait.description}>{trait.description}</span>
              </li>
            ))}
            {!traits.length && <li>{EMPTY}</li>}
          </ul>
        </ReviewPanel>

        <ReviewPanel title="Equipment" helpId="reviewEquipment" className="review-area-notes">
          <EquipmentList items={getEquippedItems(character)} />
          <p className="review-notes">
            <span className="review-label">Other Details:</span> {character.backgroundNotes.trim() || 'None recorded.'}
          </p>
        </ReviewPanel>
      </div>

      <footer className="screen-footer review-footer">
        <button type="button" className="nav-button nav-back" onClick={navigation.onBack}>
          ← Back to Edit
        </button>
        <div className="dev-buttons">
          <AutofillButton />
          <ClearButton onClear={navigation.onClear} />
          <ExportButton />
        </div>
        <button
          type="button"
          className="nav-button nav-next review-confirm"
          disabled={issues.length > 0}
          onClick={navigation.onConfirm}
        >
          {character.confirmedAt ? 'Character Confirmed ✓' : 'Confirm Character →'}
        </button>
      </footer>
    </section>
  )
}
