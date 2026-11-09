import * as THREE from 'three'
import { clearLiveClip, reportLiveClip } from '../dev/animClipDebug.js'
import { blastReactionAnimation, blastStaggerAnimation, isExplosionInjury } from '../rules/appearance.js'
import { facingToYaw, makeIsoCamera, syncIsoCamera } from './isoProjection.js'
import { resolveSpike3dAppearance } from './appearance.js'
import { clipSeconds, IDLE_FIDGET_GAP, IDLE_FIDGETS } from './clips.js'
import { ProceduralBody, PROCEDURAL_HEIGHT } from './ProceduralBody.js'
import { HumanoidRagdoll } from './HumanoidRagdoll.js'
import { createContactShadow } from './contactShadow.js'
import { addColliderMeshes, addOccluderMeshes, buildMapColliders } from './mapColliders.js'
import { PhysicsWorld } from './PhysicsWorld.js'

const HEIGHT = PROCEDURAL_HEIGHT

function blastImpulseFromReact(blastReact, seed = '') {
  const injury = blastReact?.injury
  const origin = injury?.source?.blastOrigin ?? injury?.source?.at
  const at = blastReact?.from ?? blastReact?.land ?? injury?.source?.at
  let dx = 0
  let dz = 1
  if (origin && at) {
    dx = (at.x ?? 0) - (origin.x ?? 0)
    dz = (at.y ?? 0) - (origin.y ?? 0)
  } else if (blastReact?.facing) {
    dx = blastReact.facing.x || 0
    dz = blastReact.facing.y || 0
  }
  const len = Math.hypot(dx, dz) || 1
  dx /= len
  dz /= len
  const radius = Number(injury?.source?.radius) || Number(injury?.radius) || 2
  // Readable flight: enough throw to clear tiles under soft gravity; ragdoll scales again.
  const power = 6 + radius * 2.6 + (String(seed).length % 3)
  return {
    impulse: { x: dx * power, y: 4.2 + radius * 1.0, z: dz * power },
    point: at ? { x: at.x, y: HEIGHT * 0.55, z: at.y } : null,
  }
}

class SpikeActor {
  constructor(id, host, { uniform, enemy = false, appearance = null } = {}) {
    this.id = id
    this.host = host
    this.scene = host.scene
    this.enemy = enemy
    this.ragdollActive = false
    this._blastKey = null
    this._staggerCallback = null
    this._pendingBlast = null
    this._beam = null
    this._settleFallClip = null
    this._ragdollSettledToPose = false
    this._deathLocked = false
    this._lastSeen = performance.now()

    this.root = new THREE.Group()
    this.root.name = `spike_actor_${id}`
    const resolved = appearance ?? resolveSpike3dAppearance({ uniform, enemy })
    this.body = new ProceduralBody({ height: HEIGHT, uniform: resolved.uniform ?? uniform, appearance: resolved })
    this.root.add(this.body.root)
    // Soft foot blob — Pixi owns the floor, so real shadow maps never land.
    this.shadow = createContactShadow({ width: HEIGHT * 0.55, depth: HEIGHT * 0.32 })
    this.root.add(this.shadow)
    this.ragdoll = null
    // Match setPose key so the first pose does not rebuild hair/race meshes (showcase blink).
    this._appearanceKey = resolved
      ? `${resolved.species}|${resolved.gender}|${resolved.hairStyle}|${resolved.hairColour}|${resolved.klingonArmour}|${resolved.outfit ?? ''}|${resolved.uniform ?? ''}`
      : null
    this._paintX = 0
    this._paintZ = 0
    this._tx = 0
    this._tz = 0
    this._yaw = Math.PI / 4
    this._yawTarget = this._yaw
    this._posReady = false
    this._pendingTravel = 0
    // Idle fidgets (same catalogue / gap as sprite FigureView) — only while the resolved clip is idle.
    this._fidget = null
    this._nextFidgetAt = null
    this._lastFidget = null
    this.scene.add(this.root)
  }

  _fidgetGapMs() {
    const [minGap, maxGap] = IDLE_FIDGET_GAP
    return (minGap + Math.random() * (maxGap - minGap)) * 1000
  }

  _clearFidget() {
    this._fidget = null
    this._nextFidgetAt = null
  }

