import { fatigueText, injuryText, isDead, isDying, minorDefeatText } from '../../rules/personalCondition.js'

// The condition tags as small icons for the party cards' top edge (designer request, 2026-10-12): one per Injury
// (with its Severity), Fatigued, each complication and Defeated / Dying; the full wording is on the mouseover.
const ICONS = {
  stun: 'M13 2L4 14h6l-1 8l9-12h-6z',
  deadly: 'M12 2C9 7 6 10.5 6 14a6 6 0 0 0 12 0c0-3.5-3-7-6-12z',
  fatigued: 'M2 7h16v10H2zM4 9v6h12V9zM19 10h2v4h-2zM5 10h3v4H5z',
  complication: 'M12 3L2 21h20zM11 9h2v6h-2zM11 17h2v2h-2z',
  defeated: 'M5 7l2-2l5 5l5-5l2 2l-5 5l5 5l-2 2l-5-5l-5 5l-2-2l5-5z',
}

function ConditionIcon({ kind, title, count = null, className = '' }) {
  return (
    <span className={`condition-icon is-${kind}${className}`} title={title} aria-label={title} role="img">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={ICONS[kind]} fillRule="evenodd" />
      </svg>
      {count != null && <span className="condition-icon-count">{count}</span>}
    </span>
  )
}

export default function ConditionIcons({ condition }) {
  const { injuries, fatigued, defeated } = condition
  const complications = condition.complications ?? []
  if (!injuries.length && !fatigued && !complications.length && !defeated) return null
  const dying = isDying(condition) || isDead(condition)
  return (
    <span className="condition-icons">
      {injuries.map((injury) => (
        <ConditionIcon
          key={injury.id}
          kind={injury.type === 'deadly' ? 'deadly' : 'stun'}
          count={injury.severity}
          className={injury.treated ? ' is-treated' : ''}
          title={`${injuryText(injury)}${injury.source?.weaponName ? ` (from ${injury.source.weaponName})` : ''}`}
        />
      ))}
      {fatigued && <ConditionIcon kind="fatigued" title={`${fatigueText(condition)}: +1 Difficulty on all tasks, no more Stress; tasks with the shut-down attribute automatically fail (Book p.278).`} />}
      {complications.map((complication) => (
        <ConditionIcon key={complication.id} kind="complication" title={`${complication.name}: a complication (Stress over the maximum, Book p.277)`} />
      ))}
      {defeated && (
        <ConditionIcon kind="defeated" className={dying ? ' is-dying' : ''} title={isDying(condition) ? 'Defeated, Dying' : (minorDefeatText(condition) ?? 'Defeated')} />
      )}
    </span>
  )
}
