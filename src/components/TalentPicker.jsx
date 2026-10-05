import { useEffect, useRef, useState } from 'react'
import { CATEGORY_LABELS, getChoiceLabel, getRequirementSummary } from '../rules/talents.js'
import ChipGroup from './ChipGroup.jsx'
import { useInfoTip } from './useInfoTip.js'

const CHIP_LABELS = { general: 'General', species: 'Species', command: 'CMD', conn: 'CONN', engineering: 'ENG', security: 'SEC', science: 'SCI', medicine: 'MED', career: 'Career' }

const sourceText = (talent) => `${talent.source.book}, p.${talent.source.page}`
const isHeld = (option) => option.state === 'selected' || option.state === 'invalid'
const isBlocked = (option) => option.state === 'taken' || option.state === 'unavailable'

function talentTip(option) {
  const { talent, reasons } = option
  return {
    title: `${talent.name} · Character Talent`,
    text: talent.description,
    sections: [
      { label: 'Category', text: CATEGORY_LABELS[talent.category] },
      { label: 'Requirements', text: getRequirementSummary(talent) },
    ],
    note: reasons.length ? reasons.join('. ') : null,
    source: sourceText(talent),
  }
}

const needsChoice = (option, slot) => isHeld(option) && Boolean(getChoiceLabel(option.talent)) && !slot?.choice

function rowMeta(option, slot) {
  if (isBlocked(option) || option.state === 'invalid') return option.reasons[0]
  if (needsChoice(option, slot)) return `Not finished: choose a ${getChoiceLabel(option.talent).toLowerCase()} below`
  const requirements = option.requirementSummary === 'None' ? 'No requirements' : `Requires ${option.requirementSummary}`
  if (!option.heldElsewhere.length) return requirements
  const copies = option.heldElsewhere.map(({ stepTitle, choiceName }) => (choiceName ? `${choiceName} on ${stepTitle}` : stepTitle))
  return `You already have it (${copies.join(', ')}). Can be taken again.`
}

// The talent's department / attribute / focus / attack-type choice as buttons; blocked options are listed with their reason.
function ChoicePills({ talent, slot, choiceOptions, onChoose }) {
  const choiceLabel = getChoiceLabel(talent)
  if (!choiceLabel) return null
  const blocked = choiceOptions.filter((option) => option.disabled)
  return (
    <div className="talent-choice">
      <span className={`talent-choice-label${slot?.choice ? '' : ' is-pending'}`}>
        {slot?.choice ? `${choiceLabel}:` : `Choose a ${choiceLabel.toLowerCase()} to finish this talent:`}
      </span>
      <ChipGroup
        label={`${talent.name} ${choiceLabel.toLowerCase()}`}
        options={choiceOptions.map((option) => ({ id: option.id, label: option.name, title: option.reason, disabled: option.disabled }))}
        value={slot?.choice?.id ?? ''}
        onChange={onChoose}
        missing={!slot?.choice}
      />
      {blocked.map((option) => (
        <span key={option.id} className="talent-choice-blocked">
          {option.name}: {option.reason.charAt(0).toLowerCase() + option.reason.slice(1)}
        </span>
      ))}
      {!choiceOptions.length && <span className="talent-details-empty">Nothing to choose from yet.</span>}
    </div>
  )
}

// The held talent's full text, for screens with room for a separate details panel (Finishing Touches).
// The choice itself is made in the picker's expanded row, so here it is only reported.
export function TalentDetails({ talent, slot }) {
  if (!talent) {
    return <p className="talent-details-empty">No talent chosen yet.</p>
  }
  const choiceLabel = getChoiceLabel(talent)
  return (
    <div className="talent-details">
      <span className="talent-details-kind">Character Talent · {CATEGORY_LABELS[talent.category]}</span>
      <span className="talent-details-name">{slot?.choice ? `${talent.name} (${slot.choice.name})` : talent.name}</span>
      <span className="talent-details-requirements">Requires: {getRequirementSummary(talent)}</span>
      {choiceLabel && (
        <span className={`talent-details-requirements${slot?.choice ? '' : ' is-missing-text'}`}>
          {choiceLabel}: {slot?.choice?.name ?? 'not chosen yet (choose it in the talent list)'}
        </span>
      )}
      <p className="talent-details-text">{talent.description}</p>
      <span className="source-ref">{sourceText(talent)}</span>
    </div>
  )
}