  /** Base idle, or a one-shot fidget when the gap elapses (never the same twice in a row). */
  _idleOrFidget(now) {
    if (this._fidget && (now >= this._fidget.endsAt || this.body.current === 'idle')) {
      this._fidget = null
      this._nextFidgetAt = now + this._fidgetGapMs()
    }
    if (this._nextFidgetAt === null) this._nextFidgetAt = now + this._fidgetGapMs()
    if (!this._fidget && now >= this._nextFidgetAt && IDLE_FIDGETS.length) {
      const choices = IDLE_FIDGETS.filter((name) => name !== this._lastFidget)
      const pool = choices.length ? choices : IDLE_FIDGETS
      this._lastFidget = pool[Math.floor(Math.random() * pool.length)]
      this._fidget = {
        name: this._lastFidget,
        endsAt: now + clipSeconds(this._lastFidget) * 1000,
      }
    }
    return this._fidget?.name ?? 'idle'
  }

  /** @deprecated use this.body.model — kept for ragdoll material hand-off */
  get model() {
    return this.body.model
  }

  get physics() {
    return this.host.physics
  }

  paintKey() {
    if (this.ragdollActive && this.ragdoll?.bodies?.hips) {
      const t = this.ragdoll.bodies.hips.translation()
      return t.x + t.z
    }
    return this._paintX + this._paintZ
  }

  setVisible(visible) {
    // 'waiting' = pre-beam-in: keep the actor alive but draw nothing (matches sprite alpha 0).
    // Ragdoll drives the procedural mesh in place — keep the actor root visible while flopping.
    const show = Boolean(visible) && this._beam !== 'waiting'
    this.root.visible = show
    if (this.shadow) this.shadow.visible = show && !this.ragdollActive
    if (this.ragdoll?.root) this.ragdoll.root.visible = false
  }

  setPose({ position, facing, gait, animation, down, beam, blastReact, onStaggerDone, colour, appearance }) {
    this._staggerCallback = onStaggerDone ?? null
    this._down = Boolean(down)
    this._beam = beam ?? null
    this._lastSeen = performance.now()
    if (!down && this._deathLocked) this._deathLocked = false
    if (appearance) {
      const key = `${appearance.species}|${appearance.gender}|${appearance.hairStyle}|${appearance.hairColour}|${appearance.klingonArmour}|${appearance.outfit ?? ''}|${appearance.uniform ?? ''}`
      if (key !== this._appearanceKey) {
        this._appearanceKey = key
        this.body.setAppearance(appearance)
      }
    } else if (colour != null && colour !== this._colourKey) {
      this._colourKey = colour
      this.body.setUniform(colour)
    }
    if (!position) return

    // Always track the sim tile (landing tile during a blast) even while physics drives the mesh.
    this._yawTarget = facingToYaw(facing)
    if (!this.ragdollActive) {
      // Sim delta drives stride cadence (setPose runs before update, so root is already snapped).
      if (this._posReady) {
        this._pendingTravel = Math.hypot(position.x - this._tx, position.y - this._tz)
      }
      this._tx = position.x
      this._tz = position.y
      // Feet stay on the selection ring — soft position lag slid every figure off its circle in sync.
      this.root.position.set(this._tx, 0, this._tz)
      this._paintX = this._tx
      this._paintZ = this._tz
      if (!this._posReady) {
        this._posReady = true
        this._yaw = this._yawTarget
        this.root.rotation.y = this._yaw
      }
    } else {
      this._tx = position.x
      this._tz = position.y
    }

    const blastKey = blastReact?.injury?.id ?? (blastReact ? `br:${this.id}` : null)
    if (blastReact && isExplosionInjury(blastReact.injury) && blastKey && blastKey !== this._blastKey) {
      this._blastKey = blastKey
      this._requestRagdoll(blastReact, down)
      return
    }

    if (this.ragdollActive) {
      if (!down && !blastReact) this._clearRagdoll()
      return
    }

    // Defeated after ragdoll: keep the death rest — don't let idle/fidget/fall-replay stand them up or sink them.
    if (this._deathLocked && down) {
      reportLiveClip(this.id, this._settleFallClip || this.body.current || 'fallBlastBack')
      return
    }

    // Prefer explicit clip from unitPose / figure.pose; gait is the exploration fallback.
    let clip = animation || null
    if (!clip) {
      if (gait === 'run') clip = 'run'
      else if (gait === 'sneakWalk') clip = 'sneakWalk'
      else if (gait === 'sneakIdle') clip = 'sneakIdle'
      else if (gait === 'walk') clip = 'walk'
      else if (gait === 'stepBack') clip = 'stepBack'
      else clip = 'idle'
    }
    // Standing idle: random look-around / shift / etc. Walk, combat poses, beam-wait clear the timer.
    if (clip === 'idle' && !this._down && this._beam !== 'waiting') {
      clip = this._idleOrFidget(performance.now())
    } else {
      this._clearFidget()
    }
    // Defeated fall (no ragdoll): play the tip, then lock a death rest once the hold finishes.
    if (down && String(clip).startsWith('fall')) {
      this._settleFallClip = clip
      if (this.body.current === clip && this.body.actionDone) {
        this.body.applyDeathRest(clip)
        this._deathLocked = true
      } else {
        this.body.play(clip)
      }
      reportLiveClip(this.id, clip)
      return
    }
    this.body.play(clip)
    reportLiveClip(this.id, this.body.current || clip)
  }

