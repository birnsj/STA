import { useState } from 'react'
import ChoiceList from './ChoiceList.jsx'
import FocusGroupSelect from './FocusGroupSelect.jsx'
import { initialGroupId, toFocusOption } from './focusOptions.js'

// One focus: from a group (book examples or a Focus Matrix division), or written by the player.
// heldElsewhere: Map of lower-case focus name -> where the character already has it; those are disabled.
export default function FocusPicker({ focus, groups, allowCustom, onSelect, onCustomChange, heldElsewhere = new Map() }) {
  const isCustom = Boolean(focus?.custom)
  // Keeps typed text if the player peeks at a listed focus and then returns to their own.
  const [customDraft, setCustomDraft] = useState(isCustom ? focus.name : '')
  const [groupId, setGroupId] = useState(() => initialGroupId(groups, isCustom ? null : focus?.name))
  const group = groups.find((entry) => entry.id === groupId) ?? groups[0]
  const draftHeldBy = heldElsewhere.get(customDraft.trim().toLowerCase())

  const handleCustomChange = (text) => {
    setCustomDraft(text)
    onCustomChange(text)
  }

  return (
    <div className="value-picker focus-source-picker">
      {groups.length > 1 && <FocusGroupSelect groups={groups} groupId={group.id} onChange={setGroupId} />}
      <ChoiceList
        label={group.name}
        options={group.focuses.map((name) => toFocusOption(name, heldElsewhere))}
        selectedId={isCustom ? null : focus?.name}
        onSelect={onSelect}
      />
      {allowCustom && (
        <div className={`choice custom-value${isCustom ? ' is-selected' : ''}`} title={draftHeldBy ? `Already chosen: ${draftHeldBy}` : undefined}>
          <button
            type="button"
            role="radio"
            aria-checked={isCustom}
            aria-label="Write your own focus"
            className="choice-radio-button"
            onClick={() => onCustomChange(customDraft)}
          >
            <span className="choice-radio" aria-hidden="true" />
          </button>
          <input
            type="text"
            className="custom-value-input"
            placeholder="Write your own focus…"
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
