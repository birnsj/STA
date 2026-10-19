// Destructible objects and the environment state (world/environment.js, world/DestructibleObject.js), and the map file's
// destructibles / hazards fields (maps/mapFormat.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { blocksLineOfFire, blocksMovement, toBattleMap } from '../src/combat/battleMap.js'
import { canTakeCover } from '../src/combat/coverSystem.js'
import { hasLineOfFire } from '../src/combat/rangeSystem.js'
import { createBlankMap, getTile, PALETTE_GROUPS, parseMapFile, resizeMap, serializeMap, TILES } from '../src/maps/mapFormat.js'
import { destructibleFor } from '../src/world/DestructibleObject.js'
import {
  applyEnvironmentTiles,
  createEnvironment,
  damageObject,
  DESTRUCTIBLE_STATES,
  DESTRUCTIBLE_TYPES,
  destructibleStateFor,
  destructibleTileId,
  EXPLOSION_KINDS,
  FORCE_FIELD_TILES,
  hazardRound,
  HAZARD_TYPES,
  objectAttackDifficulty,
} from '../src/world/environment.js'
import { getReachableTiles } from '../src/combat/movementSystem.js'

export const testMap = ({ destructibles = [], hazards = [], width = 12, height = 9 } = {}) => ({
  ...createBlankMap({ name: 'Test', width, height }),
  destructibles,
  hazards,
})

describe('destructible catalogue', () => {
  it('every type has a tile for each state; destroyed tiles are passable', () => {
    for (const type of Object.keys(DESTRUCTIBLE_TYPES)) {
      for (const state of DESTRUCTIBLE_STATES) {
        const tile = TILES.find((entry) => entry.id === destructibleTileId(type, state))
        assert.ok(tile, `${type} ${state} tile`)
        assert.equal(tile.role, 'destructible')
        assert.equal(tile.solid, state !== 'destroyed', `${type} ${state} solid`)
      }
      const { explosion, damagedHazard } = DESTRUCTIBLE_TYPES[type]
      assert.ok(!explosion.hazard || HAZARD_TYPES[explosion.hazard], `${type} explosion hazard`)
      assert.ok(!damagedHazard || HAZARD_TYPES[damagedHazard], `${type} damaged hazard`)
    }
  })

  it('damaged at half Structure, destroyed at 0', () => {
    assert.equal(destructibleStateFor(4, 4), 'intact')
    assert.equal(destructibleStateFor(3, 4), 'intact')
    assert.equal(destructibleStateFor(2, 4), 'damaged')
    assert.equal(destructibleStateFor(0, 4), 'destroyed')
  })
})

