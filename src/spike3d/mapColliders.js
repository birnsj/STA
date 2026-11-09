import { getTile, isRotated } from '../maps/mapFormat.js'
import { wallRunAxis } from '../maps/generators/halfWalls.js'
import { getTemplatePiece, templatePieceFootprint } from '../maps/templatePieces.js'
import { TILE_W } from '../maps/iso.js'
import { WORLD_Y_TO_PX } from './isoProjection.js'

// Floor slab under the map (world Y).
const FLOOR_THICK = 0.5
// Flat solids (water, lava): thin block so ragdolls don’t fall through.
const FLAT_SOLID_H = 0.08
// Design px → tile units (floor diamond is 64 wide).
const pxToTiles = (px) => Math.max(1 / TILE_W, Number(px) / TILE_W)

function heightWorld(tileOrHeight) {
  const px = typeof tileOrHeight === 'number' ? tileOrHeight : Number(tileOrHeight?.height)
  if (Number.isFinite(px) && px > 0) return px / WORLD_Y_TO_PX
  return FLAT_SOLID_H
}

/**
 * Sprite-matched floor footprint in tile units (width along run / X, depth = thickness along Z),
 * plus how to plant it on the cell.
 *
 * Sources (in order):
 * 1. tile.footprint { width, depth } in design px (optional catalogue field)
 * 2. Known art sizes from the tile generators (half bulkhead, Dimension kit, …)
 * 3. Full 1×1 cell — matches blockScene / full-tile iso cubes
 */
export function spriteFootprint(tile) {
  if (!tile) return { width: 1, depth: 1, plant: 'center' }
  const fp = tile.footprint
  if (fp?.width > 0) {
    return {
      width: pxToTiles(fp.width),
      depth: pxToTiles(fp.depth > 0 ? fp.depth : fp.width),
      plant: fp.plant === 'edge' || fp.plant === 'tip' ? 'edge' : 'center',
    }
  }

  const id = tile.id ?? ''

  // Ultima-8 half bulkhead: 8 px thick × full run (makeTilesV2 HALF_THICK = 1/8).
  if (id === 'halfBulkhead' || id === 'halfBulkheadCorner') {
    return { width: 1, depth: 1 / 8, plant: 'edge' }
  }

  // Dimension / labels: "Dim Wall 32-thick", dimWall32Half, dimWall32Short → 32 px thick strip.
  let m = /^dimWall(\d+)Thick$/.exec(id)
  if (m) return { width: 1, depth: pxToTiles(Number(m[1])), plant: 'edge' }
  if (id === 'dimWall32Half' || id === 'dimWall32Short' || id === 'dimWall32Corner') {
    return { width: 1, depth: pxToTiles(32), plant: id === 'dimWall32Corner' ? 'center' : 'edge' }
  }

  // Dim columns: post(N) → N×N px.
  m = /^dimColumn(\d+)/.exec(id)
  if (m) {
    const s = pxToTiles(Number(m[1]))
    return { width: s, depth: s, plant: 'center' }
  }

  // Dim crates: slab(40, 40, …) in makeDimensionKit.
  if (id === 'dimCrate' || id === 'dimCrateTall') {
    return { width: pxToTiles(40), depth: pxToTiles(40), plant: 'center' }
  }

  // surface.inset shrinks the usable top — match a slightly inset collision prism for props.
  const inset = Number(tile.surface?.inset)
  if (Number.isFinite(inset) && inset > 0 && inset < 0.45) {
    const s = 1 - inset * 2
    return { width: s, depth: s, plant: 'center' }
  }

  // Full-tile iso cube (bulkhead, crate, cal blocks, dimWall without thick, …).
  return { width: 1, depth: 1, plant: 'center' }
}

/** Axis-aligned box centered on the tile. */
function centeredBox(x, y, width, depth, h, kind) {
  const hx = width / 2
  const hz = depth / 2
  return {
    minX: x - hx,
    maxX: x + hx,
    minY: 0,
    maxY: h,
    minZ: y - hz,
    maxZ: y + hz,
    kind,
  }
}

/**
 * Thin strip on one edge of the tile (half bulkhead / Dimension thick walls).
 * axis 'x' → run along X, thin in Z; axis 'y' → run along Y, thin in X.
 * rotated flips to the opposite edge (editor R / finishHalfWalls).
 */
