// Draws a random episode card picture (Generate Card): a flat 320 x 180 scene built from the map's location and, on the
// ground, its biome's card colours (biomes.json). Pure pixel code (no DOM), so the placeholder script can use it too.
// Prototype placeholder art, not from the books.
export const CARD_WIDTH = 320
export const CARD_HEIGHT = 180
const W = CARD_WIDTH
const H = CARD_HEIGHT

const hex = (value) => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)]
const mix = (a, b, t) => {
  const [x, y] = [hex(a), hex(b)]
  return `#${[0, 1, 2].map((i) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0')).join('')}`
}
const between = (random, low, high) => low + random() * (high - low)
const pick = (random, list) => list[Math.floor(random() * list.length)]

// A seeded random source, so a picture can be drawn again from its seed.
export function seededRandom(seed) {
  let state = typeof seed === 'number' ? seed >>> 0 : [...String(seed)].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- Pixel primitives ----

function plot(c, x, y, colour, alpha = 1) {
  x = Math.floor(x)
  y = Math.floor(y)
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 4
  const rgb = hex(colour)
  for (let k = 0; k < 3; k++) c.data[i + k] = Math.round(rgb[k] * alpha + c.data[i + k] * (1 - alpha))
}

function rect(c, x, y, w, h, colour, alpha = 1) {
  for (let py = Math.max(0, Math.floor(y)); py < Math.min(H, y + h); py++) {
    for (let px = Math.max(0, Math.floor(x)); px < Math.min(W, x + w); px++) plot(c, px, py, colour, alpha)
  }
}

function gradient(c, top, bottom, y0 = 0, y1 = H) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, y1); y++) rect(c, 0, y, W, 1, mix(top, bottom, (y - y0) / Math.max(1, y1 - y0 - 1)))
}

function inside(points, px, py) {
  let result = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) result = !result
  }
  return result
}

function poly(c, points, colour, alpha = 1) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W - 1, Math.ceil(Math.max(...xs))); x++) {
      if (inside(points, x + 0.5, y + 0.5)) plot(c, x, y, colour, alpha)
    }
  }
}

function ellipse(c, cx, cy, rx, ry, colour, alpha = 1, keep = () => true) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, cy + ry); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx
      const dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy <= 1 && keep(x, y)) plot(c, x, y, colour, alpha)
    }
  }
}
const circle = (c, cx, cy, r, colour, alpha, keep) => ellipse(c, cx, cy, r, r, colour, alpha, keep)

function glow(c, cx, cy, r, colour, strength = 0.12) {
  for (let k = 4; k >= 1; k--) circle(c, cx, cy, (r * k) / 4, colour, strength)
}

function line(c, x0, y0, x1, y1, width, colour, alpha = 1) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1
  const nx = (-(y1 - y0) / len) * (width / 2)
  const ny = ((x1 - x0) / len) * (width / 2)
  poly(c, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], colour, alpha)
}

// Fills everything below the curve y = top(x).
function band(c, top, colour) {
  for (let x = 0; x < W; x++) rect(c, x, top(x), 1, H, colour)
}

function stars(c, count, maxY = H) {
  for (let i = 0; i < count; i++) plot(c, c.random() * W, c.random() * maxY, '#ffffff', 0.35 + c.random() * 0.65)
}

// A random rolling curve.
function hills(random, base, amp) {
  const [f1, f2, p1, p2] = [between(random, 0.008, 0.03), between(random, 0.03, 0.07), random() * 6, random() * 6]
  return (x) => base + Math.sin(x * f1 + p1) * amp + Math.sin(x * f2 + p2) * amp * 0.35
}

// A shaded sphere lit from a random side.
function planet(c, cx, cy, r, colour) {
  glow(c, cx, cy, r * 1.15, mix(colour, '#ffffff', 0.4), 0.05)
  circle(c, cx, cy, r, colour)
  for (let i = 0; i < 4; i++) {
    const y = cy - r + c.random() * r * 2
    const h = between(c.random, 2, Math.max(2, r * 0.15))
    circle(c, cx, cy, r, mix(colour, '#ffffff', 0.2), 0.35, (_, py) => py >= y && py < y + h)
  }
  const side = c.random() < 0.5 ? -1 : 1
  circle(c, cx + side * r * 0.35, cy + r * 0.2, r, '#000000', 0.5, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r)
}

function nebula(c, colours) {
  for (let i = 0; i < 10; i++) glow(c, c.random() * W, c.random() * H, between(c.random, 35, 90), pick(c.random, colours), 0.05)
}

// ---- Skies and terrain ----

const SKIES = {
  day: { top: '#5f97cc', bottom: '#cfe2ee', sun: '#fff4d0' },
  dusk: { top: '#2b2350', bottom: '#e08a4a', sun: '#ffb070', low: true },
  night: { top: '#04070f', bottom: '#1b2340', stars: true, moon: '#d8dce4' },
  overcast: { top: '#7d8890', bottom: '#b8c0c6' },
  murky: { top: '#5f6d5a', bottom: '#b0b89c' },
  desertDay: { top: '#e0b870', bottom: '#f6e8c4', sun: '#fff8e0' },
  pale: { top: '#a8c4dc', bottom: '#eaf2f7', sun: '#ffffff' },
  volcanic: { top: '#1e0e0c', bottom: '#6a2a18', glowColour: '#ff6a1a' },
  airless: { top: '#05070c', bottom: '#2e323c', stars: true, moon: '#c8ccd2' },
}
const DARK_SKIES = new Set(['night', 'airless', 'volcanic', 'dusk'])
const PLANET_COLOURS = ['#3d6ea8', '#a85a3a', '#5a8a5a', '#8a6aa8', '#c8a060', '#4a9aa8', '#a83a4a', '#7a7a8a']

