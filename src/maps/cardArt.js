// Draws a random episode card picture (Generate Card): a scene built from the map's location and, on the ground, its
// biome's card colours (biomes.json). Scenes are laid out on a 320 x 180 grid (design units) and rendered CARD_SCALE
// times larger with smooth edges, top-lit shading on every shape, light that blooms (glows, lamps, screens, stars) and a
// final grade (contrast, vignette, a faint paint texture). Pure pixel code (no DOM), so the placeholder script can use
// it too. Prototype placeholder art, not from the books.
const W = 320
const H = 180
export const CARD_SCALE = 3
export const CARD_WIDTH = W * CARD_SCALE
export const CARD_HEIGHT = H * CARD_SCALE
const S = CARD_SCALE
const OW = CARD_WIDTH
const OH = CARD_HEIGHT

const RGB = new Map()
function hex(value) {
  let rgb = RGB.get(value)
  if (!rgb) {
    rgb = [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)]
    RGB.set(value, rgb)
  }
  return rgb
}
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
// Coordinates are design units; every primitive rasterises at CARD_SCALE with anti-aliased edges. The canvas c holds
// rgb (the picture) and light (what blooms), both float RGB at full size.

function createCanvas(random) {
  return { rgb: new Float32Array(OW * OH * 3), light: new Float32Array(OW * OH * 3), cover: new Float32Array(OW + 2), random, emitting: 0, sky: null }
}

// Shapes are lit from above: a little lighter at the top, darker at the bottom (t: 0 top .. 1 bottom).
const shadeAt = (t) => 1.08 - 0.2 * Math.min(1, Math.max(0, t))
// Shapes shorter than this (design units) are drawn flat.
const SHADE_MIN = 4

function blend(c, p, rgb, a, shade) {
  const i = p * 3
  const col = c.rgb
  col[i] += (rgb[0] * shade - col[i]) * a
  col[i + 1] += (rgb[1] * shade - col[i + 1]) * a
  col[i + 2] += (rgb[2] * shade - col[i + 2]) * a
  if (c.emitting) {
    const e = a * c.emitting
    c.light[i] += rgb[0] * e
    c.light[i + 1] += rgb[1] * e
    c.light[i + 2] += rgb[2] * e
  } else if (a > 0) {
    // Whatever is drawn over a light hides it, so it no longer blooms there.
    const keep = 1 - a
    c.light[i] *= keep
    c.light[i + 1] *= keep
    c.light[i + 2] *= keep
  }
}

// Draws what fn draws as light (lamps, screens, flames, stars): it blooms, and isn't shaded. strength scales the bloom.
function light(c, fn, strength = 1) {
  const before = c.emitting
  c.emitting = strength
  const result = fn()
  c.emitting = before
  return result
}

// A small round point (stars, sparks), radius in design units.
function dot(c, x, y, colour, alpha = 1, radius = 0.45) {
  ellipse(c, x, y, radius, radius, colour, alpha)
}

function rect(c, x, y, w, h, colour, alpha = 1) {
  const [x0, x1, y0, y1] = [x * S, (x + w) * S, y * S, (y + h) * S]
  if (x1 <= x0 || y1 <= y0) return
  const rgb = hex(colour)
  const shaded = !c.emitting && h >= SHADE_MIN
  const [px0, px1] = [Math.max(0, Math.floor(x0)), Math.min(OW, Math.ceil(x1))]
  for (let py = Math.max(0, Math.floor(y0)); py < Math.min(OH, Math.ceil(y1)); py++) {
    const cy = Math.min(py + 1, y1) - Math.max(py, y0)
    const shade = shaded ? shadeAt((py + 0.5 - y0) / (y1 - y0)) : 1
    for (let px = px0; px < px1; px++) blend(c, py * OW + px, rgb, alpha * cy * (Math.min(px + 1, x1) - Math.max(px, x0)), shade)
  }
}

function gradient(c, top, bottom, y0 = 0, y1 = H) {
  const [a, b] = [hex(top), hex(bottom)]
  const [o0, o1] = [y0 * S, y1 * S]
  for (let py = Math.max(0, Math.floor(o0)); py < Math.min(OH, Math.ceil(o1)); py++) {
    const t = Math.min(1, Math.max(0, (py + 0.5 - o0) / Math.max(1, o1 - o0)))
    const rgb = [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t)
    const cover = Math.min(py + 1, o1) - Math.max(py, o0)
    for (let px = 0; px < OW; px++) blend(c, py * OW + px, rgb, cover, 1)
  }
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

// Adds weight to cover[] for the part of each pixel the span a..b covers (lo..hi: the pixels being filled).
function addSpan(cover, a, b, weight, lo, hi) {
  a = Math.max(a, lo)
  b = Math.min(b, hi)
  if (b <= a) return
  const [ia, ib] = [Math.floor(a), Math.floor(b)]
  if (ia === ib) {
    cover[ia] += (b - a) * weight
    return
  }
  cover[ia] += (ia + 1 - a) * weight
  for (let k = ia + 1; k < ib; k++) cover[k] += weight
  cover[ib] += (b - ib) * weight
}

// Scanline fill (even-odd, like inside()) with SUBROWS sub-rows per pixel and exact coverage across.
const SUBROWS = 4
function poly(c, points, colour, alpha = 1) {
  const pts = points.map(([x, y]) => [x * S, y * S])
  let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const [x, y] of pts) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  const [x0, x1] = [Math.max(0, Math.floor(minX)), Math.min(OW - 1, Math.ceil(maxX))]
  const [y0, y1] = [Math.max(0, Math.floor(minY)), Math.min(OH - 1, Math.ceil(maxY))]
  if (x0 > x1 || y0 > y1) return
  const rgb = hex(colour)
  const shaded = !c.emitting && maxY - minY >= SHADE_MIN * S
  const cover = c.cover
  const xs = []
  for (let py = y0; py <= y1; py++) {
    cover.fill(0, x0, x1 + 2)
    for (let s = 0; s < SUBROWS; s++) {
      const sy = py + (s + 0.5) / SUBROWS
      xs.length = 0
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]
        const [xj, yj] = pts[j]
        if (yi > sy !== yj > sy) xs.push(xi + ((sy - yi) * (xj - xi)) / (yj - yi))
      }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) addSpan(cover, xs[k], xs[k + 1], 1 / SUBROWS, x0, x1 + 1)
    }
    const shade = shaded ? shadeAt((py + 0.5 - minY) / (maxY - minY)) : 1
    for (let px = x0; px <= x1; px++) if (cover[px] > 0) blend(c, py * OW + px, rgb, alpha * Math.min(1, cover[px]), shade)
  }
}

