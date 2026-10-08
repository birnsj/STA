// Book (Core p.277): one player character goes first (highest Daring if unclear), then the sides alternate one character
// at a time; 2 Momentum Keeps the Initiative for one more player character. Not used here.
// Designer spec: individual initiative fixed at the start of combat - highest Daring first, ties by Control, then random.
// Designer decision (Oct 2026): firstSide puts that whole side ahead of the other each round (the party goes first), keeping
// Daring order within each side. firstIds lets a later ambush/surprise rule put chosen combatants at the very front.
export function buildInitiativeOrder(combatants, random, { firstIds = [], firstSide = null } = {}) {
  const tieBreaks = new Map(combatants.map((combatant) => [combatant.id, random()]))
  const sideRank = (combatant) => (firstSide && combatant.side !== firstSide ? 1 : 0)
  const sorted = [...combatants].sort(
    (a, b) =>
      sideRank(a) - sideRank(b) ||
      b.character.attributes.daring - a.character.attributes.daring ||
      b.character.attributes.control - a.character.attributes.control ||
      tieBreaks.get(b.id) - tieBreaks.get(a.id),
  )
  const first = firstIds.filter((id) => sorted.some((combatant) => combatant.id === id))
  return [...first, ...sorted.map((combatant) => combatant.id).filter((id) => !first.includes(id))]
}
