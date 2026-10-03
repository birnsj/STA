import ActionPoints, { DoneIcon } from './ActionPoints.jsx'
import CombatPortrait from './CombatPortrait.jsx'
import HitPips from './HitPips.jsx'

const STATUS_LABEL = { incapacitated: 'Incapacitated', injured: 'Injured' }
const BADGE_LABEL = { acting: 'Acting', ready: 'Ready', done: 'Done' }

// The party, in pick order. turnInfo: { [id]: { state: 'acting' | 'ready' | 'done', turn: { minorUsed, majorUsed } } }
// for members whose turn status is known this round; clicking a Ready member hands them the turn.
export default function PartyBar({ party, activeId, selectedId, turnInfo, onSelect }) {
  return (
    <div className="party-bar">
      {party.map((member) => {
        const info = member.status === 'active' ? turnInfo[member.id] : null
        return (
          <button
            key={member.id}
            type="button"
            className={`party-card${member.id === activeId ? ' is-active' : ''}${member.id === selectedId ? ' is-selected' : ''}${member.status !== 'active' ? ' is-down' : ''}${info ? ` is-${info.state}` : ''}`}
            title={info?.state === 'ready' ? `Switch to ${member.character.name}` : undefined}
            onClick={() => onSelect(member.id)}
          >
            <span className="party-portrait-wrap">
              <CombatPortrait character={member.character} className="party-portrait" />
              {info?.state === 'done' && <DoneIcon size={22} className="party-done-icon" />}
            </span>
            <span className="party-info">
              <span className="party-name">{member.character.name}</span>
              {member.status === 'active' ? <HitPips hits={member.hits} /> : <span className="party-status">{STATUS_LABEL[member.status]}</span>}
              {info && <ActionPoints turn={info.turn} />}
            </span>
            {info && (
              <span className={`party-turn-badge is-${info.state}`}>
                {info.state === 'done' && <DoneIcon size={9} />}
                {BADGE_LABEL[info.state]}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
