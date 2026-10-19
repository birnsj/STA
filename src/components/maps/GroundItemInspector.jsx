import { getItemById } from '../../rules/equipment.js'
import { snapItemPosition } from '../../rules/inventory.js'

// Map editor panel for an authored ground inventory placement (mapFormat.js groundItemPlacements).
export default function GroundItemInspector({ object, moving, onChange, onMove, onDuplicate, onDelete }) {
  const def = getItemById(object.itemId)
  const pos = object.position
  const commitCoord = (axis, raw) => {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    const next = snapItemPosition({ ...pos, [axis]: n })
    onChange({ position: next })
  }
  return (
    <div className="me-inspector">
      <p className="me-heading">
        Inventory Object · {pos.x.toFixed(3)}, {pos.y.toFixed(3)}
      </p>
      <p className="me-text">
        Instance ID: <strong>{object.id}</strong>
      </p>
      <p className="me-text">
        Item type: <strong>{def?.name ?? object.itemId}</strong> ({object.itemId})
      </p>
      <label className="me-field">
        Display name
        <input
          className="me-name me-wide"
          value={object.name ?? ''}
          placeholder={def?.name ?? object.itemId}
          onChange={(event) => onChange({ name: event.target.value.trim() ? event.target.value : null })}
        />
      </label>
      <label className="me-field">
        Position X
        <input
          className="me-name me-wide"
          type="number"
          step={0.125}
          defaultValue={pos.x}
          key={`x-${object.id}-${pos.x}`}
          onBlur={(event) => commitCoord('x', event.target.value)}
        />
      </label>
      <label className="me-field">
        Position Y
        <input
          className="me-name me-wide"
          type="number"
          step={0.125}
          defaultValue={pos.y}
          key={`y-${object.id}-${pos.y}`}
          onBlur={(event) => commitCoord('y', event.target.value)}
        />
      </label>
      <label className="me-check">
        <input type="checkbox" checked={object.pickable !== false} onChange={(event) => onChange({ pickable: event.target.checked ? null : false })} />
        Pickable
      </label>
      <label className="me-check">
        <input type="checkbox" checked={object.visible !== false} onChange={(event) => onChange({ visible: event.target.checked ? null : false })} />
        Visible
      </label>
      <p className="me-text">
        {moving ? 'Click a free floor cell to move it there (Escape cancels).' : 'Delete key removes it; Ctrl+D duplicates.'}
      </p>
      <button type="button" className="me-button" aria-pressed={moving} onClick={onMove}>
        {moving ? 'Cancel' : 'Move on Map'}
      </button>
      <button type="button" className="me-button" onClick={onDuplicate}>
        Duplicate
      </button>
      <button type="button" className="me-button" onClick={onDelete}>
        Delete
      </button>
    </div>
  )
}
