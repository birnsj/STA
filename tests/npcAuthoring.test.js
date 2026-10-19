// Map NPC authoring: patrol, responseType, perception overrides, waypoint animations (mapFormat.js / awareness.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { controllerFor } from '../src/actors/controllers.js'
import { listAuthoredCharacters, getAuthoredCharacter } from '../src/character/authoredCharacters.js'
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
import { createBlankMap, getTile, parseMapFile, PERCEPTION_DEFAULTS, serializeMap } from '../src/maps/mapFormat.js'
import { tickWaypointAnim, waypointAnimationsForCharacter } from '../src/maps/waypointAnimations.js'
import brigFile from '../maps/Deck 10 Brig.json'
import { makeCharacter } from './support/characters.js'

const blank = () => createBlankMap({ name: 'Npc Auth', width: 12, height: 10 })
const team = () => [makeCharacter({ id: 'lead', name: 'Lead' })]
const DECK10_NEW = [
  'sfSecurityReyes',
  'sfEngineerChen',
  'sfScienceVoss',
  'klingonGuardKorath',
  'klingonSentryTorak',
  'klingonWarriorKrel',
]
const waypointPlain = (at, wait, facing = null) => ({
  at,
  wait,
  facing,
  animation: null,
  animationDuration: null,
  animationLoop: false,
})

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
      waypointPlain({ x: 3, y: 3 }, 2, 0),
      waypointPlain({ x: 5, y: 4 }, 1.5, 180),
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
    assert.deepEqual(loaded.npcs[0].patrol, [waypointPlain({ x: 3, y: 3 }, 1)])
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

describe('NPC waypoint animations', () => {
  it('round-trips animation, duration and loop, and omits them when unset', () => {
    let map = withNpc(blank())
    const id = map.npcs[0].id
    map = addPatrolWaypoint(map, id, { x: 3, y: 3 }, {
      wait: 4,
      facing: 90,
      animation: 'idleLookAround',
      animationDuration: 2.6,
      animationLoop: true,
    })
    map = addPatrolWaypoint(map, id, { x: 5, y: 3 }, { wait: 1, facing: 0 })
    const saved = serializeMap(map)
    assert.deepEqual(saved.npcs[0].patrol, [
      { at: [3, 3], wait: 4, facing: 90, animation: 'idleLookAround', animationDuration: 2.6, animationLoop: true },
      { at: [5, 3], wait: 1, facing: 0 },
    ])
    const loaded = parseMapFile(JSON.parse(JSON.stringify(saved)), map.id)
    assert.equal(loaded.npcs[0].patrol[0].animation, 'idleLookAround')
    assert.equal(loaded.npcs[0].patrol[0].animationDuration, 2.6)
    assert.equal(loaded.npcs[0].patrol[0].animationLoop, true)
    assert.equal(loaded.npcs[0].patrol[1].animation, null)
    assert.equal(loaded.npcs[0].patrol[1].animationLoop, false)
  })

  it('createNpc carries waypoint animation fields into runtime patrol points', () => {
    let map = withNpc(blank())
    const id = map.npcs[0].id
    map = addPatrolWaypoint(map, id, { x: 3, y: 3 }, {
      wait: 3,
      facing: 180,
      animation: 'idleCheckPhaser',
      animationDuration: 3.2,
      animationLoop: true,
    })
    const npc = createNpc(npcConfigsFor(map)[0])
    assert.equal(npc.patrol.points[0].animation, 'idleCheckPhaser')
    assert.equal(npc.patrol.points[0].animationDuration, 3.2)
    assert.equal(npc.patrol.points[0].animationLoop, true)
    assert.equal(npc.waypointAnim, null)
  })

  it('tickWaypointAnim respects duration, loop restart, and falls back when finished', () => {
    const point = { animation: 'idleLookAround', animationDuration: 5, animationLoop: true }
    const start = tickWaypointAnim(null, point, true, 0.1)
    assert.equal(start.name, 'idleLookAround')
    assert.equal(start.playKey, 'wp-idleLookAround-0')
    const mid = tickWaypointAnim(start, point, false, 2.7)
    assert.ok(mid.cycle >= 1)
    assert.match(mid.playKey, /^wp-idleLookAround-/)
    const done = tickWaypointAnim({ ...start, elapsed: 4.9, duration: 5, loop: false, natural: 2.6 }, { ...point, animationLoop: false }, false, 0.2)
    assert.equal(done, null)
  })

  it('patrol wait faces the authored direction and continues to the next waypoint', () => {
    let map = withNpc(blank(), { disposition: 'friendly' })
    const id = map.npcs[0].id
    map = addPatrolWaypoint(map, id, { x: 3, y: 3 }, { wait: 1, facing: 90, animation: 'idleTurn', animationDuration: 0.5 })
    map = addPatrolWaypoint(map, id, { x: 6, y: 3 }, { wait: 1, facing: 0 })
    map.markers.playerStarts = [{ x: 1, y: 1 }]
    let state = createExplorationState(map, team(), 1, { enemiesActive: false })
    let npc = state.world.npcs[id]
    // Snap onto the first waypoint so wait begins immediately.
    npc = { ...npc, position: { ...npc.patrol.points[0].position } }
    const controller = controllerFor(npc)
    const ctx = { map: state.party.map, members: [], others: [], seconds: 0.25, emit: () => {} }
    npc = controller.behave(npc, ctx)
    assert.ok(npc.waypointAnim)
    assert.equal(controller.animationState(npc).pose?.animation, 'idleTurn')
    // Exhaust the wait; index advances and the anim clears.
    npc = controller.behave({ ...npc, patrol: { ...npc.patrol, waitLeft: 0.1 } }, { ...ctx, seconds: 0.2 })
    assert.equal(npc.patrol.index, 1)
    assert.equal(npc.waypointAnim, null)
  })

  it('combat readiness interrupts a waypoint animation without blocking the next behave step', () => {
    let map = withNpc(blank(), { disposition: 'hostile', responseType: 'combat' })
    const id = map.npcs[0].id
    map = addPatrolWaypoint(map, id, { x: 3, y: 3 }, { wait: 5, facing: 0, animation: 'idleLookAround', animationDuration: 2.6 })
    map.markers.playerStarts = [{ x: 1, y: 1 }]
    const state = createExplorationState(map, team(), 1, { enemiesActive: false })
    let npc = {
      ...state.world.npcs[id],
      position: { x: 3, y: 3 },
      waypointAnim: { name: 'idleLookAround', playKey: 'wp-idleLookAround-0', elapsed: 0.5, duration: 2.6, loop: false, natural: 2.6, cycle: 0 },
      combatReady: { targetId: 'lead' },
      awareness: { lead: { lastKnownPosition: { x: 1, y: 1 }, state: 'ALERTED' } },
    }
    const controller = controllerFor(npc)
    const next = controller.behave(npc, {
      map: state.party.map,
      members: [],
      others: [],
      seconds: 0.2,
      emit: () => {},
    })
    assert.equal(next.waypointAnim, null)
    assert.equal(controller.animationState(next).pose, undefined)
  })

  it('legacy patrols without animation fields still serialize and run', () => {
    const file = serializeMap(withNpc(blank()))
    file.npcs[0].patrol = [{ at: [3, 3], wait: 2 }, { at: [5, 4], wait: 1 }]
    const loaded = parseMapFile(file, 'Legacy Patrol')
    assert.equal(loaded.npcs[0].patrol[0].animation, null)
    const saved = serializeMap(loaded)
    assert.deepEqual(saved.npcs[0].patrol, [
      { at: [3, 3], wait: 2 },
      { at: [5, 4], wait: 1 },
    ])
    const npc = createNpc(npcConfigsFor(loaded)[0])
    assert.equal(npc.patrol.points[0].animation, null)
  })
})

