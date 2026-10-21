import EditorFloatWindow from './EditorFloatWindow.jsx'

// Floating Levels window — layout placeholder until elevation stacking is implemented.

const LEVELS = [
  { id: 'l0', label: 'L0 Floor' },
  { id: 'l1', label: 'L1 Low' },
  { id: 'l2', label: 'L2 Mid' },
  { id: 'l3', label: 'L3 High' },
]

export default function EditorLevelsWindow({ open, onClose, onBusyChange }) {
  return (
    <EditorFloatWindow title="Levels" open={open} onClose={onClose} onBusyChange={onBusyChange} x={260} y={96} width={200}>
      <div className="ed-level-thumbs">
        {LEVELS.map((level) => (
          <button key={level.id} type="button" className="me-button" disabled title="Elevation stacking deferred">
            {level.label}
          </button>
        ))}
      </div>
      <p className="me-text is-muted">Elevation stacking deferred.</p>
    </EditorFloatWindow>
  )
}