function drawSky(c, skyId, horizon) {
  const sky = SKIES[skyId] ?? SKIES.day
  gradient(c, sky.top, sky.bottom, 0, horizon + 10)
  if (sky.stars) stars(c, 140, horizon)
  if (sky.sun) {
    const [x, y] = [between(c.random, 30, 290), sky.low ? horizon - between(c.random, 4, 18) : between(c.random, 18, 50)]
    glow(c, x, y, 26, sky.sun, 0.2)
    circle(c, x, y, sky.low ? 16 : 10, sky.sun)
  }
  if (sky.moon) {
    const [x, y, r] = [between(c.random, 30, 290), between(c.random, 18, 50), between(c.random, 7, 16)]
    circle(c, x, y, r, sky.moon)
    circle(c, x + r * 0.4, y - r * 0.2, r, sky.top, 0.85, (px, py) => (px - x) ** 2 + (py - y) ** 2 <= r * r)
  }
  if (sky.glowColour) glow(c, between(c.random, 60, 260), horizon, 70, sky.glowColour, 0.07)
  // Alien skies: sometimes a planet or moon hangs overhead.
  if (c.random() < 0.35) planet(c, between(c.random, 20, 300), between(c.random, 10, 45), between(c.random, 6, 22), mix(pick(c.random, PLANET_COLOURS), sky.top, 0.35))
}

function mountains(c, horizon, colour) {
  const peaks = []
  for (let x = -20; x <= W + 20; x += between(c.random, 25, 60)) peaks.push([x, horizon - between(c.random, 12, 48)])
  poly(c, [[-20, horizon + 6], ...peaks, [W + 20, horizon + 6]], colour)
}

function volcano(c, horizon, palette) {
  const [x, h, w] = [between(c.random, 60, 260), between(c.random, 50, 80), between(c.random, 80, 130)]
  poly(c, [[x - w, horizon + 4], [x - 18, horizon - h], [x + 18, horizon - h], [x + w, horizon + 4]], palette.rock)
  poly(c, [[x - 18, horizon - h], [x + 18, horizon - h], [x + 12, horizon - h + 6], [x - 12, horizon - h + 6]], '#ff6a1a')
  glow(c, x, horizon - h, 22, '#ff6a1a', 0.12)
}

// Returns the near-ground curve so structures and plants can stand on it.
function drawTerrain(c, palette, horizon, { mountainChance = 0.45, volcanoChance = 0 } = {}) {
  const [far, middle, near] = palette.ground
  if (c.random() < mountainChance) mountains(c, horizon, mix(palette.rock, SKIES.day.bottom, 0.35))
  if (c.random() < volcanoChance) volcano(c, horizon, palette)
  band(c, hills(c.random, horizon - 6, between(c.random, 3, 10)), far)
  band(c, hills(c.random, horizon + 8, between(c.random, 2, 7)), middle)
  const ground = hills(c.random, horizon + 30, between(c.random, 2, 6))
  band(c, ground, near)
  if (palette.extra === 'water') drawWater(c, horizon + between(c.random, 26, 44))
  if (palette.extra === 'lava') drawRiver(c, horizon, '#ff6a1a', '#ffa040')
  if (palette.extra === 'crevasse') drawCrevasse(c, horizon + between(c.random, 30, 60))
  return ground
}

function drawWater(c, top) {
  band(c, () => top, '#34433e')
  for (let i = 0; i < 30; i++) rect(c, c.random() * W, top + 2 + c.random() * (H - top), between(c.random, 12, 40), 1, '#5a6b62', 0.7)
  for (let i = 0; i < 36; i++) {
    const x = c.random() * W
    line(c, x, top + between(c.random, 2, 30), x + 2, top - between(c.random, 6, 16), 1.4, '#6a7a3a')
  }
}

function drawRiver(c, horizon, colour, light) {
  let x = between(c.random, 60, 260)
  for (let y = horizon + 2; y < H; y += 4) {
    const next = x + (c.random() - 0.5) * 14
    const width = 2 + ((y - horizon) / (H - horizon)) * 14
    line(c, x, y, next, y + 4, width, colour)
    glow(c, next, y, width, light, 0.04)
    x = next
  }
}

function drawCrevasse(c, y) {
  for (let x = 0; x < W; x += 10) {
    const next = y + (c.random() - 0.5) * 10
    line(c, x, y, x + 10, next, 3, '#41606e')
    y = next
  }
}

// ---- Plants, sized by how near they stand ----

function plant(c, kind, colour, x, y, size) {
  if (kind === 'tree') {
    rect(c, x - size * 0.1, y - size * 0.7, size * 0.2, size * 0.7, '#4a3424')
    circle(c, x, y - size * 0.9, size * 0.5, colour)
    circle(c, x + size * 0.15, y - size * 0.8, size * 0.36, mix(colour, '#000000', 0.2))
  } else if (kind === 'pine') {
    rect(c, x - size * 0.06, y - size * 0.2, size * 0.12, size * 0.2, '#3a2a1c')
    poly(c, [[x - size * 0.45, y - size * 0.15], [x, y - size * 1.5], [x + size * 0.45, y - size * 0.15]], colour)
    poly(c, [[x, y - size * 0.15], [x, y - size * 1.5], [x + size * 0.45, y - size * 0.15]], mix(colour, '#000000', 0.25))
  } else if (kind === 'mangrove') {
    for (const dx of [-0.5, -0.2, 0.2, 0.5]) line(c, x, y - size * 0.3, x + dx * size, y, 1.5, '#2e261c')
    rect(c, x - size * 0.08, y - size * 1.1, size * 0.16, size * 0.8, '#3a3024')
    circle(c, x, y - size * 1.15, size * 0.55, colour)
    circle(c, x + size * 0.2, y - size * 1.0, size * 0.35, mix(colour, '#000000', 0.2))
  } else if (kind === 'cactus') {
    const s = size
    rect(c, x - s * 0.08, y - s, s * 0.16, s, colour)
    rect(c, x - s * 0.32, y - s * 0.7, s * 0.12, s * 0.35, colour)
    rect(c, x - s * 0.32, y - s * 0.4, s * 0.3, s * 0.1, colour)
    rect(c, x + s * 0.2, y - s * 0.8, s * 0.12, s * 0.3, colour)
    rect(c, x + s * 0.06, y - s * 0.55, s * 0.26, s * 0.1, colour)
  } else if (kind === 'iceSpike') {
    poly(c, [[x - size * 0.3, y], [x, y - size], [x + size * 0.3, y]], colour)
    poly(c, [[x, y], [x, y - size], [x + size * 0.3, y]], mix(colour, '#41606e', 0.35))
  } else if (kind === 'rock') {
    poly(c, [[x - size * 0.5, y], [x - size * 0.3, y - size * 0.4], [x + size * 0.1, y - size * 0.5], [x + size * 0.5, y]], colour)
  } else if (kind === 'crater') {
    ellipse(c, x, y, size, size * 0.3, mix(colour, '#ffffff', 0.25))
    ellipse(c, x, y + 1, size * 0.8, size * 0.22, colour)
  }
}

