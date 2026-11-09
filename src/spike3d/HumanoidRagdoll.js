import * as THREE from 'three'

/**
 * Capsule/box Rapier ragdoll that drives the procedural HumanoidModel joints.
 * Colliders stay cheap proxies; the live figure (hair, race meshes, cloth) is what you see.
 * Short flight → freeze → SpikeActor plants a death rest.
 */
export class HumanoidRagdoll {
  constructor(physics, scene, { height = 2.0, materials = {} } = {}) {
    this.physics = physics
    this.RAPIER = physics.RAPIER
    this.world = physics.world
    this.scene = scene
    this.height = height
    // Procedural officer is authored ~SPRITE_HEIGHT_PX / 32 ≈ 2 world units.
    this.u = height / 2
    this.active = false
    // Debug-only container (no low-poly body meshes in the normal path).
    this.root = new THREE.Group()
    this.root.name = 'humanoid_ragdoll'
    this.root.visible = false
    this.scene.add(this.root)

    this.bodies = {}
    this.joints = []
    this._owned = []
    this._drive = []
    this._model = null
    this.settled = false
    this._poseLocked = false
    this._age = 0
    this._stillTime = 0
    // Floor-first settle: freeze on first floor contact unless a wall/prop was hit earlier.
    this._hitWall = false
    this._hitFloor = false
    this._wasAirborne = false
    this._colliderHandles = new Set()
    /** @type {Map<number, string>} collider handle → body name */
    this._colliderBodyName = new Map()

    this._bodyM = new THREE.Matrix4()
    this._worldM = new THREE.Matrix4()
    this._parentInv = new THREE.Matrix4()
    this._localM = new THREE.Matrix4()
    this._pos = new THREE.Vector3()
    this._quat = new THREE.Quaternion()
    this._scl = new THREE.Vector3()
    this._one = new THREE.Vector3(1, 1, 1)

    // Kept for callers that still pass materials (optional future debug paint).
    this.matRobe = materials.robe ?? null
    this.matRobeDk = materials.robeDk ?? null
    this.matSkin = materials.skin ?? null
    this.matHood = materials.hood ?? null
    this.matBoot = materials.boots ?? null
    // Optional Animation Viewer overrides. Null → combat hard-coded defaults below.
    this.tuning = null
  }

  /** @param {object|null} tuning viewer knobs from ragdollSettings.js; null restores combat defaults */
  setTuning(tuning) {
    this.tuning = tuning ? { ...tuning } : null
  }

  _createBody(name, translation, rotation, colliderDesc, mass) {
    const R = this.RAPIER
    const t = this.tuning
    const rbDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(translation.x, translation.y, translation.z)
      .setCanSleep(true)
      // Slightly sticky so the first bounce doesn't skate across the deck.
      .setLinearDamping(t?.linearDamping ?? 0.85)
      .setAngularDamping(t?.angularDamping ?? 1.15)
      .setCcdEnabled(true)
    if (rotation) rbDesc.setRotation(rotation)
    const body = this.world.createRigidBody(rbDesc)
    colliderDesc
      .setMass(mass)
      .setFriction(t?.friction ?? 1.35)
      .setRestitution(t?.restitution ?? 0.02)
      .setActiveCollisionTypes(R.ActiveCollisionTypes.DEFAULT)
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
    const collider = this.world.createCollider(colliderDesc, body)
    this._colliderHandles.add(collider.handle)
    this._colliderBodyName.set(collider.handle, name)
    this.bodies[name] = body
    return body
  }

  ownsCollider(handle) {
    return this._colliderHandles.has(handle)
  }

  /**
   * Level contact from PhysicsWorld (`floor` | `wall` | `prop`).
   * Floor only counts for hips/torso/head after the body has been airborne — boots scrape the
   * deck on spawn and would otherwise freeze every throw before a wall can register.
   */
  onLevelContact(kind, myHandle) {
    if (!this.active || this.settled) return
    if (kind === 'wall' || kind === 'prop') {
      this._hitWall = true
      return
    }
    if (kind !== 'floor') return
    const part = this._colliderBodyName.get(myHandle)
    if (part !== 'hips' && part !== 'torso' && part !== 'head') return
    if (!this._wasAirborne) return
    this._hitFloor = true
  }

