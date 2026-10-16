import { Sprite } from 'pixi.js'
import { playExplosionSound } from '../../../audio/uiSounds.js'
import { project } from '../../../maps/iso.js'
import { isStanding } from '../../../world/environment.js'
import { EXPLOSION_FRAMES, explosionDisplayPx, explosionSize, explosionStrip } from '../environmentArt.js'
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
    return { id: record.id, record, x, y, size: explosionSize(record.radius), displayPx: explosionDisplayPx(record.radius) }
  })
}

// heard: a Set of explosion ids this board has already sounded. On the first call (empty set before seeding) pass
// seedOnly so a board that mounts mid-blast does not boom again; later calls play once per new id. seedOnly also
// clears the flipbook clock so the new board can still show the blast (exploration → combat hand-off).
export function playNewExplosionSounds(items, heard, { seedOnly = false } = {}) {
  for (const item of items) {
    if (heard.has(item.id)) continue
    heard.add(item.id)
    if (seedOnly) {
      startedAt.delete(item.record)
      continue
    }
    playExplosionSound(item.record.kind, item.record.radius)
  }
}

export class ExplosionView {
  constructor() {
    this.sprite = new Sprite()
    this.sprite.anchor.set(0.5, 0.6)
    this.sprite.renderable = false
    this.frame = -1
  }

  // item: { id, record, x, y (world point of the blast's tile centre), size: 'small' | 'large', displayPx }.
  update(item, now, playing) {
    const textures = stripFrames(explosionStrip(item.size), EXPLOSION_FRAMES)
    // Do not start the flipbook clock until a frame can draw — otherwise a slow strip load burns the whole blast.
    if (!textures?.[0]?.width) {
      this.sprite.renderable = false
      return
    }
    if (!startedAt.has(item.record)) startedAt.set(item.record, now)
    const step = Math.floor((now - startedAt.get(item.record)) / FRAME_MS)
    const texture = textures[playing ? Math.min(step, EXPLOSION_FRAMES - 1) : STILL_FRAME]
    // Hide after the flipbook ends.
    if (step >= EXPLOSION_FRAMES || !texture?.width) {
      this.sprite.renderable = false
      return
    }
    const frame = playing ? step : STILL_FRAME
    if (frame !== this.frame) {
      this.frame = frame
      this.sprite.texture = texture
    }
    // Scale every frame: displayPx follows the blast radius (environmentArt.js explosionDisplayPx).
    const px = item.displayPx ?? explosionDisplayPx(item.record.radius)
    this.sprite.scale.set(px / texture.width, px / texture.height)
    this.sprite.position.set(item.x, item.y)
    this.sprite.tint = 0xffffff
    this.sprite.alpha = 1
    this.sprite.renderable = true
  }

  destroy() {
    // Keep shared strip textures (effectTextures.js); only this sprite goes away.
    this.sprite.destroy({ texture: false, textureSource: false })
  }
}
