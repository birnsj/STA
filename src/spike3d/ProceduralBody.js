import { HumanoidAnimator } from './HumanoidAnimator.js'
import { COMMAND_GOLD, HumanoidModel, SPRITE_HEIGHT_PX } from './HumanoidModel.js'
import { WORLD_Y_TO_PX } from './isoProjection.js'
import { applyAppearance } from './appearance.js'

const HEIGHT = SPRITE_HEIGHT_PX / WORLD_Y_TO_PX
const XZ_SCALE = 1

function parseColour(colour) {
  if (typeof colour === 'number' && Number.isFinite(colour)) return colour
  if (typeof colour === 'string') {
    const hex = colour.replace('#', '')
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    const n = parseInt(full, 16)
    if (Number.isFinite(n)) return n
  }
  return COMMAND_GOLD
}

/**
 * Procedural CharacterBody: HumanoidModel + HumanoidAnimator.
 * SpikeActor parents `root` and drives play/update; MixamoBody will share the same surface.
 */
export class ProceduralBody {
  constructor({ height = HEIGHT, uniform, appearance = null } = {}) {
    this.model = new HumanoidModel(height, { uniform: parseColour(uniform) })
    this.model.root.scale.set(XZ_SCALE, 1, XZ_SCALE)
    this.root = this.model.root
    this.root.userData.humanoidModel = this.model
    this.animator = new HumanoidAnimator(this.model)
    this.animator.play('idle', { force: true })
    this._appearance = null
    if (appearance) this.setAppearance(appearance)
  }

  get materials() {
    return {
      robe: this.model.robe,
      robeDk: this.model.pants ?? this.model.robeDk,
      skin: this.model.skin,
      hood: this.model.hood,
      boots: this.model.boots,
    }
  }

  get bodyY() {
    return Math.abs(this.model.body?.position?.y ?? 0)
  }

  play(clip, opts) {
    return this.animator.play(clip, opts)
  }

  /** Hold the last frame of the current action clip (used after ragdoll settles). */
  snapActionToEnd() {
    return this.animator.snapActionToEnd()
  }

  /** Prone death rest on the deck (ragdoll / defeat hand-off). */
  applyDeathRest(fallClip) {
    return this.animator.applyDeathRest(fallClip)
  }

  setPaused(paused) {
    this.animator.setPaused(paused)
  }

  /** Animation viewer: once-clips hold at end instead of returning to idle. */
  setViewerHoldOnce(on) {
    this.animator.setViewerHoldOnce(on)
  }

  /** Animation viewer: once-clips loop while the Loop checkbox is on. */
  setViewerLoopOnce(on) {
    this.animator.setViewerLoopOnce(on)
  }

  /** Scrub playhead to u∈[0,1] and snap the pose. */
  seek(u) {
    return this.animator.seek(u)
  }

  get current() {
    return this.animator.current
  }

  get actionDone() {
    return this.animator.actionDone
  }

  get paused() {
    return this.animator.paused
  }

  get progress() {
    return this.animator.progress
  }

  update(dt, travel = null) {
    this.animator.update(dt, travel)
  }

  setUniform(colour) {
    this.model.setUniformColour(parseColour(colour))
  }

  setAppearance(appearance) {
    this._appearance = appearance ?? null
    applyAppearance(this.model, appearance)
  }

  /** Animation Viewer: phaser / hand-socket offsets. */
  setAttachmentSettings(next) {
    this.model.setAttachmentSettings?.(next)
  }

  dispose() {
    this.model.dispose()
  }
}

export { HEIGHT as PROCEDURAL_HEIGHT }
