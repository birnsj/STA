import { listAuthoredCharacters } from '../../character/authoredCharacters.js'
import { npcPortraitOptions } from '../../character/npcAppearance.js'
import { getGenders, getNpcBackdropById } from '../../rules/appearance.js'
import awareness from '../../data/adaptation/exploration/awareness.json'
import factionData from '../../data/adaptation/factions.json'
import { FACINGS, snapFacing } from '../../maps/facing.js'
import { PERCEPTION_DEFAULTS, PERCEPTION_KEYS, RESPONSE_TYPES } from '../../maps/mapFormat.js'

// The map editor's inspector for the selected NPC (mapFormat.js npcs): who it is (an authored character, never a copy),
// and how this instance behaves in the world. Every change goes straight into the map (onChange(changes)).
const CHARACTERS = listAuthoredCharacters()
const NPC_RULES = [
  { id: '', label: 'Full character rules' },
  { id: 'supporting', label: 'Supporting (Core p.278)' },
  { id: 'minor', label: 'Minor NPC (Core p.291)' },
  { id: 'notable', label: 'Notable NPC (Core p.291)' },
  { id: 'major', label: 'Major NPC (Core p.291)' },
]
const PERCEPTION_FIELDS = [
  { key: 'visionRange', label: 'Vision range', min: 1, max: 30, step: 1 },
  { key: 'normalRange', label: 'Normal range', min: 1, max: 30, step: 1 },
  { key: 'closeRange', label: 'Close range', min: 0, max: 30, step: 1 },
  { key: 'fieldOfView', label: 'Field of view (°)', min: 1, max: 360, step: 1 },
  { key: 'hearingRange', label: 'Hearing range', min: 0, max: 30, step: 1 },
  { key: 'awarenessBuildRate', label: 'Awareness build / s', min: 0, max: 10, step: 0.05 },
  { key: 'awarenessDecayRate', label: 'Awareness decay / s', min: 0, max: 10, step: 0.05 },
]

export function Field({ label, children }) {
  return (
    <label className="me-field">
      <span className="me-field-label">{label}</span>
      {children}
    </label>
  )
}