describe('Deck 10 Brig authored NPCs', () => {
  it('adds six character records selectable in the authored picker', () => {
    const ids = new Set(listAuthoredCharacters().map((entry) => entry.id))
    for (const id of DECK10_NEW) {
      assert.ok(ids.has(id), id)
      const character = getAuthoredCharacter(id)
      assert.ok(character.name)
      assert.ok(waypointAnimationsForCharacter(id).length >= 5)
    }
  })

  it('keeps existing NPCs and places the six new ones on walkable tiles with intact patrols', () => {
    const map = parseMapFile(brigFile, 'Deck 10 Brig')
    const byId = Object.fromEntries(map.npcs.map((npc) => [npc.id, npc]))
    assert.ok(byId.engineer)
    assert.ok(byId.guardA)
    assert.ok(byId.guardB)
    assert.ok(byId.guardC)
    assert.ok(byId.npc5)
    assert.equal(map.npcs.length, 11)
    for (const id of DECK10_NEW) {
      const npc = byId[id]
      assert.ok(npc, id)
      assert.equal(npc.characterId, id)
      assert.equal(getTile(map.tiles[npc.position.y][npc.position.x]).solid, false)
      assert.ok(npc.patrol?.length, id)
      for (const point of npc.patrol) {
        assert.equal(getTile(map.tiles[point.at.y][point.at.x]).solid, false)
      }
    }
    assert.equal(byId.sfSecurityReyes.patrol.length, 4)
    assert.equal(byId.sfEngineerChen.disposition, 'friendly')
    assert.equal(byId.sfScienceVoss.responseType, 'observe')
    assert.equal(byId.klingonGuardKorath.responseType, 'confront')
    assert.equal(byId.klingonSentryTorak.responseType, 'alarm')
    assert.equal(byId.klingonWarriorKrel.responseType, 'combat')
    assert.equal(byId.klingonSentryTorak.alertGroupId, 'brig-east-alert')
    assert.equal(byId.klingonWarriorKrel.alertGroupId, 'brig-east-alert')
    const roundTrip = parseMapFile(serializeMap(map), 'Deck 10 Brig')
    assert.equal(roundTrip.npcs.length, 11)
    assert.equal(roundTrip.npcs.find((npc) => npc.id === 'sfSecurityReyes').patrol[0].animation, 'idleLookAround')
  })
})
