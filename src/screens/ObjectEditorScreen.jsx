import { useState } from 'react'
import '../components/conversation/conversationEditor.css'
import ConfirmDialog from '../components/maps/ConfirmDialog.jsx'
import IdInput from '../components/maps/IdInput.jsx'
import ObjectActionFields from '../components/maps/ObjectActionFields.jsx'
import data from '../data/adaptation/exploration/challenges.json'
import { definitionProblemsFor } from '../exploration/challengeObjects.js'
import { TILES } from '../maps/mapFormat.js'
import { createAction, createObject, editableObjects, freshId, moveObject, objectWarnings, renameAction, renameObjectInObjectives, renameState, withObjects } from '../world/objectAuthoring.js'

// Dev challenge object editor (opened from the map editor): the open map's challenge objects listed on the left, the
// selected one edited on the right with its states and actions. Edits go into the map (map.objects), so the map
// editor's Save keeps them; a map that has none of its own starts from challenges.json's for its file name.
// map, onChange(map): the map being edited. initialId: the object selected on opening. onBack(): back to the map.
const clamp = (value, limit) => Math.min(limit - 1, Math.max(0, Math.round(Number(value) || 0)))

function StatesEditor({ object, onChange }) {
  const entries = Object.entries(object.states)
  const setState = (id, changes) => onChange({ ...object, states: { ...object.states, [id]: { ...object.states[id], ...changes } } })
  const removeState = (id) => onChange({ ...object, states: Object.fromEntries(entries.filter(([other]) => other !== id)) })
  const addState = () => onChange({ ...object, states: { ...object.states, [freshId(Object.keys(object.states), 'state')]: { label: '', description: '' } } })
  return (
    <div className="ce-list">
      {entries.map(([id, state], index) => (
        <div key={index} className="ce-row is-action">
          <IdInput className="ce-input ce-flag" label="State id" value={id} taken={(next) => Boolean(object.states[next])} onChange={(next) => onChange(renameState(object, id, next))} />
          <input className="ce-input" value={state.label ?? ''} placeholder="Label" onChange={(event) => setState(id, { label: event.target.value })} />
          <input className="ce-input oe-long" value={state.description ?? ''} placeholder="Description (the interaction panel)" onChange={(event) => setState(id, { description: event.target.value })} />
          <input className="ce-input ce-flag" list="oe-tiles" value={state.tile ?? ''} placeholder="tile (map's own)" onChange={(event) => setState(id, { tile: event.target.value.trim() || undefined })} />
          <button type="button" className="ce-button is-small" aria-label="Remove state" disabled={entries.length < 2} onClick={() => removeState(id)}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="ce-button is-small" onClick={addState}>
        + State
      </button>
    </div>
  )
}

function ObjectFields({ object, map, otherIds, onChange }) {
  const set = (changes) => onChange({ ...object, ...changes })
  const [x, y] = object.position
  return (
    <>
      <div className="ce-row">
        <label className="ce-field">
          <span className="ce-field-label">Id (objectives marked on it follow a rename; conversations that name it don&apos;t)</span>
          <IdInput value={object.id} label="Object id" taken={(next) => otherIds.includes(next)} onChange={(id) => set({ id })} />
        </label>
        <label className="ce-field">
          <span className="ce-field-label">Name</span>
          <input className="ce-input" value={object.name} onChange={(event) => set({ name: event.target.value })} />
        </label>
        <label className="ce-field">
          <span className="ce-field-label">Type</span>
          <input className="ce-input" value={object.type ?? ''} onChange={(event) => set({ type: event.target.value.trim() })} />
        </label>
      </div>
      <div className="ce-row">
        <label className="ce-toolbar-field">
          X
          <input className="ce-input ce-number" type="number" min={0} max={map.width - 1} value={x} onChange={(event) => onChange(moveObject(object, [clamp(event.target.value, map.width), y]))} />
        </label>
        <label className="ce-toolbar-field">
          Y
          <input className="ce-input ce-number" type="number" min={0} max={map.height - 1} value={y} onChange={(event) => onChange(moveObject(object, [x, clamp(event.target.value, map.height)]))} />
        </label>
        <label className="ce-toolbar-field">
          Also covers
          <input
            className="ce-input ce-flag"
            value={(object.covers ?? []).map((tile) => tile.join(',')).join(' ')}
            placeholder="x,y x,y"
            onChange={(event) => {
              const covers = event.target.value
                .split(/\s+/)
                .map((pair) => pair.split(',').map(Number))
                .filter((pair) => pair.length === 2 && pair.every(Number.isFinite))
              set({ covers: covers.length ? covers : undefined })
            }}
          />
        </label>
        <label className="ce-toolbar-field">
          Starts
          <select className="ce-input" value={object.state} onChange={(event) => set({ state: event.target.value })}>
            {!object.states[object.state] && <option value={object.state}>{object.state || '(none)'}</option>}
            {Object.entries(object.states).map(([id, state]) => (
              <option key={id} value={id}>
                {state.label || id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <span className="ce-field-label">States (a tile replaces the map&apos;s tile there while in that state)</span>
      <StatesEditor object={object} onChange={onChange} />
    </>
  )
}

export default function ObjectEditorScreen({ map, onChange, initialId = null, onBack }) {
  const objects = editableObjects(map)
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, objects.findIndex((object) => object.id === initialId)))
  const [actionIndex, setActionIndex] = useState(0)
  const [question, setQuestion] = useState(null)
  const selected = objects[selectedIndex] ?? null
  const action = selected?.actions[actionIndex] ?? null
  const warnings = [...definitionProblemsFor(map), ...objectWarnings(objects, map)]
  const fallback = data.maps[map.id] ?? data.maps[map.name] ?? null

  const commit = (next, changes = {}) => onChange({ ...withObjects(map, next), ...changes })
  const updateObject = (object) => {
    const next = objects.map((other, at) => (at === selectedIndex ? object : other))
    const renamed = selected && object.id !== selected.id
    commit(next, renamed ? { objectives: renameObjectInObjectives(map.objectives ?? [], selected.id, object.id) } : {})
  }
  const select = (index) => {
    setSelectedIndex(index)
    setActionIndex(0)
  }
  const add = () => {
    const object = createObject(objects, map)
    commit([...objects, object])
    select(objects.length)
  }
  const addAction = () => {
    updateObject({ ...selected, actions: [...selected.actions, createAction(selected)] })
    setActionIndex(selected.actions.length)
  }
  const moveAction = (step) => {
    const to = actionIndex + step
    const actions = [...selected.actions]
    ;[actions[actionIndex], actions[to]] = [actions[to], actions[actionIndex]]
    updateObject({ ...selected, actions })
    setActionIndex(to)
  }
  const ask = (title, message, confirmLabel, run) => setQuestion({ title, message, confirmLabel, run })
  const removeObject = () =>
    ask('Remove Object', `Remove ${selected.name || selected.id}? Objectives marked on it and conversations that change it will point at nothing.`, 'Remove', () => {
      commit(objects.filter((_, at) => at !== selectedIndex))
      select(Math.max(0, selectedIndex - 1))
    })
  const removeAction = () =>
    ask('Remove Action', `Remove ${action.label || action.id}?`, 'Remove', () => {
      updateObject({ ...selected, actions: selected.actions.filter((_, at) => at !== actionIndex) })
      setActionIndex(Math.max(0, actionIndex - 1))
    })
  const useFallback = () =>
    ask('Use challenges.json', `Throw away this map's own objects and use the ones challenges.json has for ${map.id ?? map.name}?`, 'Use challenges.json', () => {
      onChange({ ...map, objects: null })
      select(0)
    })

  return (
    <div className="ce-screen">
      <div className="ce-toolbar">
        <button type="button" className="ce-button" onClick={onBack}>
          Back to Map
        </button>
        <button type="button" className="ce-button" onClick={add}>
          Add Object
        </button>
        {map.objects && fallback && (
          <button type="button" className="ce-button" onClick={useFallback}>
            Use challenges.json
          </button>
        )}
        <span className="ce-text">
          Challenge objects of {map.name || 'the open map'}.{' '}
          {map.objects ? 'They are part of the map: Save the map to keep them.' : fallback ? 'From challenges.json until you change something here; then they are saved with the map.' : 'Changes are part of the map: Save the map to keep them.'}
        </span>
      </div>
      <datalist id="oe-tiles">
        {TILES.map((tile) => (
          <option key={tile.id} value={tile.id} />
        ))}
      </datalist>
      <div className="ce-body">
        <div className="oe-list">
          {objects.map((object, index) => (
            <button key={index} type="button" className={`oe-item${index === selectedIndex ? ' is-selected' : ''}`} onClick={() => select(index)}>
              <span className="oe-item-title">{object.name || object.id || 'Unnamed'}</span>
              <span className="oe-item-meta">
                {object.id} · {object.type} · at {object.position[0]}, {object.position[1]} · {object.actions.length} action{object.actions.length === 1 ? '' : 's'}
              </span>
            </button>
          ))}
          {!objects.length && <p className="ce-text">No challenge objects yet. Add Object makes one.</p>}
        </div>
        <div className="oe-detail oe-wide">
          {selected ? (
            <div className="ce-inspector">
              <div className="ce-row">
                <span className="ce-heading">{selected.name || selected.id}</span>
                <button type="button" className="ce-button is-small" onClick={removeObject}>
                  Remove Object
                </button>
              </div>
              <ObjectFields key={selectedIndex} object={selected} map={map} otherIds={objects.filter((_, at) => at !== selectedIndex).map((object) => object.id)} onChange={updateObject} />
              <span className="ce-heading">Actions</span>
              <div className="ce-row">
                {selected.actions.map((entry, index) => (
                  <button key={index} type="button" className={`ce-button is-small${index === actionIndex ? ' is-active' : ''}`} onClick={() => setActionIndex(index)}>
                    {entry.label || entry.id || 'Untitled'}
                  </button>
                ))}
                <button type="button" className="ce-button is-small" onClick={addAction}>
                  + Action
                </button>
              </div>
              {action && (
                <>
                  <div className="ce-row">
                    <button type="button" className="ce-button is-small" disabled={actionIndex === 0} onClick={() => moveAction(-1)}>
                      Move Left
                    </button>
                    <button type="button" className="ce-button is-small" disabled={actionIndex === selected.actions.length - 1} onClick={() => moveAction(1)}>
                      Move Right
                    </button>
                    <button type="button" className="ce-button is-small" onClick={removeAction}>
                      Remove Action
                    </button>
                  </div>
                  <ObjectActionFields
                    key={`${selectedIndex}:${actionIndex}`}
                    action={action}
                    object={selected}
                    onChange={(next) => updateObject({ ...selected, actions: selected.actions.map((other, at) => (at === actionIndex ? next : other)) })}
                    onRename={(to) => updateObject(renameAction(selected, action.id, to))}
                  />
                </>
              )}
            </div>
          ) : (
            <p className="ce-text">Select an object on the left, or Add Object.</p>
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
      {question && (
        <ConfirmDialog
          title={question.title}
          message={question.message}
          confirmLabel={question.confirmLabel}
          onConfirm={() => {
            question.run()
            setQuestion(null)
          }}
          onCancel={() => setQuestion(null)}
        />
      )}
    </div>
  )
}
