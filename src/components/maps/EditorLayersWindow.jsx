import EditorFloatWindow from './EditorFloatWindow.jsx'
import { LAYER_IDS, LAYER_LABELS } from '../../maps/layers.js'

// Floating Layers window: active layer, visibility and lock. UI state only — never written to the map file.

export default function EditorLayersWindow({ open, onClose, onBusyChange, layers, setActive, toggleVisible, toggleLocked }) {
  const state = layers ?? { active: 'ground', visible: {}, locked: {} }
  return (
    <EditorFloatWindow title="Layers" open={open} onClose={onClose} onBusyChange={onBusyChange} x={24} y={96} width={280}>
      <div className="ed-layer-head">
        <span className="ed-layer-col-name">Layer</span>
        <span className="ed-layer-col-vis" title="Visible on the board">
          Vis
        </span>
        <span className="ed-layer-col-lock" title="Locked layers cannot be edited">
          Lock
        </span>
      </div>
      <ul className="ed-layer-list" role="listbox" aria-label="Authoring layers">
        {LAYER_IDS.map((id) => {
          const active = state.active === id
          const visible = state.visible?.[id] !== false
          const locked = Boolean(state.locked?.[id])
          return (
            <li key={id} className={`ed-layer-row${active ? ' is-active' : ''}${!visible ? ' is-hidden' : ''}${locked ? ' is-locked' : ''}`}>
              <button
                type="button"
                className="ed-layer-name"
                role="option"
                aria-selected={active}
                onClick={() => setActive?.(id)}
                title="Make this the active layer (selection priority and tool context)"
              >
                {LAYER_LABELS[id]}
                {active ? <span className="ed-layer-active-tag">Active</span> : null}
              </button>
              <label className="me-check ed-layer-eye" title={visible ? 'Hide on board' : 'Show on board'}>
                <input type="checkbox" checked={visible} onChange={() => toggleVisible?.(id)} aria-label={`${LAYER_LABELS[id]} visible`} />
              </label>
              <label className="me-check ed-layer-lock" title={locked ? 'Unlock for editing' : 'Lock against edits'}>
                <input type="checkbox" checked={locked} onChange={() => toggleLocked?.(id)} aria-label={`${LAYER_LABELS[id]} locked`} />
              </label>
            </li>
          )
        })}
      </ul>
      <p className="me-text is-muted">
        Click a name to make it active. Vis hides it on the board; Lock blocks paint and select.
      </p>
    </EditorFloatWindow>
  )
}
