// Presentation-only hazard panic (designer 2026-10-15): while a character hazard overlay is active, low Fitness
// prefers a looping panic body pose. No Difficulty or action-cost effect.
// Fitness ≤ 9: always panic while idle. 10–11: ~50% (stable per character id). ≥ 12: never.

function hashOf(text) {
  let hash = 0
  for (const char of String(text)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash
}

// overlayActive: true when characterHazardOverlayType returned a type. Returns whether the panic pose should play.
export function hazardPanic(character, overlayActive) {
  if (!overlayActive || !character) return false
  const fitness = character.attributes?.fitness ?? 7
  if (fitness <= 9) return true
  if (fitness >= 12) return false
  return hashOf(character.id ?? character.name ?? '') % 2 === 0
}