  _jointSpherical(a, b, anchorA, anchorB) {
    const R = this.RAPIER
    const data = R.JointData.spherical(anchorA, anchorB)
    const joint = this.world.createImpulseJoint(data, a, b, true)
    this.joints.push(joint)
    return joint
  }

  _wp(obj, fallback) {
    const v = new THREE.Vector3()
    if (obj) obj.getWorldPosition(v)
    else v.copy(fallback)
    return v
  }

  /** Record joint ↔ rigid-body offset at activate so sync keeps the mesh glued to physics. */
  _captureDrive(name, object) {
    const body = this.bodies[name]
    if (!body || !object) return
    const t = body.translation()
    const r = body.rotation()
    this._pos.set(t.x, t.y, t.z)
    this._quat.set(r.x, r.y, r.z, r.w)
    this._bodyM.compose(this._pos, this._quat, this._one)
    object.updateWorldMatrix(true, false)
    const offset = new THREE.Matrix4().copy(this._bodyM).invert().multiply(object.matrixWorld)
    // Keep authored scale — decompose every frame was flipping/jittering limbs.
    const bindScale = object.scale.clone()
    this._drive.push({ name, object, offset, bindScale })
  }

  /** Write a world matrix onto obj as local TR relative to its parent (scale stays bind). */
  _setWorldMatrix(obj, worldM, bindScale) {
    if (!obj?.parent) {
      worldM.decompose(obj.position, obj.quaternion, this._scl)
      if (bindScale) obj.scale.copy(bindScale)
      return
    }
    obj.parent.updateWorldMatrix(true, false)
    this._parentInv.copy(obj.parent.matrixWorld).invert()
    this._localM.multiplyMatrices(this._parentInv, worldM)
    this._localM.decompose(obj.position, obj.quaternion, this._scl)
    if (bindScale) obj.scale.copy(bindScale)
  }

  /** Straight bind pose on driven joints so leg/arm offsets aren't fighting idle bend. */
  _zeroDrivenJoints(model) {
    if (!model) return
    const zero = (obj) => {
      if (!obj) return
      obj.rotation.set(0, 0, 0)
    }
    zero(model.hips)
    zero(model.spine)
    zero(model.torso)
    zero(model.headRoot)
    for (const leg of model.legs ?? []) {
      zero(leg.thigh)
      zero(leg.shin)
      zero(leg.foot)
    }
    for (const arm of model.arms ?? []) {
      zero(arm.shoulder)
      zero(arm.upper)
      zero(arm.forearm)
      zero(arm.hand)
    }
  }

