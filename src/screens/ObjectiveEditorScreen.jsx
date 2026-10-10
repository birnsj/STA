import { useState } from 'react'
import '../components/conversation/conversationEditor.css'
import { ConditionsEditor } from '../components/conversation/ConversationFields.jsx'
import ConfirmDialog from '../components/maps/ConfirmDialog.jsx'

// Dev objective editor (opened from the map editor): the open map's objectives (mapFormat.js objectives), listed on the
// left, the selected one edited on the right. Edits go straight into the map, so the map editor's Save keeps them.
// objectives, onChange(objectives): the map's list. width, height: the map's size, for the location fields.
// initialIndex: the objective selected on opening. onPick(index): back to the map to click that objective's location.
// objects: the map's challenge objects (challengeObjects.js definitions, where the map places them), for Marked on.
const freshId = (objectives) => {
  const used = new Set(objectives.map((objective) => objective.id))
  let index = objectives.length + 1
  while (used.has(`objective${index}`)) index += 1
  return `objective${index}`
}
const idText = (text) => text.replace(/[^A-Za-z0-9_-]/g, '')
const conditionCount = (list) => list?.length ?? 0

function warningsFor(objectives) {
  const warnings = []
  const seen = new Set()
  objectives.forEach((objective, index) => {
    const label = `O${index + 1}`
    if (!objective.id) warnings.push(`${label} has no id.`)
    else if (seen.has(objective.id)) warnings.push(`${label}: the id ${objective.id} is used twice.`)
    seen.add(objective.id)
    if (!objective.title.trim()) warnings.push(`${label} (${objective.id || 'no id'}) has no title; exploration shows its id.`)
  })
  return warnings
}

// Marked on a challenge object (the marker follows it) or on a tile of its own.
function LinkField({ objective, objects, onChange }) {
  return (
    <select className="ce-input" value={objective.objectId ?? ''} aria-label="Marked on" onChange={(event) => onChange({ objectId: event.target.value || null })}>
      <option value="">A tile of its own (below)</option>
      {objective.objectId && !objects.some((object) => object.id === objective.objectId) && <option value={objective.objectId}>{objective.objectId} (not on this map)</option>}
      {objects.map((object) => (
        <option key={object.id} value={object.id}>
          {object.name} ({object.id}) at {object.position[0]}, {object.position[1]}
        </option>
      ))}
    </select>
  )
}

function LocationFields({ objective, width, height, onChange, onPick }) {
  const position = objective.position
  const setAxis = (axis, text) => {
    const limit = axis === 'x' ? width : height
    const value = Math.min(limit - 1, Math.max(0, Math.round(Number(text) || 0)))
    onChange({ position: { ...(position ?? { x: 0, y: 0 }), [axis]: value } })
  }
  return (
    <div className="ce-row">
      {position ? (
        <>
          <label className="ce-toolbar-field">
            X
            <input className="ce-input ce-number" type="number" min={0} max={width - 1} value={position.x} onChange={(event) => setAxis('x', event.target.value)} />
          </label>
          <label className="ce-toolbar-field">
            Y
            <input className="ce-input ce-number" type="number" min={0} max={height - 1} value={position.y} onChange={(event) => setAxis('y', event.target.value)} />
          </label>
        </>
      ) : (
        <span className="ce-text">No minimap marker.</span>
      )}
      <button type="button" className="ce-button is-small" onClick={onPick}>
        {position ? 'Move on Map' : 'Place on Map'}
      </button>
      {position && (
        <button type="button" className="ce-button is-small" onClick={() => onChange({ position: null })}>
          Clear
        </button>
      )}
    </div>
  )
}

