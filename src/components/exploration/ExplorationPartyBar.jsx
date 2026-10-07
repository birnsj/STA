import { useMemo } from 'react'
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

// Compact: species / department, weapon and Stress. Hovering (or focusing) the card opens the rest around them.
function CardDetails({ character, condition }) {
  const { attribute, department, protection, rankRole, weapon, speciesLine } = useMemo(() => cardFacts(character), [character])
  return (
    <>
      {rankRole && (
        <span className="explore-card-more">
          <span className="explore-card-detail is-rank">{rankRole}</span>
        </span>
      )}
      <span className="explore-card-detail is-main">{speciesLine}</span>
      <span className="party-weapon" title="Weapon">{weapon}</span>
      <span className="explore-card-more">
        <span className="explore-card-stats">
          <span title={`Highest attribute: ${attribute.name}`}>{attribute.label} {attribute.value}</span>
          <span title={`Highest department: ${department.name}`}>{department.label} {department.value}</span>
          <span title="Protection">PROT {protection}</span>
        </span>
      </span>
      <ConditionTrack character={character} condition={condition} />
      <span className="explore-card-more">
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
      </span>
    </>
  )
}

// The away team in party order. Click selects one character; Shift / Ctrl + click adds or removes them. With more than
// one selected, Make Lead picks who walks to the clicked point (the others keep formation around them).
// recommendation: who is best at the approach being considered (rules/taskRecommendation.js), shown on the cards only
// while it is considered (null otherwise).
export function ExplorationPartyBar({ members, selectedIds, leaderId, onSelect, onSetLeader, recommendation = null }) {
  const several = selectedIds.length > 1
  return (
    <div className="party-bar explore-party-bar">
      {members.map((member, index) => {
        const selected = selectedIds.includes(member.id)
        const lead = member.id === leaderId
        const best = Boolean(recommendation?.bestIds.includes(member.id))
        return (
          <div key={member.id} className="explore-card-wrap">
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
                <CardDetails character={member.character} condition={normalizeCondition(member.condition)} />
                <PartyTaskTag recommendation={recommendation} memberId={member.id} />
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

// Stacked above the Formation panel: the general actions (exploration/partyActions.js). Clicking one considers it, so the
// party cards show who is best at it; clicking it again stops. Nothing is rolled yet.
export function ExplorationActionButtons({ consideredId, onConsider }) {
  return (
    <div className="explore-action-stack" aria-label="Actions: who is best at it">
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

export function FormationPanel({ formationId, onFormation, onRegroup }) {
  const current = FORMATIONS.find((formation) => formation.id === formationId)
  return (
    <div className="combat-panel explore-formation-panel">
      <p className="combat-panel-title">Formation{current ? `: ${current.name}` : ''}</p>
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
}
