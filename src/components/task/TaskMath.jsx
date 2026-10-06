// The one visual language for every rolled task, in exploration and in combat: Attribute + Department = Target Number,
// the Difficulty and where it comes from, the focus and critical range, what blocks or dooms the task, and afterwards
// how each die became the result. Presentation only: everything shown is read from the prepared task
// (rules/taskPreparation.js) and the resolver's result (rules/taskResolver.js); nothing here computes a rule.
import { TASK_DICE } from '../../rules/taskResolver.js'
import { complicationText, formulaText, isBaseLine, rangeText, signed, successesText } from './taskText.js'

// Attribute + Department, stacked like a sum, with the Target Number as the strongest number.
export function TaskFormula({ task }) {
  return (
    <div className="tm-block tm-formula" title={formulaText(task)}>
      <div className="tm-row">
        <span className="tm-label">
          {task.attribute.name}
          <span className="tm-kind" title="Attribute: how the character approaches the task">Attribute</span>
        </span>
        <b className="tm-value">{task.attribute.value}</b>
      </div>
      <div className="tm-row">
        <span className="tm-label">
          <span className="tm-op">+</span>
          {task.department.name}
          <span className="tm-kind" title="Department: the professional expertise used">Department</span>
        </span>
        <b className="tm-value">{task.department.value}</b>
      </div>
      <div className="tm-row tm-total">
        <span className="tm-label">Target Number</span>
        <b className="tm-value">{task.targetNumber}</b>
      </div>
      <p className="tm-help">
        Each d20 rolling <b>{task.targetNumber}</b> or lower scores a success.
      </p>
    </div>
  )
}