// keep(x, y): an extra mask in design units, called with a pixel's corner (its centre is x + 0.5, y + 0.5).
function ellipse(c, cx, cy, rx, ry, colour, alpha = 1, keep = null) {
  if (rx <= 0 || ry <= 0) return
  const [ox, oy, orx, ory] = [cx * S, cy * S, rx * S, ry * S]
  const rgb = hex(colour)
  const shaded = !c.emitting && ry * 2 >= SHADE_MIN
  const edge = Math.min(orx, ory)
  const [x0, x1] = [Math.max(0, Math.floor(ox - orx)), Math.min(OW - 1, Math.ceil(ox + orx))]
  for (let py = Math.max(0, Math.floor(oy - ory)); py <= Math.min(OH - 1, Math.ceil(oy + ory)); py++) {
    const dy = (py + 0.5 - oy) / ory
    const shade = shaded ? shadeAt((py + 0.5 - oy + ory) / (2 * ory)) : 1
    for (let px = x0; px <= x1; px++) {
      const dx = (px + 0.5 - ox) / orx
      const a = Math.min(1, (1 - Math.sqrt(dx * dx + dy * dy)) * edge + 0.5)
      if (a <= 0) continue
      if (keep && !keep((px + 0.5) / S - 0.5, (py + 0.5) / S - 0.5)) continue
      blend(c, py * OW + px, rgb, alpha * a, shade)
    }
  }
}
const circle = (c, cx, cy, r, colour, alpha, keep) => ellipse(c, cx, cy, r, r, colour, alpha, keep)

// A soft-edged disc, strongest (peak) in the middle and fading to nothing at r.
function softDisc(c, cx, cy, r, colour, peak, falloff) {
  const [ox, oy, or] = [cx * S, cy * S, r * S]
  const rgb = hex(colour)
  for (let py = Math.max(0, Math.floor(oy - or)); py <= Math.min(OH - 1, Math.ceil(oy + or)); py++) {
    for (let px = Math.max(0, Math.floor(ox - or)); px <= Math.min(OW - 1, Math.ceil(ox + or)); px++) {
      const d = Math.hypot(px + 0.5 - ox, py + 0.5 - oy) / or
      if (d < 1) blend(c, py * OW + px, rgb, peak * (1 - d) ** falloff, 1)
    }
  }
}

// A soft round light. It blooms.
function glow(c, cx, cy, r, colour, strength = 0.12) {
  light(c, () => softDisc(c, cx, cy, r, colour, 1 - (1 - strength) ** 4, 1.6))
}

// A soft puff of smoke, steam or dust.
const puff = (c, cx, cy, r, colour, alpha) => softDisc(c, cx, cy, r, colour, alpha, 0.8)

function line(c, x0, y0, x1, y1, width, colour, alpha = 1) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1
  const nx = (-(y1 - y0) / len) * (width / 2)
  const ny = ((x1 - x0) / len) * (width / 2)
  poly(c, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], colour, alpha)
}

// Fills everything below the curve y = top(x): a lit rim along the edge, darkening with depth below it.
function band(c, top, colour) {
  const rgb = hex(colour)
  const rim = rgb.map((v) => Math.min(255, v * 1.06 + 4))
  for (let px = 0; px < OW; px++) {
    const ty = top((px + 0.5) / S) * S
    for (let py = Math.max(0, Math.floor(ty)); py < OH; py++) {
      const depth = (py + 0.5 - ty) / S
      const shade = c.emitting ? 1 : 1 - 0.18 * Math.min(1, depth / 50)
      blend(c, py * OW + px, depth < 0.6 ? rim : rgb, Math.min(1, py + 1 - ty), shade)
    }
  }
}

function stars(c, count, maxY = H) {
  light(
    c,
    () => {
      for (let i = 0; i < count; i++) {
        const [x, y, b] = [c.random() * W, c.random() * maxY, c.random()]
        dot(c, x, y, '#ffffff', 0.35 + b * 0.65, b > 0.92 ? 0.75 : 0.4)
      }
    },
    0.6,
  )
}

// A soft haze across the picture between y0 and y1, thickest at peak (0..1 of the way down).
function haze(c, y0, y1, colour, strength, peak = 0.5) {
  const rgb = hex(colour)
  for (let py = Math.max(0, Math.floor(y0 * S)); py < Math.min(OH, Math.ceil(y1 * S)); py++) {
    const t = (py + 0.5 - y0 * S) / ((y1 - y0) * S)
    const a = strength * (t < peak ? t / peak : (1 - t) / (1 - peak)) ** 1.3
    if (a > 0) for (let px = 0; px < OW; px++) blend(c, py * OW + px, rgb, a, 1)
  }
}

// A random rolling curve.
function hills(random, base, amp) {
  const [f1, f2, p1, p2] = [between(random, 0.008, 0.03), between(random, 0.03, 0.07), random() * 6, random() * 6]
  return (x) => base + Math.sin(x * f1 + p1) * amp + Math.sin(x * f2 + p2) * amp * 0.35
}

// A shaded sphere lit from a random side.
function planet(c, cx, cy, r, colour) {
  glow(c, cx, cy, r * 1.3, mix(colour, '#ffffff', 0.5), 0.07)
  circle(c, cx, cy, r, colour)
  for (let i = 0; i < 4; i++) {
    const y = cy - r + c.random() * r * 2
    const h = between(c.random, 2, Math.max(2, r * 0.15))
    circle(c, cx, cy, r, mix(colour, '#ffffff', 0.2), 0.35, (_, py) => py >= y && py < y + h)
  }
  const side = c.random() < 0.5 ? -1 : 1
  const onPlanet = (x, y) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r
  // A soft terminator: night side darkening in steps, then a thin lit rim on the day side.
  for (let k = 0; k < 4; k++) circle(c, cx + side * r * (0.2 + k * 0.1), cy + r * 0.15, r, '#000000', 0.2, onPlanet)
  const rim = mix(colour, '#ffffff', 0.65)
  light(c, () => circle(c, cx, cy, r, rim, 0.55, (x, y) => onPlanet(x, y) && (x + 0.5 - cx) * side < 0 && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r * 0.9), 0.4)
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
  alienViolet: { top: '#2a1450', bottom: '#c070c0', sun: '#ffd8ff' },
  alienTeal: { top: '#04161e', bottom: '#2a7a72', stars: true, moon: '#c0fff0' },
  toxic: { top: '#3e4a14', bottom: '#b8c058', sun: '#f0ff90' },
  rust: { top: '#5a2418', bottom: '#d89868', sun: '#fff0d0' },
}
const DARK_SKIES = new Set(['night', 'airless', 'volcanic', 'dusk', 'alienTeal'])
const PLANET_COLOURS = ['#3d6ea8', '#a85a3a', '#5a8a5a', '#8a6aa8', '#c8a060', '#4a9aa8', '#a83a4a', '#7a7a8a']

