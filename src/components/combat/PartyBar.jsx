import { splitFireteams } from '../../exploration/awayTeam.js'
import PartyTaskTag from '../task/PartyTaskTag.jsx'
import ActionPoints, { DoneIcon } from './ActionPoints.jsx'
import CombatPortrait from './CombatPortrait.jsx'
import ConditionIcons from './ConditionIcons.jsx'
import ConditionTrack from './ConditionTrack.jsx'

const BADGE_LABEL = { acting: 'Acting', ready: 'Ready', done: 'Done' }

// The party, in pick order. First four = Fireteam A; the rest = Fireteam B (same card layout; follows A in
// exploration). turnInfo: { [id]: { state: 'acting' | 'ready' | 'done', turn: { ap }, movement: { left, total,
// sprintLeft, sprintTotal } } } for members whose turn status is known this round; clicking a Ready member hands them
// the turn. recommendation: who is best at the object task being considered, or null. weapons: { [id]: weapon }.
// onCycleWeapon switches the acting member's weapon (null = can't switch now).
export default function PartyBar({ party, activeId, selectedId, turnInfo, onSelect, recommendation = null, weapons = {}, onCycleWeapon = null }) {
  const ids = party.map((member) => member.id)
  const { teamA, teamB } = splitFireteams(ids)
  const byId = Object.fromEntries(party.map((member) => [member.id, member]))
  const card = (id) => (
    <MemberCard
      key={id}
      member={byId[id]}
      activeId={activeId}
      selectedId={selectedId}
      turnInfo={turnInfo}
      recommendation={recommendation}
      weapon={weapons[id]}
      onCycleWeapon={onCycleWeapon}
      onSelect={onSelect}
    />
  )
  return (
    <div className={`party-bar${teamB.length ? ' is-two-rows' : ''}`}>
      <div className="party-fireteam is-a" aria-label="Fireteam A">
        {teamA.map(card)}
      </div>
      {teamB.length > 0 && (
        <div className="party-fireteam is-b" aria-label="Fireteam B">
          {teamB.map(card)}
        </div>
      )}
    </div>
  )
}

function MemberCard({ member, activeId, selectedId, turnInfo, recommendation, weapon, onCycleWeapon, onSelect }) {
  const down = member.condition.defeated
  const info = !down ? turnInfo[member.id] : null
  const best = Boolean(recommendation?.bestIds.includes(member.id))
  return (
    <div className="party-card-wrap">
      <button
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
          <PartyWeapon weapon={weapon} onCycle={member.id === activeId ? onCycleWeapon : null} />
          <ConditionTrack character={member.character} condition={member.condition} />
          {!down && info && (
            <span className="party-hits-row">
              <span className={`party-move-left${info.movement.left ? '' : ' is-empty'}`}>Move {info.movement.left}/{info.movement.total}</span>
              <span className={`party-move-left${info.movement.sprintLeft ? '' : ' is-empty'}`}>
                Sprint {info.movement.sprintLeft}/{info.movement.sprintTotal}
              </span>
            </span>
          )}
        </span>
      </button>
      <div className="party-card-badges">
        {info && <ActionPoints turn={info.turn} />}
        <ConditionIcons condition={member.condition} />
        <PartyTaskTag recommendation={recommendation} memberId={member.id} />
        {info && (
          <span className={`party-turn-badge is-${info.state}`}>
            {info.state === 'done' && <DoneIcon size={9} />}
            {BADGE_LABEL[info.state]}
          </span>
        )}
      </div>
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
