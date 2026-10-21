import EditorFloatWindow from './EditorFloatWindow.jsx'

// Floating Layers window — layout placeholder until authoring layers are implemented.

const LAYERS = ['Ground / Floors', 'Walls / Structure', 'Furniture / Scenery', 'NPCs / Characters', 'Markers / Triggers']

export default function EditorLayersWindow({ open, onClose, onBusyChange }) {
  return (
    <EditorFloatWindow title="Layers" open={open} onClose={onClose} onBusyChange={onBusyChange} x={24} y={96} width={220}>
      <ul className="ed-layer-list" aria-disabled="true">
        {LAYERS.map((label) => (
          <li key={label}>
            <label className="me-check">
              <input type="checkbox" checked disabled />
              {label}
            </label>
          </li>
        ))}
      </ul>
      <p className="me-text is-muted">Visibility and lock controls come in a later phase.</p>
    </EditorFloatWindow>
  )
}
