function tilesOf(definition) {
  return [definition.position, ...(definition.covers ?? [])]
}

function currentTiles(definition, scenario) {
  const runtime = scenario.objects[definition.id]
  if (!runtime) return []
  const stateTile = definition.states[runtime.state]?.tile
  return tilesOf(definition).map(([x, y], index) => ({ x, y, tile: stateTile ?? runtime.originalTiles[index] }))
}

// The map with every object's current tile (a sealed door blocks its doorway). This leaf module reads only scenario
// data, so neither the object registry nor a concrete object class needs to import the other.
export function applyScenarioTiles(map, scenario) {
  const changes = scenario.definitions
    .flatMap((definition) => currentTiles(definition, scenario))
    .filter(({ x, y, tile }) => map.tiles[y][x] !== tile)
  if (!changes.length) return map
  const tiles = map.tiles.map((row) => row.slice())
  changes.forEach(({ x, y, tile }) => {
    tiles[y][x] = tile
  })
  return { ...map, tiles }
}

export function withScenarioTiles(state) {
  const map = applyScenarioTiles(state.party.map, state.scenario)
  return map === state.party.map ? state : { ...state, party: { ...state.party, map }, world: { ...state.world, map } }
}
