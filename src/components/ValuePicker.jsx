import { useState } from 'react'
import ChoiceList from './ChoiceList.jsx'

function toValueOption(entry, heldElsewhere) {
  const where = heldElsewhere.get(entry.text.toLowerCase())
  if (!where) return { id: entry.id, label: entry.text }
  return { id: entry.id, label: entry.text, disabled: true, suffix: 'Taken', title: `Already chosen: ${where}` }
}

// One value from the Values Matrix, or written by the player. Nothing is chosen until the player picks.
// heldElsewhere: Map of lower-case value text -> screen that already has it; those are disabled.
export default function ValuePicker({ value, matrix, allowCustom, onSelectMatrix, onCustomChange, heldElsewhere = new Map() }) {
  const isCustom = Boolean(value) && value.matrixId === null
  // Keeps typed text if the player picks a listed value and then returns to their own.
  const [customDraft, setCustomDraft] = useState(isCustom ? value.text : '')
  const draftHeldBy = heldElsewhere.get(customDraft.trim().toLowerCase())

  const handleCustomChange = (text) => {
    setCustomDraft(text)
    onCustomChange(text)
  }

  return (
    <div className="value-picker">
      <ChoiceList
        label="Value"
        options={matrix.map((entry) => toValueOption(entry, heldElsewhere))}
        selectedId={isCustom ? null : value?.matrixId}
        onSelect={onSelectMatrix}
      />
      {allowCustom && (
        <div className={`choice custom-value${isCustom ? ' is-selected' : ''}`} title={draftHeldBy ? `Already chosen: ${draftHeldBy}` : undefined}>
          <button
            type="button"
            role="radio"
            aria-checked={isCustom}
            aria-label="Write your own value"
            className="choice-radio-button"
            onClick={() => onCustomChange(customDraft)}
          >
            <span className="choice-radio" aria-hidden="true" />
          </button>
          <input
            type="text"
            className="custom-value-input"
            placeholder="Write your own value…"
            value={customDraft}
            onFocus={() => !isCustom && onCustomChange(customDraft)}
            onChange={(event) => handleCustomChange(event.target.value)}
          />
          {draftHeldBy && <span className="choice-suffix">Taken</span>}
        </div>
      )}
    </div>
  )
}
