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
// One map tile is the 64×64 placement spot (art pixels).
// Large gear (worldScale 0.5) is a 32×32 square → 4 per tile. Small gear (0.25) is a 16×16 square → 16 per tile.
// The picture is that same square, so the object sits in the spot it snaps to.
export const STACK_SPOT_PX = 64
const LARGE_STACK_SCALE = 0.4
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

function finiteNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// Footprint and stack height for a dropped item, in art pixels (64 = one tile).
// The footprint is a square the size of the drawn diamond. stackSize overrides. surface.topZ overrides height.
export function stackSizeOf(itemOrId) {
  const def = typeof itemOrId === 'string' ? getItemById(itemOrId) : itemOrId
  if (!def) return null
  const scale = Math.max(0.15, Math.min(1, def.worldScale ?? LARGE_STACK_SCALE))
  const authored = def.stackSize && typeof def.stackSize === 'object' ? def.stackSize : {}
  const side = Math.round(scale * STACK_SPOT_PX)
  const width = finiteNum(authored.width) ?? side
  const depth = finiteNum(authored.depth) ?? side
  const derivedH = Math.round(TILE_IMAGE.height * scale * 0.35)
  const height = finiteNum(authored.height) ?? finiteNum(def.surface?.topZ) ?? derivedH
  return { width, depth, height }
}