function drawSky(c, skyId, horizon) {
  const sky = SKIES[skyId] ?? SKIES.day
  c.sky = sky
  gradient(c, sky.top, sky.bottom, 0, horizon + 10)
  if (sky.stars) stars(c, 140, horizon)
  if (sky.sun) {
    const [x, y] = [between(c.random, 30, 290), sky.low ? horizon - between(c.random, 4, 18) : between(c.random, 18, 50)]
    glow(c, x, y, 70, sky.sun, 0.08)
    glow(c, x, y, 26, sky.sun, 0.2)
    light(c, () => circle(c, x, y, sky.low ? 16 : 10, sky.sun), 0.8)
  }
  if (sky.moon) {
    const [x, y, r] = [between(c.random, 30, 290), between(c.random, 18, 50), between(c.random, 7, 16)]
    glow(c, x, y, r * 2.2, sky.moon, 0.05)
    light(c, () => circle(c, x, y, r, sky.moon), 0.35)
    circle(c, x + r * 0.4, y - r * 0.2, r, sky.top, 0.85, (px, py) => (px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2 <= r * r)
  }
  if (sky.glowColour) glow(c, between(c.random, 60, 260), horizon, 70, sky.glowColour, 0.07)
  // Alien skies: sometimes a planet or moon hangs overhead.
  if (c.random() < 0.35) planet(c, between(c.random, 20, 300), between(c.random, 10, 45), between(c.random, 6, 22), mix(pick(c.random, PLANET_COLOURS), sky.top, 0.35))
}

function mountains(c, horizon, colour) {
  const peaks = []
  for (let x = -20; x <= W + 20; x += between(c.random, 25, 60)) peaks.push([x, horizon - between(c.random, 12, 48)])
  poly(c, [[-20, horizon + 6], ...peaks, [W + 20, horizon + 6]], colour)
  // Light from the left: slopes falling to the right are in shade, with a pale ridge line on the sunny ones.
  for (let i = 0; i + 1 < peaks.length; i++) {
    const [[x0, y0], [x1, y1]] = [peaks[i], peaks[i + 1]]
    if (y1 > y0) poly(c, [[x0, y0], [x1, y1], [x1, horizon + 6], [x0 + (x1 - x0) * 0.3, horizon + 6]], '#000000', 0.16)
    else line(c, x0, y0, x1, y1, 0.8, mix(colour, '#ffffff', 0.3), 0.6)
  }
}

function volcano(c, horizon, palette) {
  const [x, h, w] = [between(c.random, 60, 260), between(c.random, 50, 80), between(c.random, 80, 130)]
  poly(c, [[x - w, horizon + 4], [x - 18, horizon - h], [x + 18, horizon - h], [x + w, horizon + 4]], palette.rock)
  light(c, () => poly(c, [[x - 18, horizon - h], [x + 18, horizon - h], [x + 12, horizon - h + 6], [x - 12, horizon - h + 6]], '#ff6a1a'))
  glow(c, x, horizon - h, 22, '#ff6a1a', 0.12)
}

// Returns the near-ground curve so structures and plants can stand on it.
function drawTerrain(c, palette, horizon, { mountainChance = 0.45, volcanoChance = 0 } = {}) {
  const [far, middle, near] = palette.ground
  const air = c.sky?.bottom ?? SKIES.day.bottom
  if (c.random() < mountainChance) {
    mountains(c, horizon, mix(palette.rock, air, 0.45))
    haze(c, horizon - 50, horizon + 6, air, 0.35, 0.85)
  }
  if (c.random() < volcanoChance) volcano(c, horizon, palette)
  band(c, hills(c.random, horizon - 6, between(c.random, 3, 10)), mix(far, air, 0.2))
  // Distance haze where the far ground meets the sky.
  haze(c, horizon - 16, horizon + 14, air, 0.4, 0.45)
  // A sea fills the middle distance, so the near ground reads as the shore in front of it.
  if (palette.extra === 'sea') drawSea(c, horizon + 2)
  else band(c, hills(c.random, horizon + 8, between(c.random, 2, 7)), middle)
  const ground = hills(c.random, horizon + 30, between(c.random, 2, 6))
  band(c, ground, near)
  if (palette.extra === 'water') drawWater(c, horizon + between(c.random, 26, 44))
  if (palette.extra === 'acid') drawWater(c, horizon + between(c.random, 26, 44), ACID)
  if (palette.extra === 'sulphur') drawPools(c, horizon)
  if (palette.extra === 'lava') drawRiver(c, horizon, '#ff6a1a', '#ffa040')
  if (palette.extra === 'crevasse') drawCrevasse(c, horizon + between(c.random, 30, 60))
  return ground
}

const SWAMP_WATER = { water: '#34433e', ripple: '#5a6b62', reed: '#6a7a3a' }
const ACID = { water: '#5e8a1c', ripple: '#a8d040', reed: '#4a5a18' }

function drawWater(c, top, colours = SWAMP_WATER) {
  band(c, () => top, colours.water)
  for (let i = 0; i < 30; i++) rect(c, c.random() * W, top + 2 + c.random() * (H - top), between(c.random, 12, 40), 1, colours.ripple, 0.7)
  for (let i = 0; i < 36; i++) {
    const x = c.random() * W
    line(c, x, top + between(c.random, 2, 30), x + 2, top - between(c.random, 6, 16), 1.4, colours.reed)
  }
}

function drawSea(c, top) {
  band(c, () => top, '#2e6a8a')
  for (let i = 0; i < 40; i++) rect(c, c.random() * W, top + 2 + c.random() * 30, between(c.random, 6, 26), 1, '#8ac8e0', 0.6)
}

// Hot springs: orange-rimmed pools with turquoise centres and a haze of steam.
function drawPools(c, horizon) {
  for (let i = Math.floor(between(c.random, 3, 7)); i > 0; i--) {
    const [x, y, r] = [between(c.random, 10, 310), between(c.random, horizon + 34, H - 8), between(c.random, 10, 26)]
    ellipse(c, x, y, r, r * 0.3, '#d8901c')
    ellipse(c, x, y, r * 0.6, r * 0.18, '#40a8a8')
    glow(c, x, y - 8, r * 0.8, '#ffffff', 0.05)
  }
}

function drawRiver(c, horizon, colour, light) {
  let x = between(c.random, 60, 260)
  for (let y = horizon + 2; y < H; y += 4) {
    const next = x + (c.random() - 0.5) * 14
    const width = 2 + ((y - horizon) / (H - horizon)) * 14
    light(c, () => line(c, x, y, next, y + 4, width, colour), 0.5)
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
  } else if (kind === 'jungleTree') {
    rect(c, x - size * 0.08, y - size * 1.3, size * 0.16, size * 1.3, '#3a2a1c')
    ellipse(c, x, y - size * 1.4, size * 0.7, size * 0.38, colour)
    ellipse(c, x - size * 0.3, y - size * 1.2, size * 0.45, size * 0.28, mix(colour, '#000000', 0.25))
    ellipse(c, x + size * 0.35, y - size * 1.25, size * 0.4, size * 0.25, mix(colour, '#000000', 0.15))
    line(c, x + size * 0.2, y - size * 1.2, x + size * 0.25, y - size * 0.4, 1, mix(colour, '#000000', 0.3))
  } else if (kind === 'acacia') {
    line(c, x, y, x - size * 0.1, y - size * 0.9, Math.max(1, size * 0.08), '#4a3424')
    line(c, x - size * 0.05, y - size * 0.5, x + size * 0.3, y - size * 0.9, Math.max(1, size * 0.06), '#4a3424')
    ellipse(c, x + size * 0.05, y - size * 0.95, size * 0.75, size * 0.14, colour)
    ellipse(c, x + size * 0.05, y - size * 0.9, size * 0.6, size * 0.08, mix(colour, '#000000', 0.25))
  } else if (kind === 'shrub') {
    ellipse(c, x, y - size * 0.15, size * 0.4, size * 0.2, colour)
    ellipse(c, x + size * 0.15, y - size * 0.1, size * 0.25, size * 0.14, mix(colour, '#000000', 0.2))
  } else if (kind === 'palm') {
    const [tx, ty] = [x + size * 0.3, y - size * 1.3]
    line(c, x, y, tx, ty, Math.max(1, size * 0.08), '#6a5034')
    for (const [dx, dy] of [[-0.6, 0.3], [-0.4, -0.05], [0, -0.15], [0.4, -0.05], [0.6, 0.3]]) {
      line(c, tx, ty, tx + dx * size, ty + dy * size, Math.max(1, size * 0.07), colour)
    }
  } else if (kind === 'crystal') {
    for (const [dx, h, w] of [[-0.25, 0.7, 0.12], [0, 1.1, 0.16], [0.22, 0.8, 0.12]]) {
      const cx = x + dx * size
      poly(c, [[cx - w * size, y], [cx, y - h * size], [cx + w * size, y]], colour)
      poly(c, [[cx, y], [cx, y - h * size], [cx + w * size, y]], mix(colour, '#000000', 0.3))
    }
    glow(c, x, y - size * 0.5, size * 0.6, colour, 0.06)
  } else if (kind === 'mushroom') {
    rect(c, x - size * 0.07, y - size * 0.9, size * 0.14, size * 0.9, '#d8ccb8')
    ellipse(c, x, y - size * 0.9, size * 0.5, size * 0.26, colour, 1, (px, py) => py <= y - size * 0.86)
    for (let i = 0; i < 3; i++) circle(c, x + (i - 1) * size * 0.22, y - size * 1.0, Math.max(1, size * 0.05), mix(colour, '#ffffff', 0.6))
  } else if (kind === 'bulb') {
    line(c, x, y, x + size * 0.1, y - size * 0.7, Math.max(1, size * 0.05), mix(colour, '#000000', 0.4))
    circle(c, x + size * 0.1, y - size * 0.8, size * 0.2, colour)
    circle(c, x + size * 0.05, y - size * 0.85, size * 0.07, mix(colour, '#ffffff', 0.5))
  } else if (kind === 'glowTree') {
    rect(c, x - size * 0.07, y - size * 0.9, size * 0.14, size * 0.9, '#1e1a2a')
    glow(c, x, y - size * 1.0, size * 0.9, colour, 0.08)
    circle(c, x, y - size * 1.0, size * 0.42, colour)
    circle(c, x - size * 0.12, y - size * 1.08, size * 0.18, mix(colour, '#ffffff', 0.5))
  } else if (kind === 'geyser') {
    ellipse(c, x, y, size * 0.4, size * 0.1, '#c8a050')
    for (let i = 0; i < 5; i++) circle(c, x + (c.random() - 0.5) * size * 0.2, y - size * (0.3 + i * 0.3), size * (0.1 + i * 0.05), colour, 0.35)
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
const lit = (c, skyId, x, y, w = 4, h = 3) => isDark(skyId) && c.random() < 0.8 && light(c, () => rect(c, x, y, w, h, '#ffd27a'), 0.8)

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
        for (let wx = x + 4; wx < x + w - 6; wx += 6) {
          if (c.random() < chance) light(c, () => rect(c, wx, wy, 3, 3, night ? '#ffd27a' : '#cfe2ee', night ? 0.9 : 0.45), night ? 0.5 : 0)
        }
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
    glow(c, x, y - h / 2, h * 0.7, colour, 0.04)
    light(c, () => poly(c, [[x - w, y], [x, y - h], [x + w, y]], colour, 0.85), 0.35)
    poly(c, [[x, y], [x, y - h], [x + w, y]], '#000000', 0.25)
    light(c, () => line(c, x - w * 0.35, y - h * 0.3, x - w * 0.05, y - h * 0.9, 0.6, '#ffffff', 0.5), 0.4)
  }
  stalactites(c, mix(rock, '#000000', 0.45))
}

function stalactites(c, colour) {
  for (let x = 0; x < W; x += between(c.random, 14, 28)) poly(c, [[x, 0], [x + 18, 0], [x + 9, between(c.random, 12, 46)]], colour)
}

function caveMouth(c, palette) {
  const rock = mix(palette.rock, '#000000', 0.5)
  const [cx, cy, rx, ry] = [between(c.random, 110, 210), between(c.random, 105, 130), between(c.random, 80, 125), between(c.random, 55, 85)]
  // Rock everywhere outside the mouth's ellipse, with a smooth edge and a lighter lip just round it.
  const [dark, lip] = [hex('#000000'), hex(mix(rock, '#ffffff', 0.18))]
  const base = hex(rock)
  for (let py = 0; py < OH; py++) {
    const t = py / OH / 2
    const colour = base.map((v, k) => v + (dark[k] - v) * t)
    const dy = (py + 0.5 - cy * S) / (ry * S)
    for (let px = 0; px < OW; px++) {
      const dx = (px + 0.5 - cx * S) / (rx * S)
      const outside = (Math.sqrt(dx * dx + dy * dy) - 1) * Math.min(rx, ry) * S
      if (outside <= -0.5) continue
      blend(c, py * OW + px, outside < 2.5 * S ? lip : colour, Math.min(1, outside + 0.5), 1)
    }
  }
  stalactites(c, mix(rock, '#000000', 0.3))
  for (let i = 0; i < 7; i++) {
    const x = c.random() * W
    poly(c, [[x - 10, H], [x + 10, H], [x, H - between(c.random, 10, 30)]], rock)
  }
}

function farm(c, palette, skyId, base) {
  const crop = mix(palette.plantColour, '#c8b040', 0.3)
  for (let y = base + 4, i = 0; y < H; y += 3 + i++) rect(c, 0, y, W, 1 + i * 0.4, i % 2 ? crop : mix(crop, '#000000', 0.3), 0.85)
  const [bx, bw, bh] = [between(c.random, 30, 200), between(c.random, 44, 64), between(c.random, 24, 32)]
  rect(c, bx, base - bh, bw, bh, '#8a3a2a')
  poly(c, [[bx - 4, base - bh], [bx + bw / 2, base - bh - 18], [bx + bw + 4, base - bh]], '#5a2a20')
  rect(c, bx + bw / 2 - 7, base - 16, 14, 16, '#d8d0c0')
  line(c, bx + bw / 2 - 7, base - 16, bx + bw / 2 + 7, base, 1, '#8a3a2a')
  line(c, bx + bw / 2 + 7, base - 16, bx + bw / 2 - 7, base, 1, '#8a3a2a')
  const sx = bx + bw + between(c.random, 6, 14)
  rect(c, sx, base - 56, 14, 56, '#b8bcc0')
  rect(c, sx + 10, base - 56, 4, 56, '#8a8f94')
  circle(c, sx + 7, base - 56, 7, '#9aa0a6', 1, (_, y) => y <= base - 56)
  const hx = bx > 160 ? between(c.random, 20, 80) : between(c.random, 230, 280)
  rect(c, hx, base - 18, 30, 18, palette.building)
  poly(c, [[hx - 3, base - 18], [hx + 15, base - 30], [hx + 33, base - 18]], mix(palette.building, '#000000', 0.35))
  lit(c, skyId, hx + 5, base - 12)
  lit(c, skyId, hx + 20, base - 12)
}

function miningSite(c, palette, skyId, base) {
  const spoil = mix(palette.rock, '#000000', 0.15)
  for (let i = Math.floor(between(c.random, 2, 4)); i > 0; i--) {
    const [x, w, h] = [between(c.random, 0, W), between(c.random, 40, 90), between(c.random, 16, 36)]
    poly(c, [[x - w / 2, base + 6], [x, base + 6 - h], [x + w / 2, base + 6]], spoil)
    poly(c, [[x, base + 6], [x, base + 6 - h], [x + w / 2, base + 6]], mix(spoil, '#000000', 0.25))
  }
  const x = between(c.random, 60, 260)
  const top = base - between(c.random, 60, 85)
  for (const side of [-1, 1]) line(c, x + side * 16, base, x, top, 2, '#c89a30')
  for (let y = base - 12; y > top + 8; y -= 12) line(c, x - (16 * (y - top)) / (base - top), y, x + (16 * (y - top)) / (base - top), y, 1, '#9a7424')
  if (isDark(skyId)) glow(c, x, top, 6, '#ff3b30', 0.35)
  const hx = x > 160 ? between(c.random, 20, 90) : between(c.random, 220, 290)
  rect(c, hx, base - 16, 28, 16, palette.building)
  lit(c, skyId, hx + 4, base - 11)
  line(c, hx + 28, base - 12, x - 8, base - 30, 2, '#5a6066')
  for (let i = 0; i < 3; i++) {
    const cx = between(c.random, 10, 300)
    rect(c, cx, base + 6, 14, 7, '#40454a')
    rect(c, cx + 1, base + 4, 12, 3, '#8a7058')
  }
}

function landingField(c, palette, skyId, base) {
  const cx = between(c.random, 110, 210)
  ellipse(c, cx, base + 16, 130, 16, '#4a5056')
  ellipse(c, cx, base + 16, 60, 8, '#e8c040')
  ellipse(c, cx, base + 16, 56, 6.5, '#4a5056')
  const body = [[cx - 46, base + 14], [cx + 34, base + 14], [cx + 50, base + 6], [cx + 36, base - 6], [cx - 34, base - 9], [cx - 50, base]]
  poly(c, body, '#d0d6da')
  poly(c, [[cx - 50, base], [cx - 34, base - 9], [cx - 20, base - 9], [cx - 30, base + 2]], '#a0a8ae')
  rect(c, cx + 10, base - 4, 22, 3, '#4a8ac0')
  for (const side of [-1, 1]) rect(c, cx - 30, base + (side < 0 ? -14 : 12), 50, 4, '#80888e')
  if (isDark(skyId)) for (let i = 0; i < 8; i++) glow(c, cx - 120 + i * 34, base + 16 + Math.sin(i) * 6, 3, '#ffd27a', 0.4)
  const tx = cx > 160 ? between(c.random, 20, 60) : between(c.random, 260, 300)
  rect(c, tx - 5, base - 64, 10, 64, mix(palette.building, '#7d8890', 0.5))
  rect(c, tx - 11, base - 72, 22, 10, '#4a8ac0')
  if (isDark(skyId)) glow(c, tx, base - 74, 5, '#ff3b30', 0.35)
  for (let i = 0; i < 2; i++) {
    const fx = tx + (cx > 160 ? 20 : -40) + i * 18
    rect(c, fx, base - 18, 14, 18, '#d8d0b8')
    rect(c, fx, base - 12, 14, 2, '#c04030')
  }
}

function fieldCamp(c, palette, skyId, base) {
  const fire = between(c.random, 120, 200)
  for (let i = Math.floor(between(c.random, 3, 6)); i > 0; i--) {
    const [x, y, w, h] = [between(c.random, 20, 300), base + between(c.random, 0, 30), between(c.random, 14, 24), between(c.random, 14, 22)]
    poly(c, [[x - w, y], [x, y - h], [x + w, y]], '#6a7a4a')
    poly(c, [[x, y], [x, y - h], [x + w, y]], '#4e5c36')
    poly(c, [[x - 3, y], [x, y - h * 0.5], [x + 3, y]], '#2a2a20')
  }
  const fy = base + 22
  glow(c, fire, fy - 6, 30, '#ff8a2a', isDark(skyId) ? 0.12 : 0.05)
  light(c, () => {
    poly(c, [[fire - 6, fy], [fire, fy - 14], [fire + 6, fy]], '#ff8a2a')
    poly(c, [[fire - 3, fy], [fire, fy - 8], [fire + 3, fy]], '#ffd27a')
  })
  const mx = fire > 160 ? between(c.random, 30, 90) : between(c.random, 230, 290)
  line(c, mx, base + 4, mx, base - 70, 2, '#b8c0c6')
  rect(c, mx - 8, base - 72, 16, 2, '#d0d6da')
  glow(c, mx, base - 74, 4, '#5fd0ff', 0.4)
}

function crashSite(c, palette, skyId, base) {
  const [cx, cy, angle] = [between(c.random, 100, 220), base + between(c.random, 6, 20), between(c.random, -0.25, 0.25)]
  ellipse(c, cx - 30, cy + 6, 150, 12, '#1e2224', 0.8)
  const points = [[-70, 0], [-56, -14], [10, -20], [50, -12], [64, -2], [40, 6], [-20, 8], [-60, 6]]
  const hull = points.map(([x, y]) => [cx + x * Math.cos(angle) - y * Math.sin(angle), cy + x * Math.sin(angle) + y * Math.cos(angle)])
  poly(c, hull, '#7a848a')
  poly(c, [hull[0], hull[1], hull[2], [cx, cy]], '#8a949a')
  for (let i = 0; i < 4; i++) circle(c, cx + between(c.random, -50, 40), cy + between(c.random, -10, 2), between(c.random, 3, 7), '#1c2023', 0.8, (px, py) => inside(hull, px + 0.5, py + 0.5))
  for (let i = 0; i < 3; i++) {
    const [fx, fy] = [cx + between(c.random, -50, 50), cy - between(c.random, 4, 14)]
    glow(c, fx, fy, 10, '#ff8a2a', 0.18)
    light(c, () => poly(c, [[fx - 4, fy + 2], [fx, fy - 10], [fx + 4, fy + 2]], '#ffb347'))
    for (let k = 1; k < 7; k++) puff(c, fx + k * 4 + (c.random() - 0.5) * 6, fy - k * 10, (4 + k * 1.6) * 1.5, '#3a3a3c', 0.32 - k * 0.03)
  }
  for (let i = 0; i < 14; i++) {
    const [x, y, s] = [between(c.random, 0, W), between(c.random, base, H), between(c.random, 3, 8)]
    poly(c, [[x, y], [x + s, y - s * 0.4], [x + s * 1.2, y + 2], [x + s * 0.2, y + 3]], '#4a545a')
  }
}

// ---- Alien interiors ----

// A ribbed organic chamber with glowing nodes.
function alienVessel(c) {
  const hull = { wall: '#34284e', side: '#261c3a', floor: '#1e1630', ceiling: '#1a1228', back: '#4a3a6a' }
  const accent = pick(c.random, ['#c070ff', '#5fffc0', '#ff7ad0'])
  const g = room(c, hull, { width: [40, 90] })
  for (const f of [0.2, 0.45, 0.7, 0.9]) {
    line(c, g.l * f, g.t * f, g.l * f, H - (H - g.b) * f, 4 * (1.2 - f), '#5a4a7a')
    line(c, W - (W - g.r) * f, g.t * f, W - (W - g.r) * f, H - (H - g.b) * f, 4 * (1.2 - f), '#4a3c66')
  }
  for (let i = 0; i < 5; i++) {
    const [x, y] = [between(c.random, g.l + 6, g.r - 6), between(c.random, g.t + 6, g.b - 6)]
    glow(c, x, y, 8, accent, 0.15)
    light(c, () => circle(c, x, y, 2.5, accent))
  }
  line(c, g.vx, g.b, g.vx, H, 3, accent, 0.5)
}

// A stone nave of receding pillars leading to a glowing altar.
function alienTemple(c) {
  const hull = { wall: '#665a44', side: '#4e4434', floor: '#4a3e30', ceiling: '#2a241c', back: '#8a7a5e' }
  const g = room(c, hull, { width: [36, 70], top: [36, 60] })
  for (const f of [0.15, 0.4, 0.65, 0.85]) {
    const w = 18 * (1.15 - f)
    for (const x of [g.l * f + 4, W - (W - g.r) * f - 4 - w]) {
      rect(c, x, g.t * f, w, H - (H - g.b) * f - g.t * f, '#a8987a')
      rect(c, x + w * 0.65, g.t * f, w * 0.35, H - (H - g.b) * f - g.t * f, '#7c6e56')
    }
  }
  rect(c, g.vx - 14, g.b - 12, 28, 12, '#5a4a3a')
  glow(c, g.vx, g.b - 18, 26, '#d8b040', 0.12)
  light(c, () => {
    circle(c, g.vx, g.b - 18, 4, '#fff0a0')
    for (let i = 0; i < 12; i++) rect(c, between(c.random, g.l + 4, g.r - 6), between(c.random, g.t + 4, g.b - 20), 2, 2, '#d8b040', 0.8)
  }, 0.6)
}

// Resin-walled tunnels with strands hanging down and glowing egg pods on the floor.
function alienHive(c) {
  gradient(c, '#1e140e', '#3a2a20')
  band(c, hills(c.random, between(c.random, 128, 148), 8), '#2a1c14')
  for (let i = 0; i < 26; i++) {
    const x = c.random() * W
    line(c, x, 0, x + between(c.random, -8, 8), between(c.random, 20, 110), between(c.random, 1, 3), '#5a3a28', 0.8)
  }
  stalactites(c, '#42281a')
  for (let i = Math.floor(between(c.random, 6, 14)); i > 0; i--) {
    const [x, y, r] = [c.random() * W, between(c.random, 140, 178), between(c.random, 6, 14)]
    glow(c, x, y - r, r * 1.4, '#a8e060', 0.06)
    ellipse(c, x, y - r * 0.8, r * 0.7, r, '#8a6a48')
    light(c, () => ellipse(c, x, y - r * 1.4, r * 0.35, r * 0.3, '#a8e060'), 0.6)
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
  roomDetail(c, hull, { l, r, t, b, vx })
  return { l, r, t, b, vx }
}

// Floor plates receding to the back wall, panel seams down the side walls, and a kick strip and trim on the back wall.
function roomDetail(c, hull, g) {
  const seam = mix(hull.floor, '#000000', 0.35)
  for (let k = -4; k <= 4; k++) line(c, g.vx + (k / 4) * (g.r - g.vx) * 1.05, g.b, g.vx + k * 60, H, 0.5, seam, 0.6)
  for (let k = 1; k <= 5; k++) {
    const y = g.b + (H - g.b) * (k / 5) ** 1.8
    const f = (y - g.b) / (H - g.b)
    line(c, g.l * (1 - f), y, W - (W - g.r) * (1 - f), y, 0.5, seam, 0.5)
  }
  // Floor sheen in front of the back wall.
  puff(c, g.vx, g.b + 6, (g.r - g.l) * 0.6, mix(hull.back, '#ffffff', 0.4), 0.12)
  for (const [x, f] of [[g.l * 0.35, 0.35], [g.l * 0.7, 0.7]]) line(c, x, g.t * f, x, H - (H - g.b) * f, 0.6, mix(hull.wall, '#000000', 0.3), 0.7)
  for (const [x, f] of [[W - (W - g.r) * 0.35, 0.35], [W - (W - g.r) * 0.7, 0.7]]) line(c, x, g.t * f, x, H - (H - g.b) * f, 0.6, mix(hull.side, '#000000', 0.3), 0.7)
  rect(c, g.l, g.b - 3, g.r - g.l, 3, mix(hull.back, '#000000', 0.3))
  rect(c, g.l, g.t + 3, g.r - g.l, 1, mix(hull.back, '#ffffff', 0.2), 0.7)
}

function ceilingStrips(c, g, colour) {
  light(c, () => {
    poly(c, [[0, 8], [g.l, g.t + 2], [g.l, g.t + 5], [0, 16]], colour)
    poly(c, [[W, 8], [g.r, g.t + 2], [g.r, g.t + 5], [W, 16]], colour)
  }, 0.6)
}

function starsIn(c, x0, y0, x1, y1, count) {
  light(c, () => {
    for (let i = 0; i < count; i++) {
      const [x, y, b] = [between(c.random, x0, x1), between(c.random, y0, y1), c.random()]
      dot(c, x, y, '#ffffff', 0.4 + b * 0.6, b > 0.9 ? 0.7 : 0.4)
    }
  }, 0.6)
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
      if (inside(window, x, y)) light(c, () => dot(c, x, y, '#ffffff', 0.8), 0.6)
    }
  }
  ceilingStrips(c, g, accent)
  poly(c, [[g.vx - 10, H], [g.vx + 10, H], [g.vx + 1, g.b], [g.vx - 1, g.b]], mix(hull.floor, accent, 0.35))
  light(c, () => rect(c, g.l, g.t, g.r - g.l, 2, accent), 0.6)
  // Light spilling from the far end of the corridor.
  glow(c, g.vx, (g.t + g.b) / 2, (g.r - g.l) * 1.4, mix(accent, '#ffffff', 0.5), 0.05)
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
    light(c, () => rect(c, x + 12, 139, w - 24, 3, accent), 0.7)
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
  light(c, () => {
    for (let y = 0; y < g.b + 8; y += 8) rect(c, g.vx - cw + 2, y, cw * 2 - 4, 5, core, 0.5 + c.random() * 0.5)
    rect(c, g.vx - cw * 0.3, 0, cw * 0.6, g.b + 8, '#ffffff', 0.35)
  }, 0.8)
  glow(c, g.vx, (g.t + g.b) / 2, cw * 3, core, 0.1)
  const walk = between(c.random, g.t + 20, g.b - 20)
  rect(c, g.l, walk, g.r - g.l, 4, hull.side)
  for (let x = g.l; x < g.r; x += 10) rect(c, x, walk - 10, 1, 10, hull.side)
  rect(c, g.l, walk - 10, g.r - g.l, 1, hull.side)
  for (const x of [g.l * 0.4, W - (W - g.r) * 0.4]) {
    poly(c, [[x - 30, H], [x + 30, H], [x + 22, H - 34], [x - 22, H - 34]], hull.wall)
    light(c, () => rect(c, x - 18, H - 31, 36, 4, accent), 0.7)
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
      light(c, () => {
        rect(c, x - 8, g.t + 10, 16, y - g.t - 10, mix(accent, '#ffffff', 0.6), 0.12)
        for (let i = 0; i < 20; i++) dot(c, between(c.random, x - 8, x + 8), between(c.random, g.t + 10, y), '#ffffff', 0.9)
      }, 0.7)
    }
  }
  poly(c, [[20, H], [110, H], [100, H - 28], [30, H - 28]], hull.wall)
  light(c, () => rect(c, 36, H - 25, 58, 4, accent), 0.7)
}

