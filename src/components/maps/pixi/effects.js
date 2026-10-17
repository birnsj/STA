import { Container, Graphics } from 'pixi.js'
import { project, TILE_H, TILE_W } from '../../../maps/iso.js'
import { scanSweepSeconds } from '../../exploration/scanSweep.js'
import { cubicBezier, EASE, progress, track } from './cssTiming.js'
import { dashedLine, makeLabel, placeLabel } from './pixiDraw.js'

// The boards' effects, drawn by Pixi above the map and figures: transporter beams, scan sweeps, combat shots and
// strikes, floating action labels and the line of fire. Each effect plays from when it first
// appears (as a CSS animation did from when its element mounted); `speed` divides its timing (Auto Combat speed).
// Presentation only.

// Transporter sparkles: [x, y, delay as a fraction of the beam], fixed so every beam looks the same.
const BEAM_SPARKS = [
  [-9, -62, 0], [6, -54, 0.08], [-4, -44, 0.16], [10, -36, 0.05], [-11, -28, 0.22], [3, -20, 0.12],
  [-6, -12, 0.3], [8, -8, 0.18], [0, -68, 0.26], [-2, -32, 0.34], [11, -58, 0.4], [-10, -46, 0.45],
]
const BEAM_MS = 1600
const SPARK_MS = 500
// direction 'out': a fleeing enemy's red-amber beam-out; 'in': the away team beaming in; 'away': the away team beaming
// out of the mission (both blue-white).
const BEAM_COLOURS = { out: { column: 0xff7a3d, spark: 0xffe2b8 }, in: { column: 0x9fd8ff, spark: 0xf2fbff }, away: { column: 0x9fd8ff, spark: 0xf2fbff } }
const COLUMN_OPACITY = [
  [0, 0],
  [0.3, 0.35],
  [0.7, 0.4],
  [1, 0],
]
const SPARK_OPACITY = [
  [0, 0],
  [0.3, 1],
  [1, 0],
]
const SPARK_RISE = [
  [0, 4],
  [1, -10],
]

// A transporter column with sparkles over a figure. item: { position (on screen), direction, speed }.
class TransporterView {
  constructor(item) {
    const colours = BEAM_COLOURS[item.direction]
    this.container = new Container()
    this.column = new Graphics().roundRect(-17, -76, 34, 82, 17).fill({ color: colours.column })
    this.sparks = BEAM_SPARKS.map(([x, y, delay]) => {
      const spark = new Graphics().circle(0, 0, 1.8).fill({ color: colours.spark })
      spark.position.set(x, y)
      return { spark, y, delay }
    })
    this.container.addChild(this.column, ...this.sparks.map(({ spark }) => spark))
  }

  update(item, elapsed) {
    const speed = item.speed ?? 1
    this.container.position.set(item.position.x, item.position.y)
    const column = progress(elapsed, { duration: BEAM_MS / speed })
    this.column.alpha = column === null ? 0 : track(COLUMN_OPACITY, column, EASE.easeInOut)
    for (const { spark, y, delay } of this.sparks) {
      const t = progress(elapsed, { duration: SPARK_MS / speed, delay: (BEAM_MS * delay) / speed, iterations: 2, both: true })
      spark.alpha = track(SPARK_OPACITY, t, EASE.easeOut)
      spark.y = y + track(SPARK_RISE, t, EASE.easeOut)
    }
  }
}

const SCAN_POINTS = 96
// How often the arcs re-roll their jagged shape: often enough to crackle, slow enough not to strobe.
const CRACKLE_MS = 70
// Each arc: the wobble around the ring as a fraction of its radius, and its stroke.
const SCAN_ARCS = [
  { jitter: 0.035, stroke: { color: 0xbff1ff, width: 1.6, alpha: 1, join: 'bevel' } },
  { jitter: 0.05, stroke: { color: 0x7fdcff, width: 1.6, alpha: 0.75, join: 'bevel' } },
  { jitter: 0.025, stroke: { color: 0xffffff, width: 1, alpha: 0.9, join: 'bevel' } },
]
const easeOutCubic = (t) => 1 - (1 - t) ** 3

