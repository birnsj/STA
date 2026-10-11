// Minimap area names sit in the middle of their room (designer request, 2026-10-11). Implementation detail: rooms are
// found from the area's tile, bounded by walls and doorways.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import brigFile from '../maps/Deck 10 Brig.json' with { type: 'json' }
import kelDorFile from "../maps/I.K.S. Kel'dor Brig.json" with { type: 'json' }
import { areaLabelCentres } from '../src/maps/areaCentres.js'
import { createBlankMap, parseMapFile } from '../src/maps/mapFormat.js'

const centreOf = (map, name) => areaLabelCentres(map.tiles, map.areas)[map.areas.findIndex((area) => area.name === name)]

describe('minimap area name centres', () => {
  it('centres a name in a room whose doorways are doorway tiles', () => {
    const map = parseMapFile(brigFile)
    assert.deepEqual(centreOf(map, 'Phaser Control Room'), { x: 6, y: 8 })
    assert.deepEqual(centreOf(map, 'Transporter Room 1'), { x: 31.5, y: 21.5 })
  })

  it('centres a name in a room whose doorways are plain gaps in the wall', () => {
    const map = parseMapFile(kelDorFile)
    assert.deepEqual(centreOf(map, 'Cloaking Device Room'), { x: 7, y: 7 })
    assert.deepEqual(centreOf(map, "Captain's Quarters"), { x: 32.5, y: 20.5 })
  })

  it('leaves a name on its own tile on open ground', () => {
    const map = createBlankMap({ name: 'Open', width: 20, height: 20 })
    const areas = [{ name: 'Clearing', position: { x: 3, y: 4 } }]
    assert.deepEqual(areaLabelCentres(map.tiles, areas), [{ x: 3, y: 4 }])
  })
})
