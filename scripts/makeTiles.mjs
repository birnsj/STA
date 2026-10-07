// Generates the shared isometric map tiles as PNGs in public/art/tiles/ (no dependencies: a tiny polygon filler plus scripts/png.mjs).
// Run once with: node scripts/makeTiles.mjs
// Every image is 64 x 96 with the tile's 64 x 32 floor diamond across the bottom, so all tiles line up when drawn at the same anchor.
// Colours and block heights match the Combat Type 2 board's original SVG drawing. Existing files are not overwritten unless --force is passed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'

const WIDTH = 64
const HEIGHT = 96
const OUT = fileURLToPath(new URL('../public/art/tiles/', import.meta.url))
const FORCE = process.argv.includes('--force')

const hex = (value) => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16), 255]
const blend = (top, bottom, alpha) => {
  const a = hex(top)
  const b = hex(bottom)
  return [0, 1, 2].map((i) => Math.round(a[i] * alpha + b[i] * (1 - alpha))).concat(255)
}

function createCanvas() {
  return { data: new Uint8Array(WIDTH * HEIGHT * 4) }
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return
  canvas.data.set(color, (y * WIDTH + x) * 4)
}

// Even-odd test at each pixel centre, so neighbouring diamonds share edges without gaps or overlaps.
function inside(points, px, py) {
  let result = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) result = !result
  }
  return result
}

function fill(canvas, points, color, test = () => true) {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) if (inside(points, x + 0.5, y + 0.5) && test(x, y)) setPixel(canvas, x, y, color)
  }
}

// The floor diamond centre sits 16 px above the bottom edge.
const CENTRE = { x: WIDTH / 2, y: HEIGHT - 16 }
function diamond(lift = 0, scale = 1) {
  const w = 32 * scale
  const h = 16 * scale
  const { x, y } = CENTRE
  return [[x, y - h - lift], [x + w, y - lift], [x, y + h - lift], [x - w, y - lift]]
}

// A one-pixel ring just inside a diamond's edge (the stroke).
function ring(canvas, lift, scale, color, test) {
  const outer = diamond(lift, scale)
  const inner = [[0, 1], [-2, 0], [0, -1], [2, 0]].map(([dx, dy], i) => [outer[i][0] + dx, outer[i][1] + dy])
  fill(canvas, outer, color, (x, y) => !inside(inner, x + 0.5, y + 0.5) && (!test || test(x, y)))
}

function floorTile({ fill: colour, stroke, dashed = false }) {
  const canvas = createCanvas()
  fill(canvas, diamond(), hex(colour))
  ring(canvas, 0, 1, hex(stroke), dashed ? (x) => Math.floor(x / 4) % 2 === 0 : null)
  return canvas
}

function block({ top, left, right, height, detail }) {
  const canvas = createCanvas()
  const [t, r, b, l] = diamond()
  const lift = ([x, y]) => [x, y - height]
  fill(canvas, diamond(), hex('#2a3236'))
  fill(canvas, [l, b, lift(b), lift(l)], hex(left))
  fill(canvas, [b, r, lift(r), lift(b)], hex(right))
  fill(canvas, [t, r, b, l].map(lift), hex(top))
  detail?.(canvas, height)
  return canvas
}

// A scaled block standing on a lifted base (for shapes narrower than a whole tile, like a tree's trunk and canopy).
function prism(canvas, { scale, base, height, top, left, right }) {
  const [t, r, b, l] = diamond(base, scale)
  const lift = ([x, y]) => [x, y - height]
  fill(canvas, [l, b, lift(b), lift(l)], hex(left))
  fill(canvas, [b, r, lift(r), lift(b)], hex(right))
  fill(canvas, [t, r, b, l].map(lift), hex(top))
}

// A thin spike standing off-centre (reeds, crystal shards), offset by dx, dy from the tile centre.
function spike(canvas, dx, dy, { scale = 0.1, base = 0, height, top, left, right }) {
  const [t, r, b, l] = diamond(base, scale).map(([x, y]) => [x + dx, y + dy])
  const lift = ([x, y]) => [x, y - height]
  fill(canvas, [l, b, lift(b), lift(l)], hex(left))
  fill(canvas, [b, r, lift(r), lift(b)], hex(right))
  fill(canvas, [t, r, b, l].map(lift), hex(top))
}

// Speckles a floor tile so natural ground doesn't read as deck plating.
function speckle(canvas, colour, every) {
  const floor = diamond()
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) if ((x * 7 + y * 13) % every === 0 && inside(floor, x + 0.5, y + 0.5)) setPixel(canvas, x, y, hex(colour))
  }
  return canvas
}

