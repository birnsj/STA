import { getSpeciesDisplayName } from './species.js'

const withArticle = (text) => `${/^[aeiou]/i.test(text) ? 'an' : 'a'} ${text}`

const joinWords = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0])

// The character's lifepath as short sentences, skipping steps not chosen yet. Presentation only.
export function getLifeTrackSentences(character) {
  const { identity, environment, earlyOutlook, education, career, careerHistory, finishingTouches } = character
  const name = identity.name.trim()
  const species = getSpeciesDisplayName(character.species)
  const sentences = []

  if (species) sentences.push(`${name || 'This character'} is ${withArticle(species)}.`)

  if (environment.otherSpecies) sentences.push(`Raised among the ${environment.otherSpecies.name}.`)
  else {
    const upbringing = environment.condition?.name ?? environment.setting?.name
    if (upbringing) sentences.push(`Raised in ${withArticle(upbringing)} environment.`)
  }

  if (earlyOutlook.outlook) {
    const outlook = earlyOutlook.path ? `${earlyOutlook.outlook.name} (${earlyOutlook.path.name})` : earlyOutlook.outlook.name
    sentences.push(`Early outlook: ${outlook}.`)
  }

  if (education.option) sentences.push(`Education: ${education.option.name}.`)

  if (career.length || career.rank) {
    const officer = [career.length?.name, career.rank?.name].filter(Boolean).join(' ')
    sentences.push(`Career: ${officer}${career.assignment ? `, serving as ${career.assignment.name}` : ''}.`)
  }

  const events = careerHistory.events.filter(Boolean).map((slot) => slot.event.name)
  if (events.length) sentences.push(`Key events: ${joinWords(events)}.`)

  const finalValue = finishingTouches.value?.text.trim()
  if (finalValue) sentences.push(`Final value: “${finalValue}”`)

  return sentences
}
