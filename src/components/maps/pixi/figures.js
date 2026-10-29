import { ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import { shotHitGlowAlpha } from './effects.js'
import {
  blastDownHoldMs,
  blastStaggerAnimation,
  defeatAnimation,
  directionFor,
  explosionKnockback,
  explosionKnockbackFromReact,
  getIdleFidgets,
  getLegacyIdleAnimation,
  getLegacyRunAnimation,
  getLegacyWalkAnimation,
  getSpriteAnimation,
  getSpriteMetrics,
  getSpriteSetById,
  spriteMaskFile,
  spriteSheetFile,
} from '../../../rules/appearance.js'
import { loadSheet } from '../useRecolouredSheet.js'
import { exploreGetUpComplete, startExploreGetUp } from '../blastGetUpSync.js'
import { HAZARD_FRAMES, characterHazardOverlayLook } from '../environmentArt.js'
import { resolveHazardOverlayDisplay } from '../../../world/characterHazardOverlay.js'
import { FIGURE_CAST } from '../../../maps/mapShadows.js'
import { frameColumn, LOCOMOTION, playbackProgress, restColumn, startTiming, steadyGait } from '../spriteTiming.js'
import { uniformImageUrl } from '../../useUniformImage.js'
import { stripFrames } from './effectTextures.js'
import { cssFilterMatrix, drawnCanvas, makeLabel, placeLabel, textureOf } from './pixiDraw.js'

// Character hazard overlay (fire / plasma / … on the figure while on a tile or still afflicted).
// Anchored on the torso (not the floor-fire foot point) so the body wrap sits on the sprite, not the tile diamond.
const HAZARD_OVERLAY_SCALE = 1.05
const HAZARD_OVERLAY_ALPHA = 0.88
const HAZARD_OVERLAY_Y = -40
const hazardLoopMs = 1000

// The away team and NPCs on the Pixi boards: the ground ring, the sprite sheet's frame for the animation playing
// (spriteTiming.js keeps its clock), its shadow, the facing arrow and the name tags; a portrait on a stand for a
// character without a sprite set. Presentation only.

const METRICS = getSpriteMetrics()
const DISPLAY_SCALE = METRICS.displayScale ?? 1
const YELLOW = 0xf6b928
const RED = 0xe2463d
const PURPLE = 0xb07ee8
const BLUE = 0x3d7bff
const DROP = 0x7fd07f
// The ground ring by side.
export const RINGS = {
  player: { fill: { color: 0x2c66d8, alpha: 0.15 }, stroke: { color: BLUE, width: 2 } },
  selected: { fill: { color: YELLOW, alpha: 0.15 }, stroke: { color: YELLOW, width: 2.5 } },
  // Inventory item dragged over this character — release puts it in their bag.
  dropTarget: { fill: { color: DROP, alpha: 0.28 }, stroke: { color: DROP, width: 3 } },
  enemy: { fill: { color: RED, alpha: 0.15 }, stroke: { color: RED, width: 2 } },
  neutral: { fill: { color: PURPLE, alpha: 0.15 }, stroke: { color: PURPLE, width: 2 } },
}
export const SIDE_COLOURS = { blue: BLUE, yellow: YELLOW, red: RED, purple: PURPLE, drop: DROP }
// The active combatant's ring: pulsing 1 → 0.55 → 1 over 1.4 s, eased in and out.
const PULSE_MS = 1400
const pulseAlpha = (elapsed) => 1 - 0.45 * (0.5 - 0.5 * Math.cos(((elapsed % PULSE_MS) / PULSE_MS) * Math.PI * 2))
// Beaming in: opacity and brightness through the beam's 1.6 s (eased out within each step).
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
// Beaming out (fleeing): over 1.6 s / speed, eased in within each step; brightness, sepia, saturate, hue.
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

// WebGL max texture size is often 8192 (sometimes 4096/16384). The fall sheet is 84 frames wide at 3× (28224 px) and
// will not upload as one texture — cut those into per-frame canvases instead (same idea as effectTextures.js).
const MAX_SHEET_TEXTURE = 8192
const SHEET_RETRY_MS = 1500
// How long to keep showing the fall frame while getup fails to load before standing without the clip.
const GETUP_FAIL_ESCAPE_MS = 5000

function sheetFrameSize(sheet) {
  return { width: sheet.frame.width * sheet.resolution, height: sheet.frame.height * sheet.resolution }
}

function cutFrameTexture(image, column, row, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(image, column * width, row * height, width, height, 0, 0, width, height)
  return textureOf(canvas)
}

// Frame textures cut into their own canvases own those CanvasSources. Rectangle textures are only views onto a whole
// sheet texture owned by SheetStore.sheets and must never destroy that shared source.
export function destroyOwnedFrameTextures(frames) {
  for (const { texture, ownsSource } of frames.values()) texture.destroy(ownsSource)
  frames.clear()
}

// Sprite sheets and their frames, loaded once for the board (recoloured to each uniform, useRecolouredSheet.js).
export class SheetStore {
  constructor() {
    this.sheets = new Map()
    this.frames = new Map()
    this.destroyed = false
    this.shadow = textureOf(shadowCanvas())
  }

  // { texture | image+chunked, failed, failedAt } for one of a set's sheets in a uniform colour; starts loading it.
  // A failed load is retried after SHEET_RETRY_MS (dev server can briefly 404/SPA-fallback new public PNGs).
  sheet(set, sheetId, colour) {
    const file = spriteSheetFile(set, sheetId)
    const key = `${file}|${colour}`
    const prior = this.sheets.get(key)
    if (prior?.failed && prior.failedAt != null && performance.now() - prior.failedAt >= SHEET_RETRY_MS) {
      this.sheets.delete(key)
    }
    if (!this.sheets.has(key)) {
      const entry = { key, texture: null, image: null, chunked: false, failed: false, failedAt: null }
      this.sheets.set(key, entry)
      // Raw file first so a second big page (e.g. *-run) can play before uniform recolour finishes.
      const raw = new Image()
      raw.onload = () => {
        if (this.destroyed || entry.image || raw.naturalWidth <= 0) return
        entry.image = raw
        entry.chunked = true
      }
      raw.onerror = () => {}
      raw.src = file
      loadSheet(file, spriteMaskFile(set, sheetId), set.uniformDivision, colour).then((image) => {
        if (this.destroyed) return
        if (!image) {
          if (!entry.image) {
            entry.failed = true
            entry.failedAt = performance.now()
          }
          return
        }
        const wide = image.naturalWidth > MAX_SHEET_TEXTURE || image.naturalHeight > MAX_SHEET_TEXTURE
        // Drop frame cuts taken from the unrecoloured preview so the next draw uses this uniform colour.
        for (const frameKey of [...this.frames.keys()]) {
          if (!frameKey.startsWith(`${entry.key}|`)) continue
          const { texture, ownsSource } = this.frames.get(frameKey)
          texture.destroy(ownsSource)
          this.frames.delete(frameKey)
        }
        entry.image = image
        entry.chunked = true
        entry.texture?.destroy(true)
        entry.texture = wide ? null : textureOf(image)
      })
    }
    return this.sheets.get(key)
  }

  // Whether a sheet has loaded, without asking for it.
  loaded(set, sheetId, colour) {
    const entry = this.sheets.get(`${spriteSheetFile(set, sheetId)}|${colour}`)
    return Boolean(entry && (entry.texture || entry.image))
  }

  // Ready to draw frames from this entry (whole-sheet texture or chunked source image).
  ready(entry) {
    return Boolean(entry && (entry.texture || entry.image))
  }

  frame(entry, sheet, column, row) {
    const key = `${entry.key}|${column}|${row}`
    if (!this.frames.has(key)) {
      const { width, height } = sheetFrameSize(sheet)
      if (entry.chunked && entry.image) {
        this.frames.set(key, { texture: cutFrameTexture(entry.image, column, row, width, height), ownsSource: true })
      } else {
        this.frames.set(key, { texture: new Texture({ source: entry.texture.source, frame: new Rectangle(column * width, row * height, width, height) }), ownsSource: false })
      }
    }
    return this.frames.get(key).texture
  }

  destroy() {
    this.destroyed = true
    destroyOwnedFrameTextures(this.frames)
    for (const entry of this.sheets.values()) entry.texture?.destroy(true)
    this.shadow.destroy(true)
    this.sheets.clear()
  }
}

// A soft dark ellipse under the feet, at SHADOW_RES pixels per unit. Skewed/offset at draw time (FIGURE_CAST).
const SHADOW_RES = 4
const shadowCanvas = () =>
  drawnCanvas({ x: -18, y: -12, width: 36, height: 24 }, SHADOW_RES, (context) => {
    context.filter = `blur(${1.5 * SHADOW_RES}px)`
    context.fillStyle = 'rgba(0, 0, 0, 0.46)'
    context.beginPath()
    context.ellipse(0, 0, 13, 5.5, 0, 0, Math.PI * 2)
    context.fill()
  })

// A portrait on a stand (a character without a sprite set): the picture cut to the frame,
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

// Portrait textures are canvas-created for one FigureView. Other token children (Graphics/Text) retain Pixi's normal
// cleanup, while these sources are explicitly destroyed without ever touching sheet, shadow, or hazard textures.
export function destroyOwnedTokenChildren(token, ownedTextures) {
  for (const child of token.removeChildren()) {
    if (ownedTextures.has(child.texture)) child.destroy()
    else child.destroy(true)
  }
  for (const texture of ownedTextures) texture.destroy(true)
  ownedTextures.clear()
}

// Mix white toward a CSS/hex beam colour for sprite tint (amount 0 = white, 1 = full colour).
function mixTint(colour, amount) {
  const hex = typeof colour === 'string' ? colour.replace('#', '') : null
  const n = hex ? parseInt(hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex, 16) : colour
  if (!Number.isFinite(n)) return 0xffffff
  const t = Math.min(1, Math.max(0, amount))
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (Math.round(255 + (r - 255) * t) << 16) | (Math.round(255 + (g - 255) * t) << 8) | Math.round(255 + (b - 255) * t)
}

const glowColour = (colour) => {
  if (typeof colour === 'number') return colour
  const hex = String(colour).replace('#', '')
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
  const n = parseInt(full, 16)
  return Number.isFinite(n) ? n : 0xffffff
}

// The facing arrow: a triangle on the ground ring pointing along the facing, in the tiles' projection.
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
    this.shadow.position.set(FIGURE_CAST.x, FIGURE_CAST.y)
    this.shadow.scale.set(FIGURE_CAST.scaleX / SHADOW_RES, FIGURE_CAST.scaleY / SHADOW_RES)
    this.shadow.skew.x = FIGURE_CAST.skewX
    this.sheet = new Sprite()
    this.body.addChild(this.shadow, this.sheet)
    this.token = new Container()
    this.tokenTextures = new Set()
    this.arrow = new Graphics()
    // Hazard FX sits on the figure container (not body) so it stays above the sheet/token and still shows when the
    // body is hidden for portrait-token figures. Combat badges stay on `over` above it.
    this.hazardFx = new Sprite()
    this.hazardFx.anchor.set(0.5, 0.55)
    this.hazardFx.visible = false
    this.hazardFx.alpha = HAZARD_OVERLAY_ALPHA
    // Normal alpha (not add): dark smoke/gas is invisible under additive blending, and floor hazards already use alpha.
    this.hazardFx.blendMode = 'normal'
    // A board's own pieces: `under` between the ring and the figure, `over` on top (combat's badges).
    this.under = new Container()
    this.over = new Container()
    // Soft coloured wash behind the body while a phaser/disruptor beam is on them (combat hitGlow).
    this.hitGlowFx = new Graphics()
    this.hitGlowFx.blendMode = 'add'
    this.under.addChild(this.hitGlowFx)
    this.container.addChild(this.ring, this.under, this.body, this.token, this.hazardFx, this.arrow, this.over)
    this.pulseFrom = null
    this.label = null
    this.shown = {}
    this.gait = null
    this.layer = null
    this.fidget = null
    this.nextFidgetAt = null
    this.playCount = 0
    this.beam = null
    this.hazardType = null
    this.hazardFrame = -1
    this.heldHazardType = null
    this.hitGlowKey = null
    this.hitGlowFrom = null
    // Exploration has no unitPose track: when a figure first goes down on this view, play the fall once; already-down
    // on mount (hand-off from combat) stays on the last frame. Stress-Avoid blasts use staggerPlay (fall then get-up).
    this.wasDown = undefined
    this.fallPlay = null
    this.staggerPlay = null
    this.staggerSeenId = null
    this.getUpFailFrom = null
  }

  // What the sprite layer is actually drawing (may lag the wanted pose while a sheet loads).
  displayedPlayback(now) {
    if (!this.layer) return null
    return {
      name: this.layer.animation.name,
      sheetId: this.layer.animation.sheetId,
      progress: playbackProgress(this.layer.animation, this.layer.started, this.layer.timing, now),
    }
  }

  // Blast throw slide along figure.knockback. When landsHome (position already the landing tile): progress goes
  // -1 → 0 during the fall (fly from the old tile to home) and stays 0 while getting up / lying there. Legacy
  // (no landsHome): 0 → 1 and stay at 1 when Defeated.
  // Plant unless the throw is actively playing (fall drawing with progress < 1) — avoids parking off-marker while
  // the fall sheet loads or during get-up.
  blastSlide(figure, now) {
    if (!figure.knockback) return 0
    const home = figure.knockback.landsHome
    if (
      figure.pose?.standingUp ||
      figure.pose?.animation === 'getUp' ||
      this.staggerPlay?.phase === 'up' ||
      this.staggerPlay?.phase === 'down'
    ) {
      return 0
    }
    if (reducedMotion()) return home ? 0 : figure.down ? 1 : 0
    const asThrow = (progress01) => (home ? progress01 - 1 : progress01)
    if (figure.down && (figure.pose?.settled || this.fallPlay?.settled)) return home ? 0 : 1
    if (this.staggerPlay) {
      // Fall sheet not drawing yet: stay planted on the landing tile (do not sit at slide -1 off the ring).
      if (this.staggerPlay.phase !== 'fall' || this.staggerPlay.startedAt == null) return 0
      const seconds = getSpriteAnimation(this.staggerPlay.animation)?.seconds ?? 0.8
      const t = Math.min(1, (now - this.staggerPlay.startedAt) / (seconds * 1000))
      if (t >= 1) return 0
      return asThrow(1 - (1 - t) ** 2)
    }
    if (figure.pose?.reverse) return 0
    if (!this.layer) return 0
    if (this.layer.timing.settled) return home ? 0 : figure.down ? 1 : 1
    if (this.layer.animation?.name === 'getUp' || this.layer.animation?.sheetId === 'getup') return 0
    // Combat fall throw: only while the fall layer is drawing and not finished.
    const progress = playbackProgress(this.layer.animation, this.layer.started, this.layer.timing, now)
    if (progress >= 1) return 0
    if (!String(this.layer.animation?.name ?? '').startsWith('fall')) return 0
    return asThrow(1 - (1 - progress) ** 2)
  }

  // Exploration (no figure.pose): start or finish the one-shot fall for a newly Defeated figure.
  syncFallPlay(figure, now) {
    if (figure.pose) {
      this.wasDown = figure.down
      this.fallPlay = null
      this.fallStartedAt = null
      return
    }
    if (!figure.down) {
      this.wasDown = false
      this.fallPlay = null
      this.fallStartedAt = null
      return
    }
    this.staggerPlay = null
    const fall = defeatAnimation(figure.condition, figure.seed)
    if (this.wasDown === undefined) {
      // Board mounted with them already down: lie there, don't replay.
      this.fallPlay = { animation: fall, playKey: 0, settled: true }
      this.wasDown = true
      return
    }
    if (!this.wasDown) {
      this.playCount += 1
      this.fallPlay = { animation: fall, playKey: `fall${this.playCount}`, settled: reducedMotion() }
      this.fallStartedAt = now
      this.wasDown = true
      return
    }
    if (this.fallPlay && !this.fallPlay.settled && this.fallStartedAt != null) {
      const seconds = getSpriteAnimation(this.fallPlay.animation)?.seconds ?? 0.8
      if (now - this.fallStartedAt >= seconds * 1000) this.fallPlay = { ...this.fallPlay, settled: true }
    }
  }

  // Exploration: Stress-Avoid blast — fall → brief hold → getUp on the landing tile.
  // Fall/down use wall clocks only after their sheets are drawing. Get-up is requested immediately after the hold;
  // startedAt arms when the getup texture assigns; finish on displayed playback (never a timeout skip of getUp).
  syncBlastStagger(figure, now) {
    if (figure.pose || figure.down) {
      this.staggerPlay = null
      return
    }
    const injury = figure.blastReact?.injury
    // Prefer injury.id; fall back so a react without an id still plays fall → getUp.
    const reactKey = injury?.id ?? (figure.blastReact ? `react:${figure.seed}` : null)
    if (reactKey && reactKey !== this.staggerSeenId) {
      this.staggerSeenId = reactKey
      this.playCount += 1
      this.staggerPlay = {
        phase: 'fall',
        animation: blastStaggerAnimation(),
        playKey: `blast${this.playCount}`,
        startedAt: null,
      }
      this.staggerWaitFrom = null
      return
    }
    if (!this.staggerPlay) return
    // Fall sheet still loading: wait. After a long miss, request getUp (FigureView keeps the last frame until ready).
    if (this.staggerPlay.startedAt == null && this.staggerPlay.phase === 'fall') {
      this.staggerWaitFrom ??= now
      if (now - this.staggerWaitFrom > 3000) {
        this.playCount += 1
        this.staggerPlay = startExploreGetUp({ playKey: `blastUp${this.playCount}`, now: null })
        this.staggerWaitFrom = null
      }
      return
    }
    // up: armed / finished from updateSprite (texture assign + playback).
    if (this.staggerPlay.phase === 'up') {
      this.staggerWaitFrom = null
      return
    }
    this.staggerWaitFrom = null
    if (this.staggerPlay.startedAt == null) return
    const holdMs =
      this.staggerPlay.phase === 'down'
        ? blastDownHoldMs()
        : (getSpriteAnimation(this.staggerPlay.animation)?.seconds ?? 0.8) * 1000
    if (now - this.staggerPlay.startedAt < holdMs) return
    if (this.staggerPlay.phase === 'fall') {
      this.playCount += 1
      this.staggerPlay = {
        phase: 'down',
        animation: this.staggerPlay.animation,
        playKey: `blastDown${this.playCount}`,
        startedAt: now,
      }
      return
    }
    if (this.staggerPlay.phase === 'down') {
      this.playCount += 1
      this.staggerPlay = startExploreGetUp({ playKey: `blastUp${this.playCount}`, now: null })
    }
  }

  // revealed: the map has faded in (MapRevealedContext).
  update(figure, now, revealed) {
    const { centre, depth } = figure
    this.syncFallPlay(figure, now)
    this.syncBlastStagger(figure, now)
    // Explosion knockback while falling / holding / getting up (not once idle with a leftover blastReact).
    const fallPose =
      figure.pose?.animation &&
      (String(figure.pose.animation).startsWith('fall') || figure.pose.animation === 'getUp') &&
      !figure.pose.reverse
    const reactKnock =
      figure.knockback ??
      (figure.blastReact ? explosionKnockbackFromReact(figure.blastReact, figure.seed) : null) ??
      (figure.down ? explosionKnockback(figure.condition, figure.seed) : null)
    const gettingUp =
      Boolean(figure.pose?.standingUp) ||
      figure.pose?.animation === 'getUp' ||
      this.staggerPlay?.phase === 'up' ||
      this.staggerPlay?.phase === 'down'
    // Throw travel only while flying. Keep knockback during hold/getUp so we stay planted on the landing tile.
    const throwing = Boolean(
      figure.down ||
        (this.staggerPlay && this.staggerPlay.phase === 'fall') ||
        (fallPose && !gettingUp),
    )
    const knockback = throwing || gettingUp ? reactKnock : null
    this._knockback = knockback
    // fallBlastBack / getUp: the sheet row is where the feet point. Thrown characters fall onto their back facing
    // the explosive (figure.facing / look), while travel still uses the outward knockback vector. Using the throw-away
    // vector here put every prone body on the wrong row.
    const look =
      figure.facing ??
      (reactKnock?.facing ? { x: -reactKnock.facing.x, y: -reactKnock.facing.y } : null)
    this._blastFacing = (throwing || gettingUp) && look ? look : null
    // Get-up is always planted (slide 0); only the fall throws them.
    const slide = knockback && !gettingUp ? this.blastSlide({ ...figure, knockback }, now) : 0
    this.container.position.set(centre.x + (knockback?.x ?? 0) * slide, centre.y + (knockback?.y ?? 0) * slide)
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
    // After the sprite layer exists, re-apply slide so the first fall frames aren't stuck at the tile.
    if (knockback && !gettingUp) {
      const slid = this.blastSlide({ ...figure, knockback }, now)
      this.container.position.set(centre.x + knockback.x * slid, centre.y + knockback.y * slid)
    }
    const showArrow = !figure.down && !(this.staggerPlay || gettingUp || (figure.blastReact && knockback)) && Boolean(figure.facing)
    this.arrow.visible = showArrow
    if (showArrow && (this.shown.facingX !== figure.facing.x || this.shown.facingY !== figure.facing.y || this.shown.arrow !== figure.arrowColour)) {
      drawArrow(this.arrow, figure.facing, figure.arrowColour)
      Object.assign(this.shown, { facingX: figure.facing.x, facingY: figure.facing.y, arrow: figure.arrowColour })
    }
    this.updateLabel(figure.label)
    this.updateHazardOverlay(figure, now)
    this.updateHitGlow(figure, now)
    this.updateBeam(figure, now)
  }

  // figure.hitGlow: { key, colour, pulse, delayMs, speed } while a coloured beam/pulse is aimed at this figure (hits
  // only). Strength follows the same clock as the shot effect so the wash lasts while the beam is on them.
  updateHitGlow(figure, now) {
    const glow = figure.hitGlow
    if (!glow?.colour || glow.key == null) {
      this.hitGlowKey = null
      this.hitGlowFrom = null
      this.applyHitGlow(null, 0)
      return
    }
    if (this.hitGlowKey !== glow.key) {
      this.hitGlowKey = glow.key
      this.hitGlowFrom = now
    }
    const strength = reducedMotion() ? 0 : shotHitGlowAlpha(glow, now - this.hitGlowFrom)
    this.applyHitGlow(glow.colour, strength)
  }

  applyHitGlow(colour, strength) {
    const amount = Math.min(1, Math.max(0, strength))
    if (amount <= 0.01 || !colour) {
      this.hitGlowFx.clear()
      this.hitGlowFx.visible = false
      this.sheet.tint = 0xffffff
      this.token.tint = 0xffffff
      return
    }
    // Mix through white so red pulses still read on red uniforms (security / disruptor).
    const tint = mixTint(colour, Math.min(1, amount * 0.75))
    const hot = mixTint(colour, Math.min(1, 0.35 + amount * 0.4))
    this.sheet.tint = tint
    this.token.tint = tint
    const rgb = glowColour(colour)
    const y = -28
    this.hitGlowFx
      .clear()
      .ellipse(0, y, 34, 46)
      .fill({ color: rgb, alpha: 0.7 * amount })
      .ellipse(0, y, 22, 32)
      .fill({ color: hot, alpha: 0.55 * amount })
      .ellipse(0, y, 12, 18)
      .fill({ color: 0xffffff, alpha: 0.45 * amount })
    this.hitGlowFx.visible = true
  }

  // figure.hazardOverlay: hazard type id (fire, plasmaFire, …) while on a damaging tile or still afflicted; null/omit
  // hides it. Keeps the last type through fall → hold → getUp (and while Defeated) so a throw off the tile does not
  // snuff the burn mid-stagger. Torso strips only — never the floor diamond art (hide until the character strip loads).
  updateHazardOverlay(figure, now) {
    const poseName = figure.pose?.animation
    const holding =
      Boolean(figure.blastReact) ||
      Boolean(figure.down) ||
      Boolean(this.staggerPlay) ||
      Boolean(this.fallPlay && !this.fallPlay.settled) ||
      poseName === 'getUp' ||
      Boolean(figure.pose?.standingUp) ||
      this.staggerPlay?.phase === 'up' ||
      this.staggerPlay?.phase === 'down' ||
      (typeof poseName === 'string' && poseName.startsWith('fall'))
    const resolved = resolveHazardOverlayDisplay(figure.hazardOverlay || null, {
      holding,
      heldType: this.heldHazardType,
    })
    this.heldHazardType = resolved.held
    const type = resolved.type
    if (type !== this.hazardType) {
      this.hazardType = type
      this.hazardFrame = -1
    }
    if (!type || figure.beam === 'waiting' || reducedMotion()) {
      this.hazardFx.visible = false
      return
    }
    const look = characterHazardOverlayLook(type)
    const textures = look ? stripFrames(look.href, HAZARD_FRAMES) : null
    if (!textures) {
      this.hazardFx.visible = false
      return
    }
    const frame = Math.floor((now / hazardLoopMs) * HAZARD_FRAMES) % HAZARD_FRAMES
    if (frame !== this.hazardFrame || this.hazardHref !== look.href) {
      this.hazardFrame = frame
      this.hazardHref = look.href
      this.hazardFx.texture = textures[frame]
      this.hazardFx.width = look.frame.width * HAZARD_OVERLAY_SCALE * DISPLAY_SCALE
      this.hazardFx.height = look.frame.height * HAZARD_OVERLAY_SCALE * DISPLAY_SCALE
    }
    // Prone figures lie lower; keep the burn on the body rather than floating above.
    this.hazardFx.position.set(0, figure.down ? HAZARD_OVERLAY_Y * 0.45 : HAZARD_OVERLAY_Y)
    this.hazardFx.visible = true
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
  // figure.speed), exploration's one-shot fall (syncFallPlay), a fall held on its last frame when down, a fidget now
  // and then while standing idle, else the steady gait.
  wantedAnimation(figure, now) {
    if (figure.pose) {
      const { animation, playKey, settled, reverse } = figure.pose
      return { animation: getSpriteAnimation(animation), timing: { playKey, settled, reverse, speed: figure.speed ?? 1 } }
    }
    if (this.staggerPlay) {
      return {
        animation: getSpriteAnimation(this.staggerPlay.animation),
        timing: {
          playKey: this.staggerPlay.playKey,
          settled: this.staggerPlay.phase === 'down',
          reverse: false,
          speed: figure.speed ?? 1,
        },
      }
    }
    if (figure.down && this.fallPlay) {
      return {
        animation: getSpriteAnimation(this.fallPlay.animation),
        timing: { playKey: this.fallPlay.playKey, settled: this.fallPlay.settled, speed: figure.speed ?? 1 },
      }
    }
    if (figure.down) return { animation: getSpriteAnimation(defeatAnimation(figure.condition, figure.seed)), timing: { settled: true } }
    this.gait = steadyGait(this.gait, figure.gait, now)
    const gait = this.gait.steady
    if (gait !== 'idle') {
      this.fidget = null
      this.nextFidgetAt = null
    } else if (figure.panic) {
      // Presentation-only hazard panic: prefer the looping panic pose over idle fidgets.
      this.fidget = null
      this.nextFidgetAt = null
      return { animation: getSpriteAnimation('hazardPanic'), timing: { phase: figure.phase } }
    } else {
      this.updateFidget(figure, now)
      if (this.fidget) return { animation: getSpriteAnimation(this.fidget.name), timing: { playKey: this.fidget.playKey } }
    }
    return { animation: getSpriteAnimation(gait), timing: { phase: figure.phase } }
  }

  // Once the idle sheet has loaded, a fidget at random every gapSeconds apart, never the same twice.
  updateFidget(figure, now) {
    const set = getSpriteSetById(figure.spriteSet)
    if (!this.sheets.loaded(set, 'fidgets', figure.colour)) return
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
    // Prefetch getup first while blasting so oversized fall recolours are less likely to starve the stand clip.
    const blasting = Boolean(this.staggerPlay || figure.blastReact || figure.pose?.animation === 'getUp')
    if (blasting) this.sheets.sheet(set, 'getup', figure.colour)
    // Ask for the other sheets as soon as the base is in (fall is ~28k px wide and must start loading early for
    // blasts). preload (combat) asks up front so MapFadeIn waits.
    if (figure.preload || this.sheets.ready(base) || base.failed || revealed) {
      const order = blasting
        ? ['getup', 'fall', 'walk', 'run', 'idle', 'fidgets', 'reaction', 'combat', 'sneak', 'surrender']
        : ['walk', 'run', 'idle', 'fidgets', 'reaction', 'combat', 'fall', 'getup', 'sneak', 'surrender']
      for (const sheetId of order) this.sheets.sheet(set, sheetId, figure.colour)
    }
    // Panic sheet while burning / afflicted (and with combat preload so MapFadeIn can wait when already on fire).
    if (figure.panic || figure.hazardOverlay) this.sheets.sheet(set, 'panic', figure.colour)

    let { animation, timing: wanted } = this.wantedAnimation(figure, now)
    const timing = { seed: figure.seed, phase: null, playKey: 0, settled: false, reverse: false, speed: 1, ...wanted }
    let entry = this.sheets.sheet(set, animation?.sheetId, figure.colour)
    // Dedicated walk/run/idle still loading or missing: same anim on the base sheet. Draw path size-matches base
    // clips and scales the foot offset with it so the figure neither shrinks nor pops.
    if (animation?.sheetId === 'walk' && !this.sheets.ready(entry)) {
      const legacy = getLegacyWalkAnimation()
      if (legacy) {
        animation = legacy
        entry = this.sheets.sheet(set, legacy.sheetId, figure.colour)
      }
    }
    if (animation?.sheetId === 'run' && !this.sheets.ready(entry)) {
      const legacy = getLegacyRunAnimation()
      if (legacy) {
        animation = legacy
        entry = this.sheets.sheet(set, legacy.sheetId, figure.colour)
      }
    }
    if (animation?.sheetId === 'idle' && !this.sheets.ready(entry)) {
      const legacy = getLegacyIdleAnimation()
      if (legacy) {
        animation = legacy
        entry = this.sheets.sheet(set, legacy.sheetId, figure.colour)
      }
    }
    // Don't start the fall clock until that sheet can draw — otherwise the timer ends on an idle/fall-miss frame.
    if (this.staggerPlay && this.staggerPlay.phase === 'fall' && this.staggerPlay.startedAt == null) {
      this.sheets.sheet(set, 'fall', figure.colour)
      if (this.sheets.ready(entry) && (animation?.name === this.staggerPlay.animation || animation?.sheetId === 'fall')) {
        this.staggerPlay.startedAt = now
      }
    }
    // Getup sheet still missing after retries: stand without the clip (keep fall until then / while retrying).
    if (this.staggerPlay?.phase === 'up' && animation?.sheetId === 'getup') {
      this.getUpFailFrom ??= now
      if (entry?.failed && now - this.getUpFailFrom >= GETUP_FAIL_ESCAPE_MS) {
        this.staggerPlay = null
        this.getUpFailFrom = null
        figure.onStaggerDone?.()
      }
    } else {
      this.getUpFailFrom = null
    }
    const oneShot = animation.play === 'loop' ? '' : `${timing.playKey}|${timing.settled ? 's' : ''}|${timing.reverse ? 'r' : ''}|${timing.speed}`
    const key = `${animation.name}|${oneShot}|${entry.key}`
    // A sheet still loading keeps the last frame shown, so the figure never blinks out — except locomotion:
    // holding run/walk while standing (e.g. waiting on the panic sheet) looks like running in place.
    if (this.sheets.ready(entry) && this.layer?.key !== key) {
      this.layer = { key, animation, entry, timing, started: startTiming(animation, timing, now) }
      // Arm get-up playback from the moment the getup texture is assigned (authoritative start).
      if (this.staggerPlay?.phase === 'up' && animation?.name === this.staggerPlay.animation && this.staggerPlay.startedAt == null) {
        this.staggerPlay = { ...this.staggerPlay, startedAt: now }
        this.getUpFailFrom = null
      }
    } else if (
      animation &&
      !this.sheets.ready(entry) &&
      this.layer &&
      LOCOMOTION.has(this.layer.animation.name) &&
      !LOCOMOTION.has(animation.name)
    ) {
      const idle = getSpriteAnimation('idle')
      const idleEntry = this.sheets.sheet(set, idle.sheetId, figure.colour)
      if (this.sheets.ready(idleEntry)) {
        const idleKey = `${idle.name}|wait:${animation.name}|${idleEntry.key}`
        if (this.layer.key !== idleKey) {
          this.layer = { key: idleKey, animation: idle, entry: idleEntry, timing, started: startTiming(idle, timing, now) }
        }
      }
    }
    if (!this.layer) {
      this.sheet.visible = false
      return
    }
    const { animation: shownAnimation, entry: shownEntry, started, timing: shownTiming } = this.layer
    const sheet = shownAnimation.sheet
    const column = reducedMotion() ? restColumn(shownAnimation, shownTiming.reverse) : frameColumn(shownAnimation, started, shownTiming, now)
    // Blast fall / getUp: feet toward the explosive (look); otherwise the board's facing.
    const facing = this._blastFacing ?? figure.facing
    const { row, mirror } = directionFor(facing)
    this.sheet.visible = true
    this.sheet.texture = this.sheets.frame(shownEntry, sheet, column, row)
    // Migrated walk/run/idle body ~65 design px; legacy base clips ~51. Boost base walk/run/idle to that height, and
    // multiply the foot offset by the same factor — scale alone left the feet behind and read as a position pop.
    const sizeMatch =
      shownAnimation.sheetId === 'base' && (LOCOMOTION.has(shownAnimation.name) || shownAnimation.name === 'idle')
        ? 65 / 51
        : 1
    const scale = (1 / sheet.resolution) * sizeMatch
    this.sheet.scale.set(mirror ? -scale : scale, scale)
    // Fall / getup frames are taller than idle; pin the body to the ground ring so prone isn't floating.
    const floorNudge = this.proneFloorNudge(shownAnimation, started, shownTiming, now)
    const footX = mirror ? sheet.frame.width - sheet.anchor.x : -sheet.anchor.x
    const footY = -sheet.anchor.y + floorNudge
    this.sheet.position.set(footX * sizeMatch, footY * sizeMatch)

    // Exploration get-up finishes only when the last get-up frame has been displayed.
    if (this.staggerPlay?.phase === 'up') {
      const shown = this.displayedPlayback(now)
      if (
        exploreGetUpComplete(this.staggerPlay, {
          displayedName: shown?.name ?? null,
          progress: shown?.progress ?? 0,
        })
      ) {
        this.staggerPlay = null
        figure.onStaggerDone?.()
      }
    }
  }

  // 0 standing .. max px down when fully prone (fall / getUp sheets only). Fall frames are taller than idle; without
  // this the body sits above the ground ring. Nudge is in body-local px (before displayScale) so ~22 screen px stay on
  // the ring after characterSprites.json displayScale bumps — otherwise the thrown/prone sprite lands below the marker.
  proneFloorNudge(animation, started, timing, now) {
    if (animation.sheetId !== 'fall' && animation.sheetId !== 'getup') return 0
    const max = 22 / DISPLAY_SCALE
    if (animation.sheetId === 'getup') {
      // Stay low while they press up from the floor; lift once the one-knee drive begins.
      const progress = playbackProgress(animation, started, timing, now)
      const rise = Math.max(0, (progress - 0.55) / 0.45)
      const eased = rise * rise * (3 - 2 * rise)
      return max * (1 - eased)
    }
    if (timing.settled || started.settled) return max
    return max * playbackProgress(animation, started, timing, now)
  }

  drawToken(figure) {
    // imageColour: the uniform the portrait is recoloured to, when not the sprite's (combat: portrait.imageUniform).
    const imageColour = figure.imageColour !== undefined ? figure.imageColour : figure.colour
    const look = `${figure.down}|${figure.bodyColour}|${figure.image}|${imageColour}|${figure.name}`
    if (this.shown.token === look) return
    this.shown.token = look
    destroyOwnedTokenChildren(this.token, this.tokenTextures)
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
        const texture = textureOf(canvas)
        const picture = new Sprite(texture)
        this.tokenTextures.add(texture)
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
  // Colour-matrix runs on the sprite/token only (not the ring): filters rasterize their target, and at resolution 1 the
  // ring looked chunky. inherit + antialias keeps the character as sharp as the rest of the board.
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
    // Drop any legacy container filter so the ring stays a crisp vector under alpha alone.
    if (this.container.filters?.length) this.container.filters = []
    const art = this.body.visible ? this.body : this.token
    const clearArt = (target) => {
      if (target.filters?.length) target.filters = []
    }
    if (!filter || alpha === 0) {
      clearArt(this.body)
      clearArt(this.token)
      return
    }
    this.filter ??= new ColorMatrixFilter({ resolution: 'inherit', antialias: 'on' })
    this.filter.resolution = 'inherit'
    this.filter.antialias = 'on'
    this.filter.matrix = cssFilterMatrix(filter)
    if (this.body !== art) clearArt(this.body)
    if (this.token !== art) clearArt(this.token)
    if (art.filters?.[0] !== this.filter) art.filters = [this.filter]
  }

  destroy() {
    destroyOwnedTokenChildren(this.token, this.tokenTextures)
    this.container.destroy({ children: true })
    this.filter?.destroy()
  }
}
