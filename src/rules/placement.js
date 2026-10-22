// World placement surfaces: tile tops and item tops that inventory drops (and stacked props) can rest on.
// Z is world-space art pixels (same unit as tiles.json height), derived from the support — never stored as authority.
// Videogame adaptation — STA 2e has no world-prop grid.
import { blocksMovement } from '../combat/battleMap.js'
import { tileOf } from '../exploration/navigation.js'
import { getTile, TILE_IMAGE } from '../maps/mapFormat.js'
import { project, TILE_H, TILE_W, unproject } from '../maps/iso.js'
import { getItemById } from './equipment.js'

// How far in from the tile edge the usable top is (tile units). Small — furniture tops are nearly full-tile.
export const DEFAULT_SURFACE_INSET = 0.05
export const GLOBAL_STACK_CAP = 3
export const ITEM_SUPPORT_DEPTH_CAP = 3
// Match inventory.ITEM_CELL_PX (TILE_W / 32) without importing inventory (avoids a cycle).
const ITEM_CELL_PX = TILE_W / 32
// Depth bias so an item on a support always sorts after that tile's block sprite (and its front face).
const SURFACE_DEPTH_BIAS = 0.55

const cellKey = ({ x, y }) => `${x},${y}`

function snapItemPosition(point, cellPx = ITEM_CELL_PX) {
  const size = Number(cellPx) > 0 ? Number(cellPx) : ITEM_CELL_PX
  const step = size / TILE_W
  return {
    x: Math.round(point.x / step) * step,
    y: Math.round(point.y / step) * step,
  }
}

function itemGridKey(position, cellPx = ITEM_CELL_PX) {
  const snapped = snapItemPosition(position, cellPx)
  return `${snapped.x},${snapped.y}`
}

// Resolved surface from a tile catalogue entry (opt-in via tiles.json "surface"), or null.
export function surfaceOfTile(tileOrId) {
  const tile = typeof tileOrId === 'string' ? getTile(tileOrId) : tileOrId
  if (!tile?.surface || typeof tile.surface !== 'object') return null
  const authored = tile.surface
  return {
    topZ: Number.isFinite(authored.topZ) ? authored.topZ : tile.height ?? 0,
    inset: Number.isFinite(authored.inset) ? authored.inset : DEFAULT_SURFACE_INSET,
    accepts: Array.isArray(authored.accepts) ? authored.accepts : null,
    maxStack: Number.isFinite(authored.maxStack) ? authored.maxStack : 1,
  }
}

// Item catalogue surface (opt-in via items.json "surface"), or null.
export function surfaceOfItem(itemOrId) {
  const def = typeof itemOrId === 'string' ? getItemById(itemOrId) : itemOrId
  if (!def?.surface || typeof def.surface !== 'object') return null
  const authored = def.surface
  const scale = Math.max(0.15, Math.min(1, def.worldScale ?? 0.4))
  const derivedTop = Math.round(TILE_IMAGE.height * scale * 0.35)
  return {
    topZ: Number.isFinite(authored.topZ) ? authored.topZ : derivedTop,
    inset: Number.isFinite(authored.inset) ? authored.inset : DEFAULT_SURFACE_INSET,
    accepts: Array.isArray(authored.accepts) ? authored.accepts : null,
    maxStack: Number.isFinite(authored.maxStack) ? authored.maxStack : 1,
  }
}

// Tile-space square footprint (chebyshev): covers the full furniture top better than an iso diamond,
// which only accepted a small centre region and felt like "one drop cell" on a table.
export function pointInSurfaceFootprint(point, tilePos, inset = DEFAULT_SURFACE_INSET) {
  const half = 0.5 - Math.max(0, Math.min(0.49, inset))
  const dx = Math.abs(point.x - tilePos.x)
  const dy = Math.abs(point.y - tilePos.y)
  return Math.max(dx, dy) <= half + 1e-9
}

export function clampToSurfaceFootprint(point, tilePos, inset = DEFAULT_SURFACE_INSET) {
  const half = 0.5 - Math.max(0, Math.min(0.49, inset))
  return {
    x: Math.min(tilePos.x + half, Math.max(tilePos.x - half, point.x)),
    y: Math.min(tilePos.y + half, Math.max(tilePos.y - half, point.y)),
  }
}

