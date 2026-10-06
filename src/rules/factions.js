import factionData from '../data/adaptation/factions.json'

const factionsById = new Map(factionData.factions.map((faction) => [faction.id, faction]))

export const getFaction = (factionId) => factionsById.get(factionId) ?? null

// { id, name } of the faction every creator-made character belongs to (factions.json creatorFaction).
export const getCreatorFaction = () => {
  const { id, name } = getFaction(factionData.creatorFaction)
  return { id, name }
}