describe('environment', () => {
  const map = testMap({ destructibles: [{ id: 'c1', type: 'epsConduit', position: { x: 5, y: 4 } }] })

  it('creates records from the map with the type values and overrides', () => {
    const environment = createEnvironment(testMap({ destructibles: [{ id: 'g', type: 'gasCylinder', position: { x: 2, y: 2 }, structure: 5, name: 'Tank' }] }))
    assert.deepEqual(environment.destructibles.g, {
      id: 'g',
      type: 'gasCylinder',
      name: 'Tank',
      position: { x: 2, y: 2 },
      structure: 5,
      maxStructure: 5,
      resistance: DESTRUCTIBLE_TYPES.gasCylinder.resistance,
      state: 'intact',
      attackable: true,
      explosion: DESTRUCTIBLE_TYPES.gasCylinder.explosion,
      linkedTiles: [],
      debris: [],
      leakSealed: false,
    })
  })

  it('an intact object blocks movement; once destroyed it does not', () => {
    const environment = createEnvironment(map)
    const shown = applyEnvironmentTiles(map, environment)
    assert.equal(shown.tiles[4][5], 'dsEpsConduit')
    assert.ok(blocksMovement(shown, { x: 5, y: 4 }))
    assert.equal(applyEnvironmentTiles(shown, environment), shown, 'unchanged map is the same object')
    const result = damageObject(environment, shown, 'c1', 10)
    assert.equal(result.environment.destructibles.c1.state, 'destroyed')
    assert.equal(result.map.tiles[4][5], 'dsEpsConduitDestroyed')
    assert.ok(!blocksMovement(result.map, { x: 5, y: 4 }))
  })

  it('damage below the threshold only lowers Structure', () => {
    const environment = createEnvironment(map)
    const object = destructibleFor(environment, 'c1')
    assert.equal(object.damageFrom(2), 1, 'severity 2 - Resistance 1')
    assert.equal(object.damageFrom(1), 1, 'at least 1')
    const once = object.hit(environment, applyEnvironmentTiles(map, environment), 2, [])
    assert.equal(once.environment.destructibles.c1.structure, 3)
    assert.equal(once.environment.destructibles.c1.state, 'intact')
    const twice = destructibleFor(once.environment, 'c1').hit(once.environment, once.map, 2, [])
    assert.equal(twice.environment.destructibles.c1.state, 'damaged')
    assert.equal(twice.map.tiles[4][5], 'dsEpsConduitDamaged')
  })

  it('thick smoke blocks line of fire; thin smoke gives cover to whoever stands in it', () => {
    const smoky = testMap({ hazards: [{ id: 's', type: 'smoke', tiles: { '5,4': 3, '5,5': 1 } }] })
    const shown = toBattleMap(applyEnvironmentTiles(smoky, createEnvironment(smoky)))
    assert.ok(blocksLineOfFire(shown, { x: 5, y: 4 }))
    assert.ok(!hasLineOfFire(shown, { x: 2, y: 4 }, { x: 8, y: 4 }))
    assert.ok(hasLineOfFire(shown, { x: 2, y: 5 }, { x: 8, y: 5 }), 'thin smoke does not block')
    assert.ok(canTakeCover(shown, { x: 5, y: 5 }))
    assert.ok(!canTakeCover(shown, { x: 3, y: 3 }))
  })

  it('every type explodes with a known kind; the gases and smoke hang in the air', () => {
    for (const [type, { explosion }] of Object.entries(DESTRUCTIBLE_TYPES)) assert.ok(EXPLOSION_KINDS.includes(explosion.kind), `${type} kind ${explosion.kind}`)
    for (const type of ['smoke', 'toxicGas', 'steam']) assert.equal(HAZARD_TYPES[type].layer, 'air', type)
    assert.deepEqual(Object.keys(HAZARD_TYPES).filter((type) => HAZARD_TYPES[type].blocksSight).sort(), ['smoke', 'toxicGas'])
  })

  it('a force-field generator holds its linked tiles up while it stands and drops them once destroyed', () => {
    const fielded = testMap({ destructibles: [{ id: 'ff', type: 'forceFieldGenerator', position: { x: 2, y: 2 }, linkedTiles: [{ x: 6, y: 4 }, { x: 6, y: 5 }] }] })
    const environment = createEnvironment(fielded)
    const shown = applyEnvironmentTiles(fielded, environment)
    assert.equal(shown.tiles[4][6], FORCE_FIELD_TILES.up)
    assert.ok(blocksMovement(shown, { x: 6, y: 4 }))
    assert.ok(hasLineOfFire(toBattleMap(shown), { x: 4, y: 4 }, { x: 8, y: 4 }), 'the field is see-through')
    const result = damageObject(environment, shown, 'ff', 20)
    assert.equal(result.map.tiles[4][6], FORCE_FIELD_TILES.down)
    assert.ok(!blocksMovement(result.map, { x: 6, y: 5 }))
  })

  it('a fallen structural support leaves debris that blocks movement, never on anyone', () => {
    const support = testMap({ destructibles: [{ id: 's', type: 'structuralSupport', position: { x: 5, y: 4 } }] })
    const environment = createEnvironment(support)
    const actor = { id: 'p', position: { x: 4, y: 4 } }
    const result = damageObject(environment, applyEnvironmentTiles(support, environment), 's', 20, [actor])
    const { debris } = result.environment.destructibles.s
    assert.equal(debris.length, DESTRUCTIBLE_TYPES.structuralSupport.debris.count)
    assert.ok(debris.every((tile) => Math.max(Math.abs(tile.x - 5), Math.abs(tile.y - 4)) <= DESTRUCTIBLE_TYPES.structuralSupport.debris.radius))
    assert.ok(debris.every((tile) => tile.x !== 4 || tile.y !== 4), 'not on the actor')
    assert.ok(debris.every((tile) => result.map.tiles[tile.y][tile.x] === 'debris' && blocksMovement(result.map, tile)))
  })

  it('a coolant leak costs two steps of movement to enter', () => {
    const leaky = testMap({ hazards: [{ id: 'c', type: 'coolantLeak', tiles: { '5,4': 2 } }] })
    const shown = toBattleMap(applyEnvironmentTiles(leaky, createEnvironment(leaky)))
    const reach = getReachableTiles(shown, { x: 4, y: 4 }, 2)
    assert.equal(reach.get('5,4').steps, 2)
    assert.notEqual(reach.get('6,4').previousKey, '5,4', 'the tile beyond is reached around the leak, not through it')
  })
})

