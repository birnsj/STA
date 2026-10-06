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

// What one evaluated die scored (resolver evaluateStaDie output): { kind, text, short }.
export function dieVerdict(die) {
  if (die.complication) return { kind: 'complication', text: die.successes ? `Complication · ${successesText(die.successes)}` : 'Complication · 0', short: 'Complication' }
  if (die.critical) return { kind: 'critical', text: 'Critical · 2 successes', short: 'Critical: 2' }
  if (die.successes) return { kind: 'success', text: 'Success · 1 success', short: 'Success: 1' }
  return { kind: 'failure', text: 'Failure · 0', short: 'Failure: 0' }
}