export default function ObjectiveEditorScreen({ objectives, onChange, mapName, width, height, initialIndex = 0, objects = [], onPick, onBack }) {
  const [selectedIndex, setSelectedIndex] = useState(() => (objectives.length ? Math.min(initialIndex ?? 0, objectives.length - 1) : null))
  const [question, setQuestion] = useState(null)
  const selected = selectedIndex !== null ? objectives[selectedIndex] : null
  const warnings = warningsFor(objectives)

  const update = (changes) => onChange(objectives.map((objective, at) => (at === selectedIndex ? { ...objective, ...changes } : objective)))
  const add = () => {
    onChange([...objectives, { id: freshId(objectives), title: '', description: '', position: null, activeWhen: [], completeWhen: [] }])
    setSelectedIndex(objectives.length)
  }
  const move = (step) => {
    const to = selectedIndex + step
    if (to < 0 || to >= objectives.length) return
    const next = [...objectives]
    ;[next[selectedIndex], next[to]] = [next[to], next[selectedIndex]]
    onChange(next)
    setSelectedIndex(to)
  }
  const remove = () =>
    setQuestion({
      title: 'Remove Objective',
      message: `Remove ${selected.title || selected.id}? Conversations and challenge objects that set objective.${selected.id} will set a flag nothing shows.`,
      confirmLabel: 'Remove',
    })
  const confirmRemove = () => {
    onChange(objectives.filter((_, at) => at !== selectedIndex))
    setSelectedIndex(objectives.length > 1 ? Math.max(0, selectedIndex - 1) : null)
    setQuestion(null)
  }

  return (
    <div className="ce-screen">
      <div className="ce-toolbar">
        <button type="button" className="ce-button" onClick={onBack}>
          Back to Map
        </button>
        <button type="button" className="ce-button" onClick={add}>
          Add Objective
        </button>
        <span className="ce-text">
          Objectives of {mapName || 'the open map'}. Changes are part of the map: Save the map to keep them.
        </span>
      </div>
      <div className="ce-body">
        <div className="oe-list">
          {objectives.map((objective, index) => (
            <button key={index} type="button" className={`oe-item${index === selectedIndex ? ' is-selected' : ''}`} onClick={() => setSelectedIndex(index)}>
              <span className="oe-item-title">
                O{index + 1} · {objective.title || objective.id || 'Untitled'}
              </span>
              <span className="oe-item-meta">
                {objective.id}
                {objective.objectId ? ` · on ${objective.objectId}` : objective.position ? ` · at ${objective.position.x}, ${objective.position.y}` : ''}
                {conditionCount(objective.activeWhen) ? ' · auto start' : ''}
                {conditionCount(objective.completeWhen) ? ' · auto complete' : ''}
              </span>
            </button>
          ))}
          {!objectives.length && <p className="ce-text">No objectives yet. Add Objective makes one.</p>}
        </div>
        <div className="oe-detail">
          {selected ? (
            <div className="ce-inspector">
              <div className="ce-row">
                <span className="ce-heading">Objective O{selectedIndex + 1}</span>
                <button type="button" className="ce-button is-small" disabled={selectedIndex === 0} onClick={() => move(-1)}>
                  Move Up
                </button>
                <button type="button" className="ce-button is-small" disabled={selectedIndex === objectives.length - 1} onClick={() => move(1)}>
                  Move Down
                </button>
                <button type="button" className="ce-button is-small" onClick={remove}>
                  Remove
                </button>
              </div>
              <label className="ce-field">
                <span className="ce-field-label">Id (its flag is objective.{selected.id || '<id>'})</span>
                <input className="ce-input" value={selected.id} onChange={(event) => update({ id: idText(event.target.value) })} />
              </label>
              <label className="ce-field">
                <span className="ce-field-label">Title (the Objectives panel and the Captain&apos;s Log)</span>
                <input className="ce-input" value={selected.title} onChange={(event) => update({ title: event.target.value })} />
              </label>
              <label className="ce-field">
                <span className="ce-field-label">Description (the Captain&apos;s Log, under the title)</span>
                <textarea className="ce-input" rows={4} value={selected.description} onChange={(event) => update({ description: event.target.value })} />
              </label>
              <span className="ce-field-label">Marked on (the minimap marks it while active)</span>
              <LinkField objective={selected} objects={objects} onChange={update} />
              {!selected.objectId && <LocationFields objective={selected} width={width} height={height} onChange={update} onPick={() => onPick(selectedIndex)} />}
              <span className="ce-field-label">Active when (all hold; none: only actions start it)</span>
              <ConditionsEditor conditions={selected.activeWhen ?? []} onChange={(activeWhen) => update({ activeWhen })} />
              <span className="ce-field-label">Complete when (all hold; none: only actions complete it)</span>
              <ConditionsEditor conditions={selected.completeWhen ?? []} onChange={(completeWhen) => update({ completeWhen })} />
              <p className="ce-text">
                Conversations (Set Objective) and challenge objects (setFlag objective.{selected.id || '<id>'}) can also start or complete it. A fight sets defeated.&lt;npc id&gt; for each NPC
                it leaves down or surrendered.
              </p>
            </div>
          ) : (
            <p className="ce-text">Select an objective on the left, or Add Objective.</p>
          )}
          <p className="ce-heading">Warnings</p>
          {warnings.length ? (
            <ul className="ce-warnings">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="ce-text">None</p>
          )}
        </div>
      </div>
      {question && <ConfirmDialog title={question.title} message={question.message} confirmLabel={question.confirmLabel} onConfirm={confirmRemove} onCancel={() => setQuestion(null)} />}
    </div>
  )
}
