import { memo, useMemo, useState } from 'react'
import { ATTRIBUTE_IDS, DISCIPLINE_IDS, getAttributeName, getDisciplineName } from '../../character/runtimeCharacter.js'
import { armedForWorldCombat } from '../../combat/encounters.js'
import { getCharacterWeapons } from '../../combat/weaponSystem.js'
import { FORMATIONS } from '../../exploration/formations.js'
import { PARTY_ACTIONS } from '../../exploration/partyActions.js'
import { getProtection, normalizeCondition } from '../../rules/personalCondition.js'
import CombatPortrait from '../combat/CombatPortrait.jsx'
import ConditionTrack from '../combat/ConditionTrack.jsx'
import PartyTaskTag from '../task/PartyTaskTag.jsx'

const short = (name) => name.slice(0, 3).toUpperCase()

// The highest score (the first in data order on a tie).
function topScore(ids, values, nameOf) {
  const id = ids.reduce((best, next) => ((values[next] ?? 0) > (values[best] ?? 0) ? next : best), ids[0])
  return { label: short(nameOf(id)), name: nameOf(id), value: values[id] ?? 0 }
}

// The weapons they will fight with: their own, or the world encounter's standard issue if they bring none (Unarmed
// Strike, always available, is left out unless it is all they have).
function carriedWeaponText(character) {
  const weapons = getCharacterWeapons(armedForWorldCombat(character))
  const own = weapons.filter((weapon) => !weapon.alwaysAvailable)
  return (own.length ? own : weapons).map((weapon) => weapon.name).join(', ') || 'none'
}

// Everything on the card that depends only on the character, not on their condition: worked out once per character
// rather than on every frame of movement.
const cardFacts = (character) => ({
  attribute: topScore(ATTRIBUTE_IDS, character.attributes, getAttributeName),
  department: topScore(DISCIPLINE_IDS, character.disciplines, getDisciplineName),
  protection: getProtection(character, { injuryType: 'stun' }).value,
  rankRole: [character.rank?.name, character.role?.name ?? character.assignment?.name].filter(Boolean).join(' · '),
  weapon: carriedWeaponText(character),
  speciesLine: [character.species?.name, character.department?.name].filter(Boolean).join(' / '),
})

// The card itself, a fixed size: species / department, weapon and Stress.
function CardDetails({ character, condition }) {
  const { weapon, speciesLine } = useMemo(() => cardFacts(character), [character])
  return (
    <>
      <span className="explore-card-detail is-main">{speciesLine}</span>
      <span className="party-weapon" title="Weapon">{weapon}</span>
      <ConditionTrack character={character} condition={condition} />
    </>
  )
}

// The Starfleet delta on the card's info button.
const INSIGNIA_PATH = 'M12 2C15 8 17 15 18.5 22C15.8 19.2 14 18.2 12 18.2C10 18.2 8.2 19.2 5.5 22C7 15 9 8 12 2Z'

