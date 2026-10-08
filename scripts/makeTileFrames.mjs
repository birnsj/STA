// Whole-sprite animation frames for the animated tiles (tileEffects.json animations), baked from each tile's own art
// (tiles.json image, big.image or panelImages) and its light layers (art-layers/, written by scripts/makeTilesV2.mjs).
// Run after the tile scripts:   node scripts/makeTileFrames.mjs
//
// An animation is one loop of frames, frameTime seconds each. A frame shows every light layer at its level at the
// frame's middle (the curves below, the timings the views animated the old light overlays with); frames with the same
// levels share one image. Each image has an emission image too: its lit parts alone, which the views use to keep lights
// at full brightness in a dark map (IsoTiles AmbientDarkness, EditorCanvas). Rewrites tileEffects.json's animations.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from './png.mjs'
import { LAYERS, RESOLUTION } from './v2/engine.mjs'
import { windowStars } from './v2/panels.mjs'

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url))
const EFFECTS = new URL('../src/data/adaptation/maps/tileEffects.json', import.meta.url)
const TILES = new Map(JSON.parse(fs.readFileSync(new URL('../src/data/adaptation/maps/tiles.json', import.meta.url), 'utf8')).tiles.map((tile) => [tile.id, tile]))

// ---------- curves: a layer's level (0..1) t seconds into the loop ----------
const clamp01 = (value) => Math.max(0, Math.min(1, value))
// Close to CSS ease-in-out.
const ease = (s) => s * s * (3 - 2 * s)
// Rises from low to high over the first half of period and falls back over the second.
const swell = (period, low, high) => (t) => {
  const p = (t % period) / period
  const s = ease(p < 0.5 ? p * 2 : (p - 0.5) * 2)
  return p < 0.5 ? low + (high - low) * s : high - (high - low) * s
}
// Snaps a curve to `levels` steps between from and to, so frames share images.
const stepped = (curve, levels, from, to) => (t) => from + (Math.round(clamp01((curve(t) - from) / (to - from)) * (levels - 1)) / (levels - 1)) * (to - from)

// A slow breathing glow.
const pulse = stepped(swell(2.8, 0.1, 0.95), 5, 0.1, 0.95)
// Status lights switching on and off.
const blink = (t) => (t % 1.4 < 0.7 ? 1 : 0)
// An unsteady screen.
const FLICKER = [[0, 0.45], [0.08, 0.9], [0.1, 0.25], [0.12, 0.85], [0.4, 0.6], [0.7, 0.95], [0.72, 0.35], [0.74, 0.8], [1, 0.45]]
const flicker = stepped(
  (t) => {
    const p = (t % 3.2) / 3.2
    const i = FLICKER.findIndex(([at]) => at > p)
    const [a, from] = FLICKER[i - 1]
    const [b, to] = FLICKER[i]
    return from + ((to - from) * (p - a)) / (b - a)
  },
  4,
  0.25,
  0.95,
)
// A warning light stepping from full to dim and back in four steps.
const warning = (period) => (t) => [1, 0.675, 0.35, 0.675][Math.floor(((t % period) / period) * 4)]
// A star's twinkle.
const twinkle = swell(4, 0.9, 0.25)