// Pixel size of the dropped sprite. Uniform scale, so the floor diamond stays square and matches the spot.
export function propSpriteSize(itemOrId) {
  const stack = stackSizeOf(itemOrId) ?? { width: 32, depth: 32, height: 0 }
  const side = Math.min(stack.width, stack.depth) / STACK_SPOT_PX
  return {
    width: TILE_IMAGE.width * side,
    height: TILE_IMAGE.height * side,
  }
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

export function pointInFootprint(point, center, footprint) {
  if (!point || !center || !footprint) return false
  const rect = footprintRect(center, footprint)
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

// Every item has a top another item can rest on. Footprint comes from stack size, not a whole tile.
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
    // A half-tile box is as tall as the cell behind it, so its lid is the same screen pixels as that
    // empty cell. Claim the pointer only when the point on the plane the item stands on is inside this
    // item. The empty cell behind it then stays a beside drop instead of stacking onto this one.
    const onStand = unproject({ x: boardPoint.x, y: boardPoint.y + standZ })
    if (!pointInFootprint(onStand, entry.position, foot)) continue
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

// Board/SVG point (from the exploration board's toBoard) → best support under the pointer.
export function supportAtBoard(state, boardPoint, { excludeInstanceId = null } = {}) {
  const map = state.party?.map ?? state.map
  if (!map || !boardPoint) return null
  const item = boardHitItemSupport(state, boardPoint, { excludeInstanceId })
  const tile = boardHitTileSupport(map, boardPoint, excludeInstanceId)
  // The surface under the object decides the cell. The object's own top is only the target when
  // nothing else is there (a box on the floor). On a crate, the crate-plane point stays in the
  // cell: a full cell stacks, and the empty cell behind the box stays that cell.
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

function placeOnSupport(state, support, point, { excludeInstanceId, category, footprint }) {
  if (!categoryAccepted(support.surface, category)) {
    return { ok: false, reason: 'Surface does not accept this item.' }
  }
  if (support.kind === 'item') {
    const chain = itemSupportChain(state, support.instanceId, { excludeInstanceId })
    if (!chain) return { ok: false, reason: 'Invalid support stack.' }
    if (excludeInstanceId) {
      const selfChain = itemSupportChain(state, excludeInstanceId)
      if (selfChain?.some((entry) => entry.instanceId === support.instanceId)) {
        return { ok: false, reason: 'Cannot rest on a dependent item.' }
      }
    }
  }
  const spot = spotForSupport(state, support)
  const slots = spot ? slotsInSpot(point, spot, footprint) : []
  // The cell under the pointer. A free cell takes the item. A full cell stacks on the item in it.
  for (const slot of slots) {
    if (!footprintOccupied(state, slot, footprint, support, excludeInstanceId)) {
      return {
        ok: true,
        position: { x: slot.x, y: slot.y },
        tile: tileOf(slot),
        support: supportRef(support),
        z: support.z,
      }
    }
    const occupant = occupantAtSlot(state, slot, footprint, support, excludeInstanceId)
    const stacked = occupant && stackOnOccupant(state, occupant, point, { excludeInstanceId, category, footprint })
    if (stacked) return stacked
  }
  return { ok: false, reason: 'No room on this surface.' }
}

export function canPlaceOn(state, position, { excludeInstanceId = null, category = null, boardPoint = null, itemId = null } = {}) {
  const map = state.party?.map ?? state.map
  // A drop sends the corner the hover already resolved. On a .5 boundary that corner tileOf-rounds
  // onto the next tile, so a floor drop jumps. The pointer (boardPoint) is the cell the player aimed at.
  const cursor = boardPoint ? unproject(boardPoint) : position
  const floorSnapped = snapItemPosition(cursor)
  const floorTile = tileOf(floorSnapped)
  if (!map || floorTile.x < 0 || floorTile.y < 0 || floorTile.y >= map.height || floorTile.x >= map.width) {
    return { ok: false, reason: 'Off the map.', position: floorSnapped, tile: floorTile, support: null, z: 0 }
  }

  const stack = stackSizeOf(itemId) ?? { width: 32, depth: 32, height: 0 }
  const footprint = stackFootprint(stack)
  // Tile and item are both kept. A higher item must not hide free slots on the crate under it.
  const choices = []
  if (boardPoint) {
    const tileHit = boardHitTileSupport(map, boardPoint, excludeInstanceId)
    const itemHit = boardHitItemSupport(state, boardPoint, { excludeInstanceId })
    if (tileHit) choices.push(tileHit)
    if (itemHit) choices.push(itemHit)
  }
  const tileHit = tileSupportCandidate(map, floorSnapped)
  const itemHit = itemSupportCandidate(state, floorSnapped, { excludeInstanceId })
  if (tileHit) choices.push(tileHit)
  if (itemHit) choices.push(itemHit)
  const point = choices.find((choice) => choice.hitPoint)?.hitPoint ?? floorSnapped
      // The cell under the pointer first. If that cell is full, the item there is tried next so a drop on a box stacks.
  const ordered = [...choices].sort((a, b) => (a.kind === 'item') - (b.kind === 'item') || b.z - a.z)
  const seen = new Set()
  for (const support of ordered) {
    const key = support.kind === 'tile' ? `tile:${support.tile.x},${support.tile.y}` : `item:${support.instanceId}`
    if (seen.has(key)) continue
    seen.add(key)
    if (support.kind === 'tile') {
      if (!categoryAccepted(support.surface, category)) {
        return { ok: false, reason: 'Surface does not accept this item.', position: floorSnapped, tile: floorTile, support: null, z: 0 }
      }
      const slots = slotsInSpot(point, tileSpotRect(support.tile), footprint)
      for (const slot of slots) {
        if (!footprintOccupied(state, slot, footprint, support, excludeInstanceId)) {
          return {
            ok: true,
            position: { x: slot.x, y: slot.y },
            tile: { x: support.tile.x, y: support.tile.y },
            support: supportRef(support),
            z: support.z,
          }
        }
        // The nearest spot is full: stack on that item when it can hold this one, otherwise try the next spot.
        const occupant = occupantAtSlot(state, slot, footprint, support, excludeInstanceId)
        const stacked = occupant && stackOnOccupant(state, occupant, point, { excludeInstanceId, category, footprint })
        if (stacked) return stacked
      }
      continue
    }
    const placed = placeOnSupport(state, support, point, { excludeInstanceId, category, footprint })
    if (placed.reason === 'Surface does not accept this item.' || placed.reason === 'Invalid support stack.' || placed.reason === 'Cannot rest on a dependent item.') {
      return { ok: false, reason: placed.reason, position: floorSnapped, tile: floorTile, support: null, z: 0 }
    }
  }

  // Floor uses the same pack points as a table: the bottom corner locks to the nearest spot on the tile.
  if (blocksMovement(map, floorTile)) return { ok: false, reason: 'Blocked.', position: floorSnapped, tile: floorTile, support: null, z: 0 }
  const floorSlots = slotsInSpot(cursor, tileSpotRect(floorTile), footprint)
  for (const floorSlot of floorSlots) {
    if (!footprintOccupied(state, floorSlot, footprint, null, excludeInstanceId)) {
      return { ok: true, position: { x: floorSlot.x, y: floorSlot.y }, tile: floorTile, support: null, z: 0 }
    }
    const occupant = occupantAtSlot(state, floorSlot, footprint, null, excludeInstanceId)
    const stacked = occupant && stackOnOccupant(state, occupant, cursor, { excludeInstanceId, category, footprint })
    if (stacked) return stacked
  }
  return { ok: false, reason: 'Already an item here.', position: floorSnapped, tile: floorTile, support: null, z: 0 }
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
