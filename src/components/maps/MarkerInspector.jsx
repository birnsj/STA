import { FACINGS, snapFacing } from '../../maps/facing.js'
import { Field } from './NpcInspector.jsx'

// The map editor's inspector for the selected player start or enemy spawn: its facing, or Default (toward the middle of
// the map, as unturned starts and spawns have always faced). marker: { kind: 'playerStarts' | 'enemySpawns', label,
// x, y, facing }. defaultFacing: the way Default faces here, in degrees.
export default function MarkerInspector({ marker, defaultFacing, onFacing, onDelete }) {
  const kindName = marker.kind === 'playerStarts' ? 'Player Start' : 'Enemy Spawn'
  const defaultLabel = FACINGS.find((entry) => entry.degrees === snapFacing(defaultFacing))?.label
  return (
    <div className="me-inspector">
      <p className="me-heading">
        {kindName} {marker.label} &middot; {marker.x}, {marker.y}
      </p>
      <Field label="Facing">
        <select
          className="me-select me-wide"
          value={marker.facing == null ? '' : snapFacing(marker.facing)}
          onChange={(event) => onFacing(event.target.value === '' ? null : Number(event.target.value))}
        >
          <option value="">Default: toward the middle ({defaultLabel})</option>
          {FACINGS.map((entry) => (
            <option key={entry.degrees} value={entry.degrees}>
              {entry.degrees}° {entry.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="me-text">Right click on the map also turns it. Move (toolbar) drags it to another tile.</p>
      <div className="me-inspector-actions">
        <button type="button" className="me-button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}
