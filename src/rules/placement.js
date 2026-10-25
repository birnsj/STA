// World placement surfaces: tile tops and item tops that inventory drops (and stacked props) can rest on.
// Z is world-space art pixels (same unit as tiles.json height), derived from the support — never stored as authority.
// Videogame adaptation — STA 2e has no world-prop grid.
import { blocksMovement } from '../combat/battleMap.js'
import { tileOf } from '../exploration/navigation.js'
import { getTile, TILE_IMAGE } from '../maps/mapFormat.js'
import { project, TILE_H, TILE_W, unproject } from '../maps/iso.js'
import itemArtPixels from '../data/adaptation/itemArtPixels.json'
import { getItemById } from './equipment.js'
import { itemGridKey, snapItemPosition } from './itemGrid.js'

// How far in from the tile edge the usable top is (tile units). Small — furniture tops are nearly full-tile.
export const DEFAULT_SURFACE_INSET = 0.05
export const GLOBAL_STACK_CAP = 3
export const ITEM_SUPPORT_DEPTH_CAP = 3
// One map tile is the 64×64 placement spot (design pixels). A dropped item is not scaled at draw time:
// its picture was fitted to a stacking cell, and file pixels ÷ 4 are that cell on the board.
// Large gear is 32×32 (four per tile). Small gear is 16×16 (sixteen per tile).
export const STACK_SPOT_PX = 64
const ART_PIXELS_PER_DESIGN = itemArtPixels.pixelsPerDesign
// Depth bias so an item on a support always sorts after that tile's block sprite (and its front face).
const SURFACE_DEPTH_BIAS = 0.55

const cellKey = ({ x, y }) => `${x},${y}`

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

function finiteNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// File pixels of an item's world picture, or null when that picture has not been measured.
function artFileOf(def) {
  const href = def?.worldImage
  return href ? itemArtPixels.images[href] ?? null : null
}

const designPx = (filePx) => Math.round(filePx / ART_PIXELS_PER_DESIGN)

// The picture on the board, in design pixels. The whole file, including the clear space above the object,
// at the tile art ratio. No per-item scale.
export function propSpriteSize(itemOrId) {
  const def = typeof itemOrId === 'string' ? getItemById(itemOrId) : itemOrId
  const art = artFileOf(def)
  if (!art) return { width: TILE_IMAGE.width, height: TILE_IMAGE.height }
  return { width: designPx(art.width), height: designPx(art.height) }
}

// Footprint and stack height, in design pixels (64 = one tile). The floor diamond is the picture's width;
// its screen height is half that width. Height is the painted block above that diamond. No per-item scale.
export function stackSizeOf(itemOrId) {
  const def = typeof itemOrId === 'string' ? getItemById(itemOrId) : itemOrId
  if (!def) return null
  const art = artFileOf(def)
  if (!art) return { width: TILE_IMAGE.width, depth: TILE_IMAGE.width, height: 0 }
  const width = designPx(art.opaqueWidth || art.width)
  const diamond = Math.round(width / 2)
  const height = Math.max(0, designPx(art.opaqueHeight) - diamond)
  return { width, depth: width, height }
}

// Tile-space footprint (1 = one 64px side of the spot).
export function stackFootprint(stack) {
  if (!stack) return null
  return { width: stack.width / STACK_SPOT_PX, depth: stack.depth / STACK_SPOT_PX }
}

// `anchor` is the bottom corner of the iso graphic (screen-south tip): the footprint extends back from it.
export function footprintRect(anchor, footprint) {
  return {
    x: anchor.x - footprint.width,
    y: anchor.y - footprint.depth,
    width: footprint.width,
    depth: footprint.depth,
  }
}

export function pointInFootprint(point, anchor, footprint) {
  if (!point || !anchor || !footprint) return false
  const rect = footprintRect(anchor, footprint)
  return (
    point.x >= rect.x - 1e-9 &&
    point.x <= rect.x + rect.width + 1e-9 &&
    point.y >= rect.y - 1e-9 &&
    point.y <= rect.y + rect.depth + 1e-9
  )
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width - 1e-9 && b.x < a.x + a.width - 1e-9 && a.y < b.y + b.depth - 1e-9 && b.y < a.y + a.depth - 1e-9
}

// Full tile cell: the 64×64 spot, centred on the tile.
function tileSpotRect(tile) {
  return { x: tile.x - 0.5, y: tile.y - 0.5, width: 1, depth: 1 }
}

