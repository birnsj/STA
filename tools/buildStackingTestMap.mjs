// One-shot authoring helper: lays out Stacking Test with the live placement rules, then writes the map.
// Run: node --import ./tools/jsonLoader.mjs tools/buildStackingTestMap.mjs
import fs from 'node:fs'
import { canPlaceOn, zOf } from '../src/rules/placement.js'
import { getItemById } from '../src/rules/equipment.js'

const W = 22
const H = 16
const tiles = Array.from({ length: H }, (_, y) =>
  Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 'bulkhead' : 'floor')),
)

function paint(x, y, id) {
  tiles[y][x] = id
}

// Furniture row: four large, eight small, a tower, a double crate.
paint(3, 3, 'crate')
paint(7, 3, 'crate')
paint(11, 3, 'crate')
paint(15, 3, 'crate')
// Second row: four crates of ordinary gear.
paint(3, 6, 'crate')
paint(7, 6, 'crate')
paint(11, 6, 'crate')
paint(15, 6, 'crate')
// A low crate the away team walks past.
paint(3, 10, 'crate')
paint(7, 10, 'crate')

const map = {
  width: W,
  height: H,
  tiles,
  stackOver: { '15,3': ['crate'], '7,10': ['crate', 'crate'] },
}

let state = { party: { map }, groundItems: {}, itemInstances: {} }
const placements = []
let n = 0

function drop(itemId, position, name) {
  const def = getItemById(itemId)
  const placed = canPlaceOn(state, position, { itemId, category: def.category })
  if (!placed.ok) throw new Error(`Could not place ${itemId} at ${position.x},${position.y}: ${placed.reason}`)
  n += 1
  const id = `${itemId}-${n}`
  state = {
    ...state,
    itemInstances: { ...state.itemInstances, [id]: { id, itemId, quantity: 1 } },
    groundItems: {
      ...state.groundItems,
      [id]: {
        instanceId: id,
        position: placed.position,
        ...(placed.support ? { support: placed.support } : {}),
      },
    },
  }
  const entry = {
    id,
    itemId,
    position: [round(placed.position.x), round(placed.position.y)],
    ...(name ? { name } : {}),
  }
  if (placed.support?.kind === 'tile') entry.on = { tile: [placed.support.tile.x, placed.support.tile.y] }
  if (placed.support?.kind === 'item') entry.on = { placement: placed.support.instanceId }
  placements.push(entry)
  return id
}

function round(value) {
  return Math.round(value * 1000) / 1000
}

const LARGE = ['stackBoxRed', 'stackBoxBlue', 'stackBoxGreen', 'stackBoxGold']
const SMALL = ['stackSlabWhite', 'stackSlabBlack']

// Four large boxes, one colour each, filling the crate.
for (const id of LARGE) drop(id, { x: 3, y: 3 })

// Eight slabs, alternating colours.
for (let i = 0; i < 8; i++) drop(SMALL[i % 2], { x: 7, y: 3 })

// Tower: fill the crate, then two more on the first box so that corner is three high.
const towerBase = []
for (const id of LARGE) towerBase.push(drop(id, { x: 11, y: 3 }))
const base = state.groundItems[towerBase[0]]
drop('stackBoxBlue', { ...base.position }, 'Tower')
drop('stackBoxGreen', { ...base.position })

// Double crate (one crate stacked on another): four boxes on the upper crate.
for (const id of LARGE) drop(id, { x: 15, y: 3 })

// Console and crates of the ordinary catalogue, so real gear sits next to the test boxes.
for (const id of ['medkit', 'communicator', 'phaserType2', 'standardTricorder']) drop(id, { x: 3, y: 6 })
for (const id of ['engineeringToolkit', 'hypospray', 'starfleetPadd', 'hyperspanner']) drop(id, { x: 7, y: 6 })
for (let i = 0; i < 8; i++) drop(i % 2 ? 'phaserType1' : 'communicator', { x: 11, y: 6 })
for (const id of LARGE) drop(id, { x: 15, y: 6 })

// Floor towers (nothing under them but deck): three high, then a slab on a box.
for (const [x, itemId] of [
  [4, 'stackBoxRed'],
  [8, 'stackBoxBlue'],
  [12, 'stackBoxGold'],
]) {
  const first = drop(itemId, { x, y: 9 })
  const at = state.groundItems[first].position
  drop(itemId, { ...at })
  drop(itemId, { ...at })
}
const slabBase = drop('stackBoxGreen', { x: 16, y: 9 })
drop('stackSlabWhite', { ...state.groundItems[slabBase].position })
drop('stackSlabBlack', { ...state.groundItems[slabBase].position })

// A crate the party walks up to, four boxes, and a three-crate pile with four slabs on top.
for (const id of LARGE) drop(id, { x: 3, y: 10 })
for (let i = 0; i < 4; i++) drop(SMALL[i % 2], { x: 7, y: 10 })

const file = {
  schemaVersion: 2,
  name: 'Stacking Test',
  episodeName: 'Stacking Test',
  card: null,
  mapType: 'starshipDeck',
  biome: 'temperate',
  weather: 'clear',
  ambient: 95,
  rows: tiles.map((row) => row.map((id) => ({ floor: '.', bulkhead: '#', crate: 'c', epsControl: 'E' })[id]).join('')),
  stackOver: map.stackOver,
  areas: [
    { name: 'Four large', position: [3, 2] },
    { name: 'Eight small', position: [7, 2] },
    { name: 'Tower', position: [11, 2] },
    { name: 'Double crate', position: [15, 2] },
    { name: 'Gear', position: [3, 5] },
    { name: 'Floor stacks', position: [8, 8] },
    { name: 'Triple crate', position: [7, 11] },
  ],
  markers: {
    playerStarts: [
      [2, 13, 0],
      [3, 13, 0],
      [2, 12, 0],
      [4, 13, 0],
    ],
    enemySpawns: [],
  },
  briefing:
    'Stacking bay. Coloured boxes are sized to the stack grid: four large boxes fill a crate, eight slabs fill a crate, and further drops sit on the box under them. The north-east crate has another crate on it; the south crate is three high. Pick up, drop, and restack.',
  stardate: 9999.3,
  groundItemPlacements: placements,
}

fs.writeFileSync(new URL('../maps/Stacking Test.json', import.meta.url), `${JSON.stringify(file, null, 2)}\n`)

const lifted = Object.values(state.groundItems).filter((entry) => zOf(state, entry) > 0).length
const stacked = Object.values(state.groundItems).filter((entry) => entry.support?.kind === 'item').length
console.log(`placed ${placements.length}, lifted ${lifted}, item-on-item ${stacked}`)