const TILES = {
  floor: () => floorTile({ fill: '#2a3236', stroke: '#182023' }),
  'floor-alt': () => floorTile({ fill: '#2e373b', stroke: '#182023' }),
  doorway: () => floorTile({ fill: '#33444a', stroke: '#c9a23a' }),
  grating: () => floorTile({ fill: '#3d3520', stroke: '#6e5a28', dashed: true }),
  'grating-live': () => floorTile({ fill: '#c25a12', stroke: '#ffd27a' }),
  bulkhead: () => block({ top: '#5c6870', left: '#3c454b', right: '#2c3338', height: 46 }),
  'bulkhead-mid': () => block({ top: '#5c6870', left: '#3c454b', right: '#2c3338', height: 24 }),
  'bulkhead-low': () => block({ top: '#5c6870', left: '#3c454b', right: '#2c3338', height: 10 }),
  machinery: () =>
    block({ top: '#6e3a2e', left: '#4a2620', right: '#371c18', height: 40, detail: (canvas, h) => fill(canvas, diamond(h, 0.5), blend('#ff6b3d', '#6e3a2e', 0.75)) }),
  crate: () => block({ top: '#8a7650', left: '#5d4f35', right: '#4a3f2a', height: 16, detail: (canvas, h) => ring(canvas, h, 0.62, hex('#b39a68')) }),
  epsControl: () => block({ top: '#35577a', left: '#243d56', right: '#1a2d40', height: 22, detail: (canvas, h) => fill(canvas, diamond(h, 0.55), hex('#5fd0ff')) }),
  // Drawn over epsControl to blink its light, so only the light is opaque.
  'epsControl-lit': () => {
    const canvas = createCanvas()
    fill(canvas, diamond(22, 0.55), hex('#b8ecff'))
    return canvas
  },
  ground: () => speckle(floorTile({ fill: '#4a4a2e', stroke: '#35351f' }), '#5d5d3a', 11),
  'ground-alt': () => speckle(floorTile({ fill: '#4f4f31', stroke: '#35351f' }), '#3c3c24', 11),
  path: () => floorTile({ fill: '#6a665c', stroke: '#4a4740' }),
  caveFloor: () => speckle(floorTile({ fill: '#3a3430', stroke: '#26211e' }), '#4a423c', 9),
  'caveFloor-alt': () => speckle(floorTile({ fill: '#3e3833', stroke: '#26211e' }), '#2e2925', 9),
  rock: () => {
    const canvas = createCanvas()
    fill(canvas, diamond(), hex('#4a4a2e'))
    prism(canvas, { scale: 0.75, base: 0, height: 22, top: '#7a7268', left: '#57514a', right: '#433e38' })
    prism(canvas, { scale: 0.45, base: 22, height: 8, top: '#8a8278', left: '#57514a', right: '#433e38' })
    return canvas
  },
  rockWall: () => block({ top: '#5e554c', left: '#40392f', right: '#302a23', height: 46 }),
  'rockWall-mid': () => block({ top: '#5e554c', left: '#40392f', right: '#302a23', height: 24 }),
  'rockWall-low': () => block({ top: '#5e554c', left: '#40392f', right: '#302a23', height: 10 }),
  tree: () => {
    const canvas = createCanvas()
    fill(canvas, diamond(), hex('#4a4a2e'))
    prism(canvas, { scale: 0.18, base: 0, height: 16, top: '#5a3e26', left: '#4a321e', right: '#3a2717' })
    prism(canvas, { scale: 0.8, base: 16, height: 20, top: '#3f7a3a', left: '#2c5a28', right: '#21461e' })
    prism(canvas, { scale: 0.45, base: 36, height: 8, top: '#4f9248', left: '#2c5a28', right: '#21461e' })
    return canvas
  },
  fence: () => {
    const canvas = floorTile({ fill: '#4a4a2e', stroke: '#35351f' })
    prism(canvas, { scale: 0.9, base: 0, height: 12, top: '#9a9a90', left: '#6e6e66', right: '#56564f' })
    return canvas
  },
  prefabWall: () => block({ top: '#b8bcc0', left: '#8a8f94', right: '#6c7176', height: 40 }),
  'prefabWall-mid': () => block({ top: '#b8bcc0', left: '#8a8f94', right: '#6c7176', height: 20 }),
  'prefabWall-low': () => block({ top: '#b8bcc0', left: '#8a8f94', right: '#6c7176', height: 10 }),
  ruinWall: () =>
    block({ top: '#8c826e', left: '#655c4c', right: '#4f483b', height: 26, detail: (canvas, h) => fill(canvas, diamond(h, 0.4), hex('#6f6656')) }),
  grass: () => speckle(floorTile({ fill: '#35532c', stroke: '#24391e' }), '#46693a', 9),
  'grass-alt': () => speckle(floorTile({ fill: '#395a2f', stroke: '#24391e' }), '#2c4625', 9),
  bush: () => {
    const canvas = floorTile({ fill: '#35532c', stroke: '#24391e' })
    prism(canvas, { scale: 0.7, base: 0, height: 12, top: '#3f7a3a', left: '#2c5a28', right: '#21461e' })
    prism(canvas, { scale: 0.4, base: 12, height: 4, top: '#4f9248', left: '#2c5a28', right: '#21461e' })
    return canvas
  },
  log: () => {
    const canvas = floorTile({ fill: '#35532c', stroke: '#24391e' })
    prism(canvas, { scale: 0.85, base: 0, height: 10, top: '#6e5236', left: '#523b25', right: '#3f2d1c' })
    ring(canvas, 10, 0.5, hex('#8a6b48'))
    return canvas
  },
  mud: () => speckle(floorTile({ fill: '#3e3826', stroke: '#2a2519' }), '#4c4630', 7),
  'mud-alt': () => speckle(floorTile({ fill: '#423b28', stroke: '#2a2519' }), '#332d1e', 7),
  water: () => {
    const canvas = floorTile({ fill: '#1f3a3c', stroke: '#162a2b' })
    ring(canvas, 0, 0.6, hex('#2f5658'))
    return canvas
  },
  reeds: () => {
    const canvas = floorTile({ fill: '#3e3826', stroke: '#2a2519' })
    for (const [dx, dy, h] of [[-10, -2, 18], [6, -4, 22], [-2, 4, 16], [12, 2, 20], [-14, 3, 14]]) {
      const [t, r, b, l] = diamond(0, 0.1).map(([x, y]) => [x + dx, y + dy])
      const lift = ([x, y]) => [x, y - h]
      fill(canvas, [l, b, lift(b), lift(l)], hex('#7a8a3a'))
      fill(canvas, [b, r, lift(r), lift(b)], hex('#5c6a2a'))
      fill(canvas, [t, r, b, l].map(lift), hex('#9aaa4a'))
    }
    return canvas
  },
  pavement: () => floorTile({ fill: '#57575a', stroke: '#3e3e41' }),
  cityWall: () => block({ top: '#a8977a', left: '#7c6d56', right: '#625644', height: 44, detail: (canvas, h) => ring(canvas, h, 0.8, hex('#8f7f64')) }),
  'cityWall-mid': () => block({ top: '#a8977a', left: '#7c6d56', right: '#625644', height: 22 }),
  'cityWall-low': () => block({ top: '#a8977a', left: '#7c6d56', right: '#625644', height: 10 }),
  planter: () => {
    const canvas = floorTile({ fill: '#57575a', stroke: '#3e3e41' })
    prism(canvas, { scale: 0.7, base: 0, height: 8, top: '#8a8a86', left: '#66665f', right: '#50504a' })
    prism(canvas, { scale: 0.55, base: 8, height: 6, top: '#4f9248', left: '#2c5a28', right: '#21461e' })
    return canvas
  },
  fountain: () => {
    const canvas = floorTile({ fill: '#57575a', stroke: '#3e3e41' })
    prism(canvas, { scale: 0.9, base: 0, height: 10, top: '#9a9a94', left: '#6e6e68', right: '#585852' })
    fill(canvas, diamond(10, 0.7), hex('#3f8fb0'))
    prism(canvas, { scale: 0.15, base: 10, height: 10, top: '#b0b0aa', left: '#8a8a84', right: '#6e6e68' })
    return canvas
  },
  sand: () => speckle(floorTile({ fill: '#a88a5a', stroke: '#86693f' }), '#b89a68', 8),
  'sand-alt': () => speckle(floorTile({ fill: '#ad8f5e', stroke: '#86693f' }), '#977a4c', 8),
  sandstone: () => block({ top: '#c08050', left: '#965f38', right: '#7a4b2b', height: 46, detail: (canvas, h) => ring(canvas, h, 0.6, hex('#a86c42')) }),
  'sandstone-mid': () => block({ top: '#c08050', left: '#965f38', right: '#7a4b2b', height: 24 }),
  'sandstone-low': () => block({ top: '#c08050', left: '#965f38', right: '#7a4b2b', height: 10 }),
  cactus: () => {
    const canvas = floorTile({ fill: '#a88a5a', stroke: '#86693f' })
    prism(canvas, { scale: 0.2, base: 0, height: 28, top: '#5f8a3e', left: '#46692c', right: '#365222' })
    prism(canvas, { scale: 0.12, base: 12, height: 10, top: '#5f8a3e', left: '#46692c', right: '#365222' })
    return canvas
  },
  snow: () => speckle(floorTile({ fill: '#c8d2da', stroke: '#a4b0ba' }), '#dce4ea', 9),
  'snow-alt': () => speckle(floorTile({ fill: '#ccd6de', stroke: '#a4b0ba' }), '#b8c4ce', 9),
  ice: () => {
    const canvas = floorTile({ fill: '#8fb8cc', stroke: '#6e98ae' })
    ring(canvas, 0, 0.55, hex('#b4d6e6'))
    return canvas
  },
  iceBlock: () => block({ top: '#d4ecf6', left: '#9cc6da', right: '#7aa8c0', height: 30, detail: (canvas, h) => fill(canvas, diamond(h, 0.4), hex('#eef8fc')) }),
  crevasse: () => {
    const canvas = floorTile({ fill: '#1a2a36', stroke: '#a4b0ba' })
    fill(canvas, diamond(0, 0.6), hex('#0e1820'))
    return canvas
  },
  ash: () => speckle(floorTile({ fill: '#38353a', stroke: '#252327' }), '#48444a', 8),
  'ash-alt': () => speckle(floorTile({ fill: '#3c393e', stroke: '#252327' }), '#2c2a2e', 8),
  basalt: () => {
    const canvas = floorTile({ fill: '#38353a', stroke: '#252327' })
    prism(canvas, { scale: 0.8, base: 0, height: 26, top: '#4a4850', left: '#33313a', right: '#26242b' })
    prism(canvas, { scale: 0.4, base: 26, height: 8, top: '#55525c', left: '#33313a', right: '#26242b' })
    return canvas
  },
  lava: () => {
    const canvas = speckle(floorTile({ fill: '#c2410c', stroke: '#7a2a08' }), '#ffb347', 6)
    fill(canvas, diamond(0, 0.45), hex('#f97316'))
    return canvas
  },
  debris: () => {
    const canvas = floorTile({ fill: '#2a3236', stroke: '#182023' })
    prism(canvas, { scale: 0.55, base: 0, height: 10, top: '#5c6870', left: '#3c454b', right: '#2c3338' })
    prism(canvas, { scale: 0.3, base: 10, height: 8, top: '#4a4440', left: '#353130', right: '#282524' })
    fill(canvas, diamond(18, 0.12), hex('#ff6b3d'))
    return canvas
  },
  scorched: () => speckle(floorTile({ fill: '#1e2224', stroke: '#121618' }), '#3a2a22', 6),
  broadleaf: () => {
    const canvas = floorTile({ fill: '#35532c', stroke: '#24391e' })
    prism(canvas, { scale: 0.18, base: 0, height: 16, top: '#5a3e26', left: '#4a321e', right: '#3a2717' })
    prism(canvas, { scale: 0.85, base: 16, height: 20, top: '#3f7a3a', left: '#2c5a28', right: '#21461e' })
    prism(canvas, { scale: 0.5, base: 36, height: 8, top: '#4f9248', left: '#2c5a28', right: '#21461e' })
    return canvas
  },
  pine: () => {
    const canvas = floorTile({ fill: '#35532c', stroke: '#24391e' })
    prism(canvas, { scale: 0.15, base: 0, height: 10, top: '#5a3e26', left: '#4a321e', right: '#3a2717' })
    prism(canvas, { scale: 0.75, base: 10, height: 12, top: '#2f5a34', left: '#1f4024', right: '#17321b' })
    prism(canvas, { scale: 0.52, base: 22, height: 12, top: '#346339', left: '#1f4024', right: '#17321b' })
    prism(canvas, { scale: 0.3, base: 34, height: 14, top: '#3a6e40', left: '#1f4024', right: '#17321b' })
    return canvas
  },
  mangrove: () => {
    const canvas = floorTile({ fill: '#3e3826', stroke: '#2a2519' })
    for (const [dx, dy] of [[-8, 0], [8, 0], [0, -4], [0, 4]]) {
      const [t, r, b, l] = diamond(0, 0.08).map(([x, y]) => [x + dx, y + dy])
      const lift = ([x, y]) => [x, y - 14]
      fill(canvas, [l, b, lift(b), lift(l)], hex('#4a3a28'))
      fill(canvas, [b, r, lift(r), lift(b)], hex('#3a2c1e'))
      fill(canvas, [t, r, b, l].map(lift), hex('#5a4832'))
    }
    prism(canvas, { scale: 0.2, base: 14, height: 8, top: '#5a4832', left: '#4a3a28', right: '#3a2c1e' })
    prism(canvas, { scale: 0.9, base: 22, height: 14, top: '#4a6a32', left: '#344c22', right: '#283b1a' })
    return canvas
  },
  desertRock: () => {
    const canvas = floorTile({ fill: '#a88a5a', stroke: '#86693f' })
    prism(canvas, { scale: 0.75, base: 0, height: 22, top: '#b0784a', left: '#8a5a34', right: '#6e4628' })
    prism(canvas, { scale: 0.45, base: 22, height: 8, top: '#c08858', left: '#8a5a34', right: '#6e4628' })
    return canvas
  },
  timberWall: () => block({ top: '#8a6a44', left: '#654c30', right: '#4f3b25', height: 40, detail: (canvas, h) => ring(canvas, h, 0.7, hex('#6e5234')) }),
  'timberWall-mid': () => block({ top: '#8a6a44', left: '#654c30', right: '#4f3b25', height: 20 }),
  'timberWall-low': () => block({ top: '#8a6a44', left: '#654c30', right: '#4f3b25', height: 10 }),
  adobeWall: () => block({ top: '#c9a878', left: '#a08258', right: '#836a46', height: 40 }),
  'adobeWall-mid': () => block({ top: '#c9a878', left: '#a08258', right: '#836a46', height: 20 }),
  'adobeWall-low': () => block({ top: '#c9a878', left: '#a08258', right: '#836a46', height: 10 }),
  snowPrefabWall: () => block({ top: '#eef3f6', left: '#8a8f94', right: '#6c7176', height: 40 }),
  'snowPrefabWall-mid': () => block({ top: '#eef3f6', left: '#8a8f94', right: '#6c7176', height: 20 }),
  'snowPrefabWall-low': () => block({ top: '#eef3f6', left: '#8a8f94', right: '#6c7176', height: 10 }),
  heatWall: () => block({ top: '#4a4e54', left: '#33363b', right: '#26292d', height: 40, detail: (canvas, h) => ring(canvas, h, 0.75, hex('#d0621e')) }),
  'heatWall-mid': () => block({ top: '#4a4e54', left: '#33363b', right: '#26292d', height: 20, detail: (canvas, h) => ring(canvas, h, 0.75, hex('#d0621e')) }),
  'heatWall-low': () => block({ top: '#4a4e54', left: '#33363b', right: '#26292d', height: 10 }),
  boardwalk: () => {
    const canvas = floorTile({ fill: '#7a5c3a', stroke: '#4f3b25' })
    ring(canvas, 0, 0.66, hex('#5f4529'))
    ring(canvas, 0, 0.33, hex('#5f4529'))
    return canvas
  },
  iceWall: () => block({ top: '#cfe6f2', left: '#8fb8cc', right: '#6e98ae', height: 46 }),
  'iceWall-mid': () => block({ top: '#cfe6f2', left: '#8fb8cc', right: '#6e98ae', height: 24 }),
  'iceWall-low': () => block({ top: '#cfe6f2', left: '#8fb8cc', right: '#6e98ae', height: 10 }),
  basaltWall: () => block({ top: '#45434b', left: '#302e36', right: '#232128', height: 46 }),
  'basaltWall-mid': () => block({ top: '#45434b', left: '#302e36', right: '#232128', height: 24 }),
  'basaltWall-low': () => block({ top: '#45434b', left: '#302e36', right: '#232128', height: 10 }),
  regolith: () => speckle(floorTile({ fill: '#5a5652', stroke: '#403d3a' }), '#6a6662', 8),
  'regolith-alt': () => speckle(floorTile({ fill: '#5e5a56', stroke: '#403d3a' }), '#4a4744', 8),
  mossRock: () => {
    const canvas = floorTile({ fill: '#35532c', stroke: '#24391e' })
    prism(canvas, { scale: 0.75, base: 0, height: 22, top: '#5a7a48', left: '#57514a', right: '#433e38' })
    prism(canvas, { scale: 0.45, base: 22, height: 8, top: '#6a8a56', left: '#57514a', right: '#433e38' })
    return canvas
  },
  barrenRock: () => {
    const canvas = floorTile({ fill: '#5a5652', stroke: '#403d3a' })
    prism(canvas, { scale: 0.75, base: 0, height: 22, top: '#7e7a76', left: '#5a5652', right: '#46433f' })
    prism(canvas, { scale: 0.45, base: 22, height: 8, top: '#8e8a86', left: '#5a5652', right: '#46433f' })
    return canvas
  },
  snowRock: () => {
    const canvas = floorTile({ fill: '#c8d2da', stroke: '#a4b0ba' })
    prism(canvas, { scale: 0.75, base: 0, height: 22, top: '#e6edf2', left: '#5e6670', right: '#4a515a' })
    prism(canvas, { scale: 0.45, base: 22, height: 8, top: '#f4f8fa', left: '#5e6670', right: '#4a515a' })
    return canvas
  },
  ...EXTRA_BIOME_TILES(),
  ...LOCATION_TILES(),
}