// True when a board/SVG point lies on the raised iso diamond of a tile (lift = topZ art pixels).
export function pointInRaisedTileDiamond(boardPoint, tilePos, lift = 0, scale = 1) {
  const c = project(tilePos)
  const halfW = (TILE_W / 2) * scale
  const halfH = (TILE_H / 2) * scale
  if (halfW <= 0 || halfH <= 0) return false
  const dx = (boardPoint.x - c.x) / halfW
  const dy = (boardPoint.y - (c.y - lift)) / halfH
  return Math.abs(dx) + Math.abs(dy) <= 1 + 1e-6
}

// stackOver layers under a cell: list of tile ids sitting on the base tile (bottom → top).
export function stackLayersAt(map, tilePos) {
  if (!map?.stackOver) return []
  const list = map.stackOver[cellKey(tilePos)]
  return Array.isArray(list) ? list : []
}

// Base Z of the top of the base tile plus every stacked prop below the top surface.
export function stackBaseZ(map, tilePos) {
  const tileId = map.tiles?.[tilePos.y]?.[tilePos.x]
  if (!tileId) return 0
  let z = getTile(tileId).height ?? 0
  for (const id of stackLayersAt(map, tilePos)) {
    z += getTile(id).height ?? 0
  }
  return z
}

// Surface available at a tile cell (base tile or top of stackOver), or null.
export function tileSurfaceAt(map, tilePos) {
  const layers = stackLayersAt(map, tilePos)
  const topId = layers.length ? layers[layers.length - 1] : map.tiles?.[tilePos.y]?.[tilePos.x]
  if (!topId) return null
  const surface = surfaceOfTile(topId)
  if (!surface) return null
  // When stacked, topZ is the stacked height (sum of heights); authored topZ on the top tile replaces only that tile's contribution.
  const baseId = map.tiles[tilePos.y][tilePos.x]
  let below = 0
  if (layers.length) {
    below = getTile(baseId).height ?? 0
    for (let i = 0; i < layers.length - 1; i++) below += getTile(layers[i]).height ?? 0
  }
  const topTile = getTile(topId)
  const topContribution = Number.isFinite(topTile.surface?.topZ) ? topTile.surface.topZ : topTile.height ?? 0
  return {
    ...surface,
    topZ: below + topContribution,
    tileId: topId,
    stackLevel: layers.length,
  }
}

function supportEquals(a, b) {
  if (!a && !b) return true
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'tile') return a.tile.x === b.tile.x && a.tile.y === b.tile.y
  if (a.kind === 'item') return a.instanceId === b.instanceId
  return false
}

// Walk item→item supports; returns the chain (nearest first) or null on cycle / depth overflow.
export function itemSupportChain(state, instanceId, { excludeInstanceId = null } = {}) {
  const chain = []
  const seen = new Set()
  let current = instanceId
  while (current) {
    if (current === excludeInstanceId) break
    if (seen.has(current) || chain.length >= ITEM_SUPPORT_DEPTH_CAP) return null
    seen.add(current)
    const entry = state.groundItems?.[current]
    if (!entry) break
    chain.push(entry)
    const support = entry.support
    if (!support || support.kind !== 'item') break
    current = support.instanceId
  }
  return chain
}

// Derived world Z for a ground entry (or 0 for the floor).
export function zOf(state, entry) {
  if (!entry?.support) return 0
  if (entry.support.kind === 'tile') {
    const map = state.party?.map ?? state.map
    const surface = tileSurfaceAt(map, entry.support.tile)
    return surface?.topZ ?? 0
  }
  if (entry.support.kind === 'item') {
    const parent = state.groundItems?.[entry.support.instanceId]
    if (!parent) return 0
    const resolved = parent.instanceId ? getItemById(state.itemInstances?.[parent.instanceId]?.itemId) : null
    // Prefer catalogue surface; fall back to a short derived top from worldScale.
    const surface = surfaceOfItem(resolved) ?? surfaceOfItem(state.itemInstances?.[parent.instanceId]?.itemId)
    const parentZ = zOf(state, parent)
    return parentZ + (surface?.topZ ?? 0)
  }
  return 0
}

