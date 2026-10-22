// Live Generate Map wall-variant sets (share / panelVariants / tileVariants) keyed by base wall tile id.
// Seeded from generatedWallVariants.json; Generator Editor can update memory and persist via /__wall-variants.
import seed from '../../data/adaptation/maps/generatedWallVariants.json'
import { TILES } from '../mapFormat.js'

const knownTile = (id) => typeof id === 'string' && TILES.some((tile) => tile.id === id)

function clampShare(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100))
}

function cleanList(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const id of list) {
    if (!knownTile(id) || out.includes(id)) continue
    out.push(id)
  }
  return out
}

function cloneWalls(source) {
  const next = {}
  for (const [id, set] of Object.entries(source?.walls ?? {})) {
    if (!id || !set || typeof set !== 'object') continue
    next[id] = {
      share: clampShare(set.share ?? 0),
      panelVariants: [...(set.panelVariants ?? [])],
      tileVariants: [...(set.tileVariants ?? [])],
    }
  }
  return next
}

let walls = cloneWalls(seed)

// Empty editable draft when a wall has no variant entry yet.
export function emptyWallVariantSet() {
  return { share: 0.4, panelVariants: [], tileVariants: [] }
}

// Resolved set for applyWallVariants, or null when this wall stays plain.
export function getWallVariantSet(wallId) {
  if (!knownTile(wallId)) return null
  const raw = walls[wallId]
  if (!raw) return null
  const panelVariants = cleanList(raw.panelVariants)
  const tileVariants = cleanList(raw.tileVariants)
  if (!panelVariants.length && !tileVariants.length) return null
  return { share: clampShare(raw.share), panelVariants, tileVariants }
}

// Form-friendly set (always an object; missing walls get emptyWallVariantSet defaults).
export function getWallVariantDraft(wallId) {
  const live = getWallVariantSet(wallId)
  if (live) return { ...live, panelVariants: [...live.panelVariants], tileVariants: [...live.tileVariants] }
  const raw = walls[wallId]
  if (raw) {
    return {
      share: clampShare(raw.share),
      panelVariants: cleanList(raw.panelVariants),
      tileVariants: cleanList(raw.tileVariants),
    }
  }
  return emptyWallVariantSet()
}

export function wallVariantEqual(a, b) {
  if (!a || !b) return false
  if (clampShare(a.share) !== clampShare(b.share)) return false
  const panelsA = cleanList(a.panelVariants)
  const panelsB = cleanList(b.panelVariants)
  const tilesA = cleanList(a.tileVariants)
  const tilesB = cleanList(b.tileVariants)
  if (panelsA.length !== panelsB.length || tilesA.length !== tilesB.length) return false
  return panelsA.every((id, i) => id === panelsB[i]) && tilesA.every((id, i) => id === tilesB[i])
}

// Apply or clear a wall's variant set in memory. Empty lists remove the entry.
export function setWallVariantSetLocal(wallId, patch) {
  if (!knownTile(wallId)) throw new Error(`Unknown wall tile ${wallId}`)
  const merged = { ...getWallVariantDraft(wallId), ...(patch && typeof patch === 'object' ? patch : {}) }
  const panelVariants = cleanList(merged.panelVariants)
  const tileVariants = cleanList(merged.tileVariants)
  const share = clampShare(merged.share)
  if (!panelVariants.length && !tileVariants.length) {
    delete walls[wallId]
    return emptyWallVariantSet()
  }
  walls[wallId] = { share, panelVariants, tileVariants }
  return getWallVariantDraft(wallId)
}

export function replaceWallVariantsLocal(next) {
  walls = cloneWalls(next?.walls ? next : { walls: next })
}

export function wallVariantsSnapshot() {
  return { notes: seed.notes ?? [], walls: cloneWalls({ walls }) }
}