describe('map file fields', () => {
  it('round-trips destructibles and hazards, and leaves them out when empty', () => {
    const map = testMap({
      destructibles: [{ id: 'd1', type: 'gasCylinder', position: { x: 3, y: 2 }, resistance: 2 }],
      hazards: [{ id: 'h1', type: 'fire', tiles: { '4,4': 3, '5,4': 2 }, severity: 3 }],
    })
    const file = serializeMap(map)
    assert.deepEqual(file.destructibles, [{ id: 'd1', type: 'gasCylinder', position: [3, 2], resistance: 2 }])
    assert.deepEqual(file.hazards, [{ id: 'h1', type: 'fire', tiles: [[4, 4, 3], [5, 4, 2]], severity: 3 }])
    const back = parseMapFile(JSON.parse(JSON.stringify(file)), 'test')
    assert.deepEqual(back.destructibles, map.destructibles)
    assert.deepEqual(back.hazards, map.hazards)
    const empty = serializeMap(testMap())
    assert.ok(!('destructibles' in empty) && !('hazards' in empty))
    assert.deepEqual(parseMapFile(empty, 'x').destructibles, [])
  })

  it('a resize drops what falls outside', () => {
    const map = testMap({
      destructibles: [{ id: 'd1', type: 'gasCylinder', position: { x: 10, y: 2 } }],
      hazards: [{ id: 'h1', type: 'fire', tiles: { '2,2': 2, '10,2': 2 } }],
    })
    const small = resizeMap(map, 6, 6)
    assert.deepEqual(small.destructibles, [])
    assert.deepEqual(small.hazards[0].tiles, { '2,2': 2 })
  })

  it('the destructible tiles are not in the editor palette', () => {
    assert.equal(getTile('dsGasCylinder').role, 'destructible')
    const listed = JSON.stringify(PALETTE_GROUPS)
    assert.ok(!/"ds[A-Z]/.test(listed))
  })

  it('honours damagedHazard, noExplosion, attackDifficulty and debris overrides', () => {
    const map = testMap({
      destructibles: [
        {
          id: 'd1',
          type: 'epsConduit',
          position: { x: 3, y: 2 },
          damagedHazard: 'smoke',
          noExplosion: true,
          attackDifficulty: 4,
          debris: { tile: 'debris', radius: 2, count: 1 },
        },
      ],
    })
    const environment = createEnvironment(map)
    const record = environment.destructibles.d1
    assert.equal(record.damagedHazard, 'smoke')
    assert.equal(record.explosion, null)
    assert.equal(record.attackDifficulty, 4)
    assert.equal(objectAttackDifficulty(record), 4)
    assert.deepEqual(record.debrisSpec, { tile: 'debris', radius: 2, count: 1 })
    const half = damageObject(environment, map, 'd1', record.maxStructure - Math.floor(record.maxStructure / 2), [])
    assert.equal(half.environment.destructibles.d1.state, 'damaged')
    const leaking = hazardRound(half.environment, half.map).environment
    assert.ok(leaking.hazards['leak:d1'], 'leaks the overridden hazard')
    assert.equal(leaking.hazards['leak:d1'].type, 'smoke')
  })
})
