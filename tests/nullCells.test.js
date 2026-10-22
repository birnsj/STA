// Null/empty cells: parse/serialize, schema version, collision, sight, wall-fade spaces.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { blocksLineOfFire, blocksMovement } from '../src/combat/battleMap.js'
import { isClear } from '../src/exploration/navigation.js'
import {
  createBlankMap,
  createNullMap,
  MAP_SCHEMA_VERSION,
  MAP_SCHEMA_VERSION_LAYERS,
  NULL_TILE,
  parseMapFile,
  resizeMap,
  schemaVersionFor,
  serializeMap,
} from '../src/maps/mapFormat.js'
import { analyseWalls } from '../src/maps/wallFade.js'
import { paintTile } from '../src/maps/mapEdits.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const deck10 = JSON.parse(fs.readFileSync(path.join(root, '../maps/Deck 10 Brig.json'), 'utf8'))

describe('Null cells', () => {
  it('round-trips a map that contains Null without changing legacy Deck 10', () => {
    const loaded = parseMapFile(deck10, 'Deck 10 Brig')
    const again = serializeMap(loaded)
    assert.equal(again.schemaVersion, MAP_SCHEMA_VERSION)
    assert.equal(again.rows.join('\n'), deck10.rows.join('\n'))
    assert.ok(!again.floorUnder)
  })

  it('parses and serialises Null (ġ) as schema 2', () => {
    const map = createNullMap({ name: 'Null Test', width: 4, height: 4 })
    const painted = paintTile(map, { x: 1, y: 1 }, 'floor')
    const file = serializeMap(painted)
    assert.equal(file.schemaVersion, MAP_SCHEMA_VERSION_LAYERS)
    assert.ok(file.rows.some((row) => row.includes('ġ')))
    const back = parseMapFile(file, 'Null Test')
    assert.equal(back.tiles[0][0], NULL_TILE)
    assert.equal(back.tiles[1][1], 'floor')
  })

  it('keeps schema 1 when there is no Null and no floorUnder', () => {
    assert.equal(schemaVersionFor(createBlankMap({ width: 4, height: 4 })), MAP_SCHEMA_VERSION)
  })

  it('blocks movement on Null but not line of fire', () => {
    const map = createNullMap({ width: 4, height: 4 })
    assert.equal(blocksMovement(map, { x: 1, y: 1 }), true)
    assert.equal(blocksLineOfFire(map, { x: 1, y: 1 }), false)
  })

  it('rejects exploration clearance on Null', () => {
    const map = createNullMap({ width: 4, height: 4 })
    assert.equal(isClear(map, { x: 1.5, y: 1.5 }, 0.2), false)
  })

  it('excludes Null cells from wall-fade spaces', () => {
    let map = createNullMap({ width: 5, height: 5 })
    map = paintTile(map, { x: 2, y: 2 }, 'floor')
    map = paintTile(map, { x: 1, y: 2 }, 'floor')
    map = paintTile(map, { x: 3, y: 2 }, 'floor')
    const analysis = analyseWalls(map)
    // Only the three floor cells form a space; Null stays at -1.
    assert.equal(analysis.spaceAt[2 * 5 + 2] >= 0, true)
    assert.equal(analysis.spaceAt[0], -1)
  })

  it('resizes with Null fill when the map already has Null cells', () => {
    const map = createNullMap({ width: 4, height: 4 })
    const grown = resizeMap(map, 6, 6)
    assert.equal(grown.tiles[5][5], NULL_TILE)
  })

  it('resizes with floor fill when the map has no Null cells', () => {
    const map = createBlankMap({ width: 4, height: 4 })
    const grown = resizeMap(map, 6, 6)
    assert.equal(grown.tiles[5][5], 'floor')
  })
})
