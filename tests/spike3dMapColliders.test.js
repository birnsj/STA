import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import brigFile from '../maps/Deck 10 Brig.json'
import { parseMapFile } from '../src/maps/mapFormat.js'
import { buildMapColliders, occluderPunchesActor, spriteFootprint } from '../src/spike3d/mapColliders.js'
import { facingToYaw, projectWorld, WORLD_Y_TO_PX } from '../src/spike3d/isoProjection.js'
import { TILE_H, TILE_W, project } from '../src/maps/iso.js'
import { getTile } from '../src/maps/mapFormat.js'

describe('spike3d map colliders', () => {
  it('builds a floor and wall boxes for Deck 10 Brig', () => {
    const map = parseMapFile(brigFile, 'Deck 10 Brig')
    const colliders = buildMapColliders(map)
    assert.ok(colliders.length > 10)
    assert.ok(colliders.some((c) => c.kind === 'floor'))
    assert.ok(colliders.some((c) => c.kind === 'wall'))
    const floor = colliders.find((c) => c.kind === 'floor')
    assert.equal(floor.maxY, 0)
    assert.ok(floor.maxX > 10)
  })

  it('extrudes solids to catalogue height in design px (iso cube)', () => {
    const map = {
      width: 2,
      height: 1,
      tiles: [['bulkhead', 'crate']],
      rotated: [[false, false]],
    }
    const colliders = buildMapColliders(map)
    const wall = colliders.find((c) => c.kind === 'wall')
    const prop = colliders.find((c) => c.kind === 'prop')
    assert.ok(wall)
    assert.ok(prop)
    assert.equal(wall.maxY, 92 / WORLD_Y_TO_PX)
    assert.equal(prop.maxY, 16 / WORLD_Y_TO_PX)
    assert.equal(wall.maxX - wall.minX, 1)
    assert.equal(wall.maxZ - wall.minZ, 1)
  })

  it('uses a thin strip for half bulkheads', () => {
    const map = {
      width: 3,
      height: 1,
      tiles: [['floor', 'halfBulkhead', 'floor']],
      rotated: [[false, false, false]],
    }
    const colliders = buildMapColliders(map)
    const wall = colliders.find((c) => c.kind === 'wall')
    assert.ok(wall)
    const dx = wall.maxX - wall.minX
    const dz = wall.maxZ - wall.minZ
    assert.ok(Math.min(dx, dz) === 1 / 8)
    assert.ok(Math.max(dx, dz) === 1)
    assert.equal(wall.maxY, 92 / WORLD_Y_TO_PX)
  })

  it('raises prop colliders by stackOver height', () => {
    const map = {
      width: 1,
      height: 1,
      tiles: [['dimCrate']],
      rotated: [[false]],
      stackOver: { '0,0': ['dimCrate', 'dimCrate'] },
    }
    const prop = buildMapColliders(map).find((c) => c.kind === 'prop')
    assert.ok(prop)
    assert.equal(prop.maxY, (16 + 16 + 16) / WORLD_Y_TO_PX)
  })

  it('only lets occluders in front punch a figure (Pixi depth parity)', () => {
    // Figure at tile depth 10 sorts as 10.5; block at 10 must not punch (same cell / behind).
    assert.equal(occluderPunchesActor(10, 10.5), false)
    // Block one tile in front (11) still punches someone at 10.5.
    assert.equal(occluderPunchesActor(11, 10.5), true)
    // Block behind (9) must not punch someone standing in front.
    assert.equal(occluderPunchesActor(9, 10.5), false)
  })

  it('matches Dimension thick-wall and column sprite footprints', () => {
    assert.deepEqual(spriteFootprint(getTile('dimWall32Thick')), {
      width: 1,
      depth: 32 / TILE_W,
      plant: 'edge',
    })
    assert.deepEqual(spriteFootprint(getTile('dimColumn16')), {
      width: 16 / TILE_W,
      depth: 16 / TILE_W,
      plant: 'center',
    })
    assert.deepEqual(spriteFootprint(getTile('dimCrate')), {
      width: 40 / TILE_W,
      depth: 40 / TILE_W,
      plant: 'center',
    })
    const map = {
      width: 1,
      height: 1,
      tiles: [['dimWall32Thick']],
      rotated: [[false]],
    }
    const wall = buildMapColliders(map).find((c) => c.kind === 'wall')
    assert.ok(wall)
    assert.equal(wall.maxY, 92 / WORLD_Y_TO_PX)
    assert.ok(Math.abs(Math.min(wall.maxX - wall.minX, wall.maxZ - wall.minZ) - 32 / TILE_W) < 1e-9)
  })
})

describe('spike3d iso projection', () => {
  it('matches project() for feet on the ground', () => {
    const tile = { x: 5, y: 3 }
    const screen = project(tile)
    const world = projectWorld(tile.x, 0, tile.y)
    assert.equal(world.x, screen.x)
    assert.equal(world.y, screen.y)
  })

  it('raises height along screen -Y', () => {
    const a = projectWorld(4, 0, 4)
    const b = projectWorld(4, 1, 4)
    assert.ok(b.y < a.y)
    assert.equal(a.x - b.x, 0)
  })

  it('maps facing to a yaw', () => {
    assert.ok(Number.isFinite(facingToYaw({ x: 1, y: 0 })))
    assert.ok(Number.isFinite(facingToYaw({ x: 0, y: 1 })))
  })

  it('uses STA tile metrics', () => {
    assert.equal(TILE_W, 64)
    assert.equal(TILE_H, 32)
  })

  it('keeps world-Y in scale with horizontal iso (no spaghetti stretch)', () => {
    assert.equal(WORLD_Y_TO_PX, TILE_W / 2)
    // Match sprite bake: 50 body units × paintScale 1.25 → 63 design px; shoulders ±6.
    const wallPx = 96
    const heightPx = 63
    const height = heightPx / WORLD_Y_TO_PX
    const xz = 1
    const shoulderHalf = 6 * (height / 50) * xz
    const widthPx = shoulderHalf * 2 * (TILE_W / 2)
    assert.equal(heightPx, 63)
    assert.ok(heightPx / widthPx < 6, `aspect ${heightPx / widthPx} should look human, not ~10:1`)
    assert.ok(heightPx < wallPx)
    assert.ok(widthPx > 12)
  })
})
