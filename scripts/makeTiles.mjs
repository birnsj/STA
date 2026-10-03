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
}

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
