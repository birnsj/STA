import { listAuthoredCharacters } from '../../character/authoredCharacters.js'
import { npcPortraitOptions } from '../../character/npcAppearance.js'
import { getGenders, getNpcBackdropById } from '../../rules/appearance.js'
import awareness from '../../data/adaptation/exploration/awareness.json'
import factionData from '../../data/adaptation/factions.json'
import { FACINGS, snapFacing } from '../../maps/facing.js'

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

// npc: the selected NPC; conversations: [{ id, name }]; moving: the next board click moves it (onMove toggles).
// onFacing(degrees): the Facing list (it also turns a start or spawn the NPC stands on). appearance: its gender,
// portrait and backdrop in play (npcAppearance.js), or null.
export default function NpcInspector({ npc, appearance = null, conversations, moving, onChange, onFacing, onMove, onDelete, onEditConversation }) {
  const character = CHARACTERS.find((entry) => entry.id === npc.characterId)
  const text = (key) => (event) => onChange({ [key]: event.target.value.trim() ? event.target.value : null })
  const select = (key) => (event) => onChange({ [key]: event.target.value || null })
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
