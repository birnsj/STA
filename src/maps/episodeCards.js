// Episode cards: the picture an episode shows in Load Episode. A map's card is either a catalogue card id
// (episodeCards.json) or the path of a picture Generate Card drew for it (starts with '/').
// Prototype presentation, not a source-book rule.
import catalogue from '../data/adaptation/maps/episodeCards.json'

export const EPISODE_CARDS = catalogue.cards
export const CARD_IMAGE = catalogue.imageSize

export const isDrawnCard = (card) => typeof card === 'string' && card.startsWith('/')

// The file name (without .png) of a picture Generate Card drew, or null for catalogue cards.
export const drawnCardFileId = (card) => {
  const match = isDrawnCard(card) && /^\/art\/episodes\/([^/?]+)\.png/.exec(card)
  return match ? decodeURIComponent(match[1]) : null
}

// { id, label, image }, or null when the card is empty or no longer in the catalogue.
export const cardFor = (card) =>
  isDrawnCard(card) ? { id: card, label: 'Generated picture', image: card } : (EPISODE_CARDS.find((entry) => entry.id === card) ?? null)

// How well a card suits a location and biome (biome null for space locations): -1 = not at all; higher = more specific.
function cardScore(card, location, biome) {
  if (card.locations.length && !card.locations.includes(location)) return -1
  if (biome && card.biomes.length && !card.biomes.includes(biome)) return -1
  if (!biome && card.biomes.length) return -1
  return (card.locations.length ? 2 : 0) + (card.biomes.length ? 1 : 0)
}

// A random card from the most specific matches, other than currentId when there is another; null when none suit.
export function pickCard(location, biome, currentId = null, random = Math.random) {
  const scored = EPISODE_CARDS.map((card) => ({ card, score: cardScore(card, location, biome) })).filter((entry) => entry.score >= 0)
  if (!scored.length) return null
  const best = Math.max(...scored.map((entry) => entry.score))
  const top = scored.filter((entry) => entry.score === best).map((entry) => entry.card)
  const fresh = top.filter((card) => card.id !== currentId)
  const pool = fresh.length ? fresh : top
  return pool[Math.floor(random() * pool.length)]
}