// Tiles for the locations added after the first nine: farm, mining site, landing field, crash site, field camp,
// research lab, cantina, detention block and the alien temple, hive and vessel.
function LOCATION_TILES() {
  const plain = (fillColour, stroke, fleck, every = 9) => () => (fleck ? speckle(floorTile({ fill: fillColour, stroke }), fleck, every) : floorTile({ fill: fillColour, stroke }))
  const on = (base, draw) => () => {
    const canvas = base()
    draw(canvas)
    return canvas
  }
  const wall = (top, left, right, detail) => ({
    full: () => block({ top, left, right, height: 46, detail }),
    mid: () => block({ top, left, right, height: 24, detail }),
    low: () => block({ top, left, right, height: 10 }),
  })
  // Most props stand on a neutral dark floor so they read on any ground.
  const dark = plain('#2a3236', '#182023')

  const soil = plain('#4a3624', '#33251a', '#5a4430', 7)
  const quarry = plain('#5a5048', '#3e3630', '#6e645a', 6)
  const pad = plain('#4a5056', '#33383c')
  const lab = plain('#b8c0c6', '#8a9298')
  const planks = plain('#5a4028', '#3e2c1c')
  const temple = plain('#6a5a48', '#4a3e30', '#7a6a56', 11)
  const hive = plain('#3a2a20', '#261a14', '#5a3a28', 6)
  const alien = plain('#2a1e3a', '#1a1228', '#4a3a6a', 10)
  const barn = wall('#8a3a2a', '#6a2a1e', '#521f16', (canvas, h) => ring(canvas, h, 0.7, hex('#a84a36')))
  const labWall = wall('#e0e6ea', '#aab4ba', '#8a949a', (canvas, h) => ring(canvas, h, 0.8, hex('#5fd0ff')))
  const cantinaWall = wall('#7a5a3a', '#5a4028', '#46321f', (canvas, h) => ring(canvas, h, 0.75, hex('#c08040')))
  const templeWall = wall('#8a7a5e', '#665a44', '#4e4434', (canvas, h) => fill(canvas, diamond(h, 0.35), hex('#d8b040')))
  const hiveWall = wall('#5a3a28', '#42281a', '#321e14', (canvas, h) => fill(canvas, diamond(h, 0.5), hex('#7a4a30')))
  const alienWall = wall('#4a3a6a', '#34284e', '#261c3a', (canvas, h) => ring(canvas, h, 0.6, hex('#a070ff')))

  return {
    // Farm
    cropRows: on(soil, (canvas) => {
      for (const dx of [-16, -6, 4, 14]) fill(canvas, diamond(0, 0.12).map(([x, y]) => [x + dx, y + dx / 2]), hex('#5a8a2e'))
      for (const dx of [-12, -2, 8]) fill(canvas, diamond(0, 0.1).map(([x, y]) => [x + dx, y + dx / 2 - 3]), hex('#6a9a34'))
    }),
    tallCrop: on(soil, (canvas) => {
      for (const [dx, dy] of [[-10, 0], [-2, -4], [6, -8], [-6, 4], [2, 0], [10, -4], [-2, 8], [6, 4]]) {
        spike(canvas, dx, dy, { scale: 0.08, height: 22, top: '#d8c050', left: '#7a9a30', right: '#5e7a24' })
      }
    }),
    barnWall: barn.full,
    'barnWall-mid': barn.mid,
    'barnWall-low': barn.low,
    silo: on(dark, (canvas) => {
      prism(canvas, { scale: 0.8, base: 0, height: 40, top: '#b8bcc0', left: '#8a8f94', right: '#6c7176' })
      prism(canvas, { scale: 0.5, base: 40, height: 6, top: '#8a3a2a', left: '#6a2a1e', right: '#521f16' })
    }),
    hayBale: on(soil, (canvas) => {
      prism(canvas, { scale: 0.7, base: 0, height: 12, top: '#d8b860', left: '#b09040', right: '#907430' })
      ring(canvas, 12, 0.45, hex('#c0a050'))
    }),
    // Mining Site
    quarryFloor: quarry,
    'quarryFloor-alt': plain('#5e544c', '#3e3630', '#4a423a', 6),
    oreVein: on(quarry, (canvas) => {
      prism(canvas, { scale: 0.85, base: 0, height: 26, top: '#5a4e44', left: '#40372f', right: '#302a23' })
      for (const [dx, dy] of [[-6, -30], [5, -27], [0, -33]]) fill(canvas, diamond(0, 0.08).map(([x, y]) => [x + dx, y + dy]), hex('#ffc040'))
    }),
    railTrack: on(quarry, (canvas) => {
      ring(canvas, 0, 0.7, hex('#8a8a88'))
      ring(canvas, 0, 0.4, hex('#8a8a88'))
    }),
    oreCart: on(quarry, (canvas) => {
      prism(canvas, { scale: 0.65, base: 0, height: 14, top: '#5a6066', left: '#40454a', right: '#303438' })
      fill(canvas, diamond(14, 0.45), hex('#8a7058'))
    }),
    drillRig: on(dark, (canvas) => {
      prism(canvas, { scale: 0.8, base: 0, height: 10, top: '#c89a30', left: '#9a7424', right: '#7a5c1c' })
      prism(canvas, { scale: 0.2, base: 10, height: 36, top: '#d8aa40', left: '#9a7424', right: '#7a5c1c' })
      fill(canvas, diamond(46, 0.1), hex('#ff5040'))
    }),
    // Landing Field
    landingPad: pad,
    padMarking: on(pad, (canvas) => {
      ring(canvas, 0, 0.7, hex('#e8c040'))
      fill(canvas, diamond(0, 0.15), hex('#e8c040'))
    }),
    shuttleHull: on(pad, (canvas) => {
      prism(canvas, { scale: 0.95, base: 0, height: 22, top: '#d0d6da', left: '#a0a8ae', right: '#80888e' })
      prism(canvas, { scale: 0.6, base: 22, height: 10, top: '#e0e6ea', left: '#a0a8ae', right: '#80888e' })
      fill(canvas, diamond(32, 0.2), hex('#4a8ac0'))
    }),
    fuelTank: on(pad, (canvas) => {
      prism(canvas, { scale: 0.6, base: 0, height: 24, top: '#d8d0b8', left: '#b0a890', right: '#908870' })
      ring(canvas, 24, 0.4, hex('#c04030'))
    }),
    // Crash Site
    hullWreck: () => {
      const canvas = speckle(floorTile({ fill: '#1e2224', stroke: '#121618' }), '#3a2a22', 6)
      prism(canvas, { scale: 0.9, base: 0, height: 20, top: '#7a848a', left: '#545c62', right: '#40464a' })
      prism(canvas, { scale: 0.5, base: 20, height: 14, top: '#8a949a', left: '#545c62', right: '#40464a' })
      fill(canvas, diamond(34, 0.2), hex('#2a2e30'))
      return canvas
    },
    burningWreck: () => {
      const canvas = speckle(floorTile({ fill: '#1e2224', stroke: '#121618' }), '#3a2a22', 6)
      prism(canvas, { scale: 0.6, base: 0, height: 10, top: '#5c6870', left: '#3c454b', right: '#2c3338' })
      for (const [dx, dy, h] of [[-4, -1, 14], [4, -3, 18], [0, 3, 11]]) spike(canvas, dx, dy, { scale: 0.14, base: 10, height: h, top: '#ffd27a', left: '#ff8a2a', right: '#e05a10' })
      return canvas
    },
    // Field Camp
    tent: on(dark, (canvas) => {
      prism(canvas, { scale: 0.9, base: 0, height: 14, top: '#6a7a4a', left: '#4e5c36', right: '#3e4a2a' })
      prism(canvas, { scale: 0.55, base: 14, height: 8, top: '#7a8a56', left: '#4e5c36', right: '#3e4a2a' })
      prism(canvas, { scale: 0.2, base: 22, height: 4, top: '#8a9a62', left: '#4e5c36', right: '#3e4a2a' })
    }),
    campfire: on(dark, (canvas) => {
      ring(canvas, 0, 0.5, hex('#6a6660'))
      for (const [dx, dy, h] of [[-3, 0, 8], [3, -2, 10], [0, 2, 6]]) spike(canvas, dx, dy, { scale: 0.12, height: h, top: '#ffd27a', left: '#ff8a2a', right: '#e05a10' })
    }),
    sensorMast: on(dark, (canvas) => {
      prism(canvas, { scale: 0.5, base: 0, height: 6, top: '#7a848a', left: '#545c62', right: '#40464a' })
      prism(canvas, { scale: 0.08, base: 6, height: 38, top: '#b8c0c6', left: '#8a9298', right: '#6a7278' })
      prism(canvas, { scale: 0.4, base: 40, height: 3, top: '#d0d6da', left: '#8a9298', right: '#6a7278' })
      fill(canvas, diamond(46, 0.08), hex('#5fd0ff'))
    }),
    // Research Lab
    labFloor: lab,
    'labFloor-alt': plain('#c0c8ce', '#8a9298'),
    labWall: labWall.full,
    'labWall-mid': labWall.mid,
    'labWall-low': labWall.low,
    labBench: on(lab, (canvas) => {
      prism(canvas, { scale: 0.85, base: 0, height: 14, top: '#e8eef2', left: '#aab4ba', right: '#8a949a' })
      fill(canvas, diamond(14, 0.25), hex('#5fd0ff'))
    }),
    containmentPod: on(lab, (canvas) => {
      prism(canvas, { scale: 0.7, base: 0, height: 6, top: '#7a848a', left: '#545c62', right: '#40464a' })
      prism(canvas, { scale: 0.55, base: 6, height: 30, top: '#9ae0f0', left: '#5aa0c0', right: '#40809a' })
      prism(canvas, { scale: 0.7, base: 36, height: 4, top: '#7a848a', left: '#545c62', right: '#40464a' })
    }),
    // Cantina
    plankFloor: planks,
    'plankFloor-alt': plain('#5e442c', '#3e2c1c'),
    cantinaWall: cantinaWall.full,
    'cantinaWall-mid': cantinaWall.mid,
    'cantinaWall-low': cantinaWall.low,
    barCounter: on(planks, (canvas) => {
      prism(canvas, { scale: 0.95, base: 0, height: 16, top: '#2a2a30', left: '#7a5a3a', right: '#5a4028' })
      ring(canvas, 16, 0.8, hex('#c08040'))
    }),
    table: on(planks, (canvas) => {
      prism(canvas, { scale: 0.12, base: 0, height: 8, top: '#4a3a2a', left: '#3a2c1e', right: '#2c2016' })
      prism(canvas, { scale: 0.6, base: 8, height: 3, top: '#8a6a44', left: '#654c30', right: '#4f3b25' })
      fill(canvas, diamond(11, 0.08), hex('#ffd27a'))
    }),
    // Detention Block
    forceField: () => {
      const canvas = floorTile({ fill: '#2a3236', stroke: '#5fd0ff' })
      ring(canvas, 0, 0.6, hex('#3a90c0'))
      return canvas
    },
    cellBunk: on(dark, (canvas) => {
      prism(canvas, { scale: 0.8, base: 0, height: 8, top: '#7a848a', left: '#545c62', right: '#40464a' })
      fill(canvas, diamond(8, 0.6), hex('#5a6a7a'))
    }),
    // Alien Temple
    templeFloor: temple,
    'templeFloor-alt': plain('#6e5e4c', '#4a3e30', '#5a4c3c', 11),
    templeWall: templeWall.full,
    'templeWall-mid': templeWall.mid,
    'templeWall-low': templeWall.low,
    templePillar: on(temple, (canvas) => {
      prism(canvas, { scale: 0.6, base: 0, height: 4, top: '#9a8a6e', left: '#766a54', right: '#5e5442' })
      prism(canvas, { scale: 0.42, base: 4, height: 38, top: '#a8987a', left: '#7c6e56', right: '#625844' })
      prism(canvas, { scale: 0.6, base: 42, height: 4, top: '#b8a888', left: '#766a54', right: '#5e5442' })
    }),
    altar: on(temple, (canvas) => {
      prism(canvas, { scale: 0.85, base: 0, height: 14, top: '#5a4a3a', left: '#42362a', right: '#32281e' })
      fill(canvas, diamond(14, 0.4), hex('#d8b040'))
      fill(canvas, diamond(14, 0.15), hex('#fff0a0'))
    }),
    glyphTile: on(temple, (canvas) => {
      ring(canvas, 0, 0.7, hex('#d8b040'))
      ring(canvas, 0, 0.35, hex('#d8b040'))
    }),
    // Alien Hive
    hiveFloor: hive,
    'hiveFloor-alt': plain('#3e2e22', '#261a14', '#2e2018', 6),
    hiveWall: hiveWall.full,
    'hiveWall-mid': hiveWall.mid,
    'hiveWall-low': hiveWall.low,
    eggPod: on(hive, (canvas) => {
      prism(canvas, { scale: 0.55, base: 0, height: 12, top: '#8a6a48', left: '#6a4e34', right: '#523c28' })
      prism(canvas, { scale: 0.35, base: 12, height: 6, top: '#a8e060', left: '#6a4e34', right: '#523c28' })
    }),
    slimePool: () => {
      const canvas = floorTile({ fill: '#5a7a20', stroke: '#3a5214' })
      ring(canvas, 0, 0.55, hex('#8ab030'))
      return canvas
    },
    // Alien Vessel
    alienDeck: alien,
    'alienDeck-alt': plain('#2e2240', '#1a1228', '#3a2c54', 10),
    alienBulkhead: alienWall.full,
    'alienBulkhead-mid': alienWall.mid,
    'alienBulkhead-low': alienWall.low,
    alienConsole: on(alien, (canvas) => {
      prism(canvas, { scale: 0.7, base: 0, height: 26, top: '#5a4a7a', left: '#3e3258', right: '#2e2442' })
      fill(canvas, diamond(26, 0.4), hex('#c070ff'))
    }),
    bioPod: on(alien, (canvas) => {
      prism(canvas, { scale: 0.6, base: 0, height: 10, top: '#6a3a6a', left: '#4e2a4e', right: '#3a1e3a' })
      prism(canvas, { scale: 0.35, base: 10, height: 6, top: '#ff7ad0', left: '#4e2a4e', right: '#3a1e3a' })
    }),
  }
}

