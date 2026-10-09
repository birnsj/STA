import { getSpeciesAbilityLabel, getSpeciesAbilityTitle, getSpeciesDisplayName } from '../rules/species.js'
import {
  getCharacterFocuses,
  getCharacterValues,
  getFinalScores,
  getKindInfo,
  getPortraitById,
  getRequiredFocusCount,
  getRequiredValueCount,
} from '../rules/finishingTouches.js'
import { getRequiredTalentCount, getTalentById, getTalentEntries, getTalentLabel } from '../rules/talents.js'
import { getRoleBenefitName, getRoleById } from '../rules/roles.js'
import { getUniformColour } from '../rules/uniform.js'
import Portrait from './Portrait.jsx'

const EMPTY = '—'
const NOT_ASSIGNED = 'Not Assigned'

const formatBonus = (bonus) => bonus && `${bonus.name} (+${bonus.value})`
const formatBonusList = (bonuses) => bonuses.map((bonus) => `${bonus.name} ${bonus.value > 0 ? '+' : '−'}${Math.abs(bonus.value)}`).join(', ')
const joinNames = (entries) => entries.map((entry) => entry.name).join(', ')
const formatOutlook = ({ outlook, path }) => outlook && (path ? `${outlook.name} (${path.name})` : outlook.name)

function talentRow(character, stepId) {
  const slot = character.talents[stepId]
  const talent = slot ? getTalentById(slot.id) : null
  return { label: 'Talent', value: getTalentLabel(slot), title: talent ? `${getTalentLabel(slot)}: ${talent.description}` : undefined, variant: 'is-sub' }
}

function SummaryGroup({ rows }) {
  return (
    <dl className="summary-group">
      {rows.map(({ label, value, title, variant = '', empty = EMPTY }) => (
        <div key={label} className={`summary-row ${variant}`}>
          <dt>{label}</dt>
          <dd title={title || value || undefined}>{value || (variant === 'is-heading' ? '' : empty)}</dd>
        </div>
      ))}
    </dl>
  )
}

// Final scores appear only once Finishing Touches has resolved them.
function ScoreRow({ label, entries, scores }) {
  return (
    <div className={`summary-row${scores ? ' summary-score-row' : ''}`}>
      <dt>{label}</dt>
      {scores ? (
        <dd className="summary-score-grid">
          {entries.map((entry) => (
            <span key={entry.id} title={`${entry.name} ${scores[entry.id]}`}>
              {entry.name.slice(0, 3).toUpperCase()} <strong>{scores[entry.id]}</strong>
            </span>
          ))}
        </dd>
      ) : (
        <dd>{NOT_ASSIGNED}</dd>
      )}
    </div>
  )
}

function CountRow({ label, items, required }) {
  return (
    <div className="summary-row">
      <dt>{label}</dt>
      <dd title={items.join('\n') || undefined}>{items.length ? `${items.length}/${required}` : EMPTY}</dd>
    </div>
  )
}

