import { FORMATIONS } from '../../exploration/formations.js'
import CombatPortrait from '../combat/CombatPortrait.jsx'

// The away team in party order. Click selects one character; Shift / Ctrl + click adds or removes them. With more than
// one selected, Make Lead picks who walks to the clicked point (the others keep formation around them).
export function ExplorationPartyBar({ members, selectedIds, leaderId, onSelect, onSetLeader }) {
  const several = selectedIds.length > 1
  return (
    <div className="party-bar explore-party-bar">
      {members.map((member, index) => {
        const selected = selectedIds.includes(member.id)
        const lead = member.id === leaderId
        return (
          <div key={member.id} className="explore-card-wrap">
            <button
              type="button"
              className={`party-card explore-card${selected ? ' is-active' : ''}`}
              aria-pressed={selected}
              title={`${index + 1}: select ${member.character.name} (Shift + click to add or remove)`}
              onClick={(event) => onSelect(member.id, event.shiftKey || event.ctrlKey || event.metaKey)}
            >
              <span className="party-portrait-wrap">
                <CombatPortrait character={member.character} className="party-portrait" />
              </span>
              <span className="party-info">
                <span className="party-name">{member.character.name}</span>
                <span className="explore-card-detail">{[member.character.species?.name, member.character.department?.name].filter(Boolean).join(' / ')}</span>
              </span>
              {selected && lead && <span className="party-turn-badge is-acting">Lead</span>}
            </button>
            {several && selected && !lead && (
              <button type="button" className="explore-make-lead" title={`${member.character.name} leads the selected characters`} onClick={() => onSetLeader(member.id)}>
                Make Lead
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function FormationPanel({ formationId, onFormation, onRegroup }) {
  return (
    <div className="combat-panel explore-formation-panel">
      <p className="combat-panel-title">Formation</p>
      <div className="explore-formation-options">
        {FORMATIONS.map((formation) => (
          <button
            key={formation.id}
            type="button"
            className={`combat-button is-small${formation.id === formationId ? ' is-primary' : ''}`}
            aria-pressed={formation.id === formationId}
            title={formation.description}
            onClick={() => onFormation(formation.id)}
          >
            {formation.name}
          </button>
        ))}
      </div>
      <button type="button" className="combat-button is-small explore-regroup" title="Select the whole away team; everyone walks back into formation around the lead character" onClick={onRegroup}>
        Select All / Regroup
      </button>
    </div>
  )
}