// Depth sort key for a ground item.
// Floor: x + y + 0.35 (unchanged).
// On a support: at least the support tile's depth + bias (so the table/crate front face never covers the item),
// and at least the item's own x + y + bias (so a drop near the near edge sorts in front of diagonal neighbours).
export function groundItemDepth(state, entry) {
  const p = entry?.position ?? { x: 0, y: 0 }
  if (!entry?.support) return p.x + p.y + 0.35
  if (entry.support.kind === 'tile') {
    const t = entry.support.tile
    const surface = tileSurfaceAt(state.party?.map ?? state.map, t)
    const z = surface?.topZ ?? 0
    const stack = 0.01 * (surface?.stackLevel ?? 0)
    // z/TILE_H nudges elevated props slightly "forward" in the painter's sort.
    return Math.max(p.x + p.y, t.x + t.y) + SURFACE_DEPTH_BIAS + z / TILE_H + stack
  }
  if (entry.support.kind === 'item') {
    const parent = state.groundItems?.[entry.support.instanceId]
    if (!parent) return p.x + p.y + 0.35
    return groundItemDepth(state, parent) + 0.02
  }
  return p.x + p.y + 0.35
}

function categoryAccepted(surface, category) {
  if (!surface.accepts || !surface.accepts.length) return true
  if (!category) return false
  return surface.accepts.includes(category)
}

function tileSupportCandidate(map, point) {
  const tile = tileOf(point)
  if (tile.x < 0 || tile.y < 0 || tile.y >= map.height || tile.x >= map.width) return null
  const surface = tileSurfaceAt(map, tile)
  if (!surface) return null
  if (!pointInSurfaceFootprint(point, tile, surface.inset)) return null
  return {
    kind: 'tile',
    tile: { x: tile.x, y: tile.y },
    surface,
    z: surface.topZ,
  }
}

function itemSupportCandidate(state, point, { excludeInstanceId = null } = {}) {
  let best = null
  for (const entry of Object.values(state.groundItems ?? {})) {
    if (excludeInstanceId && entry.instanceId === excludeInstanceId) continue
    const def = getItemById(state.itemInstances?.[entry.instanceId]?.itemId)
    const surface = surfaceOfItem(def)
    if (!surface) continue
    // Item footprint: diamond centred on the item's snapped position, sized like a tile inset.
    if (!pointInSurfaceFootprint(point, entry.position, surface.inset)) continue
    const chain = itemSupportChain(state, entry.instanceId, { excludeInstanceId })
    if (!chain) continue
    const z = zOf(state, entry) + surface.topZ
    const candidate = {
      kind: 'item',
      instanceId: entry.instanceId,
      surface,
      z,
      depth: chain.length,
    }
    if (!best || candidate.z > best.z || (candidate.z === best.z && candidate.depth >= best.depth)) best = candidate
  }
  return best
}

// Prefer the highest accepting surface under the point (item top over tile top); otherwise null (caller uses floor).
export function supportAt(state, point, { excludeInstanceId = null } = {}) {
  const map = state.party?.map ?? state.map
  if (!map) return null
  const snapped = snapItemPosition(point)
  const item = itemSupportCandidate(state, snapped, { excludeInstanceId })
  const tile = tileSupportCandidate(map, snapped)
  if (item && tile) return item.z >= tile.z ? item : tile
  return item ?? tile
}

// Iso: pointer on a raised top must be tested in screen space. Unproject(board+topZ) alone fails against
// walls — the hit slides off the back of the footprint and the drop reads as Blocked (red preview).
const SURFACE_SEARCH_RADIUS = 3