// ---------- the animations ----------
// variants: which of the tile's images animate ('image', 'bigImage', 'panel.x', 'panel.y'). layers: { curve, blend
// ('screen' for lights, the default, or 'normal'), files: variant -> layer file in art-layers/ } or { stars: true } (a
// space window's stars, v2/panels.mjs windowStars). active: plays only while the tile is active (a live hazard).
// emission: false for floors, which are never lit through the darkness.
const lightsOn = (curve, files, blend = 'screen') => ({ curve, files, blend })
const wallFitting = (name) => ({
  loop: 1.4,
  frameTime: 0.7,
  variants: ['image'],
  layers: [lightsOn(blink, { image: `bulkhead-${name}-lights.png` })],
})
const panelFitting = (name, curve, loop, frameTime) => ({
  loop,
  frameTime,
  variants: ['panel.x', 'panel.y'],
  layers: [lightsOn(curve, { 'panel.x': `${name}Panel-x-lights.png`, 'panel.y': `${name}Panel-y-lights.png` })],
})
const spaceWindow = { loop: 4, frameTime: 0.5, variants: ['panel.x', 'panel.y'], layers: [{ stars: true }] }
const ANIMATIONS = {
  machinery: {
    loop: 2.8,
    frameTime: 0.2,
    variants: ['image', 'bigImage'],
    layers: [
      lightsOn(pulse, { image: 'machinery-glow.png', bigImage: 'machinery-glow-big.png' }),
      lightsOn(blink, { image: 'machinery-blink.png', bigImage: 'machinery-blink-big.png' }),
    ],
  },
  epsControl: {
    loop: 3.2,
    frameTime: 0.1,
    variants: ['image'],
    layers: [lightsOn(flicker, { image: 'epsControl-screen.png' }), lightsOn(warning(1.6), { image: 'epsControl-lit.png' }, 'normal')],
  },
  grating: {
    active: true,
    emission: false,
    loop: 0.6,
    frameTime: 0.15,
    variants: ['image'],
    layers: [lightsOn(warning(0.6), { image: 'grating-live.png' }, 'normal')],
  },
  lcarsWall: wallFitting('lcars'),
  conduitWall: {
    loop: 2.8,
    frameTime: 0.2,
    variants: ['image'],
    layers: [lightsOn(pulse, { image: 'bulkhead-conduit-core.png' }), lightsOn(blink, { image: 'bulkhead-conduit-lights.png' })],
  },
  hatchWall: wallFitting('hatch'),
  computerWall: wallFitting('computer'),
  lcarsPanel: panelFitting('lcars', blink, 1.4, 0.7),
  conduitPanel: panelFitting('conduit', pulse, 2.8, 0.2),
  hatchPanel: panelFitting('hatch', blink, 1.4, 0.7),
  computerPanel: panelFitting('computer', blink, 1.4, 0.7),
  bulkhead: spaceWindow,
  alienBulkhead: spaceWindow,
  breachedBulkhead: spaceWindow,
}

// ---------- images ----------
const readImage = (file) => decodePng(fs.readFileSync(file))
const publicFile = (href) => path.join(PUBLIC, href)
// A tile's own art for a variant (a public href).
function baseHref(tile, variant) {
  if (variant === 'image') return tile.image
  if (variant === 'bigImage') return tile.big.image
  return tile.panelImages[variant.split('.')[1]]
}

// Straight-alpha float RGBA, for blending.
const toFloat = ({ width, height, bytes }) => ({ width, height, pixels: Float32Array.from(bytes, (value) => value / 255) })
const blank = (width, height) => ({ width, height, pixels: new Float32Array(width * height * 4) })
const toBytes = ({ pixels }) => Uint8Array.from(pixels, (value) => Math.round(clamp01(value) * 255))

// Composites layer (float RGBA) over image at level, with the CSS blend mode (screen or normal).
function blend(image, layer, level, mode) {
  if (layer.width !== image.width || layer.height !== image.height) throw new Error('a light layer must be the size of its tile image')
  const dst = image.pixels
  const src = layer.pixels
  for (let i = 0; i < dst.length; i += 4) {
    const as = src[i + 3] * level
    if (as <= 0) continue
    const ab = dst[i + 3]
    const ao = as + ab * (1 - as)
    for (let k = 0; k < 3; k++) {
      const cs = src[i + k]
      const cb = dst[i + k]
      const mixed = mode === 'screen' ? cb + cs - cb * cs : cs
      dst[i + k] = (as * (1 - ab) * cs + as * ab * mixed + (1 - as) * ab * cb) / ao
    }
    dst[i + 3] = ao
  }
}

// A space window's stars t seconds into the loop, as a layer the size of the panel image.
const STAR = [235 / 255, 242 / 255, 1]
function starLayer(tile, axis, width, height, t) {
  const layer = blank(width, height)
  const SUB = 4
  for (const star of windowStars(axis, tile.height, tile.imageHeight)) {
    const cx = star.x * RESOLUTION
    const cy = star.y * RESOLUTION
    const r = star.r * RESOLUTION
    const alpha = 0.9 * twinkle(t + star.delay)
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        let hits = 0
        for (let sy = 0; sy < SUB; sy++) for (let sx = 0; sx < SUB; sx++) if (Math.hypot(x + (sx + 0.5) / SUB - cx, y + (sy + 0.5) / SUB - cy) <= r) hits++
        if (!hits) continue
        const i = (y * width + x) * 4
        layer.pixels.set([...STAR, Math.max(layer.pixels[i + 3], (alpha * hits) / (SUB * SUB))], i)
      }
    }
  }
  return layer
}