  _requestRagdoll(blastReact, down) {
    // Rapier only boots on impact — walk/idle never touch the physics world.
    if (this.physics) {
      this._activateRagdoll(blastReact, down)
      return
    }
    this._pendingBlast = { blastReact, down }
    this.host.ensurePhysics().then((physics) => {
      if (!physics || !this._pendingBlast) return
      const pending = this._pendingBlast
      this._pendingBlast = null
      this._activateRagdoll(pending.blastReact, pending.down)
    })
  }

  _activateRagdoll(blastReact, down) {
    if (!this.physics) return
    this.root.updateWorldMatrix(true, true)
    this.ragdollActive = true
    this._ragdollSettledToPose = false
    this.body.root.visible = true
    // Floor pose after settle: defeat uses the blast fall; stagger uses the shared getUp-matched fall.
    this._settleFallClip = down
      ? blastReactionAnimation(blastReact?.injury, this.id)
      : blastStaggerAnimation()
    if (!this.ragdoll) {
      this.ragdoll = new HumanoidRagdoll(this.physics, this.scene, {
        height: HEIGHT,
        materials: this.body.materials,
      })
    }
    const { impulse, point } = blastImpulseFromReact(blastReact, this.id)
    // Jointed ragdoll drives the procedural mesh; death rest is applied when it settles.
    this.body.root.userData.humanoidModel = this.body.model
    this.ragdoll.activate(this.body.root, impulse, point)
    this._pendingStaggerClear = !down
  }

  /** Drop physics and plant the procedural figure on the landing tile in a death / fall rest pose. */
  _finishRagdollOntoFloor() {
    if (this._ragdollSettledToPose) return
    this._ragdollSettledToPose = true
    this.ragdoll?.disposeBodies()
    this.ragdollActive = false
    this.root.position.set(this._tx, 0, this._tz)
    this.root.rotation.set(0, this._yawTarget, 0)
    this.root.quaternion.setFromEuler(this.root.rotation)
    this._yaw = this._yawTarget
    this._paintX = this._tx
    this._paintZ = this._tz
    const clip = this._settleFallClip || 'fallBlastBack'
    this.body.applyDeathRest(clip)
    // Defeated: lock the corpse. Stagger survivors stay unlocked so getUp can play.
    this._deathLocked = Boolean(this._down)
    reportLiveClip(this.id, clip)
  }

  _clearRagdoll() {
    this.ragdoll?.disposeBodies()
    this.ragdollActive = false
    this._ragdollSettledToPose = false
    this._settleFallClip = null
    this._deathLocked = false
    this._blastKey = null
    this._pendingStaggerClear = false
    this._pendingBlast = null
    this.body.root.visible = true
    this.root.rotation.set(0, this._yawTarget, 0)
    this.root.quaternion.setFromEuler(this.root.rotation)
    this._yaw = this._yawTarget
    // Snap joints back to a normal idle before the animator takes over again.
    this.body.model?.applyPose?.({ prop: false, aim: 0 })
    this.body.play('idle', { force: true })
  }