export default function CharacterSummary({ character }) {
  const { species, environment, earlyOutlook, education, career, careerHistory, identity } = character
  const historySlots = careerHistory.events.filter(Boolean)
  const traitNames = species?.traits.map((trait) => trait.name).join(', ')
  const speciesName = getSpeciesDisplayName(species)
  const portrait = getPortraitById(identity.portrait?.id)
  const values = getCharacterValues(character)
  const focuses = getCharacterFocuses(character)
  const role = getRoleById(career.role?.id)

  return (
    <aside className="summary panel">
      <h2 className="summary-heading">Character Summary</h2>
      <div className="portrait-carousel portrait-summary">
        <Portrait label={portrait?.name ?? (identity.name.trim() || speciesName)} image={portrait?.image ?? null} uniform={getUniformColour(career.department?.id)} className="portrait-carousel-image" />
      </div>
      <SummaryGroup
        rows={[
          { label: 'Name', value: identity.name.trim() },
          { label: 'Species', value: speciesName },
          { label: 'Gender', value: identity.gender?.name },
          { label: 'Species Trait', value: traitNames },
          { label: 'Species Ability', value: getSpeciesAbilityLabel(species), title: getSpeciesAbilityTitle(species) },
        ]}
      />
      <SummaryGroup
        rows={[
          { label: 'Environment', variant: 'is-heading' },
          { label: 'Setting', value: environment.setting?.name, variant: 'is-sub' },
          ...(environment.otherSpecies ? [{ label: 'Raised Among', value: environment.otherSpecies.name, variant: 'is-sub' }] : []),
          { label: 'Value', value: environment.value?.text.trim(), variant: 'is-sub' },
          { label: 'Attribute Bonus', value: formatBonus(environment.attributeBonus), variant: 'is-sub' },
          { label: 'Department Bonus', value: formatBonus(environment.disciplineBonus), variant: 'is-sub' },
        ]}
      />
      <SummaryGroup
        rows={[
          { label: 'Upbringing', value: formatOutlook(earlyOutlook), variant: 'is-heading' },
          { label: 'Attribute Bonus', value: formatBonusList(earlyOutlook.attributeBonuses), variant: 'is-sub' },
          { label: 'Department Bonus', value: formatBonus(earlyOutlook.disciplineBonus), variant: 'is-sub' },
          { label: 'Focus', value: earlyOutlook.focus?.name.trim(), variant: 'is-sub' },
          talentRow(character, 'earlyOutlook'),
        ]}
      />
      <SummaryGroup
        rows={[
          { label: 'Career Path', value: education.option?.name, variant: 'is-heading' },
          { label: 'Trait', value: education.trait?.name, variant: 'is-sub' },
          { label: 'Attribute Bonus', value: formatBonusList(education.attributeBonuses), variant: 'is-sub' },
          { label: 'Department Bonus', value: formatBonusList(education.disciplineBonuses), variant: 'is-sub' },
          { label: 'Focuses', value: education.focuses.map((focus) => focus.name).join(', '), variant: 'is-sub' },
          { label: 'Value', value: education.value?.text.trim(), variant: 'is-sub' },
          talentRow(character, 'education'),
        ]}
      />
      <SummaryGroup
        rows={[
          { label: 'Career', value: career.length?.name, variant: 'is-heading' },
          { label: 'Value', value: career.value?.text.trim(), variant: 'is-sub' },
          talentRow(character, 'career'),
          { label: 'Career History', value: joinNames(historySlots.map((slot) => slot.event)), variant: 'is-heading' },
          { label: 'Attribute Bonus', value: formatBonusList(historySlots.map((slot) => slot.attributeBonus).filter(Boolean)), variant: 'is-sub' },
          { label: 'Department Bonus', value: formatBonusList(historySlots.map((slot) => slot.disciplineBonus).filter(Boolean)), variant: 'is-sub' },
          { label: 'Focuses', value: joinNames(historySlots.map((slot) => slot.focus).filter(Boolean)), variant: 'is-sub' },
        ]}
      />
      <SummaryGroup
        rows={[
          { label: 'Rank', value: career.rank?.name },
          { label: 'Assignment', value: career.assignment?.name },
          { label: 'Department', value: career.department?.name },
          { label: 'Role', value: role?.name },
          ...(role ? [{ label: 'Role Benefit', value: role.benefit.description, title: `${getRoleBenefitName(role)}: ${role.benefit.description}` }] : []),
        ]}
      />
      <SummaryGroup rows={[{ label: 'Finishing Touches', variant: 'is-heading' }, talentRow(character, 'finishingTouches')]} />
      <dl className="summary-group">
        <ScoreRow label="Attributes" entries={getKindInfo('attributes').entries} scores={getFinalScores(character, 'attributes')} />
        <ScoreRow label="Departments" entries={getKindInfo('disciplines').entries} scores={getFinalScores(character, 'disciplines')} />
        <CountRow label="Values" items={values.map((value) => value.text.trim())} required={getRequiredValueCount()} />
        <CountRow label="Focuses" items={focuses.map((focus) => focus.name.trim())} required={getRequiredFocusCount()} />
        <CountRow label="Talents" items={getTalentEntries(character).map((entry) => entry.label)} required={getRequiredTalentCount()} />
      </dl>
    </aside>
  )
}
