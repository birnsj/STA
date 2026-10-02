import { useState } from 'react'
import { useCharacter } from '../character/CharacterContext.jsx'
import {
  getBookText,
  getCategories,
  getCharacterValues,
  getFinishingRequirements,
  getIncreaseRows,
  getKindInfo,
  getLimitAdjustment,
  getRequiredValueCount,
  getValueMatrix,
  isCustomValueAllowed,
  isFinishingStepComplete,
} from '../rules/finishingTouches.js'
import { getValuesHeldElsewhere } from '../rules/characterSheet.js'
import { NAME_GROUPS, randomName } from '../rules/names.js'
import { getAvailablePortraits } from '../rules/appearance.js'
import { getLifeTrackSentences } from '../rules/lifeTrack.js'
import { getSpeciesById, isMixedHeritage, isNewSpecies } from '../rules/species.js'
import { getLockedSections } from '../rules/requirements.js'
import CardCarousel from '../components/CardCarousel.jsx'
import HelpTip from '../components/HelpTip.jsx'
import LimitAdjuster from '../components/LimitAdjuster.jsx'
import Portrait from '../components/Portrait.jsx'
import PortraitPicker from '../components/PortraitPicker.jsx'
import RequirementTag from '../components/RequirementTag.jsx'
import ScoreIncreasePicker from '../components/ScoreIncreasePicker.jsx'
import ScreenFooter from '../components/ScreenFooter.jsx'
import ValuePicker from '../components/ValuePicker.jsx'

const KIND_LABELS = { attributes: 'Attribute', disciplines: 'Discipline' }

function Panel({ title, helpId, met, locked, className = '', children }) {
  const isMissing = met === false && !locked
  return (
    <div className={`panel mechanics-panel ${className}${isMissing ? ' is-missing' : ''}${locked ? ' is-locked' : ''}`} inert={locked}>
      <h3 className="panel-heading">
        <HelpTip helpId={helpId}>{title}</HelpTip>
        {met !== undefined && <RequirementTag met={met} />}
      </h3>
      <div className="panel-body">{children}</div>
    </div>
  )
}

function FinalValuePanels({ character, dispatch, met }) {
  const book = getBookText().finalValue
  const values = getCharacterValues(character)
  return (
    <>
      <Panel title="Final Value" helpId="finalValue" met={met}>
        <p className="attribute-instruction">Choose your final value{isCustomValueAllowed() ? ', or write your own' : ''}.</p>
        <ValuePicker
          value={character.finishingTouches.value}
          matrix={getValueMatrix()}
          allowCustom={isCustomValueAllowed()}
          onSelectMatrix={(valueId) => dispatch({ type: 'selectFinalMatrixValue', valueId })}
          onCustomChange={(text) => dispatch({ type: 'setFinalCustomValue', text })}
          heldElsewhere={getValuesHeldElsewhere(character, 'finishingTouches')}
        />
      </Panel>
      <div className="finishing-stack">
        <Panel title="Value Details" helpId="valueDetails">
          <p className="education-detail-caption">As defined in Captain's Log, p.{book.source.page}:</p>
          <p className="education-detail-description">{book.text}</p>
          <p className="education-detail-caption">Your values ({values.length}/{getRequiredValueCount()}):</p>
          <ul className="finishing-list">
            {values.map((value, index) => <li key={index}>{value.text}</li>)}
          </ul>
        </Panel>
      </div>
    </>
  )
}

