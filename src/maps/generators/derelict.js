// Derelict Ship: a starship deck laid out as normal, then wrecked: holes blown through interior bulkheads, wreckage strewn
// about and scorched plating where fires burned. The idea comes from the Captain's Log Habitat locations (abandoned and
// disabled vessels); the damage pass is prototype. Markers, labels and the EPS hazard come from the deck underneath.
import { FLOOR_TILE, getTile, WALL_TILE } from '../mapFormat.js'
import { generateStarshipDeck } from './starshipDeck.js'
import { allCells, DOOR_TILE, growBlob, key, neighboursOf, randomInt, scatter, shuffle } from './shared.js'

const DEBRIS = 'debris'

export function generateDerelict(map, random, areaNames) {
  const deck = generateStarshipDeck(map, random, areaNames)
  const { tiles } = deck
  const { width, height } = map
  const area = width * height

  // Markers, labels and doorway approaches stay clear of wreckage.
  const keep = new Set([...deck.markers.playerStarts, ...deck.markers.enemySpawns, ...deck.areas.map((a) => a.position)].map(key))
  allCells(tiles)
    .filter(({ x, y }) => tiles[y][x] === DOOR_TILE)
    .flatMap(neighboursOf)
    .forEach((cell) => keep.add(key(cell)))

  // The hull holds; interior bulkheads are breached (opened to the deck) or collapsed into wreckage. A breach must touch
  // open deck, or a wall junction would become a sealed one-tile pocket.
  const touchesDeck = (cell) => neighboursOf(cell).some(({ x, y }) => !getTile(tiles[y][x]).solid)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (tiles[y][x] !== WALL_TILE) continue
      const roll = random()
      if (roll < 0.1 && touchesDeck({ x, y })) tiles[y][x] = FLOOR_TILE
      else if (roll < 0.22) tiles[y][x] = DEBRIS
    }
  }

  const spots = shuffle(allCells(tiles), random)
  for (let i = Math.max(1, Math.round(area / 70)); i > 0; i--) growBlob(tiles, keep, spots[i % spots.length], randomInt(random, 3, 8), 'scorched', FLOOR_TILE, random)
  scatter(tiles, keep, Math.round(area / 30), DEBRIS, random, FLOOR_TILE)

  return { ...deck, tiles }
}
