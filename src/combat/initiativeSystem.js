// Book (Core p.277): one player character goes first (highest Daring if unclear), then the sides alternate one character
// at a time; 2 Momentum Keeps the Initiative for one more player character. Keep the Initiative is not used here.
// Designer spec: individual initiative fixed at the start of combat - highest Daring first, ties by Control, then random.
// Designer decision (2026-10-09): the sides alternate one combatant at a time, starting with firstSide (the party), each
// side in its own Daring order; once the smaller side has run out, the rest of the larger side follows in order.
// firstIds lets an ambush/surprise rule put chosen combatants at the very front.
export function buildInitiativeOrder(combatants, random, { firstIds = [], firstSide = null } = {}) {
  const tieBreaks = new Map(combatants.map((combatant) => [combatant.id, random()]))
  const sorted = [...combatants].sort(
    (a, b) =>
      b.character.attributes.daring - a.character.attributes.daring ||
      b.character.attributes.control - a.character.attributes.control ||
      tieBreaks.get(b.id) - tieBreaks.get(a.id),
  )
  const ids = firstSide ? alternate(sorted, firstSide) : sorted.map((combatant) => combatant.id)
  const first = firstIds.filter((id) => ids.includes(id))
  return [...first, ...ids.filter((id) => !first.includes(id))]
}

function alternate(sorted, firstSide) {
  const leading = sorted.filter((combatant) => combatant.side === firstSide)
  const trailing = sorted.filter((combatant) => combatant.side !== firstSide)
  const ids = []
  for (let i = 0; i < Math.max(leading.length, trailing.length); i++) {
    if (leading[i]) ids.push(leading[i].id)
    if (trailing[i]) ids.push(trailing[i].id)
  }
  return ids
}