function boardHitTileSupport(map, boardPoint, excludeInstanceId) {
  void excludeInstanceId
  const floorApprox = unproject(boardPoint)
  const cx = Math.round(floorApprox.x)
  const cy = Math.round(floorApprox.y)
  let best = null
  for (let ty = cy - SURFACE_SEARCH_RADIUS; ty <= cy + SURFACE_SEARCH_RADIUS; ty++) {
    for (let tx = cx - SURFACE_SEARCH_RADIUS; tx <= cx + SURFACE_SEARCH_RADIUS; tx++) {
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue
      const tilePos = { x: tx, y: ty }
      const surface = tileSurfaceAt(map, tilePos)
      if (!surface) continue
      // Screen-space test against the lifted tile diamond (matches what the player aims at).
      if (!pointInRaisedTileDiamond(boardPoint, tilePos, surface.topZ, 1 - 2 * surface.inset)) continue
      const raw = unproject({ x: boardPoint.x, y: boardPoint.y + surface.topZ })
      const hitPoint = clampToSurfaceFootprint(raw, tilePos, surface.inset)
      const candidate = {
        kind: 'tile',
        tile: tilePos,
        surface,
        z: surface.topZ,
        // Prefer the front-most tile when two tops overlap in screen space.
        depthKey: tx + ty + 0.01 * surface.stackLevel,
        hitPoint,
      }
      if (!best || candidate.z > best.z || (candidate.z === best.z && candidate.depthKey >= best.depthKey)) best = candidate
    }
  }
  return best
}

function boardHitItemSupport(state, boardPoint, { excludeInstanceId = null } = {}) {
  let best = null
  for (const entry of Object.values(state.groundItems ?? {})) {
    if (excludeInstanceId && entry.instanceId === excludeInstanceId) continue
    const def = getItemById(state.itemInstances?.[entry.instanceId]?.itemId)
    const surface = surfaceOfItem(def)
    if (!surface) continue
    const chain = itemSupportChain(state, entry.instanceId, { excludeInstanceId })
    if (!chain) continue
    const z = zOf(state, entry) + surface.topZ
    // Item tops use the same raised-diamond test centred on the item's world position.
    if (!pointInRaisedTileDiamond(boardPoint, entry.position, z, 1 - 2 * surface.inset)) continue
    const raw = unproject({ x: boardPoint.x, y: boardPoint.y + z })
    const hitPoint = clampToSurfaceFootprint(raw, entry.position, surface.inset)
    const candidate = {
      kind: 'item',
      instanceId: entry.instanceId,
      surface,
      z,
      depth: chain.length,
      hitPoint,
    }
    if (!best || candidate.z > best.z || (candidate.z === best.z && candidate.depth >= best.depth)) best = candidate
  }
  return best
}

// Board/SVG point (from the exploration board's toBoard) → best support under the pointer.
export function supportAtBoard(state, boardPoint, { excludeInstanceId = null } = {}) {
  const map = state.party?.map ?? state.map
  if (!map || !boardPoint) return null
  const item = boardHitItemSupport(state, boardPoint, { excludeInstanceId })
  const tile = boardHitTileSupport(map, boardPoint, excludeInstanceId)
  if (item && tile) return item.z >= tile.z ? item : tile
  return item ?? tile
}

// Whether a prop tile may be stacked onto the cell (editor / stackOver). Caps at surface.maxStack and GLOBAL_STACK_CAP.
export function canStackTileOn(map, tilePos, tileId) {
  const surface = tileSurfaceAt(map, tilePos)
  if (!surface) return { ok: false, reason: 'No support surface.' }
  const layers = stackLayersAt(map, tilePos)
  const cap = Math.min(surface.maxStack, GLOBAL_STACK_CAP)
  if (layers.length >= cap) return { ok: false, reason: 'Stack limit reached.' }
  const stacking = getTile(tileId)
  if (!stacking || stacking.empty) return { ok: false, reason: 'Not a stackable tile.' }
  if (!(stacking.height > 0)) return { ok: false, reason: 'Not a prop tile.' }
  return { ok: true, stackLevel: layers.length + 1 }
}

/**
 * Placeability at a world point. Additive fields: support, z.
 * Floor behaviour matches inventory.canPlaceAt when no surface is under the point.
 * Optional boardPoint (SVG/board coords): uses iso-correct surface hit-testing so a pointer on a
 * tabletop lands on the table, not the floor tile the floor-unproject would pick.
 */
