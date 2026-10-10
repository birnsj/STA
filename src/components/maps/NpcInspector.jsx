import { listAuthoredCharacters } from '../../character/authoredCharacters.js'
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

// npc: the selected NPC; conversations: [{ id, name }]; moving: the next board click moves it (onMove toggles).
// onFacing(degrees): the Facing list (it also turns a start or spawn the NPC stands on).
export default function NpcInspector({ npc, conversations, moving, onChange, onFacing, onMove, onDelete, onEditConversation }) {
  const character = CHARACTERS.find((entry) => entry.id === npc.characterId)
  const text = (key) => (event) => onChange({ [key]: event.target.value.trim() ? event.target.value : null })
  const select = (key) => (event) => onChange({ [key]: event.target.value || null })
  return (
    <div className="me-inspector">
      <p className="me-heading">
        NPC {npc.id} &middot; {npc.position.x}, {npc.position.y}
      </p>
      <Field label="Character">
        <select className="me-select me-wide" value={npc.characterId ?? ''} onChange={select('characterId')}>
          {!character && <option value="">Choose a character</option>}
          {CHARACTERS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </Field>
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
