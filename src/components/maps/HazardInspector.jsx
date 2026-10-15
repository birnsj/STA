import { HAZARD_TYPES, THICK_INTENSITY } from '../../world/environment.js'
import { OverrideField } from './DestructibleInspector.jsx'

// The map editor's panel for a hazard region (mapFormat.js hazards): its type and tiles, an intensity for the whole
// region, and overrides of the type's severity, spread and dissipate chances (percent per tile per round) and the
// Difficulty of the task that neutralizes it.
export default function HazardInspector({ region, onChange, onDelete }) {
  const info = HAZARD_TYPES[region.type]
  const intensities = Object.values(region.tiles)
  const uniform = intensities.every((value) => value === intensities[0]) ? intensities[0] : ''
  return (
    <div className="me-inspector">
      <p className="me-heading">Hazard · {region.id}</p>
      <p className="me-text">
        <strong>{info.name}</strong>: {intensities.length} tile{intensities.length === 1 ? '' : 's'}, {info.injuryType === 'stun' ? 'Stun' : 'Deadly'} Injury each round to
        whoever stands in it.
        {info.blocksSight ? ` Blocks sight at intensity ${THICK_INTENSITY} or more; thinner gives cover.` : ''}
      </p>
      <label className="me-field">
        Intensity (whole region)
        <select className="me-name me-wide" value={uniform} onChange={(event) => onChange({ intensity: Number(event.target.value) })}>
          {uniform === '' && <option value="">Mixed</option>}
          <option value={1}>1 · Thin</option>
          <option value={2}>2 · Thick</option>
          <option value={3}>3 · Dense</option>
        </select>
      </label>
      <OverrideField label="Severity" value={region.severity} fallback={info.severity} min={0} max={10} onChange={(severity) => onChange({ severity })} />
      <OverrideField label="Duration (rounds; blank: until it dissipates)" value={region.duration} fallback={null} min={1} max={99} onChange={(duration) => onChange({ duration })} />
      <label className="me-check">
        <input type="checkbox" checked={region.active !== false} onChange={(event) => onChange({ active: event.target.checked })} />
        Active from the start
      </label>
      <label className="me-check">
        <input type="checkbox" checked={region.spread !== false} onChange={(event) => onChange({ spread: event.target.checked })} />
        Spreads
      </label>
      {region.spread !== false && (
        <OverrideField label="Spread chance %" value={region.spreadChance} fallback={info.spreadChance} max={100} onChange={(spreadChance) => onChange({ spreadChance })} />
      )}
      <label className="me-check">
        <input type="checkbox" checked={region.dissipateChance !== 0} onChange={(event) => onChange({ dissipateChance: event.target.checked ? null : 0 })} />
        Dissipates
      </label>
      {region.dissipateChance !== 0 && (
        <OverrideField label="Dissipate chance %" value={region.dissipateChance} fallback={info.dissipateChance} min={1} max={100} onChange={(dissipateChance) => onChange({ dissipateChance })} />
      )}
      <label className="me-check">
        <input type="checkbox" checked={region.neutralizable !== false} onChange={(event) => onChange({ neutralizable: event.target.checked })} />
        Can be neutralized ({info.neutralize.label})
      </label>
      {region.neutralizable !== false && (
        <OverrideField
          label={`${info.neutralize.label} Difficulty`}
          value={region.neutralizeDifficulty}
          fallback={info.neutralize.difficulty}
          max={5}
          onChange={(neutralizeDifficulty) => onChange({ neutralizeDifficulty })}
        />
      )}
      <p className="me-text">Paint next to it with the same hazard to grow it; Erase Hazard trims it (a region cut in two becomes two).</p>
      <button type="button" className="me-button" onClick={onDelete}>
        Delete Region
      </button>
    </div>
  )
}