export function canPlaceOn(state, position, { excludeInstanceId = null, category = null, boardPoint = null } = {}) {
  const map = state.party?.map ?? state.map
  const floorSnapped = snapItemPosition(position)
  const floorTile = tileOf(floorSnapped)
  if (!map || floorTile.x < 0 || floorTile.y < 0 || floorTile.y >= map.height || floorTile.x >= map.width) {
    return { ok: false, reason: 'Off the map.', position: floorSnapped, tile: floorTile, support: null, z: 0 }
  }

  const boardSupport = boardPoint ? supportAtBoard(state, boardPoint, { excludeInstanceId }) : null
  const floorSupport = supportAt(state, floorSnapped, { excludeInstanceId })
  // Prefer the board hit when it finds a surface (pointer is on the raised top).
  const support = boardSupport ?? floorSupport
  const snapped = support?.hitPoint ? snapItemPosition(support.hitPoint) : floorSnapped
  const tile = tileOf(snapped)

  if (support) {
    if (!categoryAccepted(support.surface, category)) {
      return { ok: false, reason: 'Surface does not accept this item.', position: snapped, tile, support: null, z: 0 }
    }
    if (support.kind === 'item') {
      const chain = itemSupportChain(state, support.instanceId, { excludeInstanceId })
      if (!chain) return { ok: false, reason: 'Invalid support stack.', position: snapped, tile, support: null, z: 0 }
      if (excludeInstanceId) {
        // Refuse cycles: dragged item must not become an ancestor of the chosen support.
        const selfChain = itemSupportChain(state, excludeInstanceId)
        if (selfChain?.some((entry) => entry.instanceId === support.instanceId)) {
          return { ok: false, reason: 'Cannot rest on a dependent item.', position: snapped, tile, support: null, z: 0 }
        }
      }
    }
    const key = itemGridKey(snapped)
    const occupied = Object.values(state.groundItems ?? {}).some((entry) => {
      if (excludeInstanceId && entry.instanceId === excludeInstanceId) return false
      if (itemGridKey(entry.position) !== key) return false
      return supportEquals(entry.support ?? null, supportRef(support))
    })
    if (occupied) return { ok: false, reason: 'Already an item here.', position: snapped, tile, support: null, z: 0 }
    return { ok: true, position: snapped, tile, support: supportRef(support), z: support.z }
  }

  // Floor: same rules as the pre-elevation canPlaceAt.
  if (blocksMovement(map, floorTile)) return { ok: false, reason: 'Blocked.', position: floorSnapped, tile: floorTile, support: null, z: 0 }
  const key = itemGridKey(floorSnapped)
  const occupied = Object.values(state.groundItems ?? {}).some((entry) => {
    if (excludeInstanceId && entry.instanceId === excludeInstanceId) return false
    if (entry.support) return false
    return itemGridKey(entry.position) === key
  })
  if (occupied) return { ok: false, reason: 'Already an item here.', position: floorSnapped, tile: floorTile, support: null, z: 0 }
  return { ok: true, position: floorSnapped, tile: floorTile, support: null, z: 0 }
}

function supportRef(support) {
  if (!support) return null
  if (support.kind === 'tile') return { kind: 'tile', tile: { x: support.tile.x, y: support.tile.y } }
  if (support.kind === 'item') return { kind: 'item', instanceId: support.instanceId }
  return null
}

// Walk target for picking up an item that may sit on a solid support tile: the item position if walkable,
// otherwise the nearest walkable neighbour tile centre (8-way), then any further ring out to 3.
export function approachPoint(map, position) {
  if (!map || !position) return position
  const origin = { x: position.x, y: position.y }
  if (!blocksMovement(map, tileOf(origin))) return origin
  const offsets = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ]
  for (let ring = 1; ring <= 3; ring++) {
    let best = null
    let bestDist = Infinity
    for (const [dx, dy] of offsets) {
      const candidate = { x: Math.round(origin.x) + dx * ring, y: Math.round(origin.y) + dy * ring }
      if (candidate.x < 0 || candidate.y < 0 || candidate.x >= map.width || candidate.y >= map.height) continue
      if (blocksMovement(map, candidate)) continue
      const dist = Math.hypot(candidate.x - origin.x, candidate.y - origin.y)
      if (dist < bestDist) {
        bestDist = dist
        best = candidate
      }
    }
    if (best) return best
  }
  return origin
}

export { supportEquals, supportRef, cellKey }
