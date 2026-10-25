import {
  HAZARD_INJURY_TYPES,
  HAZARD_LAYERS,
  HAZARD_MOVEMENTS,
} from '../../maps/mapFormat.js'
import { HAZARD_TYPES, THICK_INTENSITY, hazardValue } from '../../world/environment.js'
import { OverrideField, OverrideSelect } from './DestructibleInspector.jsx'
import NeutralizeTaskFields from './NeutralizeTaskFields.jsx'
import { PropertySection } from './PropertySections.jsx'

const INJURY_OPTIONS = HAZARD_INJURY_TYPES.map((value) => ({
  value,
  label: value === 'stun' ? 'Stun' : 'Deadly',
}))
const LAYER_OPTIONS = HAZARD_LAYERS.map((value) => ({ value, label: value === 'air' ? 'Air' : 'Floor' }))
const MOVEMENT_OPTIONS = HAZARD_MOVEMENTS.map((value) => ({ value, label: 'Slow' }))
const SCAR_OPTIONS = [
  ...new Set(
    Object.values(HAZARD_TYPES)
      .map((info) => info.scarTile)
      .filter(Boolean),
  ),
].map((value) => ({ value, label: value }))

const capitalised = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : 'none')

// The map editor's panel for a hazard region: type/tiles, intensity, and overrides of type values (hazards.json).
export default function HazardInspector({ region, onChange, onDelete }) {
  const info = HAZARD_TYPES[region.type]
  if (!info) {
    return (
      <div className="me-inspector">
        <PropertySection id="hazard" title={`Hazard · ${region.id}`}>
          <p className="me-text">
            <strong>Unknown hazard type “{region.type || '(blank)'}”.</strong> This region is preserved but cannot be edited or used in play.
          </p>
          <button type="button" className="me-button" onClick={onDelete}>
            Delete Region
          </button>
        </PropertySection>
      </div>
    )
  }
  const intensities = Object.values(region.tiles)
  const uniform = intensities.every((value) => value === intensities[0]) ? intensities[0] : ''
  const effectiveInjury = hazardValue(region, 'injuryType') ?? info.injuryType
  const effectiveBlocks = hazardValue(region, 'blocksSight')
  const effectiveMovement = hazardValue(region, 'movement')
  const effectiveLayer = hazardValue(region, 'layer') ?? 'floor'
  const effectiveScar = hazardValue(region, 'scarTile')
  return (
    <div className="me-inspector">
      <PropertySection id="hazard" title={`Hazard · ${region.id}`}>
        <p className="me-text">
          <strong>{info.name}</strong>: {intensities.length} tile{intensities.length === 1 ? '' : 's'},{' '}
          {effectiveInjury === 'stun' ? 'Stun' : 'Deadly'} Injury each round to whoever stands in it.
          {effectiveBlocks ? ` Blocks sight at intensity ${THICK_INTENSITY} or more; thinner gives cover.` : ''}
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
        <OverrideSelect
          label="Injury type"
          value={region.injuryType}
          fallbackLabel={capitalised(info.injuryType)}
          options={INJURY_OPTIONS}
          onChange={(injuryType) => onChange({ injuryType })}
        />
        <OverrideField
          label="Damages objects (Structure / round)"
          value={region.damagesObjects}
          fallback={info.damagesObjects ?? 0}
          max={10}
          onChange={(damagesObjects) => onChange({ damagesObjects })}
        />
        <OverrideSelect
          label="Blocks sight"
          value={typeof region.blocksSight === 'boolean' ? String(region.blocksSight) : ''}
          fallbackLabel={info.blocksSight ? 'Yes' : 'No'}
          options={[
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' },
          ]}
          onChange={(value) => onChange({ blocksSight: value == null ? null : value === 'true' })}
        />
        <OverrideSelect
          label="Movement"
          value={region.movement ?? ''}
          fallbackLabel={info.movement === 'slow' ? 'Slow' : 'Normal'}
          options={MOVEMENT_OPTIONS}
          onChange={(movement) => onChange({ movement })}
        />
        <OverrideSelect
          label="Layer"
          value={region.layer}
          fallbackLabel={capitalised(info.layer ?? 'floor')}
          options={LAYER_OPTIONS}
          onChange={(layer) => onChange({ layer })}
        />
        <OverrideSelect
          label="Scar tile"
          value={region.scarTile}
          fallbackLabel={effectiveScar || info.scarTile || 'none'}
          options={SCAR_OPTIONS}
          onChange={(scarTile) => onChange({ scarTile })}
        />
        <label className="me-check">
          <input type="checkbox" checked={region.active !== false} onChange={(event) => onChange({ active: event.target.checked })} />
          Active from the start
        </label>
        <label className="me-check">
          <input type="checkbox" checked={region.spread !== false} onChange={(event) => onChange({ spread: event.target.checked })} />
          Spreads
        </label>
        {region.spread !== false && (
          <>
            <OverrideField label="Spread chance %" value={region.spreadChance} fallback={info.spreadChance} max={100} onChange={(spreadChance) => onChange({ spreadChance })} />
            <OverrideField label="Migrate chance %" value={region.migrateChance} fallback={info.migrateChance ?? 0} max={100} onChange={(migrateChance) => onChange({ migrateChance })} />
          </>
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
          Can be neutralized ({region.neutralize?.label || info.neutralize.label})
        </label>
        <p className="me-text">
          Effective: {effectiveInjury} injury · layer {effectiveLayer}
          {effectiveMovement === 'slow' ? ' · slow' : ''}
          {effectiveScar ? ` · scar ${effectiveScar}` : ''}.
        </p>
        <p className="me-text">Paint next to it with the same hazard to grow it; Erase Hazard trims it (a region cut in two becomes two).</p>
        <button type="button" className="me-button" onClick={onDelete}>
          Delete Region
        </button>
      </PropertySection>
      {region.neutralizable !== false && (
        <PropertySection id="neutralize" title="Neutralize task" defaultOpen={false}>
          <NeutralizeTaskFields
            value={
              region.neutralize ||
              (Number.isFinite(region.neutralizeDifficulty) ? { difficulty: region.neutralizeDifficulty } : null)
            }
            fallback={info.neutralize}
            onChange={(neutralize) => onChange({ neutralize, neutralizeDifficulty: null })}
          />
        </PropertySection>
      )}
    </div>
  )
}
