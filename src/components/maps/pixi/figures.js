import { ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import { defeatAnimation, directionFor, getIdleFidgets, getSpriteAnimation, getSpriteMetrics, getSpriteSetById, spriteMaskFile, spriteSheetFile } from '../../../rules/appearance.js'
import { loadSheet } from '../useRecolouredSheet.js'
import { frameColumn, restColumn, startTiming, steadyGait } from '../spriteTiming.js'
import { uniformImageUrl } from '../../useUniformImage.js'
import { cssFilterMatrix, drawnCanvas, makeLabel, placeLabel, textureOf } from './pixiDraw.js'

// The away team and NPCs on the Pixi board, drawn as the SVG board draws them (ExplorationBoard Explorer / NpcToken,
// CharacterSprite, FacingArrow; colours from combat.css and exploration.css): the ground ring, the sprite sheet's
// frame for the animation playing (spriteTiming.js keeps the SVG board's clocks), its shadow, the facing arrow and the
// name tags; a portrait on a stand for a character without a sprite set. Presentation only.

const METRICS = getSpriteMetrics()
const DISPLAY_SCALE = METRICS.displayScale ?? 1
const YELLOW = 0xf6b928
const RED = 0xe2463d
const PURPLE = 0xb07ee8
const BLUE = 0x3d7bff
// combat.css / exploration.css .iso-unit-ring by side.
export const RINGS = {
  player: { fill: { color: 0x2c66d8, alpha: 0.15 }, stroke: { color: BLUE, width: 2 } },
  selected: { fill: { color: YELLOW, alpha: 0.15 }, stroke: { color: YELLOW, width: 2.5 } },
  enemy: { fill: { color: RED, alpha: 0.15 }, stroke: { color: RED, width: 2 } },
  neutral: { fill: { color: PURPLE, alpha: 0.15 }, stroke: { color: PURPLE, width: 2 } },
}
export const SIDE_COLOURS = { blue: BLUE, yellow: YELLOW, red: RED, purple: PURPLE }
// combat.css .iso-unit-ring.is-active: pulsing 1 → 0.55 → 1 over 1.4 s, eased in and out.
const PULSE_MS = 1400
const pulseAlpha = (elapsed) => 1 - 0.45 * (0.5 - 0.5 * Math.cos(((elapsed % PULSE_MS) / PULSE_MS) * Math.PI * 2))
// combat.css unit-beam-in: opacity and brightness through the beam's 1.6 s (eased out within each step).
const BEAM_MS = 1600
const BEAM_OPACITY = [
  [0, 0],
  [0.25, 0.3],
  [0.4, 0.15],
  [0.6, 0.6],
  [0.75, 0.45],
  [1, 1],
]
const BEAM_BRIGHTNESS = [
  [0, 2, 0.4],
  [0.6, 1.6, 0.6],
  [1, 1, 1],
]
// combat.css unit-beam-out (fleeing): over 1.6 s / speed, eased in within each step; brightness, sepia, saturate, hue.
const BEAM_OUT_OPACITY = [
  [0, 1],
  [0.25, 0.95],
  [0.45, 0.6],
  [0.55, 0.8],
  [0.75, 0.25],
  [1, 0],
]
const BEAM_OUT_FILTER = [
  [0, 1, 0, 1, 0],
  [0.25, 1.5, 0.6, 2, -20],
  [1, 2, 0.6, 2, -20],
]
const easeOut = (t) => 1 - (1 - t) * (1 - t)
const easeIn = (t) => t * t
function keyframeValue(frames, t, ease, index = 1) {
  for (let i = 1; i < frames.length; i++) {
    const [to, ...after] = frames[i]
    const [from, ...before] = frames[i - 1]
    if (t > to) continue
    const local = ease((t - from) / (to - from || 1))
    return before[index - 1] + (after[index - 1] - before[index - 1]) * local
  }
  return frames.at(-1)[index]
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Sprite sheets and their frames, loaded once for the board (recoloured to each uniform, useRecolouredSheet.js).
export class SheetStore {
  constructor() {
    this.sheets = new Map()
    this.frames = new Map()
    this.destroyed = false
    this.shadow = textureOf(shadowCanvas())
  }

  // { texture (null until loaded), failed } for one of a set's sheets in a uniform colour; starts loading it.
  sheet(set, sheetId, colour) {
    const file = spriteSheetFile(set, sheetId)
    const key = `${file}|${colour}`
    if (!this.sheets.has(key)) {
      const entry = { key, texture: null, failed: false }
      this.sheets.set(key, entry)
      loadSheet(file, spriteMaskFile(set, sheetId), set.uniformDivision, colour).then((image) => {
        if (this.destroyed) return
        if (image) entry.texture = textureOf(image)
        else entry.failed = true
      })
    }
    return this.sheets.get(key)
  }

  // Whether a sheet has loaded, without asking for it.
  loaded(set, sheetId, colour) {
    return Boolean(this.sheets.get(`${spriteSheetFile(set, sheetId)}|${colour}`)?.texture)
  }

  frame(entry, sheet, column, row) {
    const key = `${entry.key}|${column}|${row}`
    if (!this.frames.has(key)) {
      const width = sheet.frame.width * sheet.resolution
      const height = sheet.frame.height * sheet.resolution
      this.frames.set(key, new Texture({ source: entry.texture.source, frame: new Rectangle(column * width, row * height, width, height) }))
    }
    return this.frames.get(key)
  }

  destroy() {
    this.destroyed = true
    for (const texture of this.frames.values()) texture.destroy(false)
    for (const entry of this.sheets.values()) entry.texture?.destroy(true)
    this.shadow.destroy(true)
    this.frames.clear()
    this.sheets.clear()
  }
}

// maps.css .char-sprite-shadow: a soft dark ellipse under the feet, at SHADOW_RES pixels per unit.
const SHADOW_RES = 4
const shadowCanvas = () =>
  drawnCanvas({ x: -16, y: -10, width: 32, height: 20 }, SHADOW_RES, (context) => {
    context.filter = `blur(${1.5 * SHADOW_RES}px)`
    context.fillStyle = 'rgba(0, 0, 0, 0.38)'
    context.beginPath()
    context.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2)
    context.fill()
  })

// A portrait on a stand (ExplorationBoard ExplorerFigure without a sprite set): the picture cut to the frame,
// xMidYMin slice, with rounded corners.
const PORTRAIT = { x: -15, y: -50, width: 30, height: 40, radius: 4 }
function portraitCanvas(image) {
  return drawnCanvas(PORTRAIT, 4, (context) => {
    const { x, y, width, height, radius } = PORTRAIT
    context.beginPath()
    context.roundRect(x, y, width, height, radius)
    context.clip()
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
    const drawWidth = image.naturalWidth * scale
    context.drawImage(image, x + (width - drawWidth) / 2, y, drawWidth, image.naturalHeight * scale)
  })
}
const portraits = new Map()
function loadPortrait(src, colour) {
  const key = `${src}|${colour}`
  if (!portraits.has(key)) {
    portraits.set(
      key,
      uniformImageUrl(src, colour).then(
        (url) =>
          new Promise((resolve) => {
            const image = new Image()
            image.onload = () => resolve(portraitCanvas(image))
            image.onerror = () => resolve(null)
            image.src = url
          }),
      ),
    )
  }
  return portraits.get(key)
}

// FacingArrow: a triangle on the ground ring pointing along the facing, in the tiles' projection.
function drawArrow(graphics, facing, colour) {
  const length = Math.hypot(facing.x - facing.y, facing.x + facing.y) || 1
  const dir = { x: (facing.x - facing.y) / length, y: (facing.x + facing.y) / length }
  const side = { x: -dir.y, y: dir.x }
  const at = (x, y) => [x, y / 2]
  graphics
    .clear()
    .poly([...at(dir.x * 38, dir.y * 38), ...at(dir.x * 21 + side.x * 11, dir.y * 21 + side.y * 11), ...at(dir.x * 21 - side.x * 11, dir.y * 21 - side.y * 11)])
    .fill({ color: colour })
    .stroke({ color: 0xe8f0ff, width: 1.4, join: 'round' })
}

// One character on the board. update(figure, now) each tick with the figure's description (PixiExplorationBoard).
export class FigureView {
  constructor(sheets) {
    this.sheets = sheets
    this.container = new Container()
    this.ring = new Graphics()
    this.body = new Container()
    this.body.scale.set(DISPLAY_SCALE)
    this.shadow = new Sprite(sheets.shadow)
    this.shadow.anchor.set(0.5)
    this.shadow.scale.set(1 / SHADOW_RES)
    this.sheet = new Sprite()
    this.body.addChild(this.shadow, this.sheet)
    this.token = new Container()
    this.arrow = new Graphics()
    // A board's own pieces: `under` between the ring and the figure, `over` on top (combat's badges).
    this.under = new Container()
    this.over = new Container()
    this.container.addChild(this.ring, this.under, this.body, this.token, this.arrow, this.over)
    this.pulseFrom = null
    this.label = null
    this.shown = {}
    this.gait = null
    this.layer = null
    this.fidget = null
    this.nextFidgetAt = null
    this.playCount = 0
    this.beam = null
  }

  // revealed: the map has faded in (MapRevealedContext).
  update(figure, now, revealed) {
    const { centre, depth } = figure
    this.container.position.set(centre.x, centre.y)
    this.container.zIndex = depth
    this.drawRing(figure.ring)
    if (!figure.ringPulse) this.pulseFrom = null
    else this.pulseFrom ??= now
    this.ring.alpha = figure.ringPulse && !reducedMotion() ? pulseAlpha(now - this.pulseFrom) : 1
    const hasSprite = Boolean(getSpriteSetById(figure.spriteSet))
    this.body.visible = hasSprite
    this.token.visible = !hasSprite
    if (hasSprite) this.updateSprite(figure, now, revealed)
    else this.drawToken(figure)
    const showArrow = !figure.down && Boolean(figure.facing)
    this.arrow.visible = showArrow
    if (showArrow && (this.shown.facingX !== figure.facing.x || this.shown.facingY !== figure.facing.y || this.shown.arrow !== figure.arrowColour)) {
      drawArrow(this.arrow, figure.facing, figure.arrowColour)
      Object.assign(this.shown, { facingX: figure.facing.x, facingY: figure.facing.y, arrow: figure.arrowColour })
    }
    this.updateLabel(figure.label)
    this.updateBeam(figure, now)
  }

  // style: a RINGS name, or { fill, stroke } of its own.
  drawRing(style) {
    const look = typeof style === 'string' ? style : JSON.stringify(style)
    if (this.shown.ring === look) return
    this.shown.ring = look
    const { fill, stroke } = typeof style === 'string' ? RINGS[style] : style
    this.ring.clear().ellipse(0, 0, 22, 11).fill(fill).stroke(stroke)
  }

  // The animation to show now: the board's pose if it gives one (combat: unitPose.js shownPose, played at
  // figure.speed), a fall held on its last frame when down, a fidget now and then while standing idle, else the
  // steady gait.
  wantedAnimation(figure, now) {
    if (figure.pose) {
      const { animation, playKey, settled, reverse } = figure.pose
      return { animation: getSpriteAnimation(animation), timing: { playKey, settled, reverse, speed: figure.speed ?? 1 } }
    }
    if (figure.down) return { animation: defeatAnimation(figure.condition, figure.seed), timing: { settled: true } }
    this.gait = steadyGait(this.gait, figure.gait, now)
    const gait = this.gait.steady
    if (gait !== 'idle') {
      this.fidget = null
      this.nextFidgetAt = null
    } else {
      this.updateFidget(figure, now)
      if (this.fidget) return { animation: getSpriteAnimation(this.fidget.name), timing: { playKey: this.fidget.playKey } }
    }
    return { animation: getSpriteAnimation(gait), timing: { phase: figure.phase } }
  }

  // useIdleFidget: once the idle sheet has loaded, a fidget at random every gapSeconds apart, never the same twice.
  updateFidget(figure, now) {
    const set = getSpriteSetById(figure.spriteSet)
    if (!this.sheets.loaded(set, 'idle', figure.colour)) return
    const { animations, gapSeconds: [minGap, maxGap] } = getIdleFidgets()
    const gap = () => (minGap + Math.random() * (maxGap - minGap)) * 1000
    if (this.fidget && now >= this.fidget.endsAt) {
      this.fidget = null
      this.nextFidgetAt = now + gap()
    }
    if (this.nextFidgetAt === null) this.nextFidgetAt = now + gap()
    if (!this.fidget && now >= this.nextFidgetAt) {
      const choices = animations.filter((name) => name !== this.lastFidget)
      this.lastFidget = choices[Math.floor(Math.random() * choices.length)]
      this.playCount += 1
      this.fidget = { name: this.lastFidget, playKey: `fidget${this.playCount}`, endsAt: now + getSpriteAnimation(this.lastFidget).seconds * 1000 }
    }
  }

  updateSprite(figure, now, revealed) {
    const set = getSpriteSetById(figure.spriteSet)
    const base = this.sheets.sheet(set, 'base', figure.colour)
    // The rest of the sheets once the base one is in and the map has faded in (MapFadeIn waits for every sheet asked
    // for by then), so the figure's first sneak, fall or fidget doesn't wait for one. All at once with preload
    // (combat, as CharacterSprite's preload), which MapFadeIn then waits for.
    if (figure.preload || ((base.texture || base.failed) && revealed)) for (const sheetId of ['combat', 'fall', 'sneak', 'surrender', 'idle']) this.sheets.sheet(set, sheetId, figure.colour)
    const { animation, timing: wanted } = this.wantedAnimation(figure, now)
    const timing = { seed: figure.seed, phase: null, playKey: 0, settled: false, reverse: false, speed: 1, ...wanted }
    const entry = this.sheets.sheet(set, animation.sheetId, figure.colour)
    const oneShot = animation.play === 'loop' ? '' : `${timing.playKey}|${timing.settled ? 's' : ''}|${timing.reverse ? 'r' : ''}|${timing.speed}`
    const key = `${animation.name}|${oneShot}|${entry.key}`
    // A sheet still loading keeps the last frame shown, so the figure never blinks out.
    if (entry.texture && this.layer?.key !== key) {
      this.layer = { key, animation, entry, timing, started: startTiming(animation, timing, now) }
    }
    if (!this.layer) {
      this.sheet.visible = false
      return
    }
    const { animation: shownAnimation, entry: shownEntry, started, timing: shownTiming } = this.layer
    const sheet = shownAnimation.sheet
    const column = reducedMotion() ? restColumn(shownAnimation, shownTiming.reverse) : frameColumn(shownAnimation, started, shownTiming, now)
    const { row, mirror } = directionFor(figure.facing)
    this.sheet.visible = true
    this.sheet.texture = this.sheets.frame(shownEntry, sheet, column, row)
    const scale = 1 / sheet.resolution
    this.sheet.scale.set(mirror ? -scale : scale, scale)
    this.sheet.position.set(mirror ? sheet.frame.width - sheet.anchor.x : -sheet.anchor.x, -sheet.anchor.y)
  }

  drawToken(figure) {
    // imageColour: the uniform the portrait is recoloured to, when not the sprite's (combat: portrait.imageUniform).
    const imageColour = figure.imageColour !== undefined ? figure.imageColour : figure.colour
    const look = `${figure.down}|${figure.bodyColour}|${figure.image}|${imageColour}|${figure.name}`
    if (this.shown.token === look) return
    this.shown.token = look
    this.token.removeChildren().forEach((child) => child.destroy(true))
    const body = new Graphics()
    if (figure.down) {
      body.roundRect(-16, -12, 32, 14, 3).fill({ color: 0x0b1428 }).stroke({ color: figure.bodyColour, width: 1.5 })
      this.token.addChild(body)
      return
    }
    body.roundRect(-17, -52, 34, 44, 5).fill({ color: 0x0b1428 }).stroke({ color: figure.bodyColour, width: 1.5 })
    body.moveTo(0, -8).lineTo(0, 0).stroke({ color: 0x9fb4dc, width: 2 })
    this.token.addChild(body)
    if (figure.image) {
      loadPortrait(figure.image, imageColour).then((canvas) => {
        if (!canvas || this.shown.token !== look || this.token.destroyed) return
        const picture = new Sprite(textureOf(canvas))
        picture.position.set(PORTRAIT.x, PORTRAIT.y)
        picture.scale.set(1 / 4)
        this.token.addChild(picture)
      })
    } else {
      const initial = makeLabel(figure.name.charAt(0), { size: 16, weight: '400', fill: 0xe8ecf5, outline: false })
      placeLabel(initial, 0, -25)
      this.token.addChild(initial)
    }
  }

  // label: { text, y (baseline), size, weight, colour, letterSpacing } or null.
  updateLabel(label) {
    const look = label && `${label.text}|${label.colour}|${label.size}`
    if (this.shown.label !== look) {
      this.shown.label = look
      this.label?.destroy()
      this.label = label ? makeLabel(label.text, { size: label.size, weight: label.weight, fill: label.colour, letterSpacing: label.letterSpacing }) : null
      if (this.label) this.container.addChild(this.label)
    }
    if (this.label) placeLabel(this.label, 0, label.y)
  }

  // beam: 'waiting' (hidden until the beam-in), 'in' (appearing in a transporter beam), 'away' (fading out in one),
  // 'out' (a fleeing enemy beaming out, over 1.6 s / figure.beamSpeed), or null. Each plays from when it began.
  // faded: drawn see-through (an NPC shown only in the debug view).
  updateBeam(figure, now) {
    if (figure.beam !== this.beam?.kind) this.beam = figure.beam ? { kind: figure.beam, startedAt: now } : null
    let alpha = figure.faded ? 0.35 : 1
    let filter = null
    if (this.beam?.kind === 'waiting') alpha = 0
    else if (this.beam?.kind === 'out') {
      const t = Math.min(1, (now - this.beam.startedAt) / (BEAM_MS / (figure.beamSpeed ?? 1)))
      alpha *= keyframeValue(BEAM_OUT_OPACITY, t, easeIn)
      const [brightness, sepia, saturate, hue] = [1, 2, 3, 4].map((index) => keyframeValue(BEAM_OUT_FILTER, t, easeIn, index))
      filter = { brightness, sepia, saturate, hue }
    } else if (this.beam) {
      const progress = Math.min(1, (now - this.beam.startedAt) / BEAM_MS)
      const t = this.beam.kind === 'in' ? progress : 1 - progress
      const ease = this.beam.kind === 'in' ? easeOut : easeIn
      alpha *= keyframeValue(BEAM_OPACITY, t, ease)
      filter = t < 1 ? { brightness: keyframeValue(BEAM_BRIGHTNESS, t, ease, 1), saturate: keyframeValue(BEAM_BRIGHTNESS, t, ease, 2) } : null
    }
    this.container.alpha = alpha
    if (!filter || alpha === 0) {
      if (this.container.filters?.length) this.container.filters = []
      return
    }
    this.filter ??= new ColorMatrixFilter()
    this.filter.matrix = cssFilterMatrix(filter)
    if (!this.container.filters?.length) this.container.filters = [this.filter]
  }

  destroy() {
    this.token.removeChildren().forEach((child) => child.destroy(true))
    this.container.destroy({ children: true })
    this.filter?.destroy()
  }
}
