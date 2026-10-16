// Short wordings of a prepared task (rules/taskPreparation.js) and of resolver dice (rules/taskResolver.js), shared by
// the task panels, the roll bar and the action ring. Presentation only.

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 'es'}`
export const signed = (value) => (value > 0 ? `+${value}` : `${value}`)
export const rangeText = (low, high) => (high <= low ? `${low}` : `${low}–${high}`)
export const successesText = (count) => plural(count, 'success')

// "Control 10 + Engineering 4 = TN 14".
export const formulaText = (task) => `${task.attribute.name} ${task.attribute.value} + ${task.department.name} ${task.department.value} = TN ${task.targetNumber}`

export const criticalText = (task) => (task.criticalRange > 1 ? rangeText(1, task.criticalRange) : 'Natural 1')
export const complicationText = (task) => (task.complicationRange > 1 ? rangeText(21 - task.complicationRange, 20) : '20')

export const isBaseLine = (line) => line.label.startsWith('Base')

// What Threat is, in the player's terms (designer request, 2026-10-15: Threat was confusing). Hover tip wherever
// Threat is shown.
export const THREAT_EXPLAINED =
  "Threat is the enemy's advantage. It grows when you buy dice without enough Momentum, make Deadly attacks, or an enemy rolls extra successes. Enemies spend it in fights on bonus dice, extra actions, Counterattacks and shrugging off Injuries."

// How a bonus-dice purchase is paid (missionResources.js checkDicePurchase result): Momentum first, the rest as Threat.
// One short line, so the roll window keeps its size.
export function dicePaymentText({ cost, momentum, threatAdded }) {
  if (!cost) return 'Bonus dice cost Momentum, then Threat'
  if (!threatAdded) return `Paid with ${momentum} Momentum`
  if (!momentum) return `No Momentum: gives the enemy ${threatAdded} Threat`
  return `Pays ${momentum} Momentum + gives the enemy ${threatAdded} Threat`
}

// "Need 2 successes · roll 15 or under (1–4 count twice)" (the roll window, before the roll; one line).
export function needText(task, difficulty) {
  const need = difficulty > 0 ? `Need ${successesText(difficulty)}` : "Difficulty 0: can't fail"
  const double = task.criticalRange > 1 ? ` (${rangeText(1, task.criticalRange)} count twice)` : ' on each d20'
  return `${need} · roll ${task.targetNumber} or under${double}`
}

// The whole task math as hover-tip lines (the roll window's title): Target Number, critical and complication ranges,
// the Difficulty and its changes, what blocks or dooms the task, equipment and effects, and the assist's die.
// prepared: taskPreparation.js prepareTask's result; assist: { task, focus, approach } | null; assistantName: string.
export function taskTipText(prepared, assist = null, assistantName = '') {
  const { task } = prepared
  const changes = prepared.difficultyLines.filter((line) => !isBaseLine(line) && line.change).map((line) => `  ${line.label} ${signed(line.change)}`)
  const lines = [
    formulaText(task),
    `Critical success: ${criticalText(task)}${task.focus ? ` (Focus: ${task.focus})` : ' (no applicable Focus)'}`,
    `Complication: ${complicationText(task)}`,
    `Difficulty ${prepared.difficulty}`,
    ...changes,
    ...prepared.blockers.map((blocker) => `Cannot attempt: ${blocker}`),
    ...(task.autoFail ? [`${task.attribute.name} is shut down by Fatigue: automatic failure`] : []),
    ...prepared.equipment.map((item) => `Equipment ${item.name}: ${item.note}`),
    ...prepared.effects.filter((effect) => effect.applied).map((effect) => `${effect.source} ${effect.name}: ${effect.note}`),
  ]
  if (assist) {
    lines.push(`${assistantName} assists${assist.approach?.label ? ` (${assist.approach.label})` : ''}: ${formulaText(assist.task)}${assist.focus ? `, Focus ${assist.focus}` : ''}; counts only if the leader scores a success`)
  }
  return lines.join('\n')
}

// What one evaluated die scored (resolver evaluateStaDie output): { kind, text, short }.
export function dieVerdict(die) {
  if (die.complication) return { kind: 'complication', text: die.successes ? `Complication · ${successesText(die.successes)}` : 'Complication · 0', short: 'Complication' }
  if (die.critical) return { kind: 'critical', text: 'Critical · 2 successes', short: 'Critical: 2' }
  if (die.successes) return { kind: 'success', text: 'Success · 1 success', short: 'Success: 1' }
  return { kind: 'failure', text: 'Failure · 0', short: 'Failure: 0' }
}