function edgeStrip(x, y, width, depth, h, axis, rotated, kind = 'wall') {
  // width = run length, depth = thickness.
  if (axis === 'y') {
    const minX = rotated ? x + 0.5 - depth : x - 0.5
    return {
      minX,
      maxX: minX + depth,
      minY: 0,
      maxY: h,
      minZ: y - width / 2,
      maxZ: y + width / 2,
      kind,
    }
  }
  const minZ = rotated ? y + 0.5 - depth : y - 0.5
  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: 0,
    maxY: h,
    minZ,
    maxZ: minZ + depth,
    kind,
  }
}

/** L-corner of two edge strips. */
function edgeCornerBoxes(x, y, width, depth, h, rotated, kind = 'wall') {
  return [
    edgeStrip(x, y, width, depth, h, 'y', rotated, kind),
    edgeStrip(x, y, width, depth, h, 'x', rotated, kind),
  ]
}

/** Tip-anchored footprint (Template Pieces): tip is the +X/+Y corner; box extends toward −X/−Y. */
function tipBox(tipX, tipY, width, depth, h, kind) {
  return {
    minX: tipX - width,
    maxX: tipX,
    minY: 0,
    maxY: h,
    minZ: tipY - depth,
    maxZ: tipY,
    kind,
  }
}

function boxesForTile(map, x, y, tile) {
  const h = heightWorld(tile)
  const id = tile.id
  const rotated = isRotated(map, { x, y })
  const { width, depth, plant } = spriteFootprint(tile)
  const kind = tile.wall ? 'wall' : 'prop'

  if (id === 'halfBulkheadCorner') {
    return edgeCornerBoxes(x, y, width, depth, h, rotated, kind)
  }
  // dimWallEnd: 64×16 tip strip; dimWallCross: + of 16-thick arms — approximate as centered thin cross via full cell height match.
  if (id === 'dimWallEnd') {
    return [edgeStrip(x, y, 1, pxToTiles(16), h, wallRunAxis(map, { x, y }), rotated, kind)]
  }
  if (id === 'dimWallCross') {
    const t = pxToTiles(16)
    return [
      centeredBox(x, y, 1, t, h, kind),
      centeredBox(x, y, t, 1, h, kind),
    ]
  }
  if (plant === 'edge') {
    const axis = wallRunAxis(map, { x, y })
    return [edgeStrip(x, y, width, depth, h, axis, rotated, kind)]
  }
  return [centeredBox(x, y, width, depth, h, kind)]
}

function boxesForTemplatePieces(map) {
  const out = []
  for (const entry of map.templatePiecePlacements ?? []) {
    const def = getTemplatePiece(entry.pieceId)
    if (!def) continue
    const fp = templatePieceFootprint(def, entry.rotation ?? 0)
    if (!fp?.width || !fp?.depth) continue
    const tip = entry.position
    if (!tip || !Number.isFinite(tip.x) || !Number.isFinite(tip.y)) continue
    const h = heightWorld(def.height ?? def.footprint?.height ?? 0)
    // Skip flat floor slabs (no vertical collision).
    if (h <= FLAT_SOLID_H) continue
    const box = tipBox(
      tip.x,
      tip.y,
      pxToTiles(fp.width),
      pxToTiles(fp.depth),
      h,
      def.cover || def.tags?.includes?.('wall') ? 'wall' : 'prop',
    )
    box.fadeKey = entry.id
    out.push(box)
  }
  return out
}

/**
 * Emit AABB colliders from an STA map grid.
 * World: X = tile.x, Y up, Z = tile.y.
 * Size matches the sprite: catalogue height (design px) × footprint width/depth (design px / 64).
 */
export function buildMapColliders(map) {
  if (!map?.tiles?.length) return []
  const height = map.tiles.length
  const width = map.tiles[0]?.length ?? 0
  const colliders = []

  colliders.push({
    minX: -0.5,
    maxX: width - 0.5,
    minY: -FLOOR_THICK,
    maxY: 0,
    minZ: -0.5,
    maxZ: height - 0.5,
    kind: 'floor',
  })

  for (let y = 0; y < height; y += 1) {
    const row = map.tiles[y]
    if (!row) continue
    for (let x = 0; x < row.length; x += 1) {
      const tile = getTile(row[x])
      if (!tile?.solid || tile.empty) continue
      const fadeKey = `${x},${y}`
      for (const box of boxesForTile(map, x, y, tile)) {
        // stackOver props raise the solid top (same sum as tileSurfaceAt).
        const stack = map.stackOver?.[fadeKey]
        if (Array.isArray(stack) && stack.length) {
          let extra = 0
          for (const id of stack) {
            const layer = getTile(id)
            if (layer?.height > 0) extra += layer.height / WORLD_Y_TO_PX
          }
          if (extra > 0) box.maxY += extra
        }
        box.fadeKey = fadeKey
        colliders.push(box)
      }
    }
  }

  colliders.push(...boxesForTemplatePieces(map))
  return colliders
}