// Tiles for the Earth-like and alien biomes added after the first seven (each set drawn on its own biome's ground).
function EXTRA_BIOME_TILES() {
  const ground = (fillColour, stroke, fleck, every = 7) => () => speckle(floorTile({ fill: fillColour, stroke }), fleck, every)
  const on = (base, draw) => () => {
    const canvas = base()
    draw(canvas)
    return canvas
  }
  const boulder = (base, top, left, right, cap) =>
    on(base, (canvas) => {
      prism(canvas, { scale: 0.75, base: 0, height: 22, top, left, right })
      prism(canvas, { scale: 0.45, base: 22, height: 8, top: cap, left, right })
    })
  const wall = (top, left, right, detail) => ({
    full: () => block({ top, left, right, height: 46, detail }),
    mid: () => block({ top, left, right, height: 24 }),
    low: () => block({ top, left, right, height: 10 }),
  })

  const jungle = ground('#2a4424', '#1c3018', '#3a5a2e')
  const savanna = ground('#8a7a3a', '#6a5c2a', '#a08e48')
  const tundra = ground('#6a7258', '#4e5640', '#c8d0d0', 10)
  const beach = ground('#d8c490', '#b8a470', '#e8d6a8', 8)
  const scree = ground('#6a6a66', '#4c4c48', '#8a8a84', 6)
  const sulphur = ground('#c8b858', '#a09040', '#e8dc80')
  const crystal = ground('#8a7aa8', '#6a5a8a', '#d8c8ff', 9)
  const fungal = ground('#4a3a4c', '#32263a', '#6a5070')
  const toxic = ground('#5a6a2a', '#404c1c', '#7a8a34')
  const glow = ground('#163032', '#0e2224', '#40e0d0', 9)
  const rust = ground('#9a4a2e', '#763620', '#b05c3a')
  const glass = ground('#1c1a24', '#0e0c14', '#5a5878', 8)
  const cliff = wall('#7a7a76', '#56564f', '#43433e', (canvas, h) => ring(canvas, h, 0.7, hex('#8a8a84')))
  const crystalWall = wall('#b8a0e0', '#8a70c0', '#6a50a0', (canvas, h) => fill(canvas, diamond(h, 0.4), hex('#e0d0ff')))
  const rustMesa = wall('#b8603e', '#8a4428', '#6e3620', (canvas, h) => ring(canvas, h, 0.6, hex('#a05030')))

  return {
    // Jungle
    jungleFloor: jungle,
    'jungleFloor-alt': ground('#2e4a27', '#1c3018', '#22381c'),
    jungleTree: on(jungle, (canvas) => {
      prism(canvas, { scale: 0.2, base: 0, height: 18, top: '#5a3e26', left: '#4a321e', right: '#3a2717' })
      prism(canvas, { scale: 0.95, base: 18, height: 18, top: '#2a6a2a', left: '#1c4a1c', right: '#153a15' })
      prism(canvas, { scale: 0.6, base: 36, height: 10, top: '#348034', left: '#1c4a1c', right: '#153a15' })
    }),
    fern: on(jungle, (canvas) => {
      for (const [dx, dy, h] of [[-9, -1, 10], [8, -2, 12], [0, 4, 9], [-2, -5, 13], [11, 3, 8]]) {
        spike(canvas, dx, dy, { scale: 0.18, height: h, top: '#4aa04a', left: '#2e7a2e', right: '#226022' })
      }
    }),
    // Grassland
    savanna,
    'savanna-alt': ground('#8e7e3e', '#6a5c2a', '#76682e'),
    acacia: on(savanna, (canvas) => {
      prism(canvas, { scale: 0.14, base: 0, height: 26, top: '#6a4a2e', left: '#523822', right: '#402c1a' })
      prism(canvas, { scale: 0.95, base: 26, height: 8, top: '#5a7a30', left: '#425a22', right: '#34481a' })
    }),
    termiteMound: on(savanna, (canvas) => {
      const colours = { top: '#b08048', left: '#8a5a2e', right: '#6e4824' }
      prism(canvas, { scale: 0.6, base: 0, height: 12, ...colours })
      prism(canvas, { scale: 0.38, base: 12, height: 10, ...colours })
      prism(canvas, { scale: 0.18, base: 22, height: 6, ...colours })
    }),
    // Tundra
    tundra,
    'tundra-alt': ground('#6e765c', '#4e5640', '#58604a', 10),
    lichenRock: boulder(tundra, '#8a9a70', '#5e6258', '#4a4e46', '#9aaa80'),
    shrub: on(tundra, (canvas) => {
      prism(canvas, { scale: 0.6, base: 0, height: 8, top: '#5a6a3a', left: '#44522c', right: '#364222' })
      prism(canvas, { scale: 0.32, base: 8, height: 4, top: '#6a7a44', left: '#44522c', right: '#364222' })
    }),
    // Coast
    beach,
    'beach-alt': ground('#dcc894', '#b8a470', '#c4b080', 8),
    shallows: () => {
      const canvas = floorTile({ fill: '#4a9aa8', stroke: '#3a7a88' })
      ring(canvas, 0, 0.6, hex('#7ac0c8'))
      ring(canvas, 0, 0.3, hex('#8ad0d6'))
      return canvas
    },
    palm: on(beach, (canvas) => {
      prism(canvas, { scale: 0.1, base: 0, height: 34, top: '#8a6a44', left: '#6a5034', right: '#54402a' })
      prism(canvas, { scale: 0.9, base: 34, height: 4, top: '#3a8a3a', left: '#2a6a2a', right: '#205420' })
      prism(canvas, { scale: 0.4, base: 38, height: 4, top: '#4aa04a', left: '#2a6a2a', right: '#205420' })
    }),
    driftwood: on(beach, (canvas) => {
      prism(canvas, { scale: 0.85, base: 0, height: 8, top: '#a89880', left: '#867a66', right: '#6a6050' })
      ring(canvas, 8, 0.5, hex('#c0b298'))
    }),
    // Mountains
    scree,
    'scree-alt': ground('#6e6e6a', '#4c4c48', '#545450', 6),
    cliff: cliff.full,
    'cliff-mid': cliff.mid,
    'cliff-low': cliff.low,
    screeRock: boulder(scree, '#8e8e88', '#62625c', '#4c4c48', '#9e9e98'),
    // Geothermal Field
    sulphurCrust: sulphur,
    'sulphurCrust-alt': ground('#ccbc5c', '#a09040', '#b0a048'),
    geyser: on(sulphur, (canvas) => {
      const rock = { top: '#a8a090', left: '#807868', right: '#686050' }
      prism(canvas, { scale: 0.6, base: 0, height: 8, ...rock })
      prism(canvas, { scale: 0.3, base: 8, height: 6, ...rock })
      prism(canvas, { scale: 0.16, base: 14, height: 10, top: '#f4f8fa', left: '#d8e0e4', right: '#c0c8cc' })
    }),
    sulphurPool: () => {
      const canvas = floorTile({ fill: '#d89a20', stroke: '#a06a14' })
      ring(canvas, 0, 0.6, hex('#f0c040'))
      fill(canvas, diamond(0, 0.3), hex('#40a0a0'))
      return canvas
    },
    // Crystal Fields
    crystalGround: crystal,
    'crystalGround-alt': ground('#8e7eac', '#6a5a8a', '#76669a', 9),
    crystalSpire: on(crystal, (canvas) => {
      prism(canvas, { scale: 0.5, base: 0, height: 30, top: '#e0c8ff', left: '#a888e0', right: '#8868c0' })
      prism(canvas, { scale: 0.3, base: 30, height: 12, top: '#f0e0ff', left: '#a888e0', right: '#8868c0' })
      prism(canvas, { scale: 0.12, base: 42, height: 4, top: '#ffffff', left: '#c8b0f0', right: '#a890d8' })
    }),
    crystalCluster: on(crystal, (canvas) => {
      for (const [dx, dy, h] of [[-8, 0, 12], [7, -2, 16], [0, 4, 10], [-1, -4, 18]]) {
        spike(canvas, dx, dy, { scale: 0.16, height: h, top: '#e8d8ff', left: '#9a78d8', right: '#7a5ab8' })
      }
    }),
    crystalWall: crystalWall.full,
    'crystalWall-mid': crystalWall.mid,
    'crystalWall-low': crystalWall.low,
    // Fungal Forest
    fungalGround: fungal,
    'fungalGround-alt': ground('#4e3e50', '#32263a', '#3a2c3e'),
    giantMushroom: on(fungal, (canvas) => {
      prism(canvas, { scale: 0.2, base: 0, height: 28, top: '#d8d0c0', left: '#b0a898', right: '#908878' })
      prism(canvas, { scale: 1, base: 28, height: 10, top: '#c8506a', left: '#9a3a50', right: '#7a2c3e' })
      prism(canvas, { scale: 0.6, base: 38, height: 6, top: '#d8607a', left: '#9a3a50', right: '#7a2c3e' })
      fill(canvas, diamond(44, 0.15), hex('#f0e0e0'))
    }),
    puffball: on(fungal, (canvas) => {
      prism(canvas, { scale: 0.55, base: 0, height: 10, top: '#b8a0c0', left: '#8a7898', right: '#6e5e7a' })
      prism(canvas, { scale: 0.3, base: 10, height: 4, top: '#c8b0d0', left: '#8a7898', right: '#6e5e7a' })
    }),
    // Acid Marsh
    toxicMud: toxic,
    'toxicMud-alt': ground('#5e6e2e', '#404c1c', '#48561e'),
    acidPool: () => {
      const canvas = floorTile({ fill: '#7ab020', stroke: '#4a6a14' })
      ring(canvas, 0, 0.6, hex('#a8e040'))
      fill(canvas, diamond(0, 0.25), hex('#c8ff60'))
      return canvas
    },
    bloatPod: on(toxic, (canvas) => {
      prism(canvas, { scale: 0.12, base: 0, height: 8, top: '#6a7a30', left: '#4e5c22', right: '#3e4a1a' })
      prism(canvas, { scale: 0.55, base: 8, height: 10, top: '#a8c040', left: '#7a9a2a', right: '#5e7a20' })
      prism(canvas, { scale: 0.3, base: 18, height: 4, top: '#c8e060', left: '#7a9a2a', right: '#5e7a20' })
    }),
    // Bioluminescent Jungle
    glowMoss: glow,
    'glowMoss-alt': ground('#1a3436', '#0e2224', '#2ab0a0', 13),
    glowTree: on(glow, (canvas) => {
      prism(canvas, { scale: 0.18, base: 0, height: 18, top: '#3a2a4a', left: '#2a1e38', right: '#20162c' })
      prism(canvas, { scale: 0.85, base: 18, height: 16, top: '#2aa0a0', left: '#1a7070', right: '#145858' })
      prism(canvas, { scale: 0.45, base: 34, height: 8, top: '#4af0e0', left: '#1a7070', right: '#145858' })
    }),
    glowPod: on(glow, (canvas) => {
      for (const [dx, dy, h] of [[-7, 0, 8], [6, -2, 11], [0, 4, 7]]) {
        spike(canvas, dx, dy, { scale: 0.2, height: h, top: '#80fff0', left: '#30c0b0', right: '#209080' })
      }
    }),
    // Rust Desert
    rustDust: rust,
    'rustDust-alt': ground('#9e4e32', '#763620', '#843e26'),
    rustRock: boulder(rust, '#a85a3a', '#7a3e26', '#62301e', '#b86a48'),
    rustMesa: rustMesa.full,
    'rustMesa-mid': rustMesa.mid,
    'rustMesa-low': rustMesa.low,
    // Glass Plains
    glassPlain: glass,
    'glassPlain-alt': ground('#201e2a', '#0e0c14', '#3a3850', 11),
    glassShard: on(glass, (canvas) => {
      for (const [dx, dy, h] of [[-8, 1, 14], [6, -2, 20], [1, 4, 10]]) {
        spike(canvas, dx, dy, { scale: 0.14, height: h, top: '#8a88b0', left: '#3a3850', right: '#24223a' })
      }
    }),
    glassSpire: on(glass, (canvas) => {
      prism(canvas, { scale: 0.45, base: 0, height: 34, top: '#4a4868', left: '#2a283c', right: '#1a1828' })
      prism(canvas, { scale: 0.2, base: 34, height: 8, top: '#9a98c8', left: '#2a283c', right: '#1a1828' })
    }),
  }
}