// The rest, in a panel above the card that its info button opens and closes.
function CardInfoPanel({ character, condition }) {
  const { attribute, department, protection, rankRole } = useMemo(() => cardFacts(character), [character])
  return (
    <div className="explore-card-info" role="dialog" aria-label={`${character.name}: details`}>
      <span className="party-name">{character.name}</span>
      {rankRole && <span className="explore-card-detail is-rank">{rankRole}</span>}
      <span className="explore-card-stats">
        <span title={`Highest attribute: ${attribute.name}`}>{attribute.label} {attribute.value}</span>
        <span title={`Highest department: ${department.name}`}>{department.label} {department.value}</span>
        <span title="Protection">PROT {protection}</span>
      </span>
      <span className="explore-card-detail">
        Fatigue: {condition.fatigued ? 'yes' : 'no'} · Injuries: {condition.injuries.length || 'none'}
      </span>
      {character.values.length > 0 && (
        <ul className="explore-card-values" aria-label="Values">
          {character.values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// The away team in party order. Click selects one character; Shift / Ctrl + click adds or removes them. With more than
// one selected, Make Lead picks who walks to the clicked point (the others keep formation around them).
// recommendation: who is best at the approach being considered (rules/taskRecommendation.js), shown on the cards only
// while it is considered (null otherwise).
// The screen re-renders on every world tick; the bar only when what it shows changes (not as the members walk).
const sameMembers = (a, b) =>
  a.length === b.length && a.every((member, i) => member.id === b[i].id && member.character === b[i].character && member.condition === b[i].condition)
const sameIds = (a, b) => a.length === b.length && a.every((id, i) => id === b[i])
const sameRecommendation = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b)
const sameBar = (prev, next) =>
  sameMembers(prev.members, next.members) &&
  sameIds(prev.selectedIds, next.selectedIds) &&
  prev.leaderId === next.leaderId &&
  prev.onSelect === next.onSelect &&
  prev.onSetLeader === next.onSetLeader &&
  sameRecommendation(prev.recommendation, next.recommendation)

export const ExplorationPartyBar = memo(function ExplorationPartyBar({ members, selectedIds, leaderId, onSelect, onSetLeader, recommendation = null }) {
  const several = selectedIds.length > 1
  // UI state: the member whose info panel is open, or null.
  const [infoId, setInfoId] = useState(null)
  return (
    <div className="party-bar explore-party-bar">
      {members.map((member, index) => {
        const selected = selectedIds.includes(member.id)
        const lead = member.id === leaderId
        const best = Boolean(recommendation?.bestIds.includes(member.id))
        const infoOpen = infoId === member.id
        const condition = normalizeCondition(member.condition)
        return (
          <div key={member.id} className="explore-card-wrap">
            {infoOpen && <CardInfoPanel character={member.character} condition={condition} />}
            <button
              type="button"
              className={`party-card explore-card${selected ? ' is-active' : ''}${best ? ' is-best' : ''}`}
              aria-pressed={selected}
              title={`${index + 1}: select ${member.character.name} (Shift + click to add or remove)`}
              onClick={(event) => onSelect(member.id, event.shiftKey || event.ctrlKey || event.metaKey)}
            >
              <span className="party-portrait-wrap">
                <CombatPortrait character={member.character} className="party-portrait" />
              </span>
              <span className="party-info">
                <span className="party-name">{member.character.name}</span>
                <CardDetails character={member.character} condition={condition} />
              </span>
            </button>
            {/* Every notification sits on the card's top edge, so the card never changes size. */}
            <div className="explore-card-badges">
              <PartyTaskTag recommendation={recommendation} memberId={member.id} />
              {selected && lead && <span className="party-turn-badge is-acting">Lead</span>}
              {several && selected && !lead && (
                <button type="button" className="explore-make-lead" title={`${member.character.name} leads the selected characters`} onClick={() => onSetLeader(member.id)}>
                  Make Lead
                </button>
              )}
            </div>
            <button
              type="button"
              className={`explore-card-info-toggle${infoOpen ? ' is-open' : ''}`}
              aria-expanded={infoOpen}
              aria-label={`${member.character.name}: details`}
              title={infoOpen ? 'Hide the details.' : `Show ${member.character.name}'s details.`}
              onClick={() => setInfoId(infoOpen ? null : member.id)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={INSIGNIA_PATH} />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}, sameBar)

// Stacked above the Formation panel: the general actions (exploration/partyActions.js). Clicking one considers it, so the
// party cards show who is best at it; clicking it again stops. Nothing is rolled yet.
export const ExplorationActionButtons = memo(function ExplorationActionButtons({ consideredId, onConsider }) {
  return (
    <div id="explore-action-stack" className="explore-action-stack" aria-label="Actions: who is best at it">
      {PARTY_ACTIONS.map((action) => {
        const considered = action.id === consideredId
        return (
          <button
            key={action.id}
            type="button"
            className="combat-button is-small"
            aria-pressed={considered}
            title={
              action.task
                ? `${action.label}: ${action.description} ${getAttributeName(action.task.attribute)} + ${getDisciplineName(action.task.department)}. Click to see who is best at it.`
                : `${action.label}: ${action.description} Anyone can do this.`
            }
            onClick={() => onConsider(considered ? null : action.id)}
          >
            {action.label}
          </button>
        )
      })}
    </div>
  )
})

// The small square under the minimap that opens and closes the action buttons.
export function ActionsToggle({ open, onToggle }) {
  return (
    <button
      type="button"
      className="explore-actions-toggle"
      aria-expanded={open}
      aria-controls="explore-action-stack"
      aria-label="Actions"
      title={open ? 'Hide the action buttons.' : 'Show the action buttons.'}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h7v5H4zM13 5h7v5h-7zM4 14h7v5H4zM13 14h7v5h-7z" />
      </svg>
    </button>
  )
}


// A formation drawn from its own slots (the lead in front, at the top), all at one scale so Tight looks tight and
// Spread wide.
const SLOT_SCALE = 4
function FormationIcon({ formation }) {
  return (
    <svg className="explore-formation-icon" viewBox="0 0 24 24" aria-hidden="true">
      {formation.slots.map((slot, index) => (
        <circle key={index} className={index === 0 ? 'is-lead' : ''} cx={12 + slot.x * SLOT_SCALE} cy={4 + slot.y * SLOT_SCALE} r={index === 0 ? 2.6 : 2.2} />
      ))}
    </svg>
  )
}

const REGROUP_ICON = 'M4 4l5 5M9 5v4H5M20 4l-5 5M15 5v4h4M4 20l5-5M9 19v-4H5M20 20l-5-5M15 19v-4h4'
const CAMERA_ICON = 'M4 8h3l2-3h6l2 3h3v11H4zM12 10.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7'
const DEBUG_ICON = 'M9 6a3 3 0 0 1 6 0M8 9h8v6a4 4 0 0 1-8 0zM12 9v10M8 12H4M20 12h-4M8 16l-3 2M16 16l3 2M8 9L5 7M16 9l3-2'
// A door with an arrow leaving through it.
const EXIT_ICON = 'M14 4H5v16h9M10 12h10M16 8l4 4l-4 4'

// followCamera / onFollowCamera(on): the view follows the lead character or stays put. debugOpen / onDebug(open): the
// debug panels (party, awareness, scenario state and the task log). onExitMission(): Exit Mission (the screen confirms,
// then beams the away team out); null while it can't be used.
export const FormationPanel = memo(function FormationPanel({ formationId, onFormation, onRegroup, followCamera, onFollowCamera, debugOpen, onDebug, onExitMission }) {
  const current = FORMATIONS.find((formation) => formation.id === formationId)
  return (
    <div className="combat-panel explore-formation-panel">
      <div className="explore-formation-header">
        <p className="combat-panel-title">Formation{current ? `: ${current.name}` : ''}</p>
        <button
          type="button"
          className="explore-panel-icon-button"
          aria-pressed={followCamera}
          aria-label="Camera: follow the lead character"
          title={followCamera ? 'Camera: follows the lead character. Click to stop.' : 'Camera: stays where you put it. Click to follow the lead character.'}
          onClick={() => onFollowCamera(!followCamera)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={CAMERA_ICON} />
          </svg>
        </button>
        <button
          type="button"
          className="explore-panel-icon-button"
          aria-pressed={debugOpen}
          aria-label="Debug panels"
          title={debugOpen ? 'Hide the debug panels.' : 'Show the debug panels (party, awareness, scenario state and task log).'}
          onClick={() => onDebug(!debugOpen)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={DEBUG_ICON} />
          </svg>
        </button>
        <button
          type="button"
          className="explore-panel-icon-button"
          aria-label="Exit Mission"
          title="Exit Mission: the whole away team beams out and the mission ends."
          disabled={!onExitMission}
          onClick={onExitMission ?? undefined}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={EXIT_ICON} />
          </svg>
        </button>
      </div>
      <div className="explore-formation-options">
        {FORMATIONS.map((formation) => (
          <button
            key={formation.id}
            type="button"
            className={`explore-formation-button${formation.id === formationId ? ' is-active' : ''}`}
            aria-pressed={formation.id === formationId}
            aria-label={formation.name}
            title={`${formation.name}: ${formation.description}`}
            onClick={() => onFormation(formation.id)}
          >
            <FormationIcon formation={formation} />
          </button>
        ))}
        <button
          type="button"
          className="explore-formation-button is-regroup"
          aria-label="Select All / Regroup"
          title="Select All / Regroup: select the whole away team; everyone walks back into formation around the lead character"
          onClick={onRegroup}
        >
          <svg className="explore-formation-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d={REGROUP_ICON} />
          </svg>
        </button>
      </div>
    </div>
  )
})