/**
 * Whether a wall/prop occluder should punch this actor's mesh.
 * Matches Pixi depthLayer: figures sort at x+y+0.5, blocks at x+y — only solids in front hide the body.
 * Without this, iso zHeight makes crate/low-wall tops closer than feet in front, so legs vanish.
 */
export function occluderPunchesActor(tileDepth, paintKey) {
  return tileDepth + 0.5 > paintKey
}

/**
 * Invisible depth-only boxes for walls/props (not floor). Spike characters depth-test against these
 * so Pixi bulkheads show through where a mesh is behind a solid — same outcome as sprite depthLayer sort.
 */
export function addOccluderMeshes(scene, colliders, THREE) {
  const group = new THREE.Group()
  group.name = 'spike3d_occluders'
  group.visible = true

  const material = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  })

  for (const box of colliders ?? []) {
    if (box.kind === 'floor') continue
    const sx = Math.max(0.01, box.maxX - box.minX)
    const sy = Math.max(0.01, box.maxY - box.minY)
    const sz = Math.max(0.01, box.maxZ - box.minZ)
    const cx = (box.minX + box.maxX) / 2
    const cy = (box.minY + box.maxY) / 2
    const cz = (box.minZ + box.maxZ) / 2
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material)
    mesh.position.set(cx, cy, cz)
    mesh.frustumCulled = false
    // Draw before characters so depth is already in the buffer when the body tests.
    mesh.renderOrder = -100
    if (box.fadeKey != null) mesh.userData.fadeKey = box.fadeKey
    // Iso painter depth (tile x+z). Spike3dScene only enables occluders in front of each actor so
    // low walls/crates cannot punch feet of people standing in front (zHeight made tops "closer").
    mesh.userData.tileDepth = cx + cz
    group.add(mesh)
  }

  group.userData.dispose = () => {
    group.traverse((obj) => {
      obj.geometry?.dispose?.()
    })
    material.dispose()
  }

  scene.add(group)
  return group
}

/**
 * Debug meshes: translucent AABBs matching sprite height × footprint (Z while spike3d is on).
 */
export function addColliderMeshes(scene, colliders, THREE) {
  const group = new THREE.Group()
  group.name = 'spike3d_colliders'
  group.visible = false

  const fillByKind = {
    wall: new THREE.MeshBasicMaterial({
      color: 0x33ddff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    prop: new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    floor: new THREE.MeshBasicMaterial({
      color: 0x44aa66,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  }
  const edgeByKind = {
    wall: new THREE.LineBasicMaterial({ color: 0xa8f7ff, transparent: true, opacity: 0.95, depthWrite: false }),
    prop: new THREE.LineBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0.95, depthWrite: false }),
    floor: new THREE.LineBasicMaterial({ color: 0x88cc99, transparent: true, opacity: 0.5, depthWrite: false }),
  }

  for (const box of colliders ?? []) {
    const sx = Math.max(0.01, box.maxX - box.minX)
    const sy = Math.max(0.01, box.maxY - box.minY)
    const sz = Math.max(0.01, box.maxZ - box.minZ)
    const cx = (box.minX + box.maxX) / 2
    const cy = (box.minY + box.maxY) / 2
    const cz = (box.minZ + box.maxZ) / 2
    const kind = box.kind === 'floor' ? 'floor' : box.kind === 'prop' ? 'prop' : 'wall'
    const geo = new THREE.BoxGeometry(sx, sy, sz)
    const mesh = new THREE.Mesh(geo, fillByKind[kind])
    mesh.position.set(cx, cy, cz)
    mesh.renderOrder = 50
    group.add(mesh)
    const edges = new THREE.EdgesGeometry(geo)
    const line = new THREE.LineSegments(edges, edgeByKind[kind])
    line.position.copy(mesh.position)
    line.renderOrder = 51
    group.add(line)
  }

  group.userData.dispose = () => {
    group.traverse((obj) => {
      obj.geometry?.dispose?.()
    })
    for (const m of Object.values(fillByKind)) m.dispose()
    for (const m of Object.values(edgeByKind)) m.dispose()
  }

  scene.add(group)
  return group
}