  /**
   * Build ragdoll at the character's current world pose and knock it with impulse.
   * @param {THREE.Object3D} modelRoot procedural body root (world-updated)
   * @param {{ x:number,y:number,z:number }} impulse world-space impulse
   * @param {{ x:number,y:number,z:number }|null} hitPoint optional world hit point
   */
  activate(modelRoot, impulse, hitPoint = null) {
    this.disposeBodies()
    this.active = true
    this.settled = false
    this._poseLocked = false
    this._age = 0
    this._stillTime = 0
    this._hitWall = false
    this._hitFloor = false
    this._wasAirborne = false
    this.root.visible = false

    modelRoot.updateWorldMatrix(true, true)
    const u = this.u
    const R = this.RAPIER
    const model = modelRoot.userData?.humanoidModel ?? null
    this._model = model

    // Straight bind so limb offsets aren't fighting idle bend; animator is frozen while active.
    model?.applyPose?.({ prop: false, aim: 0 })
    if (model?.pitchPivot) {
      model.pitchPivot.rotation.set(0, 0, 0)
      model.pitchPivot.position.set(0, 0, 0)
    }
    if (model?.body) model.body.position.set(0, 0, 0)
    this._zeroDrivenJoints(model)
    modelRoot.updateWorldMatrix(true, true)

    const hipsWP = this._wp(model?.hips, this._wp(modelRoot, new THREE.Vector3()))
    const torsoWP = this._wp(model?.torso ?? model?.chest, hipsWP.clone().add(new THREE.Vector3(0, 0.45 * u, 0)))
    const headWP = this._wp(model?.headRoot, hipsWP.clone().add(new THREE.Vector3(0, 0.95 * u, 0)))

    const qRoot = new THREE.Quaternion()
    modelRoot.getWorldQuaternion(qRoot)
    const rot = { x: qRoot.x, y: qRoot.y, z: qRoot.z, w: qRoot.w }

    this._createBody('hips', hipsWP, rot, R.ColliderDesc.cuboid(0.15 * u, 0.1 * u, 0.11 * u), 3.2)

    const torsoPos = { x: torsoWP.x, y: torsoWP.y + 0.18 * u, z: torsoWP.z }
    this._createBody('torso', torsoPos, rot, R.ColliderDesc.cuboid(0.17 * u, 0.25 * u, 0.12 * u), 4.8)

    const headPos = { x: headWP.x, y: headWP.y + 0.08 * u, z: headWP.z }
    this._createBody('head', headPos, rot, R.ColliderDesc.ball(0.12 * u), 1.1)

    const thighLen = 0.38 * u
    const shinLen = 0.36 * u
    const upperLen = 0.3 * u
    const foreLen = 0.28 * u
    const sideSign = [1, -1]

    for (let i = 0; i < 2; i += 1) {
      const side = sideSign[i]
      const tag = side > 0 ? 'L' : 'R'
      // Model: legs/arms[0] = +X = R, [1] = −X = L — opposite of this loop's tag when side>0.
      const leg = model?.legs?.[side > 0 ? 1 : 0]
      const arm = model?.arms?.[side > 0 ? 1 : 0]

      const thighSample = this._wp(leg?.thigh, null)
      const shinSample = this._wp(leg?.shin, null)
      const shoulderSample = this._wp(arm?.shoulder, null)
      const forearmSample = this._wp(arm?.forearm, null)

      const localHip = new THREE.Vector3(side * 0.12 * u, -0.12 * u, 0).applyQuaternion(qRoot)
      const thighPos = thighSample
        ? { x: thighSample.x, y: thighSample.y - thighLen * 0.35, z: thighSample.z }
        : {
            x: hipsWP.x + localHip.x,
            y: hipsWP.y + localHip.y - thighLen * 0.35,
            z: hipsWP.z + localHip.z,
          }
      this._createBody(
        `thigh${tag}`,
        thighPos,
        rot,
        R.ColliderDesc.capsule(thighLen * 0.26, 0.065 * u),
        2.0,
      )

      const shinPos = shinSample
        ? { x: shinSample.x, y: shinSample.y - shinLen * 0.35, z: shinSample.z }
        : {
            x: thighPos.x,
            y: thighPos.y - thighLen * 0.75,
            z: thighPos.z,
          }
      this._createBody(
        `shin${tag}`,
        shinPos,
        rot,
        R.ColliderDesc.capsule(shinLen * 0.22, 0.055 * u),
        1.5,
      )
      this._createBody(
        `boot${tag}`,
        { x: shinPos.x, y: shinPos.y - shinLen * 0.55, z: shinPos.z + 0.04 * u },
        rot,
        R.ColliderDesc.cuboid(0.05 * u, 0.04 * u, 0.08 * u),
        0.6,
      )

      const localShoulder = new THREE.Vector3(side * 0.2 * u, 0.32 * u, 0).applyQuaternion(qRoot)
      const upperPos = shoulderSample
        ? { x: shoulderSample.x, y: shoulderSample.y - upperLen * 0.25, z: shoulderSample.z }
        : {
            x: torsoPos.x + localShoulder.x,
            y: torsoPos.y + localShoulder.y - upperLen * 0.2,
            z: torsoPos.z + localShoulder.z,
          }
      this._createBody(
        `upper${tag}`,
        upperPos,
        rot,
        R.ColliderDesc.capsule(upperLen * 0.22, 0.05 * u),
        1.3,
      )

      const forePos = forearmSample
        ? { x: forearmSample.x, y: forearmSample.y - foreLen * 0.3, z: forearmSample.z }
        : {
            x: upperPos.x,
            y: upperPos.y - upperLen * 0.7,
            z: upperPos.z,
          }
      this._createBody(
        `fore${tag}`,
        forePos,
        rot,
        R.ColliderDesc.capsule(foreLen * 0.2, 0.04 * u),
        0.9,
      )
    }

    const hips = this.bodies.hips
    const torso = this.bodies.torso
    const head = this.bodies.head

    this._jointSpherical(hips, torso, { x: 0, y: 0.1 * u, z: 0 }, { x: 0, y: -0.26 * u, z: 0 })
    this._jointSpherical(torso, head, { x: 0, y: 0.28 * u, z: 0 }, { x: 0, y: -0.12 * u, z: 0 })

    for (const tag of ['L', 'R']) {
      const side = tag === 'L' ? 1 : -1
      this._jointSpherical(
        hips,
        this.bodies[`thigh${tag}`],
        { x: side * 0.1 * u, y: -0.08 * u, z: 0 },
        { x: 0, y: 0.16 * u, z: 0 },
      )
      this._jointSpherical(
        this.bodies[`thigh${tag}`],
        this.bodies[`shin${tag}`],
        { x: 0, y: -0.18 * u, z: 0 },
        { x: 0, y: 0.16 * u, z: 0 },
      )
      this._jointSpherical(
        this.bodies[`shin${tag}`],
        this.bodies[`boot${tag}`],
        { x: 0, y: -0.16 * u, z: 0 },
        { x: 0, y: 0.04 * u, z: 0 },
      )
      this._jointSpherical(
        torso,
        this.bodies[`upper${tag}`],
        { x: side * 0.18 * u, y: 0.2 * u, z: 0 },
        { x: 0, y: 0.12 * u, z: 0 },
      )
      this._jointSpherical(
        this.bodies[`upper${tag}`],
        this.bodies[`fore${tag}`],
        { x: 0, y: -0.14 * u, z: 0 },
        { x: 0, y: 0.12 * u, z: 0 },
      )
    }

    // Capture joint offsets after bodies exist (parent → child order for sync).
    // Feet stay parented under shins (no boot drive) — independent boot bodies twisted the legs.
    if (model) {
      modelRoot.updateWorldMatrix(true, true)
      this._captureDrive('hips', model.hips)
      this._captureDrive('torso', model.torso)
      this._captureDrive('head', model.headRoot)
      // Model index 0 = R (+X), 1 = L (−X).
      this._captureDrive('thighR', model.legs?.[0]?.thigh)
      this._captureDrive('shinR', model.legs?.[0]?.shin)
      this._captureDrive('thighL', model.legs?.[1]?.thigh)
      this._captureDrive('shinL', model.legs?.[1]?.shin)
      this._captureDrive('upperR', model.arms?.[0]?.upper)
      this._captureDrive('foreR', model.arms?.[0]?.forearm)
      this._captureDrive('upperL', model.arms?.[1]?.upper)
      this._captureDrive('foreL', model.arms?.[1]?.forearm)
    }

    // Soft throw; short settle window plants the death pose sooner.
    const raw = impulse ?? { x: 0, y: 4, z: -6 }
    const t = this.tuning
    const scale = t?.impulseScale ?? 0.48
    const minLift = t ? 0 : 3.0
    const imp = {
      x: raw.x * scale,
      y: Math.max(minLift, raw.y * scale),
      z: raw.z * scale,
    }
    const point = hitPoint ?? torsoPos
    torso.applyImpulseAtPoint(imp, point, true)
    hips.applyImpulse(
      {
        x: imp.x * 0.65,
        y: Math.max(t ? 0 : 2.4, imp.y * 0.5) + (t ? imp.y * 0.25 : 1.4),
        z: imp.z * 0.65,
      },
      true,
    )
    head.applyImpulse({ x: imp.x * 0.35, y: imp.y * 0.28 + (t ? 0 : 0.8), z: imp.z * 0.35 }, true)
    for (const tag of ['L', 'R']) {
      this.bodies[`thigh${tag}`]?.applyImpulse({ x: imp.x * 0.16, y: imp.y * 0.1, z: imp.z * 0.16 }, true)
      this.bodies[`upper${tag}`]?.applyImpulse({ x: imp.x * 0.2, y: imp.y * 0.14, z: imp.z * 0.2 }, true)
    }

    const torque = t?.torque ?? 1.6
    torso.applyTorqueImpulse(
      {
        x: (Math.random() - 0.5) * torque * 0.875,
        y: (Math.random() - 0.5) * torque * 1.125,
        z: (Math.random() - 0.5) * torque * 0.875,
      },
      true,
    )

    this.physics.registerRagdoll(this)
    this.syncFromPhysics()
  }

