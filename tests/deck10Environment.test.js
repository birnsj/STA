// The Deck 10 Brig's destructible objects (maps/Deck 10 Brig.json): the five placed objects load intact and in view, the
// map has no hazards, and with every object standing the away team can still reach each objective, object, NPC and spawn.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import brigFile from '../maps/Deck 10 Brig.json'
import { createExplorationState } from '../src/exploration/explorationState.js'
import { findTilePath } from '../src/exploration/navigation.js'
import { getTile, parseMapFile } from '../src/maps/mapFormat.js'
import { destructibleTileId } from '../src/world/environment.js'
import { makeCharacter } from './support/characters.js'

const brig = () => parseMapFile(brigFile, 'Deck 10 Brig')
const start = () => createExplorationState(brig(), [makeCharacter({ id: 'alpha', name: 'Alpha' })], 1, { enemiesActive: false })
const near = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1

describe('Deck 10 Brig environment', () => {
  it('places five intact destructible objects and no hazards', () => {
    const map = brig()
    assert.equal(map.destructibles.length, 5)
    assert.deepEqual(map.hazards, [])
    assert.equal('hazards' in brigFile, false)
    const { environment } = start()
    assert.deepEqual(
      Object.values(environment.destructibles).map((record) => [record.type, record.state]).sort(),
      [['chemicalContainer', 'intact'], ['epsConduit', 'intact'], ['gasCylinder', 'intact'], ['plasmaJunction', 'intact'], ['powerJunction', 'intact']],
    )
    assert.deepEqual(environment.hazards, {})
  })

  // A tall block east, south or south-east of an object is drawn in front of it and hides it until a party member
  // walks up to fade the wall.
  it('leaves every object in view: nothing tall is drawn in front of it', () => {
    const map = brig()
    const tall = (x, y) => {
      const tile = getTile(map.tiles[y]?.[x] ?? 'floor')
      return Boolean(tile.solid) && (tile.height ?? 0) >= 40
    }
    map.destructibles.forEach(({ id, position: { x, y } }) => {
      assert.equal([tall(x + 1, y), tall(x, y + 1), tall(x + 1, y + 1)].includes(true), false, `${id} at ${x},${y} is hidden behind a wall`)
    })
  })

  // The east section is sealed until its bulkheads open, so the baseline is the same map without the objects: whatever
  // the away team reaches there it must still reach with all five standing.
  it('cuts nothing off: every objective, object, NPC and spawn reachable without the objects stays reachable', () => {
    const state = start()
    const map = state.party.map
    Object.values(state.environment.destructibles).forEach(({ type, position }) => assert.equal(map.tiles[position.y][position.x], destructibleTileId(type)))
    const bare = createExplorationState(parseMapFile({ ...brigFile, destructibles: [] }, 'Deck 10 Brig'), [makeCharacter({ id: 'alpha', name: 'Alpha' })], 1, { enemiesActive: false }).party.map
    const from = map.markers.playerStarts[0]
    const targets = [
      ...map.objectives.filter((objective) => objective.position).map((objective) => [objective.id, objective.position]),
      ...Object.entries(map.objectPlacements),
      ...map.npcs.map((npc) => [npc.id, npc.position]),
      ...map.markers.enemySpawns.map((spawn, index) => [`enemySpawn${index}`, spawn]),
    ]
    const reaches = (grid, target) => {
      const path = findTilePath(grid, from, target)
      return near(path[path.length - 1], target)
    }
    const reachable = targets.filter(([, target]) => reaches(bare, target))
    assert.ok(reachable.some(([id]) => id === 'restorePower') && reachable.some(([id]) => id === 'powerJunction01'))
    reachable.forEach(([id, target]) => assert.ok(reaches(map, target), `${id} at ${target.x},${target.y} is cut off`))
  })
})
