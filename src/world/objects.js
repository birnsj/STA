// The behaviour object for each challenge object (docs/world-objects.md), kept outside React state like the
// character controllers (actors/controllers.js). Instances hold only their authored definition, so one is cached per
// definition object: a map that places the object elsewhere gets a new definition and so a new instance.
import { ChallengeObject } from './ChallengeObject.js'

const instances = new WeakMap()

export function objectForDefinition(definition) {
  let object = instances.get(definition)
  if (!object) {
    object = new ChallengeObject(definition)
    instances.set(definition, object)
  }
  return object
}

export function objectFor(scenario, objectId) {
  const definition = scenario.definitions.find((entry) => entry.id === objectId)
  return definition ? objectForDefinition(definition) : null
}

export const objectsOf = (scenario) => scenario.definitions.map(objectForDefinition)

// The map with every object's current tile (a sealed door blocks its doorway). Returns the same map when nothing changes,
// so movement caches keyed by the map stay valid.
export function applyScenarioTiles(map, scenario) {
  const changes = objectsOf(scenario)
    .flatMap((object) => object.currentTiles(scenario))
    .filter(({ x, y, tile }) => map.tiles[y][x] !== tile)
  if (!changes.length) return map
  const tiles = map.tiles.map((row) => row.slice())
  changes.forEach(({ x, y, tile }) => {
    tiles[y][x] = tile
  })
  return { ...map, tiles }
}

// The exploration state with the world map showing every object's current tile (after an object's state changed).
export const withMap = (state) => {
  const map = applyScenarioTiles(state.party.map, state.scenario)
  return map === state.party.map ? state : { ...state, party: { ...state.party, map }, world: { ...state.world, map } }
}