function ScorePanels({ character, dispatch, kind, met }) {
  const label = KIND_LABELS[kind]
  const { increaseCount, max } = getKindInfo(kind)
  const book = getBookText()[kind]
  const increases = character.finishingTouches[kind].increases
  const adjustment = getLimitAdjustment(character, kind)
  return (
    <>
      <Panel title={`${label} Increases (${increases.length}/${increaseCount})`} helpId={`${label.toLowerCase()}Increases`} met={met}>
        <p className="attribute-instruction">Add +1 to {increaseCount} different {label.toLowerCase()}s. Scores shown: current → final.</p>
        <ScoreIncreasePicker
          label={`${label} increases`}
          rows={getIncreaseRows(character, kind)}
          onToggle={(id) => dispatch({ type: 'toggleFinalIncrease', kind, id })}
        />
      </Panel>
      <Panel title={`${label} Details`} helpId={`${label.toLowerCase()}Details`}>
        <p className="education-detail-caption">As defined in Captain's Log, p.{book.source.page}:</p>
        <p className="education-detail-description">{book.text}</p>
        <p className="education-detail-caption">Limits (max {max}, only one at {max}):</p>
        {adjustment.needed ? (
          <LimitAdjuster
            max={max}
            keeperOptions={adjustment.keeperOptions}
            keeperId={adjustment.keeperId}
            onKeeper={(id) => dispatch({ type: 'setFinalKeepAtMax', kind, id })}
            excess={adjustment.excess}
            assigned={adjustment.assigned}
            rows={adjustment.rows}
            onAdd={(id) => dispatch({ type: 'addFinalRedistributionPoint', kind, id })}
            onRemove={(id) => dispatch({ type: 'removeFinalRedistributionPoint', kind, id })}
          />
        ) : (
          <p className="education-detail-description">All scores are within the limits.</p>
        )}
        <p className={`finishing-total${adjustment.finalTotal !== null && adjustment.finalTotal !== adjustment.requiredTotal ? ' is-error' : ''}`}>
          Total: {adjustment.finalTotal ?? '…'} / {adjustment.requiredTotal}
        </p>
      </Panel>
    </>
  )
}

function IdentityPanels({ character, dispatch, met }) {
  const { name, pronouns } = character.identity
  const book = getBookText().pronouns
  return (
    <>
      <Panel title="Name & Pronouns" helpId="nameAndPronouns" met={met}>
        <label className="finishing-field">
          <span className="finishing-field-label">Name (required)</span>
          <input
            className="text-field"
            value={name}
            maxLength={60}
            placeholder="Type a name or roll one"
            onChange={(event) => dispatch({ type: 'setCharacterName', name: event.target.value })}
          />
        </label>
        <div className="name-randomizer">
          {NAME_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              className="name-randomizer-button"
              onClick={() => dispatch({ type: 'setCharacterName', name: randomName(group.id, name) })}
            >
              {group.label}
            </button>
          ))}
        </div>
        <label className="finishing-field">
          <span className="finishing-field-label">Pronouns (optional)</span>
          <input
            className="text-field"
            value={pronouns}
            maxLength={40}
            placeholder="e.g. she/her"
            onChange={(event) => dispatch({ type: 'setCharacterPronouns', pronouns: event.target.value })}
          />
        </label>
      </Panel>
      <Panel title="Identity Details" helpId="identityDetails">
        <p className="education-detail-caption">As defined in Captain's Log, p.{book.source.page}:</p>
        <p className="education-detail-description">{book.text}</p>
        <p className="source-ref">Prototype: the name is a videogame addition; the book's lifepath has no naming step.</p>
      </Panel>
    </>
  )
}

function portraitSetLabel(character) {
  const { gender } = character.identity
  const species = character.species ? getSpeciesById(character.species.id) : null
  if (!gender || !species) return null
  const speciesLabel = isMixedHeritage(species) || isNewSpecies(species) ? 'All species' : species.name
  return `${speciesLabel} · ${gender.name}`
}