// Gender and portrait, for a character whose species has NPC portraits (npcPortraits.json). appearance: how
// npcAppearance.js shows it on this map, named in the Auto entry and previewed over its random backdrop.
function AppearanceFields({ npc, appearance, onChange }) {
  const options = npcPortraitOptions(npc.characterId)
  if (!options.length) return null
  const genders = getGenders().filter((gender) => options.some((portrait) => portrait.gender === gender.id))
  const shown = options.filter((portrait) => !npc.gender || portrait.gender === npc.gender)
  const current = options.find((portrait) => portrait.id === appearance?.portraitId)
  const auto = npc.portraitId ? null : current
  const backdrop = getNpcBackdropById(appearance?.backdropId)
  const setGender = (event) => {
    const gender = event.target.value || null
    const keeps = !gender || options.find((portrait) => portrait.id === npc.portraitId)?.gender === gender
    onChange({ gender, ...(keeps ? {} : { portraitId: null }) })
  }
  return (
    <>
      <Field label="Gender">
        <select className="me-select me-wide" value={npc.gender ?? ''} onChange={setGender}>
          <option value="">Auto</option>
          {genders.map((gender) => (
            <option key={gender.id} value={gender.id}>
              {gender.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Portrait">
        <select className="me-select me-wide" value={npc.portraitId ?? ''} onChange={(event) => onChange({ portraitId: event.target.value || null })}>
          <option value="">Auto{auto ? ` (${auto.name})` : ''}</option>
          {shown.map((portrait) => (
            <option key={portrait.id} value={portrait.id}>
              {portrait.name}
            </option>
          ))}
        </select>
      </Field>
      {current && (
        <img
          className="me-npc-portrait"
          src={current.image}
          alt={current.name}
          title={backdrop ? `${current.name} · ${backdrop.name} (random backdrop)` : current.name}
          style={backdrop ? { backgroundImage: `url("${backdrop.image}")` } : undefined}
          draggable={false}
        />
      )}
    </>
  )
}

function dispositionResponse(dispositionId) {
  return awareness.dispositions.find((entry) => entry.id === dispositionId)?.response ?? 'observe'
}

function PerceptionFields({ npc, onChange }) {
  const overrides = npc.perception ?? {}
  const setKey = (key, value) => {
    if (value == null) {
      const next = { ...overrides }
      delete next[key]
      onChange({ perception: Object.keys(next).length ? next : null })
      return
    }
    onChange({ perception: { ...overrides, [key]: value } })
  }
  return (
    <>
      <p className="me-heading">Perception</p>
      <p className="me-text">Blank uses the global default from awareness.json. Reset clears every override.</p>
      {PERCEPTION_FIELDS.filter((field) => PERCEPTION_KEYS.includes(field.key)).map((field) => (
        <label key={field.key} className="me-field">
          {field.label}
          <input
            className="me-name me-wide"
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={overrides[field.key] ?? ''}
            placeholder={`Default ${PERCEPTION_DEFAULTS[field.key]}`}
            onChange={(event) => {
              if (event.target.value === '') return setKey(field.key, null)
              const next = Number(event.target.value)
              if (!Number.isFinite(next)) return
              setKey(field.key, Math.min(field.max, Math.max(field.min, next)))
            }}
          />
        </label>
      ))}
      <button type="button" className="me-button" disabled={!npc.perception} onClick={() => onChange({ perception: null })}>
        Reset perception
      </button>
    </>
  )
}

function PatrolFields({
  npc,
  editing,
  movingWaypoint,
  selectedIndex,
  onToggleEdit,
  onToggleMoveWaypoint,
  onSelectWaypoint,
  onChangeWaypoint,
  onReorderWaypoint,
  onDeleteWaypoint,
  onClearPatrol,
}) {
  const patrol = npc.patrol ?? []
  const selected = selectedIndex != null ? patrol[selectedIndex] : null
  return (
    <>
      <p className="me-heading">Patrol</p>
      <p className="me-text">
        {patrol.length
          ? `${patrol.length} waypoint${patrol.length === 1 ? '' : 's'} (loops).`
          : 'No patrol — stands at its post.'}
      </p>
      <div className="me-inspector-actions">
        <button type="button" className={`me-button${editing ? ' is-primary' : ''}`} aria-pressed={editing} onClick={onToggleEdit}>
          {editing ? 'Click tiles to add…' : 'Edit Patrol'}
        </button>
        {patrol.length > 0 && (
          <button type="button" className="me-button" onClick={onClearPatrol}>
            Clear
          </button>
        )}
      </div>
      {editing && <p className="me-text">Click a floor tile to add a waypoint; click a W marker to select it. Escape finishes.</p>}
      {patrol.length > 0 && (
        <ul className="me-patrol-list">
          {patrol.map((point, index) => (
            <li key={`${point.at.x},${point.at.y},${index}`}>
              <button
                type="button"
                className={`me-link${index === selectedIndex ? ' is-selected' : ''}`}
                onClick={() => onSelectWaypoint(index)}
              >
                W{index + 1} · {point.at.x}, {point.at.y}
                {point.wait ? ` · wait ${point.wait}s` : ''}
                {point.facing != null ? ` · ${snapFacing(point.facing)}°` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <>
          <Field label={`Waypoint W${selectedIndex + 1} wait (seconds)`}>
            <input
              className="me-name me-wide"
              type="number"
              min={0}
              max={120}
              step={0.5}
              value={selected.wait ?? 0}
              onChange={(event) => onChangeWaypoint(selectedIndex, { wait: Number(event.target.value) })}
            />
          </Field>
          <Field label="Facing while waiting">
            <select
              className="me-select me-wide"
              value={selected.facing == null ? '' : snapFacing(selected.facing)}
              onChange={(event) => onChangeWaypoint(selectedIndex, { facing: event.target.value === '' ? null : Number(event.target.value) })}
            >
              <option value="">Keep walking facing</option>
              {FACINGS.map((entry) => (
                <option key={entry.degrees} value={entry.degrees}>
                  {entry.degrees}° {entry.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="me-inspector-actions">
            <button type="button" className={`me-button${movingWaypoint ? ' is-primary' : ''}`} aria-pressed={movingWaypoint} onClick={onToggleMoveWaypoint}>
              {movingWaypoint ? 'Click a tile…' : 'Move Waypoint'}
            </button>
            <button type="button" className="me-button" disabled={selectedIndex === 0} onClick={() => onReorderWaypoint(selectedIndex, selectedIndex - 1)}>
              Up
            </button>
            <button
              type="button"
              className="me-button"
              disabled={selectedIndex >= patrol.length - 1}
              onClick={() => onReorderWaypoint(selectedIndex, selectedIndex + 1)}
            >
              Down
            </button>
            <button type="button" className="me-button" onClick={() => onDeleteWaypoint(selectedIndex)}>
              Delete
            </button>
          </div>
        </>
      )}
    </>
  )
}

// npc: the selected NPC; conversations: [{ id, name }]; moving: the next board click moves it (onMove toggles).
// onFacing(degrees): the Facing list (it also turns a start or spawn the NPC stands on). appearance: its gender,
// portrait and backdrop in play (npcAppearance.js), or null.
export default function NpcInspector({
  npc,
  appearance = null,
  conversations,
  moving,
  onChange,
  onFacing,
  onMove,
  onDelete,
  onEditConversation,
  editingPatrol = false,
  movingWaypoint = false,
  selectedWaypointIndex = null,
  onTogglePatrolEdit,
  onToggleMoveWaypoint,
  onSelectWaypoint,
  onChangeWaypoint,
  onReorderWaypoint,
  onDeleteWaypoint,
  onClearPatrol,
}) {
  const character = CHARACTERS.find((entry) => entry.id === npc.characterId)
  const text = (key) => (event) => onChange({ [key]: event.target.value.trim() ? event.target.value : null })
  const select = (key) => (event) => onChange({ [key]: event.target.value || null })
  const defaultResponse = dispositionResponse(npc.disposition ?? 'neutral')
  // A new character keeps the chosen gender and portrait only while its species can wear them.
  const setCharacter = (event) => {
    const characterId = event.target.value || null
    const options = npcPortraitOptions(characterId)
    onChange({
      characterId,
      gender: options.some((portrait) => portrait.gender === npc.gender) ? npc.gender : null,
      portraitId: options.some((portrait) => portrait.id === npc.portraitId) ? npc.portraitId : null,
    })
  }
  return (
    <div className="me-inspector">
      <p className="me-heading">
        NPC {npc.id} &middot; {npc.position.x}, {npc.position.y}
      </p>
      <Field label="Character">
        <select className="me-select me-wide" value={npc.characterId ?? ''} onChange={setCharacter}>
          {!character && <option value="">Choose a character</option>}
          {CHARACTERS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </Field>
      <AppearanceFields npc={npc} appearance={appearance} onChange={onChange} />
      <Field label="Name">
        <input className="me-name me-wide" value={npc.name ?? ''} placeholder={character?.name ?? 'The character’s name'} onChange={text('name')} />
      </Field>
      <Field label="Faction">
        <select className="me-select me-wide" value={npc.faction ?? ''} onChange={select('faction')}>
          <option value="">The character’s</option>
          {factionData.factions.map((faction) => (
            <option key={faction.id} value={faction.id}>
              {faction.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Disposition">
        <select className="me-select me-wide" value={npc.disposition ?? 'neutral'} onChange={select('disposition')}>
          {awareness.dispositions.map((disposition) => (
            <option key={disposition.id} value={disposition.id}>
              {disposition.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Response when identified">
        <select className="me-select me-wide" value={npc.responseType ?? ''} onChange={select('responseType')}>
          <option value="">Default ({RESPONSE_TYPES.find((entry) => entry.id === defaultResponse)?.label ?? defaultResponse})</option>
          {RESPONSE_TYPES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Conversation">
        <select className="me-select me-wide" value={npc.conversationId ?? ''} onChange={select('conversationId')}>
          <option value="">None</option>
          {npc.conversationId && !conversations.some((entry) => entry.id === npc.conversationId) && <option value={npc.conversationId}>{npc.conversationId} (missing)</option>}
          {conversations.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </Field>
      {npc.conversationId && (
        <button type="button" className="me-button me-generate" onClick={() => onEditConversation(npc.conversationId)}>
          Edit Conversation
        </button>
      )}
      <Field label="Facing">
        <select className="me-select me-wide" value={snapFacing(npc.facing ?? 0)} onChange={(event) => onFacing(Number(event.target.value))}>
          {FACINGS.map((entry) => (
            <option key={entry.degrees} value={entry.degrees}>
              {entry.degrees}° {entry.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="NPC rules">
        <select className="me-select me-wide" value={npc.npcRules ?? ''} onChange={select('npcRules')}>
          {NPC_RULES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </Field>
      <label className="me-check" title="If this NPC is killed (dead, or Dying with an untreated Deadly Injury when a fight ends), the mission fails.">
        <input type="checkbox" checked={Boolean(npc.mustSurvive)} onChange={(event) => onChange({ mustSurvive: event.target.checked })} /> Must survive (mission fails if the away team fights them)
      </label>
      <Field label="Alert group">
        <input className="me-name me-wide" value={npc.alertGroupId ?? ''} placeholder="None" onChange={text('alertGroupId')} />
      </Field>
      <Field label="Alert method">
        <select className="me-select me-wide" value={npc.alertMethod ?? ''} onChange={select('alertMethod')}>
          <option value="">Default ({awareness.defaultAlertMethod})</option>
          {awareness.alertMethods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </select>
      </Field>
      <PerceptionFields npc={npc} onChange={onChange} />
      <PatrolFields
        npc={npc}
        editing={editingPatrol}
        movingWaypoint={movingWaypoint}
        selectedIndex={selectedWaypointIndex}
        onToggleEdit={onTogglePatrolEdit}
        onToggleMoveWaypoint={onToggleMoveWaypoint}
        onSelectWaypoint={onSelectWaypoint}
        onChangeWaypoint={onChangeWaypoint}
        onReorderWaypoint={onReorderWaypoint}
        onDeleteWaypoint={onDeleteWaypoint}
        onClearPatrol={onClearPatrol}
      />
      <div className="me-inspector-actions">
        <button type="button" className={`me-button${moving ? ' is-primary' : ''}`} aria-pressed={moving} onClick={onMove}>
          {moving ? 'Click a tile…' : 'Move'}
        </button>
        <button type="button" className="me-button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}
