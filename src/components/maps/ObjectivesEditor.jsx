// The map's objectives (mapFormat.js objectives): an id that conversations and challenge objects use to set it active
// or complete (the mission flag objective.{id}), a title the Objectives panel shows, a description the Captain's
// Log shows under it, an optional map position the exploration minimap marks while it is active, and optional
// activeWhen / completeWhen flag conditions that move it by themselves (missionObjectives.js).
// placingIndex: the objective whose position the next map click sets (or null); onPlace(index or null) starts or
// cancels that.
import '../conversation/conversationEditor.css'
import { ConditionsEditor } from '../conversation/ConversationFields.jsx'

const freshId = (objectives) => {
  const used = new Set(objectives.map((objective) => objective.id))
  let index = objectives.length + 1
  while (used.has(`objective${index}`)) index += 1
  return `objective${index}`
}
const idText = (text) => text.replace(/[^A-Za-z0-9_-]/g, '')

export default function ObjectivesEditor({ objectives, onChange, placingIndex = null, onPlace }) {
  const update = (index, changes) => onChange(objectives.map((objective, at) => (at === index ? { ...objective, ...changes } : objective)))
  const remove = (index) => {
    if (placingIndex !== null) onPlace(null)
    onChange(objectives.filter((_, at) => at !== index))
  }
  return (
    <div className="me-objectives">
      {objectives.map((objective, index) => (
        <div key={index} className="me-objective">
          <input className="me-name me-wide" value={objective.id} aria-label="Objective id" title="Id (the flag objective.<id>)" onChange={(event) => update(index, { id: idText(event.target.value) })} />
          <input className="me-name me-wide" value={objective.title} placeholder="Title shown in exploration" aria-label="Objective title" onChange={(event) => update(index, { title: event.target.value })} />
          <textarea className="me-name me-wide" rows={2} value={objective.description} placeholder="Description" aria-label="Objective description" onChange={(event) => update(index, { description: event.target.value })} />
          <p className="me-text">
            {placingIndex === index
              ? 'Click a tile on the map to mark this objective.'
              : objective.position
                ? `Minimap marker O${index + 1} at ${objective.position.x}, ${objective.position.y}.`
                : 'No minimap marker.'}
          </p>
          <p className="me-text">Active when (all hold; none: only actions start it)</p>
          <ConditionsEditor conditions={objective.activeWhen ?? []} onChange={(activeWhen) => update(index, { activeWhen })} />
          <p className="me-text">Complete when (all hold; none: only actions complete it)</p>
          <ConditionsEditor conditions={objective.completeWhen ?? []} onChange={(completeWhen) => update(index, { completeWhen })} />
          <button type="button" className="me-button" aria-pressed={placingIndex === index} onClick={() => onPlace(placingIndex === index ? null : index)}>
            {placingIndex === index ? 'Cancel' : objective.position ? 'Move on Map' : 'Place on Map'}
          </button>
          {objective.position && (
            <button type="button" className="me-button" onClick={() => update(index, { position: null })}>
              Clear Location
            </button>
          )}
          <button type="button" className="me-button" onClick={() => remove(index)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="me-button me-generate" onClick={() => onChange([...objectives, { id: freshId(objectives), title: '', description: '', position: null, activeWhen: [], completeWhen: [] }])}>
        Add Objective
      </button>
    </div>
  )
}