function PortraitPanels({ character, dispatch, met }) {
  const portraits = getAvailablePortraits(character)
  const selected = portraits.find((portrait) => portrait.id === character.identity.portrait?.id) ?? null
  const index = selected ? portraits.indexOf(selected) : -1
  const setLabel = portraitSetLabel(character)
  const step = (direction) => {
    if (!portraits.length) return
    const next = portraits[(index + direction + portraits.length) % portraits.length]
    dispatch({ type: 'selectPortrait', portraitId: next.id })
  }
  return (
    <>
      <Panel title="Portrait Options" helpId="portraitOptions" met={met} className="finishing-portrait-options">
        <p className="attribute-instruction">
          {setLabel ? `Select a preset (${setLabel}).` : 'Choose a species and gender on Species to see portraits.'}
        </p>
        <div className="finishing-portrait-row">
          <PortraitPicker portraits={portraits} selectedId={selected?.id} onSelect={(portraitId) => dispatch({ type: 'selectPortrait', portraitId })} />
          <div className="finishing-portrait-actions">
            <button type="button" className="dev-button" disabled title="Not available in this prototype">Customize</button>
            <button type="button" className="dev-button" disabled title="Not available in this prototype">Import</button>
          </div>
        </div>
      </Panel>
      <Panel title="Portrait Details" helpId="portraitDetails" className="finishing-portrait-details">
        <Portrait label={selected?.name} image={selected?.image} className="portrait-finishing-preview" />
        <div className="finishing-preset-row">
          <button type="button" className="carousel-arrow" onClick={() => step(-1)} aria-label="Previous portrait">‹</button>
          <span className="finishing-preset-counter">Preset {index >= 0 ? index + 1 : '–'} / {portraits.length}</span>
          <button type="button" className="carousel-arrow" onClick={() => step(1)} aria-label="Next portrait">›</button>
        </div>
        <div className="finishing-life-track">
          <h4 className="finishing-life-track-heading">Life Track</h4>
          <p>{getLifeTrackSentences(character).join(' ')}</p>
        </div>
        <p className="source-ref">Prototype: portraits are presentation only and have no game-rule effect.</p>
      </Panel>
    </>
  )
}

function BackgroundNotesPanels({ character, dispatch }) {
  return (
    <>
      <Panel title="Background Notes (optional)" helpId="backgroundNotes">
        <textarea
          className="text-field finishing-notes"
          value={character.backgroundNotes}
          maxLength={2000}
          placeholder="History, personality, relationships…"
          onChange={(event) => dispatch({ type: 'setBackgroundNotes', text: event.target.value })}
        />
      </Panel>
      <Panel title="Notes Details" helpId="notesDetails">
        <p className="education-detail-description">Saved and exported with your character. The game rules never read these notes.</p>
      </Panel>
    </>
  )
}

export default function FinishingTouchesScreen({ step, navigation }) {
  const { character, dispatch } = useCharacter()
  const [chosenCategory, setChosenCategory] = useState('finalValue')
  const requirements = getFinishingRequirements(character)
  const locked = getLockedSections(requirements)

  // Falls back to the first category if the chosen one has become locked (e.g. after the character is cleared).
  const activeId = locked[chosenCategory] ? 'finalValue' : chosenCategory
  const categories = getCategories()
  const active = categories.find((category) => category.id === activeId)
  const items = categories.map((category) => ({
    ...category,
    disabled: Boolean(category.disabled || locked[category.id]),
    tag: category.disabled ? 'Off' : category.optional ? 'Optional' : requirements[category.id] ? '✓' : null,
  }))
  const panelProps = { character, dispatch, met: requirements[activeId] }

  return (
    <section className="screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className={`screen-heading${requirements.finalValue ? '' : ' is-missing'}`}><HelpTip helpId={`${step.id}Screen`}>{step.title}</HelpTip></h1>
          <p className="screen-intro">
            Add the final value and attribute and discipline increases defined in Captain's Log, choose a portrait, and finally name your character.
          </p>
        </div>
      </div>

      <CardCarousel label="Finishing touches" variant="carousel-environment" items={items} selectedId={activeId} onSelect={setChosenCategory} />

      <div className="species-details env-details panel">
        <Portrait label={active.name} image={active.image} className="portrait-detail" />
        <div className="species-details-text">
          <h2 className="species-details-name">{active.name}</h2>
          <p>{active.description}</p>
        </div>
      </div>

      <div className="species-mechanics finishing-lower">
        {activeId === 'finalValue' && <FinalValuePanels {...panelProps} />}
        {(activeId === 'attributes' || activeId === 'disciplines') && <ScorePanels {...panelProps} kind={activeId} />}
        {activeId === 'identity' && <IdentityPanels {...panelProps} />}
        {activeId === 'portrait' && <PortraitPanels {...panelProps} />}
        {activeId === 'backgroundNotes' && <BackgroundNotesPanels {...panelProps} />}
      </div>

      <ScreenFooter {...navigation} canGoNext={navigation.canGoNext && isFinishingStepComplete(character)} />
    </section>
  )
}