// ---------- baking ----------
const frameFile = (href, index, suffix = '') => href.replace(/\.png$/, `-frame-${index}${suffix}.png`)
const emissionKey = (variant) => (variant === 'image' ? 'emission' : variant === 'bigImage' ? 'bigEmission' : 'panelEmission')

function write(href, image) {
  fs.writeFileSync(publicFile(href), encodePng(image.width, image.height, toBytes(image)))
}

// Old frames of an image, so a shorter loop leaves none behind.
function clearFrames(href) {
  const folder = path.dirname(publicFile(href))
  const stem = path.basename(href, '.png')
  for (const file of fs.readdirSync(folder)) if (file.startsWith(`${stem}-frame-`)) fs.rmSync(path.join(folder, file))
}

function bake(id, animation) {
  const tile = TILES.get(id)
  if (!tile) throw new Error(`${id} isn't in tiles.json`)
  const count = Math.round(animation.loop / animation.frameTime)
  // Each frame's layer levels; frames with the same levels share an image (star windows: every frame differs).
  const keys = []
  const frames = []
  const times = []
  for (let k = 0; k < count; k++) {
    const t = (k + 0.5) * animation.frameTime
    const key = animation.layers.map((layer) => (layer.stars ? `stars${k}` : layer.curve(t).toFixed(3))).join('|')
    if (!keys.includes(key)) {
      keys.push(key)
      times.push(t)
    }
    frames.push(keys.indexOf(key))
  }
  const images = times.map(() => ({}))
  for (const variant of animation.variants) {
    const href = baseHref(tile, variant)
    clearFrames(href)
    const base = toFloat(readImage(publicFile(href)))
    const layers = animation.layers.map((layer) => (layer.stars ? null : toFloat(readImage(path.join(LAYERS, layer.files[variant])))))
    times.forEach((t, index) => {
      const sprite = { ...base, pixels: base.pixels.slice() }
      const emission = blank(base.width, base.height)
      animation.layers.forEach((layer, i) => {
        const source = layer.stars ? starLayer(tile, variant.split('.')[1], base.width, base.height, t) : layers[i]
        const level = layer.stars ? 1 : layer.curve(t)
        const mode = layer.stars ? 'screen' : layer.blend
        blend(sprite, source, level, mode)
        blend(emission, source, level, mode)
      })
      const spriteHref = frameFile(href, index)
      write(spriteHref, sprite)
      const entry = images[index]
      const emissionHref = animation.emission === false ? null : frameFile(href, index, '-emission')
      if (emissionHref) write(emissionHref, emission)
      if (variant.startsWith('panel.')) {
        const axis = variant.split('.')[1]
        entry.panel = { ...entry.panel, [axis]: spriteHref }
        if (emissionHref) entry.panelEmission = { ...entry.panelEmission, [axis]: emissionHref }
      } else {
        entry[variant] = spriteHref
        if (emissionHref) entry[emissionKey(variant)] = emissionHref
      }
    })
  }
  console.log(`baked  ${id}: ${count} frames, ${images.length} images`)
  return { ...(animation.active ? { active: true } : {}), frameTime: animation.frameTime, frames, images }
}

const effects = JSON.parse(fs.readFileSync(EFFECTS, 'utf8'))
effects.animations = Object.fromEntries(Object.entries(ANIMATIONS).map(([id, animation]) => [id, bake(id, animation)]))
// Each frame list on one line.
const json = JSON.stringify(effects, null, 2).replace(/"frames": \[[\d,\s]+\]/g, (list) => list.replace(/\s+/g, ' ').replace('[ ', '[').replace(' ]', ']'))
fs.writeFileSync(EFFECTS, `${json}\n`)
console.log('wrote  tileEffects.json animations')
