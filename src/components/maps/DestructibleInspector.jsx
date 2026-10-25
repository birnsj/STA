import {
  DESTRUCTIBLE_STATES,
  DESTRUCTIBLE_TYPES,
  EXPLOSION_KINDS,
  HAZARD_TYPES,
  OBJECT_ATTACK_DIFFICULTY,
} from '../../world/environment.js'
import { PropertySection } from './PropertySections.jsx'

// A number box for an override: blank goes back to the type's value (shown as the placeholder).
export function OverrideField({ label, value, fallback, min = 0, max = 20, onChange }) {
  return (
    <label className="me-field">
      {label}
      <input
        className="me-name me-wide"
        type="number"
        min={min}
        max={max}
        value={value ?? ''}
        placeholder={fallback == null ? 'none (type)' : `${fallback} (type)`}
        onChange={(event) => onChange(event.target.value === '' ? null : Math.min(max, Math.max(min, Math.round(Number(event.target.value)))))}
      />
    </label>
  )
}

// A drop-down for an override: the first option goes back to the type's value.
export function OverrideSelect({ label, value, fallbackLabel, options, onChange }) {
  return (
    <label className="me-field">
      {label}
      <select className="me-name me-wide" value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}>
        <option value="">{fallbackLabel} (type)</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

const STATE_LABELS = { intact: 'Intact', damaged: 'Damaged', destroyed: 'Destroyed' }
const INJURY_OPTIONS = [
  { value: 'deadly', label: 'Deadly' },
  { value: 'stun', label: 'Stun' },
]
// "None" forces no leftover hazard even when the type leaves one; blank in OverrideSelect keeps the type's value.
const HAZARD_OPTIONS = [{ value: 'none', label: 'None' }, ...Object.entries(HAZARD_TYPES).map(([value, info]) => ({ value, label: info.name }))]
const capitalised = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// The map editor's panel for a destructible object (mapFormat.js destructibles): its type, id and name, Structure
// (Durability) and Resistance, the state it starts in, whether it can be attacked, what its explosion does and leaves
// behind, the tiles it controls (a force field), Move, Duplicate and Delete. Every field left blank keeps the type's value.
export default function DestructibleInspector({ object, moving, linking, onChange, onMove, onLink, onDuplicate, onDelete }) {
  const info = DESTRUCTIBLE_TYPES[object.type]
  if (!info) {
    return (
      <div className="me-inspector">
        <PropertySection id="destructible" title={`Destructible · ${object.position.x}, ${object.position.y}`}>
          <p className="me-text">
            <strong>Unknown destructible type “{object.type || '(blank)'}”.</strong> This object is preserved but cannot be edited or used in play.
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
  const typeExplosion = info.explosion ?? {}
  const overrides = object.explosion ?? {}
  const setExplosion = (field, value) => {
    const next = { ...overrides, [field]: value }
    if (value === null) delete next[field]
    onChange({ explosion: Object.keys(next).length ? next : null })
  }
  const hazardName = (type) => (type ? (HAZARD_TYPES[type]?.name ?? type) : 'none')
  const linked = object.linkedTiles ?? []
  return (
    <div className="me-inspector">
      <PropertySection id="destructible" title={`Destructible · ${object.position.x}, ${object.position.y}`}>
        <p className="me-text">
          <strong>{object.name || info.name}</strong> ({object.id}, {info.name})
        </p>
        <p className="me-text">{info.description}</p>
        <label className="me-field">
          Name
          <input className="me-name me-wide" value={object.name ?? ''} placeholder={info.name} onChange={(event) => onChange({ name: event.target.value.trim() ? event.target.value : null })} />
        </label>
        <OverrideField label="Durability (Structure)" value={object.structure} fallback={info.structure} min={1} onChange={(structure) => onChange({ structure })} />
        <OverrideField label="Resistance" value={object.resistance} fallback={info.resistance} onChange={(resistance) => onChange({ resistance })} />
        <label className="me-field">
          Starts
          <select className="me-name me-wide" value={object.initialState ?? 'intact'} onChange={(event) => onChange({ initialState: event.target.value === 'intact' ? null : event.target.value })}>
            {DESTRUCTIBLE_STATES.map((state) => (
              <option key={state} value={state}>
                {STATE_LABELS[state] ?? state}
              </option>
            ))}
          </select>
        </label>
        <label className="me-check">
          <input type="checkbox" checked={object.attackable !== false} onChange={(event) => onChange({ attackable: event.target.checked ? null : false })} />
          Can be attacked
        </label>
        <OverrideField
          label="Attack Difficulty"
          value={object.attackDifficulty}
          fallback={OBJECT_ATTACK_DIFFICULTY}
          min={0}
          max={5}
          onChange={(attackDifficulty) => onChange({ attackDifficulty })}
        />
        <OverrideSelect
          label="When damaged, leaks"
          value={object.damagedHazard}
          fallbackLabel={hazardName(info.damagedHazard)}
          options={HAZARD_OPTIONS}
          onChange={(damagedHazard) => onChange({ damagedHazard })}
        />
      </PropertySection>

      <PropertySection id="explosion" title="Explosion" defaultOpen={false}>
        <label className="me-check">
          <input
            type="checkbox"
            checked={object.noExplosion !== true && Boolean(info.explosion)}
            disabled={!info.explosion}
            onChange={(event) => onChange({ noExplosion: event.target.checked ? null : true, explosion: event.target.checked ? object.explosion : null })}
          />
          Explodes when destroyed
        </label>
        {object.noExplosion !== true && info.explosion && (
          <>
            <OverrideSelect
              label="Kind"
              value={overrides.kind}
              fallbackLabel={capitalised(typeExplosion.kind ?? 'none')}
              options={EXPLOSION_KINDS.map((kind) => ({ value: kind, label: capitalised(kind) }))}
              onChange={(kind) => setExplosion('kind', kind)}
            />
            <OverrideField label="Radius" value={overrides.radius} fallback={typeExplosion.radius} max={6} onChange={(radius) => setExplosion('radius', radius)} />
            <OverrideField label="Severity" value={overrides.severity} fallback={typeExplosion.severity} max={10} onChange={(severity) => setExplosion('severity', severity)} />
            <OverrideSelect label="Injury type" value={overrides.injuryType} fallbackLabel={capitalised(typeExplosion.injuryType ?? 'deadly')} options={INJURY_OPTIONS} onChange={(injuryType) => setExplosion('injuryType', injuryType)} />
            <OverrideSelect label="Leaves hazard" value={overrides.hazard} fallbackLabel={hazardName(typeExplosion.hazard)} options={HAZARD_OPTIONS} onChange={(hazard) => setExplosion('hazard', hazard)} />
            <OverrideField label="Hazard radius" value={overrides.hazardRadius} fallback={typeExplosion.hazardRadius} max={6} onChange={(hazardRadius) => setExplosion('hazardRadius', hazardRadius)} />
            <OverrideField label="Hazard intensity" value={overrides.hazardIntensity} fallback={typeExplosion.hazardIntensity ?? 3} min={1} max={3} onChange={(hazardIntensity) => setExplosion('hazardIntensity', hazardIntensity)} />
            <OverrideField label="Hazard duration (rounds)" value={overrides.hazardDuration} fallback={typeExplosion.hazardDuration} min={1} max={99} onChange={(hazardDuration) => setExplosion('hazardDuration', hazardDuration)} />
            <label className="me-check">
              <input type="checkbox" checked={(overrides.hazardSpread ?? typeExplosion.hazardSpread) !== false} onChange={(event) => setExplosion('hazardSpread', event.target.checked ? null : false)} />
              The hazard spreads
            </label>
          </>
        )}
      </PropertySection>

      <PropertySection id="debris" title="Debris" defaultOpen={false}>
        <p className="me-text">
          Type default: {info.debris ? `${info.debris.count}× ${info.debris.tile} (radius ${info.debris.radius})` : 'none'}. Blank fields keep the type.
        </p>
        <label className="me-field">
          Debris tile id
          <input
            className="me-name me-wide"
            value={object.debris?.tile ?? ''}
            placeholder={info.debris?.tile ?? 'none'}
            onChange={(event) => {
              const tile = event.target.value.trim()
              const next = { ...(object.debris ?? {}), tile }
              if (!tile) {
                const { tile: _drop, ...rest } = next
                onChange({ debris: rest.radius != null || rest.count != null ? rest : null })
              } else onChange({ debris: next })
            }}
          />
        </label>
        <OverrideField
          label="Debris radius"
          value={object.debris?.radius}
          fallback={info.debris?.radius}
          max={6}
          onChange={(radius) => {
            const next = { ...(object.debris ?? {}), radius }
            if (radius == null) delete next.radius
            onChange({ debris: next.tile || next.radius != null || next.count != null ? next : null })
          }}
        />
        <OverrideField
          label="Debris count"
          value={object.debris?.count}
          fallback={info.debris?.count}
          max={20}
          onChange={(count) => {
            const next = { ...(object.debris ?? {}), count }
            if (count == null) delete next.count
            onChange({ debris: next.tile || next.radius != null || next.count != null ? next : null })
          }}
        />
      </PropertySection>

      <PropertySection id="linked-tiles" title="Linked tiles">
        <p className="me-text">
          {linked.length ? `${linked.map((tile) => `(${tile.x}, ${tile.y})`).join(', ')}. ` : 'None. '}
          Linked tiles show an active force field (solid) while it stands, and drop to the plain emitter once it is destroyed.
        </p>
        <button type="button" className="me-button" aria-pressed={linking} onClick={onLink}>
          {linking ? 'Done Picking' : 'Pick Linked Tiles'}
        </button>
        <p className="me-text">
          {moving ? 'Click a floor tile to move it there (Escape cancels).' : linking ? 'Click tiles to link or unlink them (Escape stops).' : 'Ctrl+D duplicates it; the toolbar’s Move drags it.'}
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
