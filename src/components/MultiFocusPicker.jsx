import { useState } from 'react'
import FocusGroupSelect from './FocusGroupSelect.jsx'
import { initialGroupId } from './focusOptions.js'

// Several focuses from groups (book examples or Focus Matrix divisions) and/or written by the player.
// When all focuses are chosen, a new pick replaces the oldest (handled by the rules layer).
// Only focuses the character already has from another screen (heldElsewhere) are disabled.
export default function MultiFocusPicker({ focuses, groups, allowCustom, onToggle, onAddCustom, onRemove, heldElsewhere = new Map() }) {
  const [draft, setDraft] = useState('')
  const [groupId, setGroupId] = useState(() => initialGroupId(groups, null))
  const group = groups.find((entry) => entry.id === groupId) ?? groups[0]
  // Chosen focuses not in the shown list stay visible so they can be removed.
  const otherChosen = focuses.filter((focus) => focus.custom || !group.focuses.includes(focus.name))
  const draftHeldBy = heldElsewhere.get(draft.trim().toLowerCase())
  const canAdd = Boolean(draft.trim()) && !draftHeldBy

  const addDraft = () => {
    if (!canAdd) return
    onAddCustom(draft)
    setDraft('')
  }

  return (
    <div className="focus-source-picker">
      {groups.length > 1 && <FocusGroupSelect groups={groups} groupId={group.id} onChange={setGroupId} />}
      <div className="choice-list focus-picker" role="group" aria-label="Focuses">
        {otherChosen.map((focus) => (
          <button key={focus.name} type="button" role="checkbox" aria-checked="true" className="choice is-selected" onClick={() => onRemove(focus.name)}>
            <span className="choice-radio" aria-hidden="true" />
            <span className="choice-label">{focus.name}</span>
            <span className="choice-suffix">{focus.custom ? '(yours)' : '(chosen)'}</span>
          </button>
        ))}
        {group.focuses.map((name) => {
          const isSelected = focuses.some((focus) => !focus.custom && focus.name === name)
          const heldBy = isSelected ? null : heldElsewhere.get(name.toLowerCase())
          return (
            <button
              key={name}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              disabled={Boolean(heldBy)}
              title={heldBy ? `Already chosen: ${heldBy}` : undefined}
              className={`choice${isSelected ? ' is-selected' : ''}`}
              onClick={() => onToggle(name)}
            >
              <span className="choice-radio" aria-hidden="true" />
              <span className="choice-label">{name}</span>
              {heldBy && <span className="choice-suffix">Taken</span>}
            </button>
          )
        })}
        {allowCustom && (
          <div className="choice custom-value">
            <input
              type="text"
              className="custom-value-input"
              placeholder="Write your own focus…"
              aria-label="Write your own focus"
              title={draftHeldBy ? `Already chosen: ${draftHeldBy}` : undefined}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addDraft()}
            />
            <button type="button" className="point-button" aria-label="Add focus" disabled={!canAdd} onClick={addDraft}>
              +
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
