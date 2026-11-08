import * as THREE from 'three'
import { isExplosionInjury } from '../rules/appearance.js'
import { facingToYaw, makeIsoCamera, syncIsoCamera } from './isoProjection.js'
import { resolveSpike3dAppearance } from './appearance.js'
import { ProceduralBody, PROCEDURAL_HEIGHT } from './ProceduralBody.js'
import { HumanoidRagdoll } from './HumanoidRagdoll.js'
import { createContactShadow } from './contactShadow.js'
import { addColliderMeshes, buildMapColliders } from './mapColliders.js'
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
  // Strong enough to clear the tile; HumanoidRagdoll scales again for settle feel.
  const power = 10 + radius * 4.5 + (String(seed).length % 4)
  return {
    impulse: { x: dx * power, y: 7 + radius * 1.6, z: dz * power },
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
      ? `${resolved.species}|${resolved.gender}|${resolved.hairStyle}|${resolved.hairColour}|${resolved.klingonArmour}|${resolved.uniform ?? ''}`
      : null
    this._paintX = 0
    this._paintZ = 0
    this._tx = 0
    this._tz = 0
    this._yaw = Math.PI / 4
    this._yawTarget = this._yaw
    this._posReady = false
    this._pendingTravel = 0
    this.scene.add(this.root)
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
    const show = Boolean(visible) && this._beam !== 'waiting'
    this.root.visible = show && !this.ragdollActive
    if (this.shadow) this.shadow.visible = show && !this.ragdollActive
    if (this.ragdoll?.root) this.ragdoll.root.visible = show && this.ragdollActive && this.ragdoll.active
  }

  setPose({ position, facing, gait, animation, down, beam, blastReact, onStaggerDone, colour, appearance }) {
    this._staggerCallback = onStaggerDone ?? null
    this._down = Boolean(down)
    this._beam = beam ?? null
    this._lastSeen = performance.now()
    if (appearance) {
      const key = `${appearance.species}|${appearance.gender}|${appearance.hairStyle}|${appearance.hairColour}|${appearance.klingonArmour}|${appearance.uniform ?? ''}`
      if (key !== this._appearanceKey) {
        this._appearanceKey = key
        this.body.setAppearance(appearance)
      }
    } else if (colour != null && colour !== this._colourKey) {
      this._colourKey = colour
      this.body.setUniform(colour)
    }
    if (!position) return

    if (!this.ragdollActive) {
      // Sim delta drives stride cadence (setPose runs before update, so root is already snapped).
      if (this._posReady) {
        this._pendingTravel = Math.hypot(position.x - this._tx, position.y - this._tz)
      }
      this._tx = position.x
      this._tz = position.y
      this._yawTarget = facingToYaw(facing)
      // Feet stay on the selection ring — soft position lag slid every figure off its circle in sync.
      this.root.position.set(this._tx, 0, this._tz)
      this._paintX = this._tx
      this._paintZ = this._tz
      if (!this._posReady) {
        this._posReady = true
        this._yaw = this._yawTarget
        this.root.rotation.y = this._yaw
      }
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

    // Prefer explicit clip from unitPose / figure.pose; gait is the exploration fallback.
    let clip = animation || null
    if (!clip) {
      if (gait === 'run') clip = 'run'
      else if (gait === 'sneakWalk') clip = 'sneakWalk'
      else if (gait === 'sneakIdle') clip = 'sneakIdle'
      else if (gait === 'walk') clip = 'walk'
      else clip = 'idle'
    }
    this.body.play(clip)
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
    this.body.root.visible = false
    this.ragdollActive = true
    if (!this.ragdoll) {
      this.ragdoll = new HumanoidRagdoll(this.physics, this.scene, {
        height: HEIGHT,
        materials: this.body.materials,
      })
    }
    const { impulse, point } = blastImpulseFromReact(blastReact, this.id)
    this.body.root.userData.humanoidModel = this.body.model
    this.ragdoll.activate(this.body.root, impulse, point)
    this._pendingStaggerClear = !down
  }

  _clearRagdoll() {
    this.ragdoll?.disposeBodies()
    this.ragdollActive = false
    this._blastKey = null
    this._pendingStaggerClear = false
    this._pendingBlast = null
    this.body.root.visible = true
    this.root.rotation.x = 0
    this.root.rotation.z = 0
    this.body.play('idle', { force: true })
  }

  update(dt) {
    if (this.ragdollActive) {
      if (this._pendingStaggerClear && this.ragdoll?.settled) {
        this._pendingStaggerClear = false
        this._staggerCallback?.()
      }
      return
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
    this.body.update(dt, travel)
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
   */
  frame(poses, viewBox) {
    if (this._disposed || !this._ready) return
    this._poses = poses ?? []
    this._viewBox = viewBox
    const now = performance.now()
    const dt = Math.min(0.05, (now - this._last) / 1000)
    this._last = now
    this._paint(dt)
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

    // Painter order by tile x+z (iso depth). Wall occlusion uses Pixi wall-fade while spike3d is on.
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
    this.colliderGroup?.userData?.dispose?.()
    if (this.colliderGroup) this.scene.remove(this.colliderGroup)
    this.colliderGroup = null
    this.renderer.dispose()
  }
}