// A point on a block's front faces: 'left' runs from the left corner to the front corner, 'right' from the front corner
// to the right corner; u 0..1 along the face, v pixels above the floor.
function facePoint(face, u, v) {
  const [, r, b, l] = diamond()
  const [from, to] = face === 'left' ? [l, b] : [b, r]
  return [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u - v]
}
// A patch on a face; colours: [left face, right face] (the right face is in shadow).
function facePatch(canvas, face, u0, u1, v0, v1, colours) {
  const colour = face === 'left' ? colours[0] : colours[1]
  fill(canvas, [facePoint(face, u0, v0), facePoint(face, u1, v0), facePoint(face, u1, v1), facePoint(face, u0, v1)], hex(colour))
}
const bothFaces = (draw) => ['left', 'right'].forEach(draw)

// Walls and floors for the locations and biomes that had none of their own (designer request, Oct 2026).
function MORE_WALL_TILES() {
  const wall = (top, left, right, detail, height = 46) => ({
    full: () => block({ top, left, right, height, detail }),
    mid: () => block({ top, left, right, height: Math.round(height / 2) }),
    low: () => block({ top, left, right, height: 10 }),
  })
  // Horizontal bands across both faces at the given heights.
  const strata = (bands, colours, thick = 2) => (canvas) => bothFaces((face) => bands.forEach((v) => facePatch(canvas, face, 0, 1, v, v + thick, colours)))
  // Vertical strips on both faces at the given positions along them.
  const posts = (us, width, colours, v0 = 0, v1 = null) => (canvas, h) =>
    bothFaces((face) => us.forEach((u) => facePatch(canvas, face, u, u + width, v0, v1 ?? h, colours)))
  // Small blobs scattered over both faces (a fixed pattern, so every copy of the tile matches).
  const spots = (count, size, colours, seed = 1) => (canvas, h) =>
    bothFaces((face, f) => {
      for (let i = 0; i < count; i++) {
        const u = ((i * 37 + seed * 11 + f * 5) % 89) / 89
        const v = 3 + (((i * 53 + seed * 7 + f * 3) % 97) / 97) * (h - 6)
        facePatch(canvas, face, u, Math.min(1, u + size / 32), v, v + size, colours)
      }
    })
  const all = (...details) => (canvas, h) => details.forEach((detail) => detail(canvas, h))

  const walls = {
    breachedBulkhead: wall(
      '#4a5258',
      '#30383d',
      '#232a2e',
      all(spots(9, 3, ['#1c2124', '#161a1c'], 3), (canvas) => {
        facePatch(canvas, 'left', 0.42, 0.7, 14, 30, ['#c25a12', '#c25a12'])
        facePatch(canvas, 'left', 0.46, 0.66, 16, 28, ['#050608', '#050608'])
      }),
    ),
    shoredWall: wall('#5a5048', '#3e362e', '#2e2822', all(posts([0.12, 0.8], 0.09, ['#7a5a34', '#5e4428']), strata([38], ['#7a5a34', '#5e4428'], 3))),
    blastBarrier: wall(
      '#9a9a92',
      '#74746c',
      '#5c5c56',
      (canvas, h) => {
        bothFaces((face) => {
          for (let i = 0; i < 10; i++) facePatch(canvas, face, i / 10, (i + 1) / 10, 3, 8, i % 2 ? ['#262626', '#1c1c1c'] : ['#d8b020', '#a88818'])
        })
        ring(canvas, h, 0.85, hex('#b0b0a8'))
      },
      40,
    ),
    hullBarricade: wall('#6a7680', '#4a545c', '#3a4248', all(strata([14, 28], ['#2e353b', '#252b30'], 1), spots(6, 3, ['#24292d', '#1c2023'], 5)), 40),
    campBarricade: wall('#6a6a3a', '#4e4e2a', '#3c3c20', all(strata([16], ['#34341c', '#2a2a16'], 1), posts([0.5], 0.04, ['#34341c', '#2a2a16']), posts([0.04, 0.54], 0.03, ['#7e7e48', '#5e5e34'])), 32),
    cellWall: wall('#4a5258', '#343b40', '#262c30', all(strata([20], ['#c03030', '#902424'], 3), posts([0.33, 0.66], 0.02, ['#262c30', '#1c2024']))),
    rootWall: wall('#4a4630', '#3a3424', '#2c271b', all(posts([0.1, 0.38, 0.7], 0.07, ['#5a4a30', '#46392a']), spots(10, 2, ['#4a6a2a', '#3a5420'], 2))),
    vineWall: wall('#4e4a40', '#36322a', '#28251f', all(posts([0.18, 0.5, 0.82], 0.05, ['#2e6a2a', '#245a22'], 8), spots(14, 2, ['#3e8a36', '#2e6e2a'], 4))),
    stoneWall: wall('#8a8478', '#686258', '#524d45', all(strata([8, 17, 26], ['#4a463e', '#3c3832'], 1), spots(8, 2, ['#9a9488', '#7a756a'], 6)), 34),
    frostRockWall: wall('#e8f0f4', '#6e767a', '#565e62', all(strata([38, 41], ['#c8d4da', '#a8b4ba'], 2), spots(8, 2, ['#d8e4ea', '#b8c4ca'], 7))),
    seaCliff: wall('#6a8a4a', '#80705a', '#665a48', strata([6, 15, 24, 33], ['#a89878', '#86785e'], 2)),
    sinterWall: wall('#e8dcb8', '#b8a070', '#9a845a', all(strata([9, 22, 35], ['#d08a3a', '#a86c2a'], 2), strata([15, 29], ['#f0e8d0', '#d0c8b0'], 1))),
    regolithRidge: wall('#8a8478', '#666058', '#4e4a44', spots(12, 3, ['#4e4a44', '#3c3934'], 8)),
    fungalWall: wall('#4a3a4c', '#34283a', '#281e2c', all(spots(7, 3, ['#c8506a', '#9a3a50'], 9), spots(9, 1, ['#f0e0e0', '#c8b8b8'], 10))),
    corrodedWall: wall('#5a5a40', '#40402c', '#303020', posts([0.15, 0.42, 0.68, 0.88], 0.03, ['#a8c040', '#7a9a2a'], 10)),
    glowRootWall: wall('#1e2a34', '#141e26', '#0e161c', all(posts([0.2, 0.55, 0.85], 0.025, ['#40e0d0', '#2ab0a0'], 4), spots(8, 2, ['#80fff0', '#50d0c0'], 11))),
    obsidianWall: wall('#2a2834', '#1a1824', '#121018', posts([0.25, 0.3], 0.03, ['#6a68a0', '#4a4878'], 6)),
  }
  const tiles = {}
  for (const [id, set] of Object.entries(walls)) {
    tiles[id] = set.full
    tiles[`${id}-mid`] = set.mid
    tiles[`${id}-low`] = set.low
  }
  // Floors: a derelict's dark, cracked plating and a brig's deck.
  tiles.derelictDeck = () => {
    const canvas = speckle(floorTile({ fill: '#262c30', stroke: '#141a1c' }), '#1a1f22', 7)
    for (let i = 0; i < 18; i++) setPixel(canvas, 20 + i, 74 + Math.round(Math.sin(i / 2) * 2), hex('#0c0f10'))
    return canvas
  }
  tiles.cellFloor = () => {
    const canvas = floorTile({ fill: '#30363a', stroke: '#1a2023' })
    ring(canvas, 0, 0.7, hex('#3c4448'))
    return canvas
  }
  return tiles
}
Object.assign(TILES, MORE_WALL_TILES())

fs.mkdirSync(OUT, { recursive: true })
for (const [id, draw] of Object.entries(TILES)) {
  const file = path.join(OUT, `${id}.png`)
  if (fs.existsSync(file) && !FORCE) {
    console.log(`kept   ${id}.png (already exists)`)
    continue
  }
  fs.writeFileSync(file, encodePng(WIDTH, HEIGHT, draw().data))
  console.log(`wrote  ${id}.png`)
}
