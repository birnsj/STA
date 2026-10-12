// The outro's retelling of the Captain's Log (missionLog.json story): the entries in order as paragraphs of prose in
// the captain's voice. Pure; the templates live in the data file.
import data from '../data/adaptation/exploration/missionLog.json'

// The templates as loaded; the map editor's Story Wording updates them in place when it saves (storyFiles.js).
export const STORY_TEMPLATES = data.story

// "Restore power" -> "restore power"; an acronym ("EPS junction") keeps its capitals.
const lowerFirst = (text) => (/^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text)
const withoutStop = (text) => String(text ?? '').trim().replace(/[.!]+$/, '')
// Object actions are labelled in title case ("Replace the EPS Coupling" -> "replace the EPS coupling").
const lowerTitle = (text) => text.replace(/\b[A-Z][a-z]+\b/g, (word) => word.toLowerCase())

export function joinNames(names) {
  if (names.length < 2) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (match, key) => (Array.isArray(values[key]) ? joinNames(values[key]) : (values[key] ?? match)))

const FIGHT_OUTCOME = { victory: 'fightVictory', defeat: 'fightDefeat' }

// How a fight ended: its outcome, then whoever went down, surrendered or fled, and which of the away team fell.
function fightEnding(story, templates) {
  const lists = [
    ['fightDown', story.down],
    ['fightSurrendered', story.surrendered],
    ['fightFled', story.fled],
    ['fightFallen', story.fallen],
  ]
  return [templates[FIGHT_OUTCOME[story.outcome] ?? 'fightBrokeOff'], ...lists.filter(([, names]) => names?.length).map(([key, names]) => fill(templates[key], { names }))].join(' ')
}

function sentenceFor(story, templates) {
  if (story.event === 'fightEnded') return fightEnding(story, templates)
  const template = templates[story.event]
  if (!template) return null
  return fill(template, {
    ...story,
    action: lowerFirst(withoutStop(story.title)),
    label: !story.label ? templates.unnamedCheck : story.event.startsWith('task') ? lowerTitle(withoutStop(story.label)) : lowerFirst(withoutStop(story.label)),
  })
}

const STARTS_PARAGRAPH = new Set(['fightStartedByUs', 'fightStartedByThem'])
const ENDS_PARAGRAPH = new Set(['objectiveComplete', 'fightEnded'])

// entries: the mission log's entries; templates: the wording, the loaded ones unless previewing others. Returns paragraphs (strings). Characters beaming out one after another are told
// in one sentence; a fight is its own paragraph and a completed objective closes its paragraph.
export function storyParagraphs(entries, templates = STORY_TEMPLATES) {
  const paragraphs = []
  let sentences = []
  let beamed = []
  const flushBeams = () => {
    if (beamed.length) sentences.push(fill(templates.beamOut, { names: joinNames(beamed) }))
    beamed = []
  }
  const closeParagraph = () => {
    if (sentences.length) paragraphs.push(sentences.join(' '))
    sentences = []
  }
  entries.forEach((entry) => {
    if (entry.story?.event === 'beamOut') {
      beamed.push(entry.story.name)
      return
    }
    flushBeams()
    if (STARTS_PARAGRAPH.has(entry.story?.event)) closeParagraph()
    sentences.push((entry.story && sentenceFor(entry.story, templates)) || entry.text)
    if (ENDS_PARAGRAPH.has(entry.story?.event)) closeParagraph()
  })
  flushBeams()
  closeParagraph()
  return paragraphs
}