function shuttlebay(c, hull, accent) {
  const g = room(c, hull, { width: [95, 130], top: [20, 40], bottom: [110, 125] })
  rect(c, g.l, g.t, g.r - g.l, g.b - g.t, '#03060e')
  starsIn(c, g.l, g.t, g.r, g.b, 80)
  if (c.random() < 0.6) viewPlanet(c, g.l, g.t, g.r, g.b)
  rect(c, g.l, g.t, g.r - g.l, g.b - g.t, '#5fb0ff', 0.1)
  light(c, () => rect(c, g.l, g.t, g.r - g.l, 2, accent), 0.7)
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
    light(c, () => {
      for (let k = 0; k < 22; k += 2) line(c, x - 12 + k, g.t + 22 + Math.sin(k + i) * 4, x - 10 + k, g.t + 22 + Math.sin(k + 2 + i) * 4, 0.8, accent)
    }, 0.7)
  }
  for (let i = 0; i < beds; i++) {
    const x = 40 + ((i + 0.5) / beds) * 240
    const y = between(c.random, 140, 170)
    const s = 0.7 + ((y - 130) / 50) * 0.6
    rect(c, x - 6 * s, y - 14 * s, 12 * s, 14 * s, hull.side)
    poly(c, [[x - 30 * s, y - 14 * s], [x + 30 * s, y - 14 * s], [x + 26 * s, y - 22 * s], [x - 26 * s, y - 22 * s]], mix(bright.back, '#ffffff', 0.4))
    light(c, () => rect(c, x - 30 * s, y - 14 * s, 60 * s, 2, accent), 0.5)
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
    light(c, () => rect(c, vx - half, y, half * 2, Math.max(1, 3 * 0.8 ** k), accent), 0.6)
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
    light(c, () => {
      rect(c, x0, g.t + 10, x1 - x0, 2, field)
      rect(c, x0, g.b - 2, x1 - x0, 2, field)
    }, 0.8)
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
      if (inside(breach, px, py)) light(c, () => dot(c, px, py, '#ffffff', 0.8), 0.6)
    }
  }
  for (let i = 0; i < 14; i++) {
    const [x, y, s] = [between(c.random, 0, W), between(c.random, 120, 178), between(c.random, 4, 12)]
    poly(c, [[x, y], [x + s, y - s * 0.4], [x + s * 1.2, y + 2], [x + s * 0.2, y + 3]], '#2a2e30')
  }
  for (let i = 0; i < 3; i++) glow(c, between(c.random, 20, 300), between(c.random, 20, 160), between(c.random, 4, 10), '#ffb347', 0.25)
  rect(c, 0, 0, W, H, '#ff2a1a', 0.08)
}

