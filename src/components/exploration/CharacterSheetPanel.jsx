import { ATTRIBUTE_IDS, DISCIPLINE_IDS, getAttributeName, getDisciplineName } from '../../character/runtimeCharacter.js'
import { armedForWorldCombat } from '../../combat/encounters.js'
import { getCharacterWeapons, getInjuryMode } from '../../combat/weaponSystem.js'
import { fatigueText, getMaxStress, getProtection, injuryText, normalizeCondition } from '../../rules/personalCondition.js'
import CombatPortrait from '../combat/CombatPortrait.jsx'

// short: three-letter labels (the full name on hover), for the compact sheet.
function ScoreGrid({ ids, values, nameOf, short }) {
  return (
    <div className="sheet-scores">
      {ids.map((id) => (
        <div key={id} className="sheet-score" title={nameOf(id)}>
          <span className="sheet-score-name">{short ? nameOf(id).slice(0, 3).toUpperCase() : nameOf(id)}</span>
          <span className="sheet-score-value">{values[id] ?? 0}</span>
        </div>
      ))}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="sheet-section">
      <h4 className="sheet-heading">{title}</h4>
      {children}
    </section>
  )
}

function Chips({ items }) {
  if (!items.length) return <p className="sheet-empty">None</p>
  return (
    <ul className="sheet-chips">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

// A named rule with its text underneath (talents, species ability, role benefit).
function RuleList({ entries }) {
  if (!entries.length) return <p className="sheet-empty">None</p>
  return (
    <ul className="sheet-rules">
      {entries.map((entry) => (
        <li key={entry.key} title={entry.description ? `${entry.name}: ${entry.description}` : entry.name}>
          <span className="sheet-rule-name">{entry.name}</span>
          {entry.description && <span className="sheet-rule-text">{entry.description}</span>}
        </li>
      ))}
    </ul>
  )
}

const weaponLine = (weapon) =>
  [
    weapon.injuryModes.map((mode) => getInjuryMode(mode)?.name ?? mode).join(' / '),
    `Severity ${weapon.severity}`,
    weapon.hands === 2 ? 'Two-handed' : null,
    ...(weapon.qualities ?? []),
  ]
    .filter(Boolean)
    .join(' · ')

// One character's full record, laid out as a character sheet. Read-only. className places it (e.g. floating on the
// map); onClose (optional) adds the close button. compact: everything packed into a fixed box (labels beside their
// content, one line per rule with the full text on hover).
export default function CharacterSheetPanel({ character, condition = null, className = '', onClose = null, compact = false }) {
  const current = normalizeCondition(condition)
  const weapons = getCharacterWeapons(armedForWorldCombat(character))
  const subtitle = [character.rank?.name, character.role?.name ?? character.assignment?.name].filter(Boolean).join(' · ')
  const origin = [character.species?.name, character.department?.name].filter(Boolean).join(' / ')
  const abilities = [
    ...(character.speciesAbility ? [{ key: 'species', name: `${character.speciesAbility.name} (species)`, description: character.speciesAbility.description }] : []),
    ...(character.role?.benefit.name ? [{ key: 'role', name: `${character.role.benefit.name} (role)`, description: character.role.benefit.description }] : []),
  ]
  const talents = character.talents.map((talent) => ({
    key: talent.id,
    name: talent.choice ? `${talent.name}: ${talent.choice.name}` : talent.name,
    description: talent.description,
  }))

  return (
    <aside className={`combat-panel character-sheet${compact ? ' is-compact' : ''} ${className}`} aria-label={`${character.name}: character sheet`}>
      <header className="sheet-header">
        <CombatPortrait character={character} className="sheet-portrait" />
        <div className="sheet-identity">
          <h3 className="sheet-name">{character.name}</h3>
          {subtitle && <p className="sheet-subtitle">{subtitle}</p>}
          {compact ? (
            <p className="sheet-origin">{[origin, character.pronouns].filter(Boolean).join(' · ')}</p>
          ) : (
            <>
              {origin && <p className="sheet-origin">{origin}</p>}
              {character.pronouns && <p className="sheet-origin">{character.pronouns}</p>}
            </>
          )}
        </div>
        {onClose && (
          <button type="button" className="sheet-close" aria-label="Close character sheet" title="Close" onClick={onClose}>
            &times;
          </button>
        )}
      </header>

      <div className="sheet-body">
        <div className="sheet-condition">
          <span>
            <b>Stress</b> {current.stress} / {getMaxStress(character).value}
          </span>
          <span>
            <b>Protection</b> {getProtection(character, { injuryType: 'stun' }).value}
          </span>
          <span>
            <b>Fatigue</b> {current.fatigued ? fatigueText(current) : 'No'}
          </span>
          <span>
            <b>Injuries</b> {current.injuries.length ? current.injuries.map(injuryText).join(', ') : 'None'}
          </span>
        </div>

        <Section title="Attributes">
          <ScoreGrid ids={ATTRIBUTE_IDS} values={character.attributes} nameOf={getAttributeName} short={compact} />
        </Section>
        <Section title="Departments">
          <ScoreGrid ids={DISCIPLINE_IDS} values={character.disciplines} nameOf={getDisciplineName} short={compact} />
        </Section>
        <Section title="Focuses">
          <Chips items={character.focuses} />
        </Section>
        <Section title="Values">
          {character.values.length ? (
            <ul className="sheet-values">
              {character.values.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          ) : (
            <p className="sheet-empty">None</p>
          )}
        </Section>
        <Section title="Traits">
          <Chips items={character.traits.map((trait) => trait.name).filter(Boolean)} />
        </Section>
        <Section title="Abilities">
          <RuleList entries={abilities} />
        </Section>
        <Section title="Talents">
          <RuleList entries={talents} />
        </Section>
        <Section title="Weapons">
          <RuleList entries={weapons.map((weapon) => ({ key: weapon.id, name: weapon.name, description: weaponLine(weapon) }))} />
        </Section>
        <Section title="Equipment">
          <Chips items={character.equipment.map((item) => item.name)} />
        </Section>
      </div>
    </aside>
  )
}
