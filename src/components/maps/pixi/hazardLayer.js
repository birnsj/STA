import { Sprite } from 'pixi.js'
import { perfCount, perfEnd, perfOff, perfStart } from '../../../dev/perfProbe.js'
import { project } from '../../../maps/iso.js'
import { activeHazards, HAZARD_TYPES, parseKey } from '../../../world/environment.js'
import { HAZARD_FRAME, HAZARD_FRAMES, characterHazardStrip, hazardStrip } from '../environmentArt.js'
import { stripFrames } from './effectTextures.js'

// Every active hazard tile (world/environment.js) as a looping flipbook sprite, for any Pixi board. Both floor hazards
// (fire, plasma, …) and air hazards (smoke, gas, steam) sort in the depth layer among the blocks and figures: a crate
// or wall in front of a fire tile covers it, and fire in front of a crate sits on top of it (designer report 2026-10-15:
// floor fire under the whole depth layer was buried by crates in front and looked sunk). Air stays a little in front of
// floor on the same tile so smoke still reads over flames. Sprites are built only when environment.hazards changes (a
// hazard round, a blast, a neutralize, an editor edit) and go back to a free list when their tile goes; each frame only
// swaps a texture when its frame index changes and hides what is off screen. Presentation only.

// Each tile is shifted by whole frames so neighbours don't flicker in lockstep.
const shiftOf = (position) => (position.x * 7 + position.y * 13) % HAZARD_FRAMES
const loopMs = (type) => (HAZARD_TYPES[type]?.loopSeconds ?? 1) * 1000
// Stronger hazards are more opaque; air hazards stay see-through enough to read the figures inside.
const alphaOf = (air, intensity) => (air ? 0.35 + 0.15 * intensity : 0.4 + 0.2 * intensity)
// Depth among blocks (x+y) and figures (x+y+0.5): floor fire just above the block on its tile, air above that.
const depthOf = (position, air) => position.x + position.y + (air ? 0.6 : 0.2)

export class HazardLayer {
  constructor({ depthLayer }) {
    this.depthLayer = depthLayer
    this.entries = new Map()
    this.free = []
    this.hazards = undefined
    this.typeFrames = {}
  }

  // environment: the board's environment record (or null); view: the world area on screen (pixiStage frame());
  // playing: false holds every tile on its first frame (reduced motion, the editor with tile animations off).
  update(environment, now, view, playing) {
    const started = perfStart()
    this.sync(perfOff('hazards') ? null : environment)
    for (const type in this.typeFrames) this.typeFrames[type] = -1
    let shown = 0
    for (const entry of this.entries.values()) {
      const { sprite } = entry
      const textures = stripFrames(hazardStrip(entry.type), HAZARD_FRAMES)
      const onScreen = !view || (entry.x + HAZARD_FRAME.width / 2 > view.x && entry.x - HAZARD_FRAME.width / 2 < view.x + view.width && entry.y + HAZARD_FRAME.height / 4 > view.y && entry.y - (HAZARD_FRAME.height * 3) / 4 < view.y + view.height)
      if (!textures || !onScreen) {
        sprite.renderable = false
        continue
      }
      let typeFrame = this.typeFrames[entry.type]
      if (typeFrame === undefined || typeFrame < 0) typeFrame = this.typeFrames[entry.type] = playing ? Math.floor((now / loopMs(entry.type)) * HAZARD_FRAMES) : 0
      const frame = playing ? (typeFrame + entry.shift) % HAZARD_FRAMES : 0
      if (frame !== entry.frame) {
        entry.frame = frame
        sprite.texture = textures[frame]
        sprite.width = HAZARD_FRAME.width
        sprite.height = HAZARD_FRAME.height
      }
      sprite.renderable = true
      shown += 1
    }
    perfCount('hazard.sprites', shown)
    perfEnd('pixi.hazards', started)
  }

  sync(environment) {
    const hazards = environment?.hazards ?? null
    if (hazards === this.hazards) return
    this.hazards = hazards
    const seen = new Set()
    const warmed = new Set()
    for (const region of activeHazards(environment)) {
      // Warm floor + character torso strips together so figure overlays do not briefly show floor diamonds.
      if (!warmed.has(region.type)) {
        warmed.add(region.type)
        stripFrames(hazardStrip(region.type), HAZARD_FRAMES)
        stripFrames(characterHazardStrip(region.type), HAZARD_FRAMES)
      }
      const air = (region.layer ?? HAZARD_TYPES[region.type]?.layer) === 'air'
      for (const key in region.tiles) {
        const id = `${region.id}|${key}`
        seen.add(id)
        let entry = this.entries.get(id)
        if (!entry || entry.air !== air) {
          if (entry) this.release(entry)
          entry = this.take(air)
          this.entries.set(id, entry)
        }
        const position = parseKey(key)
        const centre = project(position)
        if (entry.type !== region.type) entry.frame = -1
        entry.type = region.type
        entry.shift = shiftOf(position)
        entry.x = centre.x
        entry.y = centre.y
        entry.sprite.position.set(centre.x, centre.y)
        entry.sprite.alpha = alphaOf(air, region.tiles[key])
        entry.sprite.zIndex = depthOf(position, air)
      }
    }
    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue
      this.release(entry)
      this.entries.delete(id)
    }
  }

  take(air) {
    const sprite = this.free.pop() ?? new Sprite()
    sprite.anchor.set(0.5, 0.75)
    sprite.renderable = false
    this.depthLayer.addChild(sprite)
    return { sprite, air, type: null, frame: -1, shift: 0, x: 0, y: 0 }
  }

  release(entry) {
    entry.sprite.removeFromParent()
    entry.sprite.renderable = false
    this.free.push(entry.sprite)
  }

  destroy() {
    for (const entry of this.entries.values()) entry.sprite.destroy()
    for (const sprite of this.free) sprite.destroy()
    this.entries.clear()
    this.free = []
  }
}