// The Difficulty, what it asks for, and every change from the base when there is any. lines: the prepared task's
// difficultyLines (plus any the caller adds, e.g. combat range); difficulty: the final value the roll uses.
// note: replaces the "you need" sentence when the Difficulty isn't fixed yet (an opposed roll).
export function TaskDifficulty({ difficulty, lines = [], note = null }) {
  const base = lines.find(isBaseLine)
  const modifiers = lines.filter((line) => !isBaseLine(line) && line.change)
  const sum = lines.reduce((total, line) => total + line.change, 0)
  return (
    <div className="tm-block tm-difficulty">
      <div className="tm-row tm-total">
        <span className="tm-label">Difficulty</span>
        <b className="tm-value">{difficulty}</b>
      </div>
      <p className="tm-help">
        {note ??
          (difficulty > 0 ? (
            <>
              You need <b>{successesText(difficulty)}</b> to succeed.
            </>
          ) : (
            'No successes needed: every success scored becomes Momentum.'
          ))}
      </p>
      {modifiers.length > 0 && (
        <ul className="tm-lines">
          {base && (
            <li>
              <span>Base Difficulty</span>
              <b>{base.change}</b>
            </li>
          )}
          {modifiers.map((line) => (
            <li key={line.label}>
              <span>{line.label}</span>
              <b>{signed(line.change)}</b>
            </li>
          ))}
          {sum !== difficulty && (
            <li>
              <span>{difficulty > sum ? 'Minimum Difficulty' : 'Never below 0'}</span>
              <b>{difficulty}</b>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function focusExplanation(task) {
  const { department, criticalRange } = task
  const range = rangeText(1, criticalRange)
  if (criticalRange === department.value) return `Because ${department.name} is ${department.value}, a roll of ${range} counts as 2 successes.`
  if (criticalRange === department.value * 2) return `A talent doubles it to twice ${department.name} (${department.value}): a roll of ${range} counts as 2 successes.`
  return `A roll of ${range} counts as 2 successes.`
}

// Whether a focus applies, and the critical range it gives. focusOptions: the focuses the task accepts (to show what
// would have helped when none applies).
export function TaskFocus({ task, focusOptions = [] }) {
  if (task.focus) {
    return (
      <div className="tm-block tm-focus is-on">
        <p className="tm-focus-title">Focus applies</p>
        <p className="tm-focus-name">{task.focus}</p>
        <div className="tm-row">
          <span className="tm-label">Critical success</span>
          <b className="tm-value">{rangeText(1, task.criticalRange)}</b>
        </div>
        <p className="tm-help">{focusExplanation(task)}</p>
      </div>
    )
  }
  const wouldHelp = focusOptions.length > 0 && task.department.value > 1
  return (
    <div className="tm-block tm-focus">
      <p className="tm-focus-title">No applicable Focus</p>
      <div className="tm-row">
        <span className="tm-label">Critical success</span>
        <b className="tm-value">Natural 1</b>
      </div>
      <p className="tm-help">
        Only a roll of 1 counts as 2 successes.
        {wouldHelp && ` With a Focus in ${focusOptions.join(', ')}, a roll of ${rangeText(1, task.department.value)} would.`}
      </p>
    </div>
  )
}

// Why the task can't be attempted (blockers from the authored requirements), or why it is bound to fail (a Fatigued
// character's shut-down attribute: Book p.277, the only automatic failure the resolver has).
export function TaskBlockers({ blockers = [], task = null }) {
  return (
    <>
      {blockers.map((blocker) => (
        <div key={blocker} className="tm-blocker">
          <b>Cannot attempt</b>
          <span>{blocker}</span>
        </div>
      ))}
      {task?.autoFail && (
        <div className="tm-blocker">
          <b>Automatic failure</b>
          <span>{task.attribute.name} is shut down by Fatigue: every die scores nothing, so this task fails.</span>
        </div>
      )}
    </>
  )
}

// Equipment and structured character effects (talents, role benefit, species ability, conditions) the preparation
// found for this task; ones it recognised but doesn't apply are shown greyed. The Fatigue shut-down is in TaskBlockers.
export function TaskModifiers({ equipment = [], effects = [] }) {
  const shown = effects.filter((effect) => !(effect.source === 'Condition' && effect.note.includes('shut down')))
  if (!equipment.length && !shown.length) return null
  return (
    <ul className="tm-block tm-modifiers">
      {equipment.map((item) => (
        <li key={item.name}>
          <span className="tm-modifier-source">Equipment</span> {item.name}: {item.note}
        </li>
      ))}
      {shown.map((effect) => (
        <li key={`${effect.source}${effect.name}${effect.note}`} className={effect.applied ? '' : 'is-inactive'}>
          <span className="tm-modifier-source">{effect.source}</span> {effect.name}: {effect.note}
        </li>
      ))}
    </ul>
  )
}

// Any assist die and the complication range. The dice count (base, bought, total) and its cost are in BonusDicePicker.
export function TaskDice({ task, assist = null }) {
  return (
    <div className="tm-block tm-dice">
      {assist && <p className="tm-help">{assist}</p>}
      <p className="tm-help">A roll of {complicationText(task)} causes a complication.</p>
    </div>
  )
}

// The count after the roll: total successes against the Difficulty, the verdict, the excess and the Momentum it made.
// result: the resolver's result (resolveStaTask), or the same fields from a combat roll.
export function TaskOutcome({ result, difficulty, autoFail = false }) {
  const excess = Math.max(0, result.successes - difficulty)
  return (
    <div className={`tm-outcome ${result.success ? 'is-success' : 'is-failure'}`}>
      <div className="tm-row">
        <span className="tm-label">Total successes</span>
        <b className="tm-value">{result.successes}</b>
      </div>
      <div className="tm-row">
        <span className="tm-label">Required (Difficulty)</span>
        <b className="tm-value">{difficulty}</b>
      </div>
      <p className="tm-verdict">{result.success ? 'Success' : 'Failure'}</p>
      {autoFail && <p className="tm-help">Automatic failure: the shut-down attribute scores nothing.</p>}
      {result.success && (
        <>
          <div className="tm-row">
            <span className="tm-label">Excess successes</span>
            <b className="tm-value">{excess}</b>
          </div>
          <div className="tm-row">
            <span className="tm-label">Momentum generated</span>
            <b className="tm-value">+{result.momentumGenerated}</b>
          </div>
        </>
      )}
    </div>
  )
}

// Who is the strongest choice for this task, said in words (the party cards carry the highlight).
// recommendation: rules/taskRecommendation.js output; nameOf(id) -> display name.
export function RecommendationLine({ recommendation, nameOf, task }) {
  if (!recommendation) return null
  if (recommendation.allTied) return <p className="tm-recommend">Everyone in the party is equally suited to this.</p>
  if (!recommendation.bestIds.length) return <p className="tm-recommend">Nobody in the party can succeed at this right now.</p>
  const best = recommendation.bestIds.map((id) => ({ id, name: nameOf(id), entry: recommendation.entries[id] }))
  const uses = `${task.attribute.name} + ${task.department.name}`
  return (
    <p className="tm-recommend">
      <span className="tm-recommend-star">&#9733;</span> {best.length > 1 ? 'Best choices' : 'Best choice'}:{' '}
      {best.map(({ id, name, entry }, index) => (
        <span key={id}>
          {index > 0 && ' and '}
          <b>{name}</b> (TN {entry.targetNumber}, Difficulty {entry.difficulty}
          {entry.focus ? `, Focus ${entry.focus}` : ''})
        </span>
      ))}
      . This uses {uses}.
    </p>
  )
}

// DEV-only: the prepared task and its result as raw fields, read straight from the shared preparation and resolver.
// rows: extra [label, value] pairs from the caller (character, action, costs).
export function TaskDevDetails({ prepared = null, task, bonusDice = 0, result = null, rows = [] }) {
  const lines = prepared?.difficultyLines ?? []
  const all = [
    ...rows,
    ['Attribute', `${task.attribute.name} (${task.attribute.id}) ${task.attribute.value}`],
    ['Department', `${task.department.name} (${task.department.id}) ${task.department.value}`],
    ['TN', task.targetNumber],
    ['Base Difficulty', lines.find(isBaseLine)?.change ?? '-'],
    ['Final Difficulty', task.difficulty ?? prepared?.difficulty ?? '-'],
    ['Difficulty lines', lines.map((line) => `${line.label} ${signed(line.change)}`).join('; ') || '-'],
    ['Focus', task.focus ?? 'none'],
    ['Critical range', `1-${task.criticalRange}`],
    ['Complication range', complicationText(task)],
    ['Base dice', `${TASK_DICE}d20`],
    ['Purchased dice', bonusDice],
    ['Auto-fail', task.autoFail ? 'yes' : 'no'],
    ...(prepared
      ? [
          ['Possible', prepared.possible ? 'yes' : `no: ${prepared.blockers.join('; ')}`],
          ['Equipment', prepared.equipment.map((item) => `${item.name} (${item.note})`).join('; ') || '-'],
          ['Effects', prepared.effects.map((effect) => `${effect.source}: ${effect.name}: ${effect.note}${effect.applied ? '' : ' [not applied]'}`).join('; ') || '-'],
          ['Ignore complications', prepared.ignoreComplications],
          ['Bonus Momentum', prepared.bonusMomentum],
        ]
      : []),
    ...(result ? [['Result', `${result.successes} successes vs ${result.difficulty ?? task.difficulty}: ${result.success ? 'SUCCESS' : 'FAILURE'}, Momentum ${result.momentumGenerated}, complications ${result.complications}`]] : []),
  ]
  return (
    <details className="tm-dev" open>
      <summary>Task details (dev)</summary>
      <table>
        <tbody>
          {all.map(([label, value]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
