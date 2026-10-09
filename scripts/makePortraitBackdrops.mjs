// Placeholder portrait backdrops (480 x 600, the head-and-shoulders portrait size): simple flat scenes drawn behind a
// portrait's transparent characterImage. Listed in src/data/adaptation/portraitBackdrops.json; replace the PNGs with
// real art freely. Writes public/art/portraits/backdrops/<backdrop id>.png. Run: node scripts/makePortraitBackdrops.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLayer, ellipse, fill, polygon, roundRect, stroke, verticalGradient, writeLayer } from './portraitDraw.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'art', 'portraits', 'backdrops')
const W = 480
const H = 600

function seeded(seed) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function stars(layer, x0, y0, x1, y1, count, seed) {
  const random = seeded(seed)
  for (let i = 0; i < count; i++) {
    const x = x0 + random() * (x1 - x0)
    const y = y0 + random() * (y1 - y0)
    fill(layer, ellipse(x, y, 1.2, 1.2), [230, 236, 255], 0.4 + random() * 0.6)
  }
}

// Darkens the bottom so the portrait's shoulders stand out.
const shade = (layer) => fill(layer, polygon([[0, 380], [W, 380], [W, H], [0, H]]), [0, 0, 0], 0.25)

const BACKDROPS = {
  'starship-bridge': (layer) => {
    verticalGradient(layer, [34, 30, 44], [14, 12, 20])
    fill(layer, roundRect(40, 40, 440, 230, 14), [8, 8, 16])
    stars(layer, 50, 50, 430, 220, 70, 1)
    fill(layer, roundRect(40, 40, 440, 230, 14), [120, 140, 200], 0.06)
    fill(layer, polygon([[0, 330], [W, 330], [W, 400], [0, 400]]), [60, 48, 52])
    for (let x = 20; x < W; x += 46) fill(layer, roundRect(x, 345, x + 26, 357, 3), [[230, 80, 70], [250, 200, 70], [90, 170, 240]][(x / 46) % 3 | 0])
    shade(layer)
  },
  'starship-corridor': (layer) => {
    verticalGradient(layer, [70, 62, 72], [30, 26, 32])
    fill(layer, polygon([[0, 0], [170, 180], [170, 420], [0, H]]), [96, 86, 96])
    fill(layer, polygon([[W, 0], [310, 180], [310, 420], [W, H]]), [96, 86, 96])
    fill(layer, polygon([[170, 180], [310, 180], [310, 420], [170, 420]]), [44, 38, 48])
    fill(layer, polygon([[0, 0], [W, 0], [310, 180], [170, 180]]), [120, 112, 120])
    fill(layer, stroke([[60, 0], [200, 180]], 6), [255, 236, 200], 0.7)
    fill(layer, stroke([[420, 0], [280, 180]], 6), [255, 236, 200], 0.7)
    for (const y of [120, 260]) fill(layer, roundRect(20, y, 70, y + 30, 4), [230, 160, 60], 0.8)
    shade(layer)
  },
  'briefing-room': (layer) => {
    verticalGradient(layer, [46, 40, 52], [20, 18, 24])
    fill(layer, roundRect(30, 50, 450, 210, 10), [8, 10, 20])
    stars(layer, 40, 60, 440, 200, 55, 2)
    for (const x of [170, 310]) fill(layer, polygon([[x - 6, 50], [x + 6, 50], [x + 6, 210], [x - 6, 210]]), [60, 54, 66])
    fill(layer, polygon([[60, 420], [420, 420], [480, 520], [0, 520]]), [92, 64, 48])
    fill(layer, polygon([[0, 520], [W, 520], [W, H], [0, H]]), [30, 24, 26])
    shade(layer)
  },
  'transporter-room': (layer) => {
    verticalGradient(layer, [40, 44, 58], [16, 18, 26])
    for (const x of [60, 180, 300, 420]) {
      fill(layer, roundRect(x - 26, 40, x + 26, 330, 20), [150, 190, 255], 0.25)
      fill(layer, ellipse(x, 440, 50, 16), [200, 220, 255], 0.55)
      fill(layer, ellipse(x, 440, 36, 10), [255, 255, 255], 0.5)
    }
    fill(layer, polygon([[0, 470], [W, 470], [W, H], [0, H]]), [36, 34, 42])
    shade(layer)
  },
  sickbay: (layer) => {
    verticalGradient(layer, [86, 104, 120], [40, 50, 60])
    fill(layer, roundRect(300, 60, 450, 190, 8), [18, 26, 34])
    fill(layer, stroke([[310, 140], [340, 140], [352, 100], [366, 170], [380, 130], [440, 130]], 3), [120, 240, 150])
    fill(layer, roundRect(30, 60, 160, 150, 8), [18, 26, 34])
    for (let i = 0; i < 4; i++) fill(layer, roundRect(44, 74 + i * 18, 70 + i * 22, 84 + i * 18, 2), [90, 180, 240])
    fill(layer, polygon([[0, 400], [W, 400], [W, 430], [0, 430]]), [180, 190, 200])
    shade(layer)
  },
  engineering: (layer) => {
    verticalGradient(layer, [30, 30, 40], [10, 10, 16])
    fill(layer, roundRect(48, 0, 132, H, 20), [40, 60, 110])
    fill(layer, roundRect(66, 0, 114, H, 14), [110, 170, 255], 0.8)
    for (let y = 20; y < H; y += 60) fill(layer, roundRect(50, y, 130, y + 10, 4), [200, 230, 255], 0.6)
    fill(layer, roundRect(330, 80, 450, 300, 8), [50, 46, 56])
    for (let y = 100; y < 290; y += 24) fill(layer, roundRect(344, y, 436, y + 10, 3), [[240, 170, 60], [230, 80, 70], [100, 200, 120]][(y / 24) % 3 | 0], 0.85)
    fill(layer, stroke([[0, 380], [W, 380]], 8), [140, 130, 120])
    shade(layer)
  },
  'planet-surface': (layer) => {
    verticalGradient(layer, [240, 150, 90], [90, 50, 110])
    fill(layer, ellipse(380, 120, 46, 46), [255, 230, 170])
    fill(layer, polygon([[0, 360], [80, 300], [170, 350], [260, 280], [360, 340], [W, 290], [W, 420], [0, 420]]), [110, 60, 90])
    fill(layer, polygon([[0, 420], [W, 420], [W, H], [0, H]]), [70, 40, 50])
    shade(layer)
  },
  'alien-interior': (layer) => {
    verticalGradient(layer, [40, 70, 60], [14, 24, 26])
    for (const [cx, rx] of [[240, 230], [240, 170], [240, 110]]) {
      fill(layer, ellipse(cx, 420, rx, 400), [90, 160, 130], 0.18)
    }
    for (const x of [40, 440]) fill(layer, ellipse(x, 300, 30, 220), [120, 60, 140], 0.6)
    for (let i = 0; i < 9; i++) fill(layer, ellipse(60 + i * 45, 40 + (i % 3) * 18, 6, 6), [180, 255, 200], 0.8)
    shade(layer)
  },
}

for (const [id, draw] of Object.entries(BACKDROPS)) {
  const layer = createLayer(W, H)
  draw(layer)
  writeLayer(OUT, id, layer)
}
console.log(`Wrote ${Object.keys(BACKDROPS).length} backdrops to ${path.relative(ROOT, OUT)}`)