  /**
   * Short settle:
   * - No wall/prop hit yet → freeze on first floor contact (after a tiny air time).
   * - Hit a wall/prop first → keep flopping briefly until motion dies near the floor.
   * Hard cap is short so SpikeActor can hand off to a death rest quickly.
   */
  tickSettle(dt) {
    if (!this.active || this.settled) return
    this._age += dt
    const t = this.tuning
    const floorDelay = t?.floorFreezeDelay ?? 0.08
    const settleMax = t?.settleMaxAge ?? 1.6
    const freezeOnFloor = t?.freezeOnFloor !== false
    const dampRamp = t?.dampRamp !== false

    const hipsY = this.bodies.hips?.translation()?.y ?? 0
    if (hipsY > 0.55 * this.u) this._wasAirborne = true

    // Direct-to-deck: stop when the torso hits the floor, unless we already glanced a bulkhead.
    if (freezeOnFloor && this._hitFloor && !this._hitWall && this._age > floorDelay) {
      this.freeze()
      return
    }

    let maxSpeed = 0
    let maxSpin = 0
    let nearFloor = false
    for (const body of Object.values(this.bodies)) {
      const lv = body.linvel()
      const av = body.angvel()
      const speed = Math.hypot(lv.x, lv.y, lv.z)
      const spin = Math.hypot(av.x, av.y, av.z)
      if (speed > maxSpeed) maxSpeed = speed
      if (spin > maxSpin) maxSpin = spin
      if (body.translation().y < 0.45 * this.u) nearFloor = true
    }

    // Bleed energy early so wall-hit flops plant quickly.
    if (dampRamp && this._age > 0.1) {
      const damp = 1.4 + Math.min(8, this._age * 3.5)
      const angDamp = 1.8 + Math.min(9, this._age * 3.8)
      for (const body of Object.values(this.bodies)) {
        body.setLinearDamping(damp)
        body.setAngularDamping(angDamp)
      }
    }

    const quiet = maxSpeed < 0.55 && maxSpin < 1.4
    if (quiet && (nearFloor || this._hitFloor || this._age > Math.min(0.45, settleMax * 0.3))) {
      this._stillTime += dt
    } else {
      this._stillTime = 0
    }

    if (this._stillTime > 0.12 || this._age > settleMax) {
      this.freeze()
    }
  }