function plants(c, palette, ground, count, minY = 0) {
  const spots = Array.from({ length: count }, () => {
    const x = c.random() * W
    return { x, y: Math.max(minY, ground(x) + c.random() * (H - ground(x)) * 0.9) }
  }).sort((a, b) => a.y - b.y)
  for (const { x, y } of spots) {
    const near = (y - (ground(x) - 20)) / (H - ground(x) + 20)
    plant(c, palette.plant, palette.plantColour, x, y, 10 + near * 26 + c.random() * 6)
  }
}

// ---- Ground locations ----

const isDark = (skyId) => DARK_SKIES.has(skyId)
const lit = (c, skyId, x, y, w = 4, h = 3) => isDark(skyId) && c.random() < 0.8 && rect(c, x, y, w, h, '#ffd27a')

function colony(c, palette, skyId, base) {
  const dome = mix(palette.building, '#ffffff', 0.45)
  const domes = Math.floor(between(c.random, 2, 6))
  for (let i = 0; i < domes; i++) {
    const [x, r] = [between(c.random, 20, 300), between(c.random, 14, 38)]
    circle(c, x, base, r, dome, 1, (_, y) => y < base)
    circle(c, x + r * 0.35, base, r, '#000000', 0.18, (px, y) => y < base && (px - x) ** 2 + (y - base) ** 2 <= r * r)
    rect(c, x - 3, base - 8, 6, 8, '#3a4a54')
    lit(c, skyId, x - r * 0.5, base - r * 0.4)
  }
  const blocks = Math.floor(between(c.random, 1, 5))
  for (let i = 0; i < blocks; i++) {
    const [x, w, h] = [between(c.random, 10, 290), between(c.random, 14, 30), between(c.random, 10, 20)]
    rect(c, x, base - h, w, h, palette.building)
    rect(c, x + w * 0.7, base - h, w * 0.3, h, mix(palette.building, '#000000', 0.25))
    lit(c, skyId, x + 3, base - h + 4)
  }
  if (c.random() < 0.6) {
    const x = between(c.random, 20, 300)
    rect(c, x, base - 50, 2, 50, '#7d8890')
    if (isDark(skyId)) glow(c, x + 1, base - 50, 5, '#ff3b30', 0.35)
  }
}

function outpost(c, palette, skyId, base) {
  const [x, h] = [between(c.random, 40, 280), between(c.random, 55, 100)]
  rect(c, x - 7, base - h, 14, h, mix(palette.building, '#7d8890', 0.5))
  rect(c, x - 1, base - h - 20, 2, 20, '#9aa4ac')
  const side = c.random() < 0.5 ? -1 : 1
  circle(c, x, base - h + 4, 15, '#b4bec6', 1, (px, y) => y < base - h + 4 && (px - x) * side > 0)
  for (let y = base - h + 14; y < base - 8; y += 14) lit(c, skyId, x - 2, y)
  if (isDark(skyId)) glow(c, x, base - h - 20, 6, '#ff3b30', 0.35)
  const sheds = Math.floor(between(c.random, 1, 4))
  for (let i = 0; i < sheds; i++) {
    const [sx, w, sh] = [between(c.random, 10, 290), between(c.random, 20, 40), between(c.random, 14, 22)]
    rect(c, sx, base - sh, w, sh, palette.building)
    lit(c, skyId, sx + 4, base - sh + 5)
  }
  if (c.random() < 0.6) {
    for (let fx = 0; fx < W; fx += 16) rect(c, fx, base - 2, 2, 10, mix(palette.building, '#000000', 0.5))
    rect(c, 0, base + 1, W, 1, mix(palette.building, '#000000', 0.5))
  }
}

function city(c, palette, skyId, base) {
  const night = isDark(skyId)
  const sky = SKIES[skyId] ?? SKIES.day
  ;[[mix(palette.building, sky.bottom, 0.55), 0.25, 75], [mix(palette.building, '#1c2436', night ? 0.6 : 0.2), 0.6, 105]].forEach(([colour, chance, height]) => {
    let x = -10
    while (x < W) {
      const w = between(c.random, 16, 44)
      const h = height * between(c.random, 0.45, 1.4)
      rect(c, x, base - h, w - 2, h, colour)
      if (c.random() < 0.15) poly(c, [[x + w * 0.3, base - h], [x + w * 0.45, base - h - 22], [x + w * 0.6, base - h]], colour)
      for (let wy = base - h + 6; wy < base - 4; wy += 8) {
        for (let wx = x + 4; wx < x + w - 6; wx += 6) if (c.random() < chance) rect(c, wx, wy, 3, 3, night ? '#ffd27a' : '#cfe2ee', night ? 0.9 : 0.45)
      }
      x += w
    }
  })
}

