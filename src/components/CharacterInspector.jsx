import { ATTRIBUTE_IDS, DISCIPLINE_IDS, getAttributeName, getDisciplineName } from '../character/runtimeCharacter.js'
import { fatigueText, getMaxStress, getProtection, injuryText, isDying, normalizeCondition, npcCategoryName } from '../rules/personalCondition.js'

const list = (items) => (items.length ? items.join(', ') : 'none')
const scores = (ids, values, nameOf) => ids.map((id) => `${nameOf(id)} ${values[id] ?? 0}`).join(', ')

// Debug: one person's character record and condition as the rules read them, plus how their actor runs them in the
// world. actor: { id, controller, side?, disposition?, awareness? } (missing fields show '-').
export default function CharacterInspector({ character, condition, actor = {} }) {
  const current = normalizeCondition(condition)
  const rows = [
    ['Actor id', actor.id ?? '-'],
    ['Character id', character.id],
    ['Species', character.species?.name || '-'],
    ['Faction', character.faction?.name ?? '-'],
    ['Controller', actor.controller ?? '-'],
    ['Side', actor.side ?? '-'],
    ['Disposition', actor.disposition ?? '-'],
    ['Awareness', actor.awareness ?? '-'],
    ['NPC rules', npcCategoryName(character)],
    ['Attributes', scores(ATTRIBUTE_IDS, character.attributes, getAttributeName)],
    ['Departments', scores(DISCIPLINE_IDS, character.disciplines, getDisciplineName)],
    ['Focuses', list(character.focuses)],
    ['Values', list(character.values)],
    ['Traits', list(character.traits.map((trait) => trait.name))],
    ['Talents', list(character.talents.map((talent) => talent.name))],
    ['Species Ability', character.speciesAbility?.name ?? 'none'],
    ['Equipment', list(character.equipment.map((item) => item.name))],
    ['Protection', `${getProtection(character, { injuryType: 'stun' }).value}`],
    ['Stress', `${current.stress} / ${getMaxStress(character).value}`],
    ['Fatigue', current.fatigued ? fatigueText(current) : 'no'],
    ['Injuries', list(current.injuries.map(injuryText))],
    ['Defeated', current.defeated ? 'yes' : 'no'],
    ['Dying', isDying(current) ? 'yes' : 'no'],
  ]
  return (
    <details className="character-inspector">
      <summary>{character.name}</summary>
      <dl className="debug-grid">
        {rows.map(([label, value]) => (
          <div key={label} className="character-inspector-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