// Stack slots inside a spot. The cell under the pointer comes first. Empty when the footprint does not fit.
function slotsInSpot(point, spot, footprint) {
  const cols = Math.floor((spot.width + 1e-6) / footprint.width)
  const rows = Math.floor((spot.depth + 1e-6) / footprint.depth)
  if (cols < 1 || rows < 1) return []
  const slots = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // The slot's anchor is its bottom corner. The cell itself is the square behind that corner.
      const x = spot.x + (col + 1) * footprint.width
      const y = spot.y + (row + 1) * footprint.depth
      slots.push({ x, y, dist: (x - point.x) ** 2 + (y - point.y) ** 2 })
    }
  }
  // The cell that contains the pointer wins. Nearest-corner alone jumps a click in the back of a cell
  // onto the cell behind it, because that cell's front corner is closer than this cell's front corner.
  const inside = (slot) => (pointInFootprint(point, slot, footprint) ? 0 : 1)
  slots.sort((a, b) => inside(a) - inside(b) || a.dist - b.dist)
  return slots
}

// Every item has a top another item can rest on. Footprint and height come from the picture's pixels.
export function surfaceOfItem(itemOrId) {
  const def = typeof itemOrId === 'string' ? getItemById(itemOrId) : itemOrId
  if (!def) return null
  const stack = stackSizeOf(def)
  if (!stack) return null
  const authored = def.surface && typeof def.surface === 'object' ? def.surface : {}
  return {
    topZ: stack.height,
    inset: finiteNum(authored.inset) ?? DEFAULT_SURFACE_INSET,
    accepts: Array.isArray(authored.accepts) ? authored.accepts : null,
    maxStack: Number.isFinite(authored.maxStack) ? authored.maxStack : 1,
    footprint: stackFootprint(stack),
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
export function pointInRaisedTileDiamond(boardPoint, tilePos, lift = 0, scale = 1, scaleY = scale) {
  const c = project(tilePos)
  const halfW = (TILE_W / 2) * scale
  const halfH = (TILE_H / 2) * scaleY
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
function resolveZ(state, entry, seen) {
  if (!entry?.support) return { ok: true, value: 0 }
  if (entry.support.kind === 'tile') {
    const map = state.party?.map ?? state.map
    const surface = tileSurfaceAt(map, entry.support.tile)
    return { ok: true, value: surface?.topZ ?? 0 }
  }
  if (entry.support.kind === 'item') {
    const parentId = entry.support.instanceId
    if (seen.has(parentId)) return { ok: false, value: 0 }
    const parent = state.groundItems?.[parentId]
    if (!parent) return { ok: true, value: 0 }
    const resolved = parent.instanceId ? getItemById(state.itemInstances?.[parent.instanceId]?.itemId) : null
    // The parent's top is its picture's painted height.
    const surface = surfaceOfItem(resolved) ?? surfaceOfItem(state.itemInstances?.[parent.instanceId]?.itemId)
    const parentZ = resolveZ(state, parent, new Set([...seen, parentId]))
    return parentZ.ok ? { ok: true, value: parentZ.value + (surface?.topZ ?? 0) } : parentZ
  }
  return { ok: true, value: 0 }
}

export function zOf(state, entry) {
  const seen = new Set(entry?.instanceId ? [entry.instanceId] : [])
  return resolveZ(state, entry, seen).value
}

// Depth sort key for a ground item.
// Floor: x + y + 0.35 (unchanged).
// On a support: at least the support tile's depth + bias (so the table/crate front face never covers the item),
// and at least the item's own x + y + bias (so a drop near the near edge sorts in front of diagonal neighbours).
function resolveGroundItemDepth(state, entry, seen) {
  const p = entry?.position ?? { x: 0, y: 0 }
  const floor = p.x + p.y + 0.35
  if (!entry?.support) return { ok: true, value: floor }
  if (entry.support.kind === 'tile') {
    const t = entry.support.tile
    const surface = tileSurfaceAt(state.party?.map ?? state.map, t)
    const z = surface?.topZ ?? 0
    const stack = 0.01 * (surface?.stackLevel ?? 0)
    // z/TILE_H nudges elevated props slightly "forward" in the painter's sort.
    return { ok: true, value: Math.max(p.x + p.y, t.x + t.y) + SURFACE_DEPTH_BIAS + z / TILE_H + stack }
  }
  if (entry.support.kind === 'item') {
    const parentId = entry.support.instanceId
    if (seen.has(parentId)) return { ok: false, value: floor }
    const parent = state.groundItems?.[parentId]
    if (!parent) return { ok: true, value: floor }
    const parentDepth = resolveGroundItemDepth(state, parent, new Set([...seen, parentId]))
    return parentDepth.ok ? { ok: true, value: parentDepth.value + 0.02 } : { ok: false, value: floor }
  }
  return { ok: true, value: floor }
}

export function groundItemDepth(state, entry) {
  const seen = new Set(entry?.instanceId ? [entry.instanceId] : [])
  return resolveGroundItemDepth(state, entry, seen).value
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
    if (!surface?.footprint) continue
    if (!pointInFootprint(point, entry.position, surface.footprint)) continue
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
    const standZ = zOf(state, entry)
    const z = standZ + surface.topZ
    const foot = surface.footprint
    const center = { x: entry.position.x - foot.width / 2, y: entry.position.y - foot.depth / 2 }
    if (!pointInRaisedTileDiamond(boardPoint, center, z, foot.width, foot.depth)) continue
    // A half-tile box is as tall as the cell behind it, so the back of its lid is the same screen
    // pixels as that empty cell. A floor drop there sorts behind the box. Keep the point on this lid
    // and clamp it onto the footprint.
    const onStand = unproject({ x: boardPoint.x, y: boardPoint.y + standZ })
    const rect = footprintRect(entry.position, foot)
    // Stay on the plane the item stands on. The lid plane slides a tall box's click onto its
    // south corner, and that .5 corner rounds onto the next tile.
    const hitPoint = {
      x: Math.min(rect.x + rect.width, Math.max(rect.x, onStand.x)),
      y: Math.min(rect.y + rect.depth, Math.max(rect.y, onStand.y)),
    }
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

// The surface cell whose raised top contains this board point, or null. The editor uses this so a prop
// painted on a tall stack lands on that stack. Floor unproject of the same point is the cell behind it.
export function surfaceTileAtBoard(map, boardPoint) {
  if (!map || !boardPoint) return null
  return boardHitTileSupport(map, boardPoint, null)?.tile ?? null
}

// Board/SVG point (from the exploration board's toBoard) → best support under the pointer.
export function supportAtBoard(state, boardPoint, { excludeInstanceId = null } = {}) {
  const map = state.party?.map ?? state.map
  if (!map || !boardPoint) return null
  const item = boardHitItemSupport(state, boardPoint, { excludeInstanceId })
  const tile = boardHitTileSupport(map, boardPoint, excludeInstanceId)
  // A raised tile top wins, so a box standing on a crate uses the crate's cell.
  // An item top is the target only when no tile top is under the pointer (a box on the floor),
  // including the back of its lid. Those pixels are also the floor cell behind the box.
  if (tile) return tile
  return item
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
function spotForSupport(state, support) {
  if (support.kind === 'tile') return tileSpotRect(support.tile)
  const parent = state.groundItems?.[support.instanceId]
  if (!parent || !support.surface?.footprint) return null
  return footprintRect(parent.position, support.surface.footprint)
}

function footprintOccupied(state, slot, footprint, support, excludeInstanceId) {
  const next = footprintRect(slot, footprint)
  const ref = supportRef(support)
  return Object.values(state.groundItems ?? {}).some((entry) => {
    if (excludeInstanceId && entry.instanceId === excludeInstanceId) return false
    if (!supportEquals(entry.support ?? null, ref)) return false
    const otherId = state.itemInstances?.[entry.instanceId]?.itemId
    const other = stackFootprint(stackSizeOf(otherId))
    if (!other) return itemGridKey(entry.position) === itemGridKey(slot)
    return rectsOverlap(next, footprintRect(entry.position, other))
  })
}

function refused(reason, position, tile) {
  return { ok: false, reason, position, tile, support: null, z: 0 }
}

// One walk of the slots in a spot. A free slot takes the item. A full slot stacks on the item in it.
// `tile` is the cell to report: a tile support's own cell, or the floor tile. A slot anchor on a .5
// boundary tileOf-rounds onto the next tile, so the caller passes the cell the player aimed at.
function placeInSpot(state, point, spot, { excludeInstanceId, category, footprint, support = null, tile = null }) {
  const slots = spot ? slotsInSpot(point, spot, footprint) : []
  for (const slot of slots) {
    if (!footprintOccupied(state, slot, footprint, support, excludeInstanceId)) {
      return {
        ok: true,
        position: { x: slot.x, y: slot.y },
        tile: tile ?? tileOf(slot),
        support: supportRef(support),
        z: support?.z ?? 0,
      }
    }
    const occupant = occupantAtSlot(state, slot, footprint, support, excludeInstanceId)
    const stacked = occupant && stackOnOccupant(state, occupant, point, { excludeInstanceId, category, footprint })
    if (stacked) return stacked
  }
  return { ok: false, reason: support ? 'No room on this surface.' : 'Already an item here.' }
}

function placeOnSupport(state, support, point, options) {
  if (!categoryAccepted(support.surface, options.category)) {
    return { ok: false, stop: true, reason: 'Surface does not accept this item.' }
  }
  if (support.kind === 'item') {
    const chain = itemSupportChain(state, support.instanceId, { excludeInstanceId: options.excludeInstanceId })
    if (!chain) return { ok: false, stop: true, reason: 'Invalid support stack.' }
    if (options.excludeInstanceId) {
      const selfChain = itemSupportChain(state, options.excludeInstanceId)
      if (selfChain?.some((entry) => entry.instanceId === support.instanceId)) {
        return { ok: false, stop: true, reason: 'Cannot rest on a dependent item.' }
      }
    }
  }
  const tile = support.kind === 'tile' ? { x: support.tile.x, y: support.tile.y } : null
  return placeInSpot(state, point, spotForSupport(state, support), { ...options, support, tile })
}

// Screen hits first: their hitPoint is the lid. Floor unproject of that same point is the cell behind it.
function supportsUnderPointer(state, map, boardPoint, floorSnapped, excludeInstanceId) {
  const choices = []
  if (boardPoint) {
    const raisedTile = boardHitTileSupport(map, boardPoint, excludeInstanceId)
    const raisedItem = boardHitItemSupport(state, boardPoint, { excludeInstanceId })
    if (raisedTile) choices.push(raisedTile)
    if (raisedItem) choices.push(raisedItem)
  }
  const floorTile = tileSupportCandidate(map, floorSnapped)
  const floorItem = itemSupportCandidate(state, floorSnapped, { excludeInstanceId })
  if (floorTile) choices.push(floorTile)
  if (floorItem) choices.push(floorItem)
  return choices
}

// A tile top is tried before an item top, so a free slot on the crate under a box stays reachable.
// Same kind: the higher surface wins.
function compareSupports(a, b) {
  if (a.kind !== b.kind) return a.kind === 'tile' ? -1 : 1
  return b.z - a.z
}

export function canPlaceOn(state, position, { excludeInstanceId = null, category = null, boardPoint = null, itemId = null } = {}) {
  const map = state.party?.map ?? state.map
  // A drop sends the corner the hover already resolved. On a .5 boundary that corner tileOf-rounds
  // onto the next tile, so a floor drop jumps. The pointer (boardPoint) is the cell the player aimed at.
  const cursor = boardPoint ? unproject(boardPoint) : position
  const floorSnapped = snapItemPosition(cursor)
  const floorTile = tileOf(floorSnapped)
  if (!map || floorTile.x < 0 || floorTile.y < 0 || floorTile.y >= map.height || floorTile.x >= map.width) {
    return refused('Off the map.', floorSnapped, floorTile)
  }

  const stack = stackSizeOf(itemId) ?? { width: STACK_SPOT_PX, depth: STACK_SPOT_PX, height: 0 }
  const footprint = stackFootprint(stack)
  const choices = supportsUnderPointer(state, map, boardPoint, floorSnapped, excludeInstanceId)
  const point = choices.find((choice) => choice.hitPoint)?.hitPoint ?? floorSnapped
  const seen = new Set()
  for (const support of [...choices].sort(compareSupports)) {
    const key = support.kind === 'tile' ? `tile:${support.tile.x},${support.tile.y}` : `item:${support.instanceId}`
    if (seen.has(key)) continue
    seen.add(key)
    const placed = placeOnSupport(state, support, point, { excludeInstanceId, category, footprint })
    if (placed.ok) return placed
    if (placed.stop) return refused(placed.reason, floorSnapped, floorTile)
  }

  // Floor uses the same pack points as a table: the bottom corner locks to the nearest spot on the tile.
  if (blocksMovement(map, floorTile)) return refused('Blocked.', floorSnapped, floorTile)
  const floorPlace = placeInSpot(state, cursor, tileSpotRect(floorTile), {
    excludeInstanceId,
    category,
    footprint,
    tile: floorTile,
  })
  if (floorPlace.ok) return floorPlace
  return refused(floorPlace.reason, floorSnapped, floorTile)
}

function occupantAtSlot(state, slot, footprint, support, excludeInstanceId) {
  const next = footprintRect(slot, footprint)
  const ref = supportRef(support)
  let best = null
  for (const entry of Object.values(state.groundItems ?? {})) {
    if (excludeInstanceId && entry.instanceId === excludeInstanceId) continue
    if (!supportEquals(entry.support ?? null, ref)) continue
    const other = stackFootprint(stackSizeOf(state.itemInstances?.[entry.instanceId]?.itemId))
    if (!other || !rectsOverlap(next, footprintRect(entry.position, other))) continue
    if (!best || zOf(state, entry) >= zOf(state, best)) best = entry
  }
  return best
}

function stackOnOccupant(state, occupant, point, options) {
  const surface = surfaceOfItem(state.itemInstances?.[occupant.instanceId]?.itemId)
  if (!surface) return null
  const placed = placeOnSupport(
    state,
    { kind: 'item', instanceId: occupant.instanceId, surface, z: zOf(state, occupant) + surface.topZ },
    point,
    options,
  )
  return placed.ok ? placed : null
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