// options: getTalentOptions(); slot: the step's held talent. The held talent's row opens to show its text and choice.
export default function TalentPicker({ label, options, slot, choiceOptions, onSelect, onChoose }) {
  const [categoryId, setCategoryId] = useState('all')
  const tip = useInfoTip()
  // Career talents only ever fit the Career slot, so their chip appears only where one can be taken.
  const categories = Object.keys(CHIP_LABELS).filter((id) =>
    options.some((option) => option.talent.category === id && (id !== 'career' || !isBlocked(option))),
  )
  const activeId = categoryId === 'all' || categories.includes(categoryId) ? categoryId : 'all'
  const inCategory = options.filter((option) => activeId === 'all' || option.talent.category === activeId)
  // Talents the player can take come first; greyed-out ones follow, each with its reason.
  const visible = [...inCategory.filter((option) => !isBlocked(option)), ...inCategory.filter(isBlocked)]

  // The open row grows below its button, so scroll the list until the whole row (and its choice) is visible.
  const listRef = useRef(null)
  const heldId = options.find(isHeld)?.talent.id
  useEffect(() => {
    // Measured after a short wait: on screen entry the layout (fonts, stage scale) is not settled yet.
    const timer = setTimeout(() => {
      const list = listRef.current
      const row = list?.querySelector('.talent-row-wrap.is-open')
      if (!row) return
      const listTop = list.getBoundingClientRect().top
      const scale = list.getBoundingClientRect().height / list.offsetHeight || 1
      const top = (row.getBoundingClientRect().top - listTop) / scale + list.scrollTop
      const bottom = top + row.offsetHeight
      if (top < list.scrollTop) list.scrollTo({ top, behavior: 'smooth' })
      else if (bottom > list.scrollTop + list.clientHeight) {
        list.scrollTo({ top: Math.min(top, bottom - list.clientHeight), behavior: 'smooth' })
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [heldId, activeId])

  return (
    <div className="talent-picker">
      <ChipGroup
        label="Talent category"
        className="talent-chips"
        options={['all', ...categories].map((id) => ({
          id,
          label: id === 'all' ? 'All' : CHIP_LABELS[id],
          title: id === 'all' ? 'All talents' : `${CATEGORY_LABELS[id]} talents`,
        }))}
        value={activeId}
        onChange={setCategoryId}
      />
      <div ref={listRef} className="choice-list talent-list" role="radiogroup" aria-label={label}>
        {visible.map((option) => {
          const held = isHeld(option)
          const pending = needsChoice(option, slot)
          return (
            <div key={option.talent.id} className={`talent-row-wrap${held ? ' is-open' : ''}${pending ? ' is-pending' : ''}`}>
              <button
                type="button"
                role="radio"
                aria-checked={held}
                disabled={isBlocked(option)}
                className={`choice talent-row is-${option.state}${held ? ' is-selected' : ''}`}
                onClick={() => onSelect(option.talent.id)}
                {...tip.bind(talentTip(option))}
              >
                <span className="choice-radio" aria-hidden="true" />
                <span className="talent-row-text">
                  <span className="choice-label">{slot?.choice && held ? `${option.talent.name} (${slot.choice.name})` : option.talent.name}</span>
                  <span className="talent-row-meta">{rowMeta(option, slot)}</span>
                </span>
              </button>
              {held && (
                <div className="talent-row-expand">
                  <p className="talent-row-description">{option.talent.description}</p>
                  <ChoicePills talent={option.talent} slot={slot} choiceOptions={choiceOptions} onChoose={onChoose} />
                </div>
              )}
            </div>
          )
        })}
        {!visible.length && <p className="talent-details-empty">No talents in this category.</p>}
      </div>
      {tip.element}
    </div>
  )
}