// A ship or station interior: the scene a name suggests, otherwise a random one. scene / hull: fixed choices instead.
function interior(c, name, { damaged = false, scene: fixedScene = null, hull: fixedHull = null } = {}) {
  const scene = fixedScene ?? sceneForName(name) ?? pick(c.random, SCENES)
  const hull = fixedHull ?? pick(c.random, HULLS)
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
  light(c, () => {
    for (let i = 0; i < 10; i++) dot(c, cx + Math.cos(i * 0.63) * 51 * s, cy + Math.sin(i * 0.63) * 15.5 * s, '#ffd27a', 1, 0.6)
  }, 0.8)
  glow(c, cx, cy - 34 * s, 4, '#ff5040', 0.3)
}

function stationSpindle(c, cx, cy, s) {
  rect(c, cx - 3 * s, cy - 50 * s, 6 * s, 100 * s, '#9aa4ac')
  for (const [dy, rx] of [[-30, 22], [0, 34], [26, 18]]) {
    ellipse(c, cx, cy + dy * s, rx * s, 6 * s, '#8a949c')
    ellipse(c, cx, cy + dy * s - 2 * s, rx * s * 0.8, 3 * s, '#b4bec6')
    light(c, () => {
      for (let i = 0; i < 6; i++) dot(c, cx - rx * s * 0.8 + i * rx * s * 0.32, cy + dy * s + 2, '#ffd27a', 1, 0.6)
    }, 0.8)
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
  const c = createCanvas(random)
  const namedRoom = Boolean(sceneForName(name))
  if (location === 'starshipDeck') interior(c, name)
  else if (location === 'spaceStation') {
    if (namedRoom || random() < 0.5) interior(c, name)
    else station(c)
  } else if (location === 'klingonShip') interior(c, name, { hull: HULLS[3] })
  else if (location === 'klingonStation') {
    if (namedRoom || random() < 0.5) interior(c, name, { hull: HULLS[3] })
    else station(c)
  } else if (location === 'derelict') {
    if (random() < 0.5) interior(c, name, { damaged: true })
    else derelict(c)
  } else if (location === 'laboratory') interior(c, name, { scene: sceneForName(name) ?? sickbay, hull: HULLS[4] })
  // Cantina names often hold scene words ("The Broken Warp Coil"), so the scene is fixed.
  else if (location === 'cantina') interior(c, name, { scene: lounge, hull: HULLS[1] })
  else if (location === 'detention') interior(c, name, { scene: brig })
  else if (location === 'alienVessel') alienVessel(c)
  else if (location === 'alienTemple') alienTemple(c)
  else if (location === 'alienHive') alienHive(c)
  else if (location === 'cave' && random() < 0.5) caveInterior(c, palette)
  else {
    const suited = skies ? palette.skies.filter((sky) => skies.includes(sky)) : []
    const skyId = pick(random, suited.length ? suited : palette.skies)
    const horizon = between(random, 92, 118)
    drawSky(c, skyId, horizon)
    const wild = location === 'wilderness'
    const ground = drawTerrain(c, palette, horizon, {
      mountainChance: palette.mountains ?? (wild ? 0.6 : 0.4),
      volcanoChance: palette.extra === 'lava' ? (wild ? 0.7 : 0.35) : 0,
    })
    const base = horizon + 24
    if (location === 'colony') colony(c, palette, skyId, base)
    else if (location === 'outpost') outpost(c, palette, skyId, base)
    else if (location === 'city') city(c, palette, skyId, base + 10)
    else if (location === 'surfaceSite') ruins(c, palette, skyId, base)
    else if (location === 'farm') farm(c, palette, skyId, base)
    else if (location === 'miningSite') miningSite(c, palette, skyId, base)
    else if (location === 'landingField') landingField(c, palette, skyId, base)
    else if (location === 'fieldCamp') fieldCamp(c, palette, skyId, base)
    else if (location === 'crashSite') crashSite(c, palette, skyId, base)
    if (location === 'cave') caveMouth(c, palette)
    else     plants(c, palette, ground, wild ? Math.floor(between(random, 10, 22)) : Math.floor(between(random, 2, 7)), location === 'city' ? base + 12 : 0)
  }
  return finish(c)
}

// ---- Finishing: bloom, then a grade ----

// Bloom works on a copy DOWNSAMPLE times smaller: what is lit (c.light) plus anything very bright, blurred twice (a
// tight halo and a wide one) and added back.
const DOWNSAMPLE = 4
const BLOOM = { threshold: 0.78, bright: 0.5, light: 0.8, tight: { radius: 2, gain: 0.85 }, wide: { radius: 7, gain: 0.5 } }

// Three box blurs each way (close to a Gaussian). Returns a new buffer.
function boxBlur(src, w, h, radius) {
  const a = Float32Array.from(src)
  const b = new Float32Array(src.length)
  const pass = (from, to, horizontal) => {
    const [lines, length] = horizontal ? [h, w] : [w, h]
    const at = (line, i) => (horizontal ? (line * w + i) * 3 : (i * w + line) * 3)
    const span = radius * 2 + 1
    for (let line = 0; line < lines; line++) {
      for (let k = 0; k < 3; k++) {
        let sum = 0
        for (let i = -radius; i <= radius; i++) sum += from[at(line, Math.min(length - 1, Math.max(0, i))) + k]
        for (let i = 0; i < length; i++) {
          to[at(line, i) + k] = sum / span
          sum += from[at(line, Math.min(length - 1, i + radius + 1)) + k] - from[at(line, Math.max(0, i - radius)) + k]
        }
      }
    }
  }
  for (let n = 0; n < 3; n++) {
    pass(a, b, true)
    pass(b, a, false)
  }
  return a
}

function bloom(c) {
  const [bw, bh] = [OW / DOWNSAMPLE, OH / DOWNSAMPLE]
  const small = new Float32Array(bw * bh * 3)
  const n = DOWNSAMPLE * DOWNSAMPLE
  for (let py = 0; py < OH; py++) {
    for (let px = 0; px < OW; px++) {
      const i = (py * OW + px) * 3
      const lum = (0.2126 * c.rgb[i] + 0.7152 * c.rgb[i + 1] + 0.0722 * c.rgb[i + 2]) / 255
      const bright = (Math.max(0, lum - BLOOM.threshold) / (1 - BLOOM.threshold)) * BLOOM.bright
      const j = (Math.floor(py / DOWNSAMPLE) * bw + Math.floor(px / DOWNSAMPLE)) * 3
      for (let k = 0; k < 3; k++) small[j + k] += (c.light[i + k] * BLOOM.light + c.rgb[i + k] * bright) / n
    }
  }
  const tight = boxBlur(small, bw, bh, BLOOM.tight.radius)
  const wide = boxBlur(small, bw, bh, BLOOM.wide.radius)
  // Bilinear upsample back onto the picture.
  for (let py = 0; py < OH; py++) {
    const fy = Math.min(bh - 1, Math.max(0, (py + 0.5) / DOWNSAMPLE - 0.5))
    const [y0, ty] = [Math.floor(fy), fy - Math.floor(fy)]
    const y1 = Math.min(bh - 1, y0 + 1)
    for (let px = 0; px < OW; px++) {
      const fx = Math.min(bw - 1, Math.max(0, (px + 0.5) / DOWNSAMPLE - 0.5))
      const [x0, tx] = [Math.floor(fx), fx - Math.floor(fx)]
      const x1 = Math.min(bw - 1, x0 + 1)
      const i = (py * OW + px) * 3
      for (let k = 0; k < 3; k++) {
        const sample = (buffer) => {
          const top = buffer[(y0 * bw + x0) * 3 + k] * (1 - tx) + buffer[(y0 * bw + x1) * 3 + k] * tx
          const bottom = buffer[(y1 * bw + x0) * 3 + k] * (1 - tx) + buffer[(y1 * bw + x1) * 3 + k] * tx
          return top * (1 - ty) + bottom * ty
        }
        c.rgb[i + k] += sample(tight) * BLOOM.tight.gain + sample(wide) * BLOOM.wide.gain
      }
    }
  }
}

// Smooth value noise in 0..1 (a faint paint texture over the whole card).
function valueNoise(x, y, seed) {
  const cell = (cx, cy) => {
    let h = Math.imul(cx, 374761393) ^ Math.imul(cy, 668265263) ^ Math.imul(seed, 982451653)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  const [ix, iy] = [Math.floor(x), Math.floor(y)]
  const [fx, fy] = [x - ix, y - iy]
  const [sx, sy] = [fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)]
  const top = cell(ix, iy) + (cell(ix + 1, iy) - cell(ix, iy)) * sx
  const bottom = cell(ix, iy + 1) + (cell(ix + 1, iy + 1) - cell(ix, iy + 1)) * sx
  return top + (bottom - top) * sy
}

// The paint texture also hides banding in smooth skies, so no dither (which would double the file size).
const GRADE = { contrast: 0.22, vignette: 0.3, texture: 0.022, shoulder: 205 }

// Returns the finished picture as RGBA bytes.
function finish(c) {
  bloom(c)
  const out = new Uint8Array(OW * OH * 4)
  const seed = Math.floor(c.random() * 1e6)
  for (let py = 0; py < OH; py++) {
    for (let px = 0; px < OW; px++) {
      const i = py * OW + px
      const [nx, ny] = [(px + 0.5) / OW - 0.5, (py + 0.5) / OH - 0.5]
      const edge = Math.hypot(nx * 1.15, ny) * 2
      const vignette = 1 - GRADE.vignette * Math.min(1, Math.max(0, (edge - 0.55) / 0.75)) ** 1.5
      const texture = 1 + GRADE.texture * (valueNoise(px / 40, py / 40, seed) * 2 - 1)
      for (let k = 0; k < 3; k++) {
        let v = c.rgb[i * 3 + k]
        // Bright light rolls off towards white instead of clipping.
        if (v > GRADE.shoulder) v = GRADE.shoulder + (v - GRADE.shoulder) / (1 + (v - GRADE.shoulder) / (255 - GRADE.shoulder))
        let n = Math.min(1, Math.max(0, v / 255))
        n += GRADE.contrast * (n * n * (3 - 2 * n) - n)
        out[i * 4 + k] = Math.min(255, Math.max(0, Math.round(n * vignette * texture * 255)))
      }
      out[i * 4 + 3] = 255
    }
  }
  return out
}