// A jagged ellipse: each point's distance from the centre wobbles by up to `jitter`, so the ring reads as an electric
// arc rather than a clean line. `seed` changes the wobble pattern.
function arcPoints(rx, ry, jitter, seed) {
  const points = []
  for (let i = 0; i < SCAN_POINTS; i++) {
    const angle = (i / SCAN_POINTS) * Math.PI * 2
    const wobble = 1 + jitter * Math.sin(i * 2.7 + seed) * Math.cos(i * 1.3 + seed * 2.3)
    points.push(Math.cos(angle) * rx * wobble, Math.sin(angle) * ry * wobble)
  }
  return points
}

// The tricorder sweep of a party Scan: an electric ring that spreads along the floor from the scanner to the scan's
// radius, then fades. item: { origin (the scanner, in tiles), radius (in tiles), speed (Auto Combat speed), onDone }.
// A circle on the floor is an ellipse on the isometric map; redrawn at its true size each frame so the lines stay crisp.
class ScanView {
  constructor() {
    this.container = new Container()
    this.graphics = new Graphics()
    this.container.addChild(this.graphics)
    this.seed = 0
    this.lastCrackle = -Infinity
    this.done = false
  }

  update(item, elapsed) {
    const speed = Math.max(item.speed ?? 1, 0.01)
    const t = Math.min(1, elapsed / ((scanSweepSeconds(item.radius) * 1000) / speed))
    const grow = 0.02 + 0.98 * easeOutCubic(t)
    const rx = ((item.radius * TILE_W) / Math.SQRT2) * grow
    const ry = ((item.radius * TILE_H) / Math.SQRT2) * grow
    if (elapsed - this.lastCrackle >= CRACKLE_MS / speed) {
      this.seed = Math.random() * 100
      this.lastCrackle = elapsed
    }
    const centre = project(item.origin)
    this.container.position.set(centre.x, centre.y)
    this.container.alpha = t < 0.08 ? t / 0.08 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1
    const graphics = this.graphics.clear()
    graphics.ellipse(0, 0, rx, ry).fill({ color: 0x78dcff, alpha: 0.05 }).stroke({ color: 0x78dcff, alpha: 0.3, width: 8 })
    SCAN_ARCS.forEach(({ jitter, stroke }, index) => graphics.poly(arcPoints(rx, ry, jitter, this.seed + index * 17), true).stroke(stroke))
    if (t >= 1 && !this.done) {
      this.done = true
      item.onDone?.()
    }
  }
}

export const BEAM_SHOT_MS = 800
export const BEAM_SHOT_OPACITY = [
  [0, 0],
  [0.1, 1],
  [0.6, 1],
  [1, 0],
]
export const PULSE_FLY_MS = 320
export const PULSE_IMPACT_MS = 400
// The impact flashes this long after the bolt sets off, as it reaches the target.
export const PULSE_IMPACT_AFTER_MS = 280
// The bolt is a fifth of the shot long and slides from just before the shooter to just past the target.
const PULSE_LENGTH = 0.2
const pulseFly = cubicBezier(0.3, 0, 0.9, 1)

// Pulse impact wash: hold longer than the impact circle alone so the hit reads on any uniform colour.
const PULSE_HIT_GLOW_MS = 560
const PULSE_HIT_GLOW_OPACITY = [
  [0, 0],
  [0.08, 1],
  [0.5, 1],
  [1, 0],
]