  update(dt) {
    if (this.ragdollActive) {
      reportLiveClip(this.id, 'ragdoll')
      if (this.ragdoll?.settled) {
        this._finishRagdollOntoFloor()
        if (this._pendingStaggerClear) {
          this._pendingStaggerClear = false
          this._staggerCallback?.()
        }
        // Fall pose is now animator-driven; continue into the normal update path.
      } else {
        return
      }
    }
    let travel = 0
    if (this._posReady && dt > 0) {
      travel = this._pendingTravel
      this._pendingTravel = 0
      this.root.position.set(this._tx, 0, this._tz)
      const yawK = 1 - Math.exp(-16 * dt)
      let dy = this._yawTarget - this._yaw
      while (dy > Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      this._yaw += dy * yawK
      this.root.rotation.y = this._yaw
      this._paintX = this.root.position.x
      this._paintZ = this.root.position.z
    }
    // Cadence from distance travelled so stride length tracks party walk/run speed.
    // Death-locked corpses keep their last applied rest — don't let the animator ease them.
    if (!(this._deathLocked && this._down)) {
      this.body.update(dt, travel)
      // After a non-ragdoll defeat fall holds its last frame, lock the corpse on a death rest.
      if (this._down && !this.ragdollActive) {
        const clip = this.body.current
        if (String(clip || '').startsWith('fall') && this.body.actionDone) {
          this._settleFallClip = clip
          this.body.applyDeathRest(clip)
          this._deathLocked = true
        }
      }
    }
    reportLiveClip(this.id, this.body.current || 'idle')
    if (this.shadow) {
      // Counter-rotate so the ellipse stays axis-aligned on the floor (reads as a contact blob).
      this.shadow.rotation.y = -this._yaw
      const bounce = this.body.bodyY
      const squash = 1 + Math.min(0.12, bounce * 0.8)
      // Plane lies in local XY; after rot.x = -π/2 that is the floor.
      this.shadow.scale.set(squash, 1 / squash, 1)
      this.shadow.material.opacity = 0.7 + Math.min(0.2, bounce * 1.5)
    }
  }

  dispose() {
    clearLiveClip(this.id)
    this._pendingBlast = null
    this.ragdoll?.dispose()
    this.ragdoll = null
    this.scene.remove(this.root)
    this.shadow?.geometry?.dispose?.()
    this.shadow?.material?.dispose?.()
    this.shadow = null
    this.body.dispose()
  }
}

export class Spike3dScene {
  constructor(canvas, map) {
    this.canvas = canvas
    this.map = map
    this.actors = new Map()
    this.physics = null
    this._physicsPromise = null
    this._ready = false
    this._disposed = false
    this._last = performance.now()

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      // Explore↔combat freezes this canvas with drawImage/toDataURL; without it the buffer is often blank.
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    // Contact blobs ground the figures; map floor is Pixi so PCF maps never land — skip the cost.
    this.renderer.shadowMap.enabled = false
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.92
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.autoClear = false
    this.renderer.sortObjects = true

    this.scene = new THREE.Scene()
    this.camera = makeIsoCamera()
    /** True after at least one frame drew with a real SVG viewBox (handoff cover waits on this). */
    this._paintedOnce = false

    // Soft board-matched light: ambient carries most of the look; key is weak so cloth stays matte.
    const hemi = new THREE.HemisphereLight(0xc8d4e4, 0x2a3038, 0.95)
    this.scene.add(hemi)
    this.sun = new THREE.DirectionalLight(0xfff2e0, 0.55)
    this.sun.position.set(6, 12, 5)
    this.sun.castShadow = false
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
    const fill = new THREE.DirectionalLight(0xa8b8c8, 0.35)
    fill.position.set(-5, 7, -3)
    this.scene.add(fill)
    const rim = new THREE.DirectionalLight(0xb0c4d8, 0.22)
    rim.position.set(-2, 5, 8)
    this.scene.add(rim)

    this.colliders = buildMapColliders(map)
    // Depth-only wall/prop boxes: characters fail the depth test behind solids so Pixi art shows through.
    this.occluderGroup = addOccluderMeshes(this.scene, this.colliders, THREE)
    this.colliderGroup = addColliderMeshes(this.scene, this.colliders, THREE)

    this._viewBox = null
    this._poses = []
  }

  async init() {
    // Pose animation only until an explosion needs Rapier.
    // No internal rAF — Pixi boardScene/battleScene call frame() after syncing the SVG viewBox
    // so 3D feet stay on the Pixi rings while the camera follows.
    this._ready = true
  }

  /**
   * One paint driven by the Pixi ticker (same viewBox sample as the rings/map).
   * poses: spike pose list; viewBox: { x, y, width, height } from the board SVG.
   * fadedKeys: tile keys / template ids whose Pixi walls are see-through — drop those occluders
   * so the full body shows and wall-fade does the read-through (no character silhouette).
   */
  frame(poses, viewBox, fadedKeys = null) {
    if (this._disposed || !this._ready) return
    this._poses = poses ?? []
    this._viewBox = viewBox
    this._syncFadedOccluders(fadedKeys)
    const now = performance.now()
    const dt = Math.min(0.05, (now - this._last) / 1000)
    this._last = now
    this._paint(dt)
  }

  _syncFadedOccluders(fadedKeys) {
    const faded = fadedKeys instanceof Set ? fadedKeys : null
    if (!this.occluderGroup) return
    for (const mesh of this.occluderGroup.children) {
      const key = mesh.userData?.fadeKey
      mesh.visible = !key || !faded?.has(key)
    }
  }

