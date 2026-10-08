import attributeSource from '../data/source/attributes.json'
import disciplineSource from '../data/source/disciplines.json'
import rankSource from '../data/source/ranks.json'

// Info box content: { title, text?, sections?: [{ label, text }], note?, source? }. Null means the item has nothing worth showing.
const scoresById = new Map([...attributeSource.attributes, ...disciplineSource.disciplines].map((entry) => [entry.id, entry]))
const ranksById = new Map([...rankSource.ranks, ...rankSource.enlistedRanks].map((rank) => [rank.id, rank]))
const bookSource = (page, book = "Captain's Log") => (page ? `${book}, p.${page}` : null)

export function getCardTip(item) {
  if (!item?.description) return null
  return { title: item.name, text: item.description, source: bookSource(item.source?.page, item.source?.book) }
}

// Attributes and disciplines share one lookup; their ids never collide.
export function getScoreTip(scoreId) {
  const entry = scoresById.get(scoreId)
  return entry ? { title: entry.name, text: entry.description, source: bookSource(entry.page) } : null
}

export function getAssignmentTip(assignment, block) {
  return {
    title: assignment.name,
    text: assignment.description,
    note: block ? `${block}.` : null,
    source: bookSource(assignment.source?.page, assignment.source?.book),
  }
}

export function getRankTip(rankId) {
  const rank = ranksById.get(rankId)
  if (!rank?.note) return null
  return { title: rank.name, text: rank.note, source: bookSource(rankSource.source.page, rankSource.source.book) }
}
