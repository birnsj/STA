// Rotated tiles and the long-wall brush (maps/mapEdits.js, maps/mapFormat.js rotated, maps/wallPanels.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap, isRotated, parseMapFile, resizeMap, serializeMap } from '../src/maps/mapFormat.js'
import { gridFacing } from '../src/maps/facing.js'
import { brushPositions, hasMarkers, moveMarkers, paintBrush, setFacing, swapTiles, turnFacing } from '../src/maps/mapEdits.js'
import { getWallPanels } from '../src/maps/wallPanels.js'

const blank = () => createBlankMap({ name: 'Test', width: 6, height: 6 })

describe('long-wall brush', () => {
  it('a wall with panels lays two tiles, along x or along y when rotated', () => {
    assert.deepEqual(brushPositions(blank(), { x: 2, y: 2 }, 'bulkhead', false), [{ x: 2, y: 2 }, { x: 3, y: 2 }])
    assert.deepEqual(brushPositions(blank(), { x: 2, y: 2 }, 'bulkhead', true), [{ x: 2, y: 2 }, { x: 2, y: 3 }])
  })

  it('other tiles and the map edge leave one tile', () => {
    assert.deepEqual(brushPositions(blank(), { x: 2, y: 2 }, 'crate', false), [{ x: 2, y: 2 }])
    assert.deepEqual(brushPositions(blank(), { x: 5, y: 2 }, 'bulkhead', false), [{ x: 5, y: 2 }])
  })

  it('a rotated long wall pairs into one panel along y', () => {
    const map = paintBrush(blank(), { x: 2, y: 2 }, 'bulkhead', true)
    const panels = getWallPanels(map)
    assert.equal(panels.get('2,2').axis, 'y')
    assert.equal(panels.get('2,3').axis, 'y')
  })

  it('an unrotated long wall pairs along x', () => {
    const map = paintBrush(blank(), { x: 2, y: 2 }, 'bulkhead', false)
    assert.equal(getWallPanels(map).get('2,2').axis, 'x')
  })
})

describe('Move tool swap', () => {
  it('swaps two tiles, each keeping its rotation', () => {
    const map = paintBrush(blank(), { x: 1, y: 1 }, 'crate', true)
    const swapped = swapTiles(map, { x: 1, y: 1 }, { x: 4, y: 3 })
    assert.equal(swapped.tiles[3][4], 'crate')
    assert.equal(isRotated(swapped, { x: 4, y: 3 }), true)
    assert.equal(swapped.tiles[1][1], map.tiles[3][4])
    assert.equal(isRotated(swapped, { x: 1, y: 1 }), false)
  })

  it('drops a marker from a tile that becomes solid, and does nothing for the same tile', () => {
    const map = { ...paintBrush(blank(), { x: 1, y: 1 }, 'crate'), markers: { playerStarts: [{ x: 4, y: 3 }], enemySpawns: [] } }
    assert.deepEqual(swapTiles(map, { x: 1, y: 1 }, { x: 4, y: 3 }).markers.playerStarts, [])
    assert.equal(swapTiles(map, { x: 2, y: 2 }, { x: 2, y: 2 }), map)
  })
})

describe('Move tool markers', () => {
  const withMarkers = () => ({
    ...paintBrush(blank(), { x: 4, y: 4 }, 'crate'),
    markers: { playerStarts: [{ x: 1, y: 1 }], enemySpawns: [{ x: 2, y: 2 }] },
    npcs: [{ id: 'npc1', position: { x: 3, y: 1 } }],
  })

  it('moves an enemy spawn and an NPC to a free floor tile', () => {
    assert.equal(hasMarkers(withMarkers(), { x: 2, y: 2 }), true)
    assert.equal(hasMarkers(withMarkers(), { x: 3, y: 3 }), false)
    const spawn = moveMarkers(withMarkers(), { x: 2, y: 2 }, { x: 3, y: 3 }).map
    assert.deepEqual(spawn.markers.enemySpawns, [{ x: 3, y: 3 }])
    const npc = moveMarkers(withMarkers(), { x: 3, y: 1 }, { x: 3, y: 2 }).map
    assert.deepEqual(npc.npcs[0].position, { x: 3, y: 2 })
  })

  it('refuses a solid tile or a tile that already has a start, spawn or NPC', () => {
    assert.ok(moveMarkers(withMarkers(), { x: 2, y: 2 }, { x: 4, y: 4 }).error)
    assert.ok(moveMarkers(withMarkers(), { x: 2, y: 2 }, { x: 1, y: 1 }).error)
  })
})

