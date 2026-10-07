import PartyTaskTag from '../task/PartyTaskTag.jsx'
import ActionPoints, { DoneIcon } from './ActionPoints.jsx'
import CombatPortrait from './CombatPortrait.jsx'
import ConditionTrack from './ConditionTrack.jsx'

const BADGE_LABEL = { acting: 'Acting', ready: 'Ready', done: 'Done' }

// The party, in pick order. turnInfo: { [id]: { state: 'acting' | 'ready' | 'done', turn: { ap }, movement: { left, total, sprintLeft, sprintTotal } } }
// for members whose turn status is known this round; clicking a Ready member hands them the turn.
// recommendation: who is best at the object task being considered (rules/taskRecommendation.js), or null.
// weapons: { [id]: weapon } each member's current weapon. onCycleWeapon switches the acting member's weapon (null = can't switch now).
export default function PartyBar({ party, activeId, selectedId, turnInfo, onSelect, recommendation = null, weapons = {}, onCycleWeapon = null }) {
  return (
    <div className="party-bar">
      {party.map((member) => {
        const down = member.condition.defeated
        const info = !down ? turnInfo[member.id] : null
        const best = Boolean(recommendation?.bestIds.includes(member.id))
        return (
          <button
            key={member.id}
            type="button"
            className={`party-card${member.id === activeId ? ' is-active' : ''}${member.id === selectedId ? ' is-selected' : ''}${down ? ' is-down' : ''}${info ? ` is-${info.state}` : ''}${best ? ' is-best' : ''}`}
            title={info?.state === 'ready' ? `Switch to ${member.character.name}` : undefined}
            onClick={() => onSelect(member.id)}
          >
            <span className="party-portrait-wrap">
              <CombatPortrait character={member.character} className="party-portrait" />
              {info?.state === 'done' && <DoneIcon size={22} className="party-done-icon" />}
            </span>
            <span className="party-info">
              <span className="party-name">{member.character.name}</span>
              <PartyWeapon weapon={weapons[member.id]} onCycle={member.id === activeId ? onCycleWeapon : null} />
              <ConditionTrack character={member.character} condition={member.condition} />
              {!down && info && (
                <span className="party-hits-row">
                  <span className={`party-move-left${info.movement.left ? '' : ' is-empty'}`}>Move {info.movement.left}/{info.movement.total}</span>
                  <span className={`party-move-left${info.movement.sprintLeft ? '' : ' is-empty'}`}>
                    Sprint {info.movement.sprintLeft}/{info.movement.sprintTotal}
                  </span>
                </span>
              )}
              {info && <ActionPoints turn={info.turn} />}
              <PartyTaskTag recommendation={recommendation} memberId={member.id} />
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

// The card is itself a button, so the switch is a span with button behaviour rather than a nested <button>.
function PartyWeapon({ weapon, onCycle }) {
  if (!weapon) return null
  if (!onCycle) return <span className="party-weapon">{weapon.name}</span>
  const cycle = (event) => {
    event.stopPropagation()
    event.preventDefault()
    onCycle()
  }
  return (
    <span
      role="button"
      tabIndex={0}
      className="party-weapon is-switchable"
      title="Change weapon"
      onClick={cycle}
      onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && cycle(event)}
    >
      {weapon.name}
      <span aria-hidden="true"> &rsaquo;</span>
    </span>
  )
}