function ruins(c, palette, skyId, base) {
  const stone = mix(palette.rock, '#d8c8a8', 0.55)
  const shade = mix(stone, '#000000', 0.3)
  const columns = Math.floor(between(c.random, 3, 7))
  for (let i = 0; i < columns; i++) {
    const [x, h, w] = [between(c.random, 10, 300), between(c.random, 30, 85), between(c.random, 10, 18)]
    rect(c, x, base - h, w, h, stone)
    rect(c, x + w * 0.7, base - h, w * 0.3, h, shade)
    poly(c, [[x, base - h], [x + w, base - h], [x + w, base - h - between(c.random, 4, 14)], [x + w * 0.4, base - h - 2]], stone)
  }
  if (c.random() < 0.6) {
    const [x, h] = [between(c.random, 40, 230), between(c.random, 50, 75)]
    rect(c, x, base - h, 12, h, stone)
    rect(c, x + 48, base - h, 12, h, stone)
    poly(c, [[x - 6, base - h], [x + 44, base - h], [x + 38, base - h - 12], [x - 6, base - h - 12]], stone)
    rect(c, x - 6, base - h - 3, 50, 3, shade)
  }
  for (let i = 0; i < 12; i++) rect(c, c.random() * W, base - 4 + c.random() * 24, between(c.random, 5, 14), between(c.random, 3, 8), shade)
}

const CRYSTALS = ['#5fd0ff', '#b07aff', '#6aff9a', '#ffb347']

function caveInterior(c, palette) {
  const rock = palette.rock
  gradient(c, mix(rock, '#000000', 0.55), mix(rock, '#000000', 0.8))
  band(c, hills(c.random, between(c.random, 128, 150), 6), mix(rock, '#000000', 0.35))
  if (palette.extra === 'lava') drawRiver(c, 132, '#ff6a1a', '#ffa040')
  else if (palette.extra === 'water') ellipse(c, between(c.random, 80, 240), 160, between(c.random, 50, 110), 14, '#34433e')
  const colours = [pick(c.random, CRYSTALS), pick(c.random, CRYSTALS)]
  const crystals = Math.floor(between(c.random, 8, 26))
  for (let i = 0; i < crystals; i++) {
    const [x, y, h, w] = [c.random() * W, between(c.random, 125, 180), between(c.random, 14, 55), between(c.random, 3, 9)]
    const colour = pick(c.random, colours)
    glow(c, x, y - h / 2, h * 0.5, colour, 0.03)
    poly(c, [[x - w, y], [x, y - h], [x + w, y]], colour, 0.85)
    poly(c, [[x, y], [x, y - h], [x + w, y]], '#ffffff', 0.25)
  }
  stalactites(c, mix(rock, '#000000', 0.45))
}

function stalactites(c, colour) {
  for (let x = 0; x < W; x += between(c.random, 14, 28)) poly(c, [[x, 0], [x + 18, 0], [x + 9, between(c.random, 12, 46)]], colour)
}

function caveMouth(c, palette) {
  const rock = mix(palette.rock, '#000000', 0.5)
  const [cx, cy, rx, ry] = [between(c.random, 110, 210), between(c.random, 105, 130), between(c.random, 80, 125), between(c.random, 55, 85)]
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 > 1) plot(c, x, y, mix(rock, '#000000', y / H / 2))
    }
  }
  stalactites(c, mix(rock, '#000000', 0.3))
  for (let i = 0; i < 7; i++) {
    const x = c.random() * W
    poly(c, [[x - 10, H], [x + 10, H], [x, H - between(c.random, 10, 30)]], rock)
  }
}

// ---- Space ----

const ACCENTS = ['#ffb347', '#5fd0ff', '#9aff7a', '#ff7ad0', '#ffd27a', '#c8a0ff']
// Interior colour schemes: grey, beige, blue, dark red and bright white.
const HULLS = [
  { wall: '#3c454b', side: '#2c3338', floor: '#2a3236', ceiling: '#20282c', back: '#33444a' },
  { wall: '#6a5e50', side: '#564c40', floor: '#3a332c', ceiling: '#4a4238', back: '#7a6c5c' },
  { wall: '#2e3a4e', side: '#222c3c', floor: '#1c2430', ceiling: '#18202a', back: '#3a4a62' },
  { wall: '#4a3434', side: '#382626', floor: '#2a1e1e', ceiling: '#201616', back: '#5a3e3e' },
  { wall: '#c4c9ce', side: '#a4abb2', floor: '#7a8288', ceiling: '#d4d8dc', back: '#b4bac0' },
]

// A room seen from its doorway. Returns the back wall's edges and the vanishing x.
function room(c, hull, { width = [50, 110], top = [28, 56], bottom = [112, 136] } = {}) {
  const vx = 160 + between(c.random, -40, 40)
  const hw = between(c.random, ...width)
  const [t, b] = [between(c.random, ...top), between(c.random, ...bottom)]
  const [l, r] = [vx - hw, vx + hw]
  rect(c, 0, 0, W, H, hull.ceiling)
  poly(c, [[0, H], [W, H], [r, b], [l, b]], hull.floor)
  poly(c, [[0, 0], [l, t], [l, b], [0, H]], hull.wall)
  poly(c, [[W, 0], [r, t], [r, b], [W, H]], hull.side)
  rect(c, l, t, r - l, b - t, hull.back)
  return { l, r, t, b, vx }
}

function ceilingStrips(c, g, colour) {
  poly(c, [[0, 8], [g.l, g.t + 2], [g.l, g.t + 5], [0, 16]], colour)
  poly(c, [[W, 8], [g.r, g.t + 2], [g.r, g.t + 5], [W, 16]], colour)
}

function starsIn(c, x0, y0, x1, y1, count) {
  for (let i = 0; i < count; i++) plot(c, between(c.random, x0, x1), between(c.random, y0, y1), '#ffffff', 0.4 + c.random() * 0.6)
}