// How strongly a hit target should glow (0..1) for the same elapsed timing as BeamShotView / PulseShotView.
// item: { pulse, delayMs, speed }. Beams glow while the laser is up; pulses glow from impact (bolt arrival).
export function shotHitGlowAlpha(item, elapsed) {
  const speed = item.speed ?? 1
  const delayMs = item.delayMs ?? 0
  if (item.pulse) {
    const flash = progress(elapsed, {
      duration: PULSE_HIT_GLOW_MS / speed,
      delay: delayMs + PULSE_IMPACT_AFTER_MS / speed,
    })
    return flash === null ? 0 : track(PULSE_HIT_GLOW_OPACITY, flash, EASE.easeOut)
  }
  const t = progress(elapsed, { duration: BEAM_SHOT_MS / speed, delay: delayMs })
  return t === null ? 0 : track(BEAM_SHOT_OPACITY, t, EASE.easeOut)
}

// A phaser-style beam from the shooter to the target (or wide of it, on a miss), with a flash where it hits.
// item: { from, end, hit (where it lands, or null on a miss), colour, delayMs, speed }; positions on screen.
class BeamShotView {
  constructor(item) {
    const { from, end, hit, colour } = item
    this.container = new Container()
    const lines = new Graphics()
      .moveTo(from.x, from.y)
      .lineTo(end.x, end.y)
      .stroke({ color: colour, width: 9, alpha: 0.35, cap: 'round' })
      .moveTo(from.x, from.y)
      .lineTo(end.x, end.y)
      .stroke({ color: 0xfff6e0, width: 2.5, cap: 'round' })
    if (hit) lines.circle(hit.x, hit.y, 10).fill({ color: colour, alpha: 0.8 })
    this.container.addChild(lines)
  }

  update(item, elapsed) {
    const speed = item.speed ?? 1
    const t = progress(elapsed, { duration: BEAM_SHOT_MS / speed, delay: item.delayMs })
    this.container.alpha = t === null ? 0 : track(BEAM_SHOT_OPACITY, t, EASE.easeOut)
  }
}

// A disruptor's pulse: a short bolt that flies from the shooter to the target (or wide), then flashes on impact.
// item: as BeamShotView.
class PulseShotView {
  constructor(item) {
    this.container = new Container()
    this.bolt = new Graphics()
    this.impact = new Graphics().circle(0, 0, 11).fill({ color: item.colour })
    this.impact.alpha = 0
    if (item.hit) this.impact.position.set(item.hit.x, item.hit.y)
    this.container.addChild(this.bolt, this.impact)
  }

  update(item, elapsed) {
    const { from, end, hit, colour, delayMs } = item
    const speed = item.speed ?? 1
    const fly = progress(elapsed, { duration: PULSE_FLY_MS / speed, delay: delayMs })
    const head = fly === null ? 0 : (1 + PULSE_LENGTH) * pulseFly(fly)
    const start = Math.max(0, head - PULSE_LENGTH)
    const stop = Math.min(1, head)
    const at = (f) => ({ x: from.x + (end.x - from.x) * f, y: from.y + (end.y - from.y) * f })
    this.bolt.clear()
    if (stop > start) {
      const [a, b] = [at(start), at(stop)]
      this.bolt
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ color: colour, width: 10, alpha: 0.55, cap: 'round' })
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ color: 0xffd2c8, width: 3, cap: 'round' })
    }
    if (!hit) return
    const flash = progress(elapsed, { duration: PULSE_IMPACT_MS / speed, delay: delayMs + PULSE_IMPACT_AFTER_MS / speed })
    this.impact.alpha = flash === null ? 0 : track([[0, 0.95], [1, 0]], flash, EASE.easeOut)
    this.impact.scale.set(flash === null ? 0.4 : track([[0, 0.4], [1, 1.5]], flash, EASE.easeOut))
  }
}

const STRIKE_MS = 600

// A melee strike: a white ring that bursts on the target. item: { at (on screen), delayMs, speed }.
class StrikeView {
  constructor(item) {
    this.container = new Container()
    this.ring = new Graphics().circle(0, 0, 14).stroke({ color: 0xffffff, width: 3 })
    this.ring.position.set(item.at.x, item.at.y)
    this.ring.alpha = 0
    this.container.addChild(this.ring)
  }

