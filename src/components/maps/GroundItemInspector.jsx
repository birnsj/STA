import { getItemById } from '../../rules/equipment.js'
import { snapItemPosition } from '../../rules/inventory.js'
import { tileSurfaceAt, zOf } from '../../rules/placement.js'
import { getTile } from '../../maps/mapFormat.js'
import { PropertySection } from './PropertySections.jsx'

function supportLabel(map, entry) {
  if (!entry.on) return 'Floor'
  if (entry.on.tile) {
    const [x, y] = entry.on.tile
    const tileId = map?.tiles?.[y]?.[x]
    const label = tileId ? getTile(tileId).label : 'tile'
    return `${label} at ${x}, ${y}`
  }
  if (entry.on.placement) {
    const parent = (map?.groundItemPlacements ?? []).find((item) => item.id === entry.on.placement)
    const def = parent ? getItemById(parent.itemId) : null
    return parent ? `${def?.name ?? parent.itemId} (${parent.id})` : entry.on.placement
  }
  return 'Floor'
}

function derivedZ(map, entry) {
  if (!entry.on) return 0
  if (entry.on.tile) {
    const surface = tileSurfaceAt(map, { x: entry.on.tile[0], y: entry.on.tile[1] })
    return surface?.topZ ?? 0
  }
  const support = entry.on.placement
    ? { kind: 'item', instanceId: entry.on.placement }
    : entry.on.tile
      ? { kind: 'tile', tile: { x: entry.on.tile[0], y: entry.on.tile[1] } }
      : null
  if (!support) return 0
  const groundItems = {}
  const itemInstances = {}
  for (const item of map.groundItemPlacements ?? []) {
    itemInstances[item.id] = { id: item.id, itemId: item.itemId, quantity: 1 }
    groundItems[item.id] = {
      instanceId: item.id,
      position: item.position,
      ...(item.on?.tile
        ? { support: { kind: 'tile', tile: { x: item.on.tile[0], y: item.on.tile[1] } } }
        : item.on?.placement
          ? { support: { kind: 'item', instanceId: item.on.placement } }
          : {}),
    }
  }
  return zOf({ party: { map }, groundItems, itemInstances }, groundItems[entry.id])
}

// Map editor panel for an authored ground inventory placement (mapFormat.js groundItemPlacements).
export default function GroundItemInspector({ object, map, moving, onChange, onMove, onDuplicate, onDelete }) {
  const def = getItemById(object.itemId)
  const pos = object.position
  const z = derivedZ(map, object)
  const commitCoord = (axis, raw) => {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    const next = snapItemPosition({ ...pos, [axis]: n })
    onChange({ position: next })
  }
  return (
    <div className="me-inspector">
      <PropertySection id="ground-item" title={`Inventory Object · ${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}`}>
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
          step={0.03125}
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
          step={0.03125}
          defaultValue={pos.y}
          key={`y-${object.id}-${pos.y}`}
          onBlur={(event) => commitCoord('y', event.target.value)}
        />
      </label>
      <p className="me-text">
        Elevation Z: <strong>{z}</strong> (derived from support; not editable)
      </p>
      <p className="me-text">
        On: <strong>{supportLabel(map, object)}</strong>
      </p>
      <label className="me-check">
        <input type="checkbox" checked={object.pickable !== false} onChange={(event) => onChange({ pickable: event.target.checked ? null : false })} />
        Pickable
      </label>
      <label className="me-check">
        <input type="checkbox" checked={object.visible !== false} onChange={(event) => onChange({ visible: event.target.checked ? null : false })} />
        Visible
      </label>
      <p className="me-text">
        {moving ? 'Click a free floor or surface cell to move it there (Escape cancels).' : 'Delete key removes it; Ctrl+D duplicates.'}
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
      </PropertySection>
    </div>
  )
}