function viewPlanet(c, x0, y0, x1, y1) {
  const [px, py, pr] = [between(c.random, x0 + 20, x1 - 20), between(c.random, y0 + 20, y1 + 30), between(c.random, 14, 45)]
  const keep = (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1
  circle(c, px, py, pr, pick(c.random, PLANET_COLOURS), 1, keep)
  circle(c, px + pr * 0.35, py + pr * 0.2, pr, '#000000', 0.5, (x, y) => keep(x, y) && (x - px) ** 2 + (y - py) ** 2 <= pr * pr)
}

function corridor(c, hull, accent) {
  const g = room(c, hull, { width: [16, 34], top: [52, 70], bottom: [104, 122] })
  rect(c, g.vx - 3, g.t + 4, 6, g.b - g.t - 4, hull.ceiling)
  const panels = Math.floor(between(c.random, 3, 7))
  for (let i = 1; i <= panels; i++) {
    const s = i / (panels + 1)
    rect(c, s * g.l - 1, s * g.t, 2, H - s * (H - g.b) - s * g.t, hull.floor)
    rect(c, W - s * (W - g.r) - 1, s * g.t, 2, H - s * (H - g.b) - s * g.t, hull.floor)
  }
  if (c.random() < 0.45) {
    const [x0, x1] = c.random() < 0.5 ? [g.l * 0.2, g.l * 0.55] : [W - (W - g.r) * 0.55, W - (W - g.r) * 0.2]
    const window = [[x0, 40], [x1, 50], [x1, 100], [x0, 120]]
    poly(c, window, '#03060e')
    for (let i = 0; i < 25; i++) {
      const [x, y] = [between(c.random, x0, x1), between(c.random, 40, 120)]
      if (inside(window, x, y)) plot(c, x, y, '#ffffff', 0.8)
    }
  }
  ceilingStrips(c, g, accent)
  poly(c, [[g.vx - 10, H], [g.vx + 10, H], [g.vx + 1, g.b], [g.vx - 1, g.b]], mix(hull.floor, accent, 0.35))
  rect(c, g.l, g.t, g.r - g.l, 2, accent)
}

function bridge(c, hull, accent) {
  gradient(c, hull.ceiling, hull.floor)
  const [x0, x1, y0, y1] = [between(c.random, 40, 70), between(c.random, 250, 280), between(c.random, 18, 30), between(c.random, 95, 110)]
  rect(c, x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8, hull.wall)
  rect(c, x0, y0, x1 - x0, y1 - y0, '#03060e')
  starsIn(c, x0, y0, x1, y1, 60)
  if (c.random() < 0.7) viewPlanet(c, x0, y0, x1, y1)
  if (c.random() < 0.3) for (let i = 0; i < 30; i++) line(c, (x0 + x1) / 2, (y0 + y1) / 2, between(c.random, x0, x1), c.random() < 0.5 ? y0 : y1 - 1, 1, '#cfe2ee', 0.35)
  poly(c, [[0, 140], [100, 128], [220, 128], [W, 140], [W, H], [0, H]], hull.floor)
  for (const [x, w] of [[20, 70], [125, 70], [230, 70]]) {
    poly(c, [[x, 150], [x + w, 150], [x + w - 8, 136], [x + 8, 136]], hull.wall)
    rect(c, x + 12, 139, w - 24, 3, accent)
  }
  ellipse(c, 160, 168, 26, 10, mix(hull.side, '#5c3a2e', 0.6))
  rect(c, 150, 150, 20, 18, mix(hull.wall, '#6e3a2e', 0.6))
}

const CORE_COLOURS = ['#5fd0ff', '#7a8aff', '#c070ff', '#5fffc0']

function engineering(c, hull, accent) {
  const g = room(c, hull, { width: [80, 120] })
  const core = pick(c.random, CORE_COLOURS)
  const cw = between(c.random, 12, 22)
  glow(c, g.vx, (g.t + g.b) / 2, 70, core, 0.06)
  rect(c, g.vx - cw, 0, cw * 2, g.b + 8, mix(core, '#000000', 0.55))
  for (let y = 0; y < g.b + 8; y += 8) rect(c, g.vx - cw + 2, y, cw * 2 - 4, 5, core, 0.5 + c.random() * 0.5)
  rect(c, g.vx - cw * 0.3, 0, cw * 0.6, g.b + 8, '#ffffff', 0.35)
  const walk = between(c.random, g.t + 20, g.b - 20)
  rect(c, g.l, walk, g.r - g.l, 4, hull.side)
  for (let x = g.l; x < g.r; x += 10) rect(c, x, walk - 10, 1, 10, hull.side)
  rect(c, g.l, walk - 10, g.r - g.l, 1, hull.side)
  for (const x of [g.l * 0.4, W - (W - g.r) * 0.4]) {
    poly(c, [[x - 30, H], [x + 30, H], [x + 22, H - 34], [x - 22, H - 34]], hull.wall)
    rect(c, x - 18, H - 31, 36, 4, accent)
  }
  ceilingStrips(c, g, accent)
}

function transporter(c, hull, accent) {
  const g = room(c, hull, { width: [70, 110] })
  const [cy, rx] = [g.b - 6, (g.r - g.l) * 0.46]
  ellipse(c, g.vx, cy + 4, rx, 14, mix(hull.side, '#000000', 0.3))
  ellipse(c, g.vx, cy, rx, 13, mix(hull.back, '#ffffff', 0.15))
  ellipse(c, g.vx, g.t + 6, rx * 0.8, 8, mix(hull.ceiling, accent, 0.3))
  const beam = c.random() < 0.6
  for (const [dx, dy] of [[-0.6, -4], [0, -5], [0.6, -4], [-0.3, 4], [0.3, 4]]) {
    const [x, y] = [g.vx + dx * rx, cy + dy]
    ellipse(c, x, y, 11, 3.5, mix(accent, '#ffffff', 0.4))
    if (beam && c.random() < 0.7) {
      rect(c, x - 8, g.t + 10, 16, y - g.t - 10, mix(accent, '#ffffff', 0.6), 0.25)
      for (let i = 0; i < 20; i++) plot(c, between(c.random, x - 8, x + 8), between(c.random, g.t + 10, y), '#ffffff', 0.9)
    }
  }
  poly(c, [[20, H], [110, H], [100, H - 28], [30, H - 28]], hull.wall)
  rect(c, 36, H - 25, 58, 4, accent)
}

function shuttlebay(c, hull, accent) {
  const g = room(c, hull, { width: [95, 130], top: [20, 40], bottom: [110, 125] })
  rect(c, g.l, g.t, g.r - g.l, g.b - g.t, '#03060e')
  starsIn(c, g.l, g.t, g.r, g.b, 80)
  if (c.random() < 0.6) viewPlanet(c, g.l, g.t, g.r, g.b)
  rect(c, g.l, g.t, g.r - g.l, g.b - g.t, '#5fb0ff', 0.1)
  rect(c, g.l, g.t, g.r - g.l, 2, accent)
  for (const dx of [-60, -20, 20, 60]) line(c, g.vx + dx * 0.3, g.b, g.vx + dx * 2.5, H, 2, accent, 0.6)
  const shuttles = Math.floor(between(c.random, 1, 3))
  for (let i = 0; i < shuttles; i++) {
    const [x, y, s] = [between(c.random, 70, 250), between(c.random, 135, 160), between(c.random, 0.8, 1.3)]
    poly(c, [[x - 30 * s, y], [x + 24 * s, y], [x + 30 * s, y - 8 * s], [x + 14 * s, y - 18 * s], [x - 26 * s, y - 18 * s]], mix(hull.wall, '#d0d4d8', 0.6))
    poly(c, [[x + 14 * s, y - 18 * s], [x + 30 * s, y - 8 * s], [x + 20 * s, y - 8 * s], [x + 10 * s, y - 15 * s]], '#3a5a7a')
    rect(c, x - 26 * s, y - 6 * s, 50 * s, 2, accent)
  }
}

function lounge(c, hull, accent) {
  const g = room(c, hull, { width: [100, 140], top: [24, 44], bottom: [100, 118] })
  const panes = Math.floor(between(c.random, 3, 7))
  const paneW = (g.r - g.l) / panes
  const warp = c.random() < 0.5
  const [y0, y1] = [g.t + 6, g.b - 12]
  rect(c, g.l + 2, y0, g.r - g.l - 4, y1 - y0, '#03060e')
  if (warp) for (let i = 0; i < 40; i++) {
    const [x, y] = [between(c.random, g.l, g.r), between(c.random, y0, y1)]
    line(c, x, y, x + (x - g.vx) * 0.15, y + (y - (y0 + y1) / 2) * 0.15, 1, '#cfe2ee', 0.8)
  }
  else {
    starsIn(c, g.l, y0, g.r, y1, 70)
    if (c.random() < 0.6) viewPlanet(c, g.l, y0, g.r, y1)
  }
  for (let i = 0; i <= panes; i++) rect(c, g.l + i * paneW - 2, y0, 4, y1 - y0, hull.wall)
  const tables = Math.floor(between(c.random, 3, 7))
  for (let i = 0; i < tables; i++) {
    const [x, y] = [between(c.random, 30, 290), between(c.random, 130, 172)]
    const s = 0.6 + ((y - 120) / 60) * 0.8
    rect(c, x - 2 * s, y - 14 * s, 4 * s, 14 * s, hull.side)
    ellipse(c, x, y - 14 * s, 18 * s, 5 * s, mix(hull.back, '#ffffff', 0.2))
    for (const dx of [-24, 24]) rect(c, x + dx * s - 5 * s, y - 16 * s, 10 * s, 16 * s, mix(hull.wall, accent, 0.25))
  }
}

const CRATE_COLOURS = ['#8a7650', '#6a7a8a', '#7a5a40', '#5a6a5a', '#8a5a5a']

function cargo(c, hull, accent) {
  const g = room(c, hull, { width: [80, 125] })
  rect(c, 0, g.t + 6, W, 2, hull.side)
  const stacks = Math.floor(between(c.random, 4, 9))
  const spots = Array.from({ length: stacks }, () => ({ x: between(c.random, 10, 300), y: between(c.random, g.b + 4, 176) })).sort((a, b) => a.y - b.y)
  for (const { x, y } of spots) {
    const s = 14 + ((y - g.b) / (H - g.b)) * 26
    const colour = pick(c.random, CRATE_COLOURS)
    const height = Math.floor(between(c.random, 1, 4))
    for (let k = 0; k < height; k++) {
      const top = y - s * (k + 1)
      rect(c, x, top, s * 1.3, s - 1, colour)
      rect(c, x + s * 1.3 * 0.75, top, s * 1.3 * 0.25, s - 1, mix(colour, '#000000', 0.25))
      rect(c, x + 3, top + s * 0.4, s * 0.6, 2, c.random() < 0.5 ? accent : '#d8d0b0')
    }
  }
}

function sickbay(c, hull, accent) {
  const bright = { ...hull, back: mix(hull.back, '#ffffff', 0.35), wall: mix(hull.wall, '#ffffff', 0.25), side: mix(hull.side, '#ffffff', 0.2) }
  const g = room(c, bright, { width: [90, 130] })
  const beds = Math.floor(between(c.random, 2, 5))
  for (let i = 0; i < beds; i++) {
    const x = g.l + ((i + 0.5) / beds) * (g.r - g.l)
    rect(c, x - 14, g.t + 14, 28, 16, '#0c1418')
    for (let k = 0; k < 24; k += 2) plot(c, x - 12 + k, g.t + 22 + Math.sin(k + i) * 4, accent)
  }
  for (let i = 0; i < beds; i++) {
    const x = 40 + ((i + 0.5) / beds) * 240
    const y = between(c.random, 140, 170)
    const s = 0.7 + ((y - 130) / 50) * 0.6
    rect(c, x - 6 * s, y - 14 * s, 12 * s, 14 * s, hull.side)
    poly(c, [[x - 30 * s, y - 14 * s], [x + 30 * s, y - 14 * s], [x + 26 * s, y - 22 * s], [x - 26 * s, y - 22 * s]], mix(bright.back, '#ffffff', 0.4))
    rect(c, x - 30 * s, y - 14 * s, 60 * s, 2, accent)
  }
}

function jefferies(c, hull, accent) {
  const [vx, vy] = [160 + between(c.random, -30, 30), 90 + between(c.random, -15, 15)]
  rect(c, 0, 0, W, H, hull.ceiling)
  const octagon = (s) => [[-1, -0.42], [-0.42, -1], [0.42, -1], [1, -0.42], [1, 0.42], [0.42, 1], [-0.42, 1], [-1, 0.42]].map(([x, y]) => [vx + x * s * 1.6, vy + y * s])
  const rings = Math.floor(between(c.random, 5, 9))
  for (let k = 0; k < rings; k++) {
    const s = 120 * 0.72 ** k
    poly(c, octagon(s), k % 2 ? hull.wall : hull.side)
    poly(c, octagon(s * 0.9), mix(hull.ceiling, '#000000', k / rings / 2))
    if (k % 2 === 0) for (const [x, y] of octagon(s * 0.95)) glow(c, x, y, 3 * 0.8 ** k, accent, 0.3)
  }
  circle(c, vx, vy, 120 * 0.72 ** rings, '#05080a')
  for (let k = 0; k < 6; k++) {
    const y = vy + 100 * 0.75 ** k
    const half = 40 * 0.75 ** k
    rect(c, vx - half, y, half * 2, Math.max(1, 3 * 0.8 ** k), accent)
  }
}

function brig(c, hull, accent) {
  const g = room(c, hull, { width: [70, 110] })
  const field = pick(c.random, ['#5fb0ff', '#ff7a5f', '#9aff7a'])
  const cells = Math.floor(between(c.random, 2, 4))
  for (let i = 0; i < cells; i++) {
    const [x0, x1] = [g.l + (i / cells) * (g.r - g.l) + 4, g.l + ((i + 1) / cells) * (g.r - g.l) - 4]
    rect(c, x0, g.t + 10, x1 - x0, g.b - g.t - 10, mix(hull.back, '#000000', 0.45))
    rect(c, x0 + 4, g.b - 14, x1 - x0 - 8, 5, hull.side)
    rect(c, x0, g.t + 10, x1 - x0, g.b - g.t - 10, field, 0.22)
    rect(c, x0, g.t + 10, x1 - x0, 2, field)
    rect(c, x0, g.b - 2, x1 - x0, 2, field)
  }
  for (const side of [0, 1]) {
    const [a, b2] = side ? [W - (W - g.r) * 0.75, W - (W - g.r) * 0.25] : [g.l * 0.25, g.l * 0.75]
    const cell = side ? [[a, 30], [b2, 14], [b2, 166], [a, 150]] : [[a, 14], [b2, 30], [b2, 150], [a, 166]]
    poly(c, cell, mix(hull.wall, '#000000', 0.45))
    poly(c, cell, field, 0.2)
  }
  ceilingStrips(c, g, accent)
}

// Room names that suggest a scene (map names are often room names, e.g. "Main Engineering").
const SCENE_WORDS = [
  [/engineer|warp|reactor|eps|power|fusion|plasma/i, engineering],
  [/transporter/i, transporter],
  [/shuttle|hangar|docking|airlock|launch/i, shuttlebay],
  [/lounge|ten forward|observation|mess|promenade|quarters|habitat/i, lounge],
  [/cargo|storage|replicator|hold|supply|customs/i, cargo],
  [/sickbay|medical|biolab|infirmary|lab/i, sickbay],
  [/jefferies|tube|conduit|maintenance|shaft|crawl/i, jefferies],
  [/brig|security|detention|holding/i, brig],
  [/bridge|helm|command|control|astrometrics|sensor|computer|phaser|torpedo|tactical/i, bridge],
]
const SCENES = [corridor, bridge, engineering, transporter, shuttlebay, lounge, cargo, sickbay, jefferies, brig]
const sceneForName = (name) => SCENE_WORDS.find(([pattern]) => pattern.test(name ?? ''))?.[1] ?? null

function damage(c) {
  rect(c, 0, 0, W, H, '#000000', 0.45)
  if (c.random() < 0.6) {
    const [x, y, s] = [between(c.random, 30, 290), between(c.random, 20, 90), between(c.random, 18, 40)]
    const breach = Array.from({ length: 9 }, (_, i) => {
      const angle = (i / 9) * Math.PI * 2
      const r = s * between(c.random, 0.5, 1.1)
      return [x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.8]
    })
    poly(c, breach, '#03060e')
    for (let i = 0; i < 20; i++) {
      const [px, py] = [between(c.random, x - s, x + s), between(c.random, y - s, y + s)]
      if (inside(breach, px, py)) plot(c, px, py, '#ffffff', 0.8)
    }
  }
  for (let i = 0; i < 14; i++) {
    const [x, y, s] = [between(c.random, 0, W), between(c.random, 120, 178), between(c.random, 4, 12)]
    poly(c, [[x, y], [x + s, y - s * 0.4], [x + s * 1.2, y + 2], [x + s * 0.2, y + 3]], '#2a2e30')
  }
  for (let i = 0; i < 3; i++) glow(c, between(c.random, 20, 300), between(c.random, 20, 160), between(c.random, 4, 10), '#ffb347', 0.25)
  rect(c, 0, 0, W, H, '#ff2a1a', 0.08)
}

// A ship or station interior: the scene a name suggests, otherwise a random one.
function interior(c, name, { damaged = false } = {}) {
  const scene = sceneForName(name) ?? pick(c.random, SCENES)
  const hull = pick(c.random, HULLS)
  const alert = !damaged && c.random() < 0.2
  scene(c, hull, alert ? '#ff3b30' : pick(c.random, ACCENTS))
  if (damaged) damage(c)
  else if (alert) rect(c, 0, 0, W, H, '#ff2a1a', 0.14)
}

function stationRing(c, cx, cy, s) {
  for (const angle of [0, 1.05, 2.1]) line(c, cx - Math.cos(angle) * 50 * s, cy - Math.sin(angle) * 15 * s, cx + Math.cos(angle) * 50 * s, cy + Math.sin(angle) * 15 * s, 2, '#7d8890')
  ellipse(c, cx, cy, 54 * s, 17 * s, '#8a949c', 1, (x, y) => ((x + 0.5 - cx) / (48 * s)) ** 2 + ((y + 0.5 - cy) / (12 * s)) ** 2 > 1)
  rect(c, cx - 4 * s, cy - 34 * s, 8 * s, 68 * s, '#9aa4ac')
  circle(c, cx, cy, 13 * s, '#b4bec6')
  for (let i = 0; i < 10; i++) plot(c, cx + Math.cos(i * 0.63) * 51 * s, cy + Math.sin(i * 0.63) * 15.5 * s, '#ffd27a')
  glow(c, cx, cy - 34 * s, 4, '#ff5040', 0.3)
}

function stationSpindle(c, cx, cy, s) {
  rect(c, cx - 3 * s, cy - 50 * s, 6 * s, 100 * s, '#9aa4ac')
  for (const [dy, rx] of [[-30, 22], [0, 34], [26, 18]]) {
    ellipse(c, cx, cy + dy * s, rx * s, 6 * s, '#8a949c')
    ellipse(c, cx, cy + dy * s - 2 * s, rx * s * 0.8, 3 * s, '#b4bec6')
    for (let i = 0; i < 6; i++) plot(c, cx - rx * s * 0.8 + i * rx * s * 0.32, cy + dy * s + 2, '#ffd27a')
  }
  glow(c, cx, cy - 50 * s, 4, '#ff5040', 0.3)
}

function spaceBackdrop(c) {
  rect(c, 0, 0, W, H, '#03060e')
  if (c.random() < 0.5) nebula(c, [pick(c.random, PLANET_COLOURS), pick(c.random, PLANET_COLOURS)])
  stars(c, 160)
  if (c.random() < 0.75) {
    const r = between(c.random, 40, 130)
    planet(c, between(c.random, 0, W), H - r * between(c.random, 0.2, 0.8) + 40, r, pick(c.random, PLANET_COLOURS))
  }
}

function station(c) {
  spaceBackdrop(c)
  const [x, y, s] = [between(c.random, 70, 250), between(c.random, 60, 100), between(c.random, 0.7, 1.3)]
  if (c.random() < 0.5) stationRing(c, x, y, s)
  else stationSpindle(c, x, y, s)
  if (c.random() < 0.4) {
    const [sx, sy] = [between(c.random, 20, 300), between(c.random, 20, 160)]
    poly(c, [[sx, sy], [sx + 14, sy + 3], [sx, sy + 6]], '#b4bec6')
  }
}

function derelict(c) {
  spaceBackdrop(c)
  const [cx, cy, angle, length] = [between(c.random, 110, 210), between(c.random, 70, 110), between(c.random, -0.6, 0.6), between(c.random, 120, 200)]
  const points = []
  for (let i = 0; i <= 8; i++) points.push([(i / 8 - 0.5) * length, -between(c.random, 10, 26)])
  points.push([length / 2 + between(c.random, 4, 20), 0])
  for (let i = 8; i >= 0; i--) points.push([(i / 8 - 0.5) * length, between(c.random, 10, 24) * (i % 3 === 0 ? 0.4 : 1)])
  const hull = points.map(([x, y]) => [cx + x * Math.cos(angle) - y * Math.sin(angle), cy + x * Math.sin(angle) + y * Math.cos(angle)])
  poly(c, hull, '#5c6870')
  for (let i = 0; i < 9; i++) {
    const [x, y] = [cx + between(c.random, -length / 2, length / 2) * Math.cos(angle), cy + between(c.random, -length / 2, length / 2) * Math.sin(angle)]
    circle(c, x, y, between(c.random, 4, 11), '#1c2023', 0.75, (px, py) => inside(hull, px + 0.5, py + 0.5))
  }
  for (let i = 0; i < 16; i++) {
    const [x, y, s] = [between(c.random, 0, W), between(c.random, 0, H), between(c.random, 2, 7)]
    poly(c, [[x, y], [x + s, y + s * 0.4], [x + s * 0.3, y + s]], '#4a545a')
  }
  const [fx, fy] = hull[Math.floor(c.random() * hull.length)]
  glow(c, fx, fy, between(c.random, 6, 14), '#ff7a2a', 0.2)
}

// ---- Entry point ----

// location: a Generate Map location id. palette: the biome's card colours (ignored in space). name: the map name, which
// picks a matching ship or station room when it names one. skies: the sky ids the weather allows (null = any of the
// biome's). Returns RGBA bytes, rows top to bottom.
export function drawEpisodeCard(location, palette, random = Math.random, name = '', skies = null) {
  const c = { data: new Uint8Array(W * H * 4).fill(255), random }
  const namedRoom = Boolean(sceneForName(name))
  if (location === 'starshipDeck') interior(c, name)
  else if (location === 'spaceStation') {
    if (namedRoom || random() < 0.5) interior(c, name)
    else station(c)
  } else if (location === 'derelict') {
    if (random() < 0.5) interior(c, name, { damaged: true })
    else derelict(c)
  }
  else if (location === 'cave' && random() < 0.5) caveInterior(c, palette)
  else {
    const suited = skies ? palette.skies.filter((sky) => skies.includes(sky)) : []
    const skyId = pick(random, suited.length ? suited : palette.skies)
    const horizon = between(random, 92, 118)
    drawSky(c, skyId, horizon)
    const wild = location === 'wilderness'
    const ground = drawTerrain(c, palette, horizon, {
      mountainChance: wild ? 0.6 : 0.4,
      volcanoChance: palette.extra === 'lava' ? (wild ? 0.7 : 0.35) : 0,
    })
    const base = horizon + 24
    if (location === 'colony') colony(c, palette, skyId, base)
    else if (location === 'outpost') outpost(c, palette, skyId, base)
    else if (location === 'city') city(c, palette, skyId, base + 10)
    else if (location === 'surfaceSite') ruins(c, palette, skyId, base)
    if (location === 'cave') caveMouth(c, palette)
    else plants(c, palette, ground, wild ? Math.floor(between(random, 10, 22)) : Math.floor(between(random, 2, 7)), location === 'city' ? base + 12 : 0)
  }
  return c.data
}
