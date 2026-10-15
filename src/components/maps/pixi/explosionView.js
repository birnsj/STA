import { Sprite } from 'pixi.js'
import { project } from '../../../maps/iso.js'
import { isStanding } from '../../../world/environment.js'
import { EXPLOSION_FRAMES, EXPLOSION_SIZES, explosionSize, explosionStrip } from '../environmentArt.js'
import { stripFrames } from './effectTextures.js'

// One blast from environment.explosions (world/environment.js), played once as a flipbook sprite. Presentation only.

const FRAME_MS = 70
// With reduced motion the blast shows one bright frame for the same time instead of animating.
const STILL_FRAME = 3
export const MAX_EXPLOSIONS = 8

// When each blast started, by its record: a board mounted mid-blast (the hand-off between exploration and combat)
// carries on from there, and a finished one never plays again.
const startedAt = new WeakMap()

// The board items for an environment's latest blasts, newest last. Also starts loading the strips of any object that
// could still explode, so the first blast doesn't wait on the image.
export function explosionItems(environment) {
  for (const record of Object.values(environment?.destructibles ?? {})) {
    if (record.explosion && isStanding(record)) stripFrames(explosionStrip(explosionSize(record.explosion.radius)), EXPLOSION_FRAMES)
  }
  return (environment?.explosions ?? []).slice(-MAX_EXPLOSIONS).map((record) => {
    const { x, y } = project(record.position)
    return { id: record.id, record, x, y, size: explosionSize(record.radius) }
  })
}

export class ExplosionView {
  constructor() {
    this.sprite = new Sprite()
    this.sprite.anchor.set(0.5, 0.6)
    this.sprite.renderable = false
    this.frame = -1
  }

  // item: { id, record, x, y (world point of the blast's tile centre), size: 'small' | 'large' }.
  update(item, now, playing) {
    if (!startedAt.has(item.record)) startedAt.set(item.record, now)
    const step = Math.floor((now - startedAt.get(item.record)) / FRAME_MS)
    const textures = stripFrames(explosionStrip(item.size), EXPLOSION_FRAMES)
    if (step >= EXPLOSION_FRAMES || !textures) {
      this.sprite.renderable = false
      return
    }
    const frame = playing ? step : STILL_FRAME
    if (frame !== this.frame) {
      this.frame = frame
      this.sprite.texture = textures[frame]
      const size = EXPLOSION_SIZES[item.size]
      this.sprite.width = size
      this.sprite.height = size
    }
    this.sprite.position.set(item.x, item.y)
    this.sprite.renderable = true
  }

  destroy() {
    this.sprite.destroy()
  }
}