  update(item, elapsed) {
    const t = progress(elapsed, { duration: STRIKE_MS / (item.speed ?? 1), delay: item.delayMs })
    this.ring.alpha = t === null ? 0 : track([[0, 1], [1, 0]], t, EASE.easeOut)
    this.ring.scale.set(t === null ? 0.3 : track([[0, 0.3], [1, 1.4]], t, EASE.easeOut))
  }
}

const LABEL_MS = 1600
const LABEL_Y = -76
const LABEL_STYLES = { action: { fill: 0xf6b928, size: 13 }, hit: { fill: 0xff5a4f, size: 15 }, miss: { fill: 0xc6cfdf, size: 15 } }
const LABEL_OPACITY = [
  [0, 0],
  [0.15, 1],
  [0.75, 1],
  [1, 0],
]
const LABEL_RISE = [
  [0, 6],
  [0.15, 0],
  [1, -14],
]

// What a combatant just did, or what a hit did to them, floating up over their head. It walks with them: it glides to
// a new tile over msPerTile, as the figure does. item: { centre (on screen), msPerTile, text, style ('action', 'hit'
// or 'miss'), delayMs, speed }.
class LabelView {
  constructor(item) {
    const { fill, size } = LABEL_STYLES[item.style]
    this.container = new Container()
    this.label = makeLabel(item.text.toUpperCase(), { size, fill, letterSpacing: size * 0.05, outline: '#02060f', outlineWidth: 4 })
    this.label.alpha = 0
    this.container.addChild(this.label)
    this.walk = null
  }

  update(item, elapsed) {
    const to = item.centre
    if (!this.walk) this.walk = { from: to, to, startedAt: elapsed, ms: 0 }
    else if (this.walk.to.x !== to.x || this.walk.to.y !== to.y) this.walk = { from: this.centreAt(elapsed), to, startedAt: elapsed, ms: item.msPerTile }
    const centre = this.centreAt(elapsed)
    this.container.position.set(centre.x, centre.y)
    const t = progress(elapsed, { duration: LABEL_MS / (item.speed ?? 1), delay: item.delayMs })
    this.label.alpha = t === null ? 0 : track(LABEL_OPACITY, t, EASE.easeOut)
    placeLabel(this.label, 0, LABEL_Y + (t === null ? 6 : track(LABEL_RISE, t, EASE.easeOut)))
  }

  centreAt(elapsed) {
    const { from, to, startedAt, ms } = this.walk
    const t = ms > 0 ? Math.min(1, (elapsed - startedAt) / ms) : 1
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
  }
}

// The line of fire while aiming: dashed blue, or red if the shot can't be taken. item: { from, to, available }.
class AimView {
  constructor() {
    this.container = new Container()
    this.line = new Graphics()
    this.container.addChild(this.line)
    this.drawn = null
  }

  update(item) {
    const { from, to, available } = item
    const key = `${from.x},${from.y},${to.x},${to.y},${available}`
    if (key === this.drawn) return
    this.drawn = key
    this.line.clear()
    dashedLine(this.line, from, to, 6, 4)
    this.line.stroke(available ? { color: 0x7fb6ff, width: 2 } : { color: 0xe2463d, width: 2, alpha: 0.7 })
  }
}

const KINDS = { transporter: TransporterView, scan: ScanView, beamShot: BeamShotView, pulseShot: PulseShotView, strike: StrikeView, label: LabelView, aim: AimView }

// One effect on the board, built on its first update. item: { id, kind, ... } (the kind's own fields).
export class EffectView {
  constructor() {
    this.container = new Container()
    this.view = null
    this.born = 0
  }

  update(item, now) {
    if (!this.view) {
      this.view = new KINDS[item.kind](item)
      this.born = now
      this.container.addChild(this.view.container)
    }
    this.view.update(item, now - this.born)
  }

  destroy() {
    this.view?.destroy?.()
    this.container.destroy({ children: true })
  }
}
