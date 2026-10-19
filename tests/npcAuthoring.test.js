// Map NPC authoring: patrol, responseType and perception overrides (mapFormat.js / awareness.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createNpc } from '../src/exploration/awareness.js'
import { createExplorationState, npcConfigsFor } from '../src/exploration/explorationState.js'
import {
  addPatrolWaypoint,
  clearNpcPatrol,
  placeNpc,
  removePatrolWaypoint,
  reorderPatrolWaypoint,
  updateNpc,
  updatePatrolWaypoint,
} from '../src/maps/mapEdits.js'
import { createBlankMap, parseMapFile, PERCEPTION_DEFAULTS, serializeMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const blank = () => createBlankMap({ name: 'Npc Auth', width: 12, height: 10 })
const team = () => [makeCharacter({ id: 'lead', name: 'Lead' })]

function withNpc(map, extras = {}) {
  const placed = placeNpc(map, { x: 3, y: 3 }, 'klingonWarrior1')
  return updateNpc(placed.map, placed.npc.id, extras)
}

describe('NPC patrol serialization', () => {
  it('round-trips waypoints with wait and facing, and omits an empty patrol', () => {
    let map = withNpc(blank())
    const id = map.npcs[0].id
    map = addPatrolWaypoint(map, id, { x: 3, y: 3 }, { wait: 2, facing: 0 })
    map = addPatrolWaypoint(map, id, { x: 5, y: 4 }, { wait: 1.5, facing: 90 })
    map = updatePatrolWaypoint(map, id, 1, { facing: 180 })
    const saved = serializeMap(map)
    assert.deepEqual(saved.npcs[0].patrol, [
      { at: [3, 3], wait: 2, facing: 0 },
      { at: [5, 4], wait: 1.5, facing: 180 },
    ])
    const loaded = parseMapFile(JSON.parse(JSON.stringify(saved)), map.id)
    assert.deepEqual(loaded.npcs[0].patrol, [
      { at: { x: 3, y: 3 }, wait: 2, facing: 0 },
      { at: { x: 5, y: 4 }, wait: 1.5, facing: 180 },
    ])
    const cleared = serializeMap(clearNpcPatrol(loaded, id))
    assert.equal('patrol' in cleared.npcs[0], false)
  })

  it('drops out-of-bounds waypoints on parse and keeps facing null when omitted', () => {
    const file = serializeMap(withNpc(blank()))
    file.npcs[0].patrol = [
      { at: [3, 3], wait: 1 },
      { at: [99, 99], wait: 2, facing: 45 },
    ]
    const loaded = parseMapFile(file, 'Npc Auth')
    assert.deepEqual(loaded.npcs[0].patrol, [{ at: { x: 3, y: 3 }, wait: 1, facing: null }])
  })

  it('reorder and remove keep a coherent list', () => {
    let map = withNpc(blank())
    const id = map.npcs[0].id
    map = addPatrolWaypoint(map, id, { x: 3, y: 3 })
    map = addPatrolWaypoint(map, id, { x: 4, y: 3 })
    map = addPatrolWaypoint(map, id, { x: 5, y: 3 })
    map = reorderPatrolWaypoint(map, id, 0, 2)
    assert.deepEqual(
      map.npcs[0].patrol.map((point) => point.at.x),
      [4, 5, 3],
    )
    map = removePatrolWaypoint(map, id, 1)
    assert.deepEqual(
      map.npcs[0].patrol.map((point) => point.at.x),
      [4, 3],
    )
  })
})

describe('NPC patrol runtime', () => {
  it('createNpc builds a looping patrol from map-authored waypoints', () => {
    let map = withNpc(blank(), { disposition: 'hostile' })
    const id = map.npcs[0].id
    map = addPatrolWaypoint(map, id, { x: 3, y: 3 }, { wait: 2, facing: 0 })
    map = addPatrolWaypoint(map, id, { x: 6, y: 3 }, { wait: 1, facing: 90 })
    const [config] = npcConfigsFor(map)
    assert.deepEqual(config.patrol[0].at, [3, 3])
    const npc = createNpc(config)
    assert.equal(npc.patrol.points.length, 2)
    assert.equal(npc.patrol.points[0].wait, 2)
    assert.equal(npc.patrol.points[0].facing, 0)
    assert.ok(Math.abs(npc.patrol.points[1].facing - Math.PI / 2) < 1e-9)
  })

  it('exploration seeds patrol and perception from the map', () => {
    let map = withNpc(blank(), {
      disposition: 'hostile',
      responseType: 'alarm',
      perception: { visionRange: 12, hearingRange: 4 },
    })
    const id = map.npcs[0].id
    map = addPatrolWaypoint(map, id, { x: 3, y: 3 }, { wait: 2 })
    map = addPatrolWaypoint(map, id, { x: 5, y: 5 }, { wait: 2 })
    map.markers.playerStarts = [{ x: 1, y: 1 }]
    const state = createExplorationState(map, team())
    const npc = state.world.npcs[id]
    assert.equal(npc.responseType, 'alarm')
    assert.equal(npc.perception.visionRange, 12)
    assert.equal(npc.perception.hearingRange, 4)
    assert.equal(npc.perception.normalRange, PERCEPTION_DEFAULTS.normalRange)
    assert.equal(npc.patrol.points.length, 2)
  })
})

describe('NPC responseType and perception', () => {
  it('persists responseType and omits the default null', () => {
    const map = withNpc(blank(), { responseType: 'alarm' })
    const saved = serializeMap(map)
    assert.equal(saved.npcs[0].responseType, 'alarm')
    const loaded = parseMapFile(JSON.parse(JSON.stringify(saved)), map.id)
    assert.equal(loaded.npcs[0].responseType, 'alarm')
    const plain = serializeMap(withNpc(blank()))
    assert.equal('responseType' in plain.npcs[0], false)
  })

  it('drops unknown responseType values on parse', () => {
    const file = serializeMap(withNpc(blank()))
    file.npcs[0].responseType = 'teleport'
    assert.equal(parseMapFile(file, 'Npc Auth').npcs[0].responseType, null)
  })

  it('round-trips perception overrides and leaves legacy NPCs without them', () => {
    const map = withNpc(blank(), { perception: { visionRange: 11, awarenessBuildRate: 2 } })
    const saved = serializeMap(map)
    assert.deepEqual(saved.npcs[0].perception, { visionRange: 11, awarenessBuildRate: 2 })
    const loaded = parseMapFile(JSON.parse(JSON.stringify(saved)), map.id)
    assert.deepEqual(loaded.npcs[0].perception, { visionRange: 11, awarenessBuildRate: 2 })
    const legacy = parseMapFile(serializeMap(withNpc(blank())), 'Legacy')
    assert.equal('perception' in legacy.npcs[0], false)
    const npc = createNpc(npcConfigsFor(legacy)[0])
    assert.equal(npc.perception.visionRange, PERCEPTION_DEFAULTS.visionRange)
  })
})