describe('NPC and enemy facing', () => {
  const withActors = () => ({
    ...blank(),
    markers: { playerStarts: [], enemySpawns: [{ x: 0, y: 0 }] },
    npcs: [{ id: 'npc1', position: { x: 4, y: 4 }, facing: 315 }],
  })

  it('a right click turns an NPC 45° clockwise, wrapping past 315', () => {
    assert.equal(turnFacing(withActors(), { x: 4, y: 4 }).npcs[0].facing, 0)
  })

  it('an unturned spawn starts from facing the map middle', () => {
    // From the corner (0, 0) the middle of a 6 x 6 map is along +x +y (45°).
    const turned = turnFacing(withActors(), { x: 0, y: 0 })
    assert.equal(turned.markers.enemySpawns[0].facing, 90)
    assert.deepEqual(gridFacing(90), { x: 0, y: 1 })
  })

  it('a turned spawn is saved as [x, y, facing] and an unturned one as [x, y]; moving keeps the facing', () => {
    const map = { ...turnFacing(withActors(), { x: 0, y: 0 }), markers: { playerStarts: [], enemySpawns: [{ x: 0, y: 0, facing: 90 }, { x: 2, y: 0 }] } }
    const file = serializeMap(map)
    assert.deepEqual(file.markers.enemySpawns, [[0, 0, 90], [2, 0]])
    assert.deepEqual(parseMapFile(file, 'Test').markers.enemySpawns, [{ x: 0, y: 0, facing: 90 }, { x: 2, y: 0 }])
    assert.deepEqual(moveMarkers(map, { x: 0, y: 0 }, { x: 1, y: 1 }).map.markers.enemySpawns[0], { x: 1, y: 1, facing: 90 })
  })

  it('a player start turns, is saved with its facing and keeps it when moved', () => {
    const map = { ...blank(), markers: { playerStarts: [{ x: 0, y: 0 }], enemySpawns: [] } }
    const turned = turnFacing(map, { x: 0, y: 0 })
    assert.equal(turned.markers.playerStarts[0].facing, 90)
    assert.deepEqual(serializeMap(turned).markers.playerStarts, [[0, 0, 90]])
    assert.deepEqual(parseMapFile(serializeMap(turned), 'Test').markers.playerStarts, [{ x: 0, y: 0, facing: 90 }])
    assert.deepEqual(moveMarkers(turned, { x: 0, y: 0 }, { x: 2, y: 2 }).map.markers.playerStarts, [{ x: 2, y: 2, facing: 90 }])
  })

  it('an NPC standing on a spawn turns the spawn with it', () => {
    const map = { ...withActors(), markers: { playerStarts: [], enemySpawns: [{ x: 4, y: 4, facing: 180 }] } }
    const turned = turnFacing(map, { x: 4, y: 4 })
    assert.equal(turned.npcs[0].facing, 0)
    assert.equal(turned.markers.enemySpawns[0].facing, 0)
  })

  it('the Facing list sets a spawn, and Default clears it back to facing the middle', () => {
    const map = withActors()
    const set = setFacing(map, { x: 0, y: 0 }, 270)
    assert.deepEqual(set.markers.enemySpawns[0], { x: 0, y: 0, facing: 270 })
    assert.deepEqual(setFacing(set, { x: 0, y: 0 }, null).markers.enemySpawns[0], { x: 0, y: 0 })
  })

  it('a click on a tile with no NPC or spawn changes nothing', () => {
    const map = withActors()
    assert.equal(turnFacing(map, { x: 2, y: 2 }), map)
  })
})

describe('rotation in map files', () => {
  it('survives saving, loading and resizing', () => {
    const map = paintBrush(blank(), { x: 2, y: 2 }, 'crate', true)
    const file = serializeMap(map)
    assert.deepEqual(file.rotated, [[2, 2]])
    const loaded = parseMapFile(file, 'Test')
    assert.equal(isRotated(loaded, { x: 2, y: 2 }), true)
    assert.equal(isRotated(loaded, { x: 3, y: 2 }), false)
    assert.equal(isRotated(resizeMap(loaded, 4, 4), { x: 2, y: 2 }), true)
  })

  it('maps saved before rotation load with nothing rotated', () => {
    const file = { ...serializeMap(blank()) }
    delete file.rotated
    assert.equal(parseMapFile(file, 'Test').rotated.flat().some(Boolean), false)
  })

  it('painting a tile unrotated clears its rotation', () => {
    const map = paintBrush(paintBrush(blank(), { x: 2, y: 2 }, 'crate', true), { x: 2, y: 2 }, 'floor', false)
    assert.equal(isRotated(map, { x: 2, y: 2 }), false)
  })
})
