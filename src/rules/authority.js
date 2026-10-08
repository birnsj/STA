// Who is in a position of authority on a side (for Direct, and later scenario or party leadership rules).
// Book (STA 2e Core p.289): Direct "may only be attempted by one character on each side in a position of authority (the
// highest-ranking person, or a nominated leader)".
// Prototype (designer decision, Oct 2026): a nominated leader, when a scenario or the party sets one, holds authority;
// otherwise the highest Starfleet rank among those able to act; if the highest rank is shared, or no one has a rank
// recorded, the first character picked for the away team (earliest in pick order among them) is the nominated leader.
import rankData from '../data/source/ranks.json'

// Enlisted ranks sit below every officer rank; a character with no rank recorded ranks lowest of all.
const RANK_ORDER = [...rankData.enlistedRanks, ...rankData.ranks].map((rank) => rank.id)

export const rankIndex = (character) => RANK_ORDER.indexOf(character.rank?.id ?? '')

// candidates: [{ id, character }] in pick order, already limited to those able to act. nominatedId: a leader set by the
// scenario or party (null = none). Returns { id, reason } or null when there is no candidate.
export function findAuthority(candidates, nominatedId = null) {
  if (!candidates.length) return null
  const nominated = candidates.find((candidate) => candidate.id === nominatedId)
  if (nominated) return { id: nominated.id, reason: 'Nominated leader' }
  const best = Math.max(...candidates.map((candidate) => rankIndex(candidate.character)))
  const top = candidates.filter((candidate) => rankIndex(candidate.character) === best)
  if (best >= 0 && top.length === 1) return { id: top[0].id, reason: `Highest rank (${top[0].character.rank.name})` }
  return { id: top[0].id, reason: best >= 0 ? 'Highest rank shared: first picked for the away team' : 'No ranks recorded: first picked for the away team' }
}