  /** Create the Rapier world + map colliders the first time a blast needs a ragdoll. */
  ensurePhysics() {
    if (this.physics) return Promise.resolve(this.physics)
    if (this._physicsPromise) return this._physicsPromise
    this._physicsPromise = PhysicsWorld.create()
      .then((world) => {
        if (this._disposed) {
          world.dispose()
          return null
        }
        world.addLevelColliders(this.colliders)
        this.physics = world
        return world
      })
      .catch((err) => {
        console.error('[spike3d] Rapier init failed', err)
        this._physicsPromise = null
        return null
      })
    return this._physicsPromise
  }

  setSize(width, height) {
    if (width < 1 || height < 1) return
    this.renderer.setSize(width, height, false)
  }

  setViewBox(viewBox) {
    this._viewBox = viewBox
  }

  setPoses(poses) {
    this._poses = poses ?? []
  }

  /** Debug: show translucent boxes for solid wall / floor colliders (Z while spike3d is on). */
  setCollidersVisible(on) {
    if (this.colliderGroup) this.colliderGroup.visible = Boolean(on)
  }

  toggleCollidersVisible() {
    const next = !this.colliderGroup?.visible
    this.setCollidersVisible(next)
    return next
  }

  _syncActors() {
    const seen = new Set()
    const now = performance.now()
    for (const pose of this._poses) {
      if (!pose?.id) continue
      seen.add(pose.id)
      let actor = this.actors.get(pose.id)
      if (!actor) {
        actor = new SpikeActor(pose.id, this, {
          uniform: pose.colour,
          enemy: pose.enemy,
          appearance: pose.appearance,
        })
        this.actors.set(pose.id, actor)
      }
      actor.setPose(pose)
    }
    // Linger before dispose so a one-frame pose gap (beam filter, reconcile order) cannot blink bodies out.
    const LINGER_MS = 400
    for (const [id, actor] of this.actors) {
      if (seen.has(id)) continue
      if (now - (actor._lastSeen ?? 0) < LINGER_MS) continue
      actor.dispose()
      this.actors.delete(id)
    }
  }

  _anyRagdoll() {
    for (const actor of this.actors.values()) {
      if (actor.ragdollActive) return true
    }
    return false
  }

  _paint(dt) {
    this._syncActors()
    for (const actor of this.actors.values()) actor.update(dt)
    // Step Rapier only while at least one body is tumbling.
    if (this.physics && this._anyRagdoll()) this.physics.step(dt)

    this.renderer.setScissorTest(false)
    this.renderer.clear()
    // Wait for the SVG viewBox — drawing with the default ortho camera places figures wrong for a frame.
    if (!this._viewBox?.width) return
    syncIsoCamera(this.camera, this._viewBox, this.renderer)
    this._paintedOnce = true

    if (this._poses.length) {
      let sx = 0
      let sz = 0
      for (const p of this._poses) {
        sx += p.position?.x ?? 0
        sz += p.position?.y ?? 0
      }
      const n = this._poses.length
      this.sun.target.position.set(sx / n, 0, sz / n)
      this.sun.target.updateMatrixWorld()
      this.sun.position.set(sx / n + 8, 14, sz / n + 6)
    }

    // Painter order by tile x+z among characters. Occluders hide people behind solid walls; faded
    // Pixi walls drop their occluders so wall-fade shows the full body through (no ghost silhouette).
    const list = [...this.actors.values()].sort((a, b) => {
      const d = a.paintKey() - b.paintKey()
      return d !== 0 ? d : String(a.id).localeCompare(String(b.id))
    })
    for (const actor of list) actor.setVisible(false)
    if (list.length === 0) {
      this.renderer.render(this.scene, this.camera)
    } else {
      for (const actor of list) {
        this.renderer.clearDepth()
        actor.setVisible(true)
        this.renderer.render(this.scene, this.camera)
        actor.setVisible(false)
      }
      for (const actor of list) actor.setVisible(true)
    }
  }

  dispose() {
    this._disposed = true
    for (const actor of this.actors.values()) actor.dispose()
    this.actors.clear()
    this.physics?.dispose()
    this.physics = null
    this._physicsPromise = null
    this.occluderGroup?.userData?.dispose?.()
    if (this.occluderGroup) this.scene.remove(this.occluderGroup)
    this.occluderGroup = null
    this.colliderGroup?.userData?.dispose?.()
    if (this.colliderGroup) this.scene.remove(this.colliderGroup)
    this.colliderGroup = null
    this.renderer.dispose()
  }
}