  /** Lock pose in place once settled on the floor. */
  freeze() {
    if (this.settled || !this.active) return
    this.settled = true
    const R = this.RAPIER
    for (const body of Object.values(this.bodies)) {
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      body.setBodyType(R.RigidBodyType.Fixed, true)
      body.sleep()
    }
    // One last mesh sync, then stop writing joints (kills end-of-flop jitter).
    this.syncFromPhysics()
    this._poseLocked = true
  }

  syncFromPhysics() {
    if (!this.active || !this._drive.length || this._poseLocked) return
    for (const entry of this._drive) {
      const body = this.bodies[entry.name]
      if (!body || !entry.object) continue
      const t = body.translation()
      const r = body.rotation()
      this._pos.set(t.x, t.y, t.z)
      this._quat.set(r.x, r.y, r.z, r.w)
      this._bodyM.compose(this._pos, this._quat, this._one)
      this._worldM.multiplyMatrices(this._bodyM, entry.offset)
      this._setWorldMatrix(entry.object, this._worldM, entry.bindScale)
      entry.object.updateMatrixWorld(true)
    }
  }

  disposeBodies() {
    this.physics.unregisterRagdoll(this)
    for (const joint of this.joints) {
      this.world.removeImpulseJoint(joint, true)
    }
    this.joints.length = 0
    for (const body of Object.values(this.bodies)) {
      this.world.removeRigidBody(body)
    }
    this.bodies = {}
    this._drive = []
    this._model = null
    this._colliderHandles.clear()
    this._colliderBodyName.clear()
    this.active = false
    this.settled = false
    this._poseLocked = false
    this._hitWall = false
    this._hitFloor = false
    this._wasAirborne = false
    this._age = 0
    this._stillTime = 0
    this.root.visible = false
  }

  dispose() {
    this.disposeBodies()
    this.scene.remove(this.root)
    for (const item of this._owned) item.dispose?.()
    this._owned.length = 0
  }
}
