// Prototype presentation only (designer request, Oct 2026): the gender and portrait an authored NPC is shown with, for
// species with their own NPC portraits (npcPortraits.json). No game-rule effect.
import npcPortraitData from '../data/adaptation/npcPortraits.json'
import { getAuthoredRecord } from './authoredCharacters.js'

const speciesOf = (characterId) => (characterId ? getAuthoredRecord(characterId)?.character.species?.id ?? null : null)

// The NPC portraits a character can wear: its species', of one gender when genderId is given ([] for none).
export function npcPortraitOptions(characterId, genderId = null) {
  const species = speciesOf(characterId)
  if (!species) return []
  return npcPortraitData.portraits.filter((portrait) => portrait.species === species && (!genderId || portrait.gender === genderId))
}

// A stable number for a name, so an Auto NPC keeps the same face every time the map loads.
function hashOf(text) {
  let hash = 0
  for (const char of String(text)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash
}

// One entry from pool, starting from the key's place in it and skipping ids in used while any are left (then noted).
function pick(pool, key, used) {
  if (!pool.length) return null
  const start = hashOf(key) % pool.length
  const rotated = [...pool.slice(start), ...pool.slice(0, start)]
  const entry = rotated.find((candidate) => !used.has(candidate.id)) ?? rotated[0]
  used.add(entry.id)
  return entry
}

// npcs: [{ key, characterId, gender, portraitId }] in map order; gender / portraitId null for Auto. Returns, for each,
// { genderId, portraitId, backdropId } or null when its species has no NPC portraits. A chosen portrait wins (its
// gender with it); an Auto one is picked from the species' portraits of the chosen gender (or of any gender), starting
// from the key and skipping faces another NPC already shows while any are left. The backdrop is always picked that
// way from the species' backdrops (null when it has none).
export function assignNpcAppearances(npcs) {
  const chosen = npcs.map((npc) => npcPortraitOptions(npc.characterId).find((portrait) => portrait.id === npc.portraitId) ?? null)
  const usedPortraits = new Set(chosen.filter(Boolean).map((portrait) => portrait.id))
  const usedBackdrops = new Set()
  return npcs.map((npc, index) => {
    const portrait = chosen[index] ?? pick(npcPortraitOptions(npc.characterId, npc.gender), npc.key, usedPortraits)
    if (!portrait) return null
    const backdrops = npcPortraitData.backdrops.filter((backdrop) => backdrop.species === portrait.species)
    const backdrop = pick(backdrops, `${npc.key}:backdrop`, usedBackdrops)
    return { genderId: portrait.gender, portraitId: portrait.id, backdropId: backdrop?.id ?? null }
  })
}
