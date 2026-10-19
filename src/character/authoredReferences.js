// Where an authored character id is referenced (maps, exploration npcs.json, combat encounter rosters).
// Used to block Character Library delete and to surface unknown characterId warnings.
import encountersData from '../data/adaptation/combat/encounters.json'
import npcsData from '../data/adaptation/exploration/npcs.json'
import { hasAuthoredCharacter } from './authoredCharacters.js'

// Vite transforms import.meta.glob at build time. Node tests have no glob — pass mapSources or rely on openMap + JSON.
const VITE_MAPS =
  typeof import.meta.glob === 'function'
    ? import.meta.glob('/maps/*.json', { eager: true, import: 'default' })
    : null

function mapIdFromPath(file) {
  return file.slice('/maps/'.length, -'.json'.length)
}

function defaultMapSources() {
  if (!VITE_MAPS) return []
  return Object.entries(VITE_MAPS).map(([file, record]) => ({
    id: mapIdFromPath(file),
    npcs: record?.npcs || [],
  }))
}

function refsFromMapNpcs(mapId, npcs, characterId) {
  const hits = []
  ;(npcs ?? []).forEach((npc) => {
    if (npc?.characterId === characterId) {
      hits.push({
        kind: 'map',
        mapId,
        npcId: npc.id || null,
        label: npc.name || npc.id || characterId,
      })
    }
  })
  return hits
}

function refsFromNpcsJson(characterId) {
  const hits = []
  Object.entries(npcsData.maps || {}).forEach(([mapKey, list]) => {
    ;(list || []).forEach((npc) => {
      if (npc?.characterId === characterId) {
        hits.push({
          kind: 'npcsJson',
          mapKey,
          npcId: npc.id || null,
          label: npc.name || npc.id || characterId,
        })
      }
    })
  })
  ;(npcsData.fallback || []).forEach((npc) => {
    if (npc?.characterId === characterId) {
      hits.push({
        kind: 'npcsJson',
        mapKey: 'fallback',
        npcId: npc.id || null,
        label: npc.name || npc.id || characterId,
      })
    }
  })
  return hits
}

function refsFromEncounters(characterId) {
  return (encountersData.encounters || [])
    .filter((encounter) => (encounter.roster || []).includes(characterId))
    .map((encounter) => ({
      kind: 'encounter',
      encounterId: encounter.id,
      label: encounter.name || encounter.id,
    }))
}

/**
 * Synchronous reference scan.
 * Pass `openMap` for the unsaved editor map. Pass `mapSources` in Node tests (Vite supplies bundled maps).
 */
export function findAuthoredCharacterReferences(characterId, { openMap = null, mapSources = null } = {}) {
  if (!characterId) return []
  const hits = []
  const seenMapNpc = new Set()

  const pushMapHits = (mapId, npcs) => {
    refsFromMapNpcs(mapId, npcs, characterId).forEach((hit) => {
      const key = `${hit.mapId}::${hit.npcId}`
      if (seenMapNpc.has(key)) return
      seenMapNpc.add(key)
      hits.push(hit)
    })
  }

  if (openMap) pushMapHits(openMap.id || openMap.name || 'open-map', openMap.npcs)
  ;(mapSources ?? defaultMapSources()).forEach((source) => pushMapHits(source.id, source.npcs))
  hits.push(...refsFromNpcsJson(characterId))
  hits.push(...refsFromEncounters(characterId))
  return hits
}

/** Prefer live DEV map list when available; otherwise same as the sync scan. */
export async function findAuthoredCharacterReferencesAsync(characterId, { openMap = null } = {}) {
  if (import.meta.env?.DEV && typeof fetch === 'function') {
    try {
      const { listMaps, loadMap } = await import('../maps/mapFiles.js')
      const sources = []
      for (const summary of await listMaps()) {
        const map = await loadMap(summary.id)
        sources.push({ id: map.id, npcs: map.npcs })
      }
      return findAuthoredCharacterReferences(characterId, { openMap, mapSources: sources })
    } catch {
      /* fall through to sync scan */
    }
  }
  return findAuthoredCharacterReferences(characterId, { openMap })
}

export function formatAuthoredReference(hit) {
  if (hit.kind === 'map') return `Map “${hit.mapId}” (NPC ${hit.label})`
  if (hit.kind === 'npcsJson') {
    const where = hit.mapKey ? `npcs.json → ${hit.mapKey}` : 'npcs.json'
    return `${where} (NPC ${hit.label})`
  }
  if (hit.kind === 'encounter') return `Encounter “${hit.label}”`
  return String(hit.label || hit.kind)
}

export function isUnknownAuthoredCharacterId(characterId) {
  return Boolean(characterId) && !hasAuthoredCharacter(characterId)
}
