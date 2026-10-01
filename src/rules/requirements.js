// Each step reports its requirements as { sectionId: isMet } so screens can flag the unmet sections.
export const areAllMet = (requirements) => Object.values(requirements).every(Boolean)

// Prototype design: sections unlock in the order a step lists its requirements (its on-screen order),
// so a section is locked until every section before it is met. Only the first unmet section is unlocked.
export function getLockedSections(requirements) {
  let earlierUnmet = false
  const locked = {}
  for (const [sectionId, met] of Object.entries(requirements)) {
    locked[sectionId] = earlierUnmet
    if (!met) earlierUnmet = true
  }
  return locked
}
