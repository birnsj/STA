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

  /**
   * Rapier interaction groups: high 16 = membership, low 16 = filter mask.
   * Head must NOT collide with arms — the skull was shoving the shoulder capsules
   * so the sleeves looked like they were glued to the head.
   */
  static _COL = {
    WORLD: 0x0001,
    BODY: 0x0002,
    HEAD: 0x0004,
    ARM: 0x0008,
  }

  _groups(membership, filterMask) {
    return ((membership & 0xffff) << 16) | (filterMask & 0xffff)
  }

  _createBody(name, translation, rotation, colliderDesc, mass, group = 'body') {
    const R = this.RAPIER
    const t = this.tuning
    const C = HumanoidRagdoll._COL
    const rbDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(translation.x, translation.y, translation.z)
      .setCanSleep(true)
      // Slightly sticky so the first bounce doesn't skate across the deck.
      .setLinearDamping(t?.linearDamping ?? 1.0)
      .setAngularDamping(t?.angularDamping ?? 3.2)
      .setCcdEnabled(true)
    if (rotation) rbDesc.setRotation(rotation)
    const body = this.world.createRigidBody(rbDesc)

    let membership = C.BODY
    let filter = C.WORLD | C.BODY | C.HEAD | C.ARM
    if (group === 'head') {
      membership = C.HEAD
      // Skull hits the deck and torso — not the shoulder/forearm capsules.
      filter = C.WORLD | C.BODY
    } else if (group === 'arm') {
      membership = C.ARM
      filter = C.WORLD | C.BODY | C.ARM
    }

    colliderDesc
      .setMass(mass)
      .setFriction(t?.friction ?? 1.35)
      .setRestitution(t?.restitution ?? 0.02)
      .setCollisionGroups(this._groups(membership, filter))
      .setSolverGroups(this._groups(membership, filter))
      // Keep self-collision so limbs don't sink into the torso into a compact pile.
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
    if (part !== 'hips' && part !== 'spine' && part !== 'torso' && part !== 'head') return
    if (!this._wasAirborne) return
    this._hitFloor = true
  }

  _jointSpherical(a, b, anchorA, anchorB, { contacts = false } = {}) {
    const R = this.RAPIER
    const data = R.JointData.spherical(anchorA, anchorB)
    const joint = this.world.createImpulseJoint(data, a, b, true)
    // Adjacent segments start near each other — contacts here explode the flop.
    joint.setContactsEnabled?.(contacts)
    this.joints.push(joint)
    return joint
  }

  /** Hinge with human range — primary tool for a readable fall (no ball-joint windmills). */
  _jointRevolute(a, b, anchorA, anchorB, axis, min = 0, max = Math.PI * 0.7, { contacts = false } = {}) {
    const R = this.RAPIER
    const data = R.JointData.revolute(anchorA, anchorB, axis)
    const joint = this.world.createImpulseJoint(data, a, b, true)
    joint.setLimits?.(min, max)
    joint.setContactsEnabled?.(contacts)
    this.joints.push(joint)
    return joint
  }

  _wp(obj, fallback) {
    const v = new THREE.Vector3()
    if (obj) obj.getWorldPosition(v)
    else v.copy(fallback)
    return v
  }

  /** World point → rigid-body local (matches joint anchors to visual sockets). */
  _bodyLocal(body, worldPoint) {
    const t = body.translation()
    const r = body.rotation()
    this._pos.set(worldPoint.x - t.x, worldPoint.y - t.y, worldPoint.z - t.z)
    this._quat.set(r.x, r.y, r.z, r.w).invert()
    this._pos.applyQuaternion(this._quat)
    return { x: this._pos.x, y: this._pos.y, z: this._pos.z }
  }

  /**
   * Record joint ↔ rigid-body offset at activate so sync keeps the mesh glued to physics.
   * @param {{ rotationOnly?: boolean }} [opts] — shoulder sockets keep authored local position
   *   on the chest; only their swing comes from physics (stops sleeves sliding into the neck).
   */
  _captureDrive(name, object, opts = {}) {
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
    const bindPos = object.position.clone()
    this._drive.push({
      name,
      object,
      offset,
      bindScale,
      bindPos,
      rotationOnly: Boolean(opts.rotationOnly),
    })
  }

  /** Write a world matrix onto obj as local TR relative to its parent (scale stays bind). */
  _setWorldMatrix(obj, worldM, bindScale, bindPos = null) {
    if (!obj?.parent) {
      worldM.decompose(obj.position, obj.quaternion, this._scl)
      if (bindScale) obj.scale.copy(bindScale)
      if (bindPos) obj.position.copy(bindPos)
      return
    }
    obj.parent.updateWorldMatrix(true, false)
    this._parentInv.copy(obj.parent.matrixWorld).invert()
    this._localM.multiplyMatrices(this._parentInv, worldM)
    this._localM.decompose(obj.position, obj.quaternion, this._scl)
    if (bindScale) obj.scale.copy(bindScale)
    // Socket joints (shoulders): keep the authored mount point on the chest.
    if (bindPos) obj.position.copy(bindPos)
  }

  /** Upright rest with a slight knee bend — ready to tip, not already crumpled. */
  _zeroDrivenJoints(model) {
    if (!model) return
    const zero = (obj) => {
      if (!obj) return
      obj.rotation.set(0, 0, 0)
      obj.quaternion.identity()
    }
    zero(model.hips)
    zero(model.spine)
    zero(model.torso)
    zero(model.headRoot)
    for (const leg of model.legs ?? []) {
      zero(leg.thigh)
      zero(leg.shin)
      zero(leg.foot)
      if (leg.thigh) leg.thigh.rotation.x = 0.08
      if (leg.shin) leg.shin.rotation.x = 0.16
      if (leg.foot) leg.foot.rotation.x = -0.08
    }
    for (const arm of model.arms ?? []) {
      zero(arm.shoulder)
      zero(arm.upper)
      zero(arm.forearm)
      zero(arm.hand)
      // Upper stays identity — physics drives the shoulder joint.
      if (arm.shoulder) arm.shoulder.rotation.z = (arm.side ?? 1) * 0.06
      if (arm.forearm) arm.forearm.rotation.x = -0.2
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

    // Keep the upright stance, but clear arm locals: physics drives `upper` / `forearm`.
    // Leaving idle rotation on `upper` while driving `shoulder` double-rotated the arm cylinder.
    if (model?.pitchPivot) {
      model.pitchPivot.rotation.set(0, 0, 0)
      model.pitchPivot.position.set(0, 0, 0)
    }
    if (model?.body) model.body.position.x = 0
    for (const arm of model?.arms ?? []) {
      if (arm.shoulder) arm.shoulder.rotation.set(0, 0, (arm.side ?? 1) * 0.04)
      if (arm.upper) {
        arm.upper.position.set(0, 0, 0)
        arm.upper.rotation.set(0, 0, 0)
      }
      if (arm.forearm) arm.forearm.rotation.set(0, 0, 0)
    }
    modelRoot.updateWorldMatrix(true, true)

    const hipsWP = this._wp(model?.hips, this._wp(modelRoot, new THREE.Vector3()))
    const torsoWP = this._wp(model?.torso ?? model?.chest, hipsWP.clone().add(new THREE.Vector3(0, 0.45 * u, 0)))

    const qRoot = new THREE.Quaternion()
    modelRoot.getWorldQuaternion(qRoot)
    const qHips = new THREE.Quaternion()
    const qTorso = new THREE.Quaternion()
    if (model?.hips) model.hips.getWorldQuaternion(qHips)
    else qHips.copy(qRoot)
    if (model?.torso) model.torso.getWorldQuaternion(qTorso)
    else qTorso.copy(qRoot)
    const rotOf = (q) => ({ x: q.x, y: q.y, z: q.z, w: q.w })

    // Colliders sized close to the visual mesh so limbs don't ghost through the torso.
    // No separate head body: a free skull was collapsing into the shoulder-bar mesh.
    // Head stays at bind under torso, so the shoulder girdle and head tip as one piece.
    this._createBody('hips', hipsWP, rotOf(qHips), R.ColliderDesc.cuboid(0.16 * u, 0.1 * u, 0.11 * u), 3.5)
    const torsoPos = { x: torsoWP.x, y: torsoWP.y + 0.08 * u, z: torsoWP.z }
    this._createBody('torso', torsoPos, rotOf(qTorso), R.ColliderDesc.cuboid(0.16 * u, 0.2 * u, 0.1 * u), 6.2)

    // Limb lengths match HumanoidModel proportions (hang along joint −Y).
    const thighLen = 0.36 * u
    const shinLen = 0.34 * u
    const upperLen = 0.28 * u
    const foreLen = 0.26 * u
    const qTmp = new THREE.Quaternion()
    const vTmp = new THREE.Vector3()

    /** Mid-limb capsule: same world orient as the joint, center halfway down −Y. */
    const limbPose = (joint, length, fallbackPos, fallbackSide) => {
      if (joint) {
        joint.getWorldPosition(vTmp)
        joint.getWorldQuaternion(qTmp)
      } else {
        vTmp.copy(fallbackPos)
        qTmp.copy(qRoot)
        vTmp.x += fallbackSide * 0.12 * u
      }
      const mid = new THREE.Vector3(0, -length * 0.5, 0).applyQuaternion(qTmp)
      return {
        pos: { x: vTmp.x + mid.x, y: vTmp.y + mid.y, z: vTmp.z + mid.z },
        rot: { x: qTmp.x, y: qTmp.y, z: qTmp.z, w: qTmp.w },
      }
    }

    for (const tag of ['L', 'R']) {
      const side = tag === 'L' ? 1 : -1
      // Model: legs/arms[0] = +X = R, [1] = −X = L
      const leg = model?.legs?.[tag === 'R' ? 0 : 1]
      const arm = model?.arms?.[tag === 'R' ? 0 : 1]

      const thigh = limbPose(leg?.thigh, thighLen, hipsWP, side)
      this._createBody(
        `thigh${tag}`,
        thigh.pos,
        thigh.rot,
        R.ColliderDesc.capsule(thighLen * 0.32, 0.075 * u),
        2.0,
      )

      const shin = limbPose(leg?.shin, shinLen, thigh.pos, side)
      this._createBody(
        `shin${tag}`,
        shin.pos,
        shin.rot,
        R.ColliderDesc.capsule(shinLen * 0.3, 0.06 * u),
        1.4,
      )

      // Pose from the upper-arm group (where the sleeve capsule lives), not the socket.
      const upper = limbPose(arm?.upper ?? arm?.shoulder, upperLen, torsoPos, side)
      this._createBody(
        `upper${tag}`,
        upper.pos,
        upper.rot,
        R.ColliderDesc.capsule(upperLen * 0.3, 0.055 * u),
        1.2,
        'arm',
      )

      const fore = limbPose(arm?.forearm, foreLen, upper.pos, side)
      this._createBody(
        `fore${tag}`,
        fore.pos,
        fore.rot,
        R.ColliderDesc.capsule(foreLen * 0.28, 0.045 * u),
        0.8,
        'arm',
      )
    }

    const hips = this.bodies.hips
    const torso = this.bodies.torso

    // Waist hinge. Head has no physics body — rides torso bind with the shoulder bar.
    // Knees bend +X (shin.rotation.x > 0). Elbows bend −X (forearm.rotation.x < 0).
    const ax = { x: 1, y: 0, z: 0 }
    const elbowAx = { x: -1, y: 0, z: 0 }
    const spineWP = this._wp(model?.spine, hipsWP.clone().add(new THREE.Vector3(0, 0.2 * u, 0)))
    this._jointRevolute(
      hips,
      torso,
      this._bodyLocal(hips, spineWP),
      this._bodyLocal(torso, spineWP),
      ax,
      -0.45,
      0.7,
    )

    // Joint anchors from the real visual sockets — hard-coded offsets were attaching
    // arms near the neck, so the sleeve cylinders slid into the head.
    for (const tag of ['L', 'R']) {
      const leg = model?.legs?.[tag === 'R' ? 0 : 1]
      const arm = model?.arms?.[tag === 'R' ? 0 : 1]
      const thighBody = this.bodies[`thigh${tag}`]
      const shinBody = this.bodies[`shin${tag}`]
      const upperBody = this.bodies[`upper${tag}`]
      const foreBody = this.bodies[`fore${tag}`]

      const hipSocket = this._wp(leg?.thigh, hipsWP)
      const kneeSocket = this._wp(leg?.shin, hipSocket.clone().add(new THREE.Vector3(0, -thighLen, 0)))
      this._jointRevolute(
        hips,
        thighBody,
        this._bodyLocal(hips, hipSocket),
        this._bodyLocal(thighBody, hipSocket),
        ax,
        -0.25,
        1.45,
      )
      this._jointRevolute(
        thighBody,
        shinBody,
        this._bodyLocal(thighBody, kneeSocket),
        this._bodyLocal(shinBody, kneeSocket),
        ax,
        0.02,
        2.0,
      )

      const shoulderSocket = this._wp(
        arm?.shoulder,
        new THREE.Vector3(torsoPos.x, torsoPos.y, torsoPos.z),
      )
      const elbowSocket = this._wp(
        arm?.forearm,
        new THREE.Vector3(shoulderSocket.x, shoulderSocket.y - upperLen, shoulderSocket.z),
      )
      this._jointRevolute(
        torso,
        upperBody,
        this._bodyLocal(torso, shoulderSocket),
        this._bodyLocal(upperBody, shoulderSocket),
        ax,
        -0.55,
        0.4,
      )
      // Opposite axis from the knee — model elbows fold on negative forearm.x.
      this._jointRevolute(
        upperBody,
        foreBody,
        this._bodyLocal(upperBody, elbowSocket),
        this._bodyLocal(foreBody, elbowSocket),
        elbowAx,
        0.02,
        2.0,
      )
    }

    // Drive the shoulder SOCKET from the upper-arm body (upper stays identity under it).
    // Driving `upper` left the socket on the chest while the sleeve floated to the neck.
    if (model) {
      if (model.headRoot) model.headRoot.rotation.set(0, 0, 0)
      if (model.spine) model.spine.rotation.set(0, 0, 0)
      for (const arm of model.arms ?? []) {
        if (arm.upper) {
          arm.upper.position.set(0, 0, 0)
          arm.upper.rotation.set(0, 0, 0)
        }
      }
      modelRoot.updateWorldMatrix(true, true)
      this._captureDrive('hips', model.hips)
      this._captureDrive('torso', model.torso)
      this._captureDrive('thighR', model.legs?.[0]?.thigh)
      this._captureDrive('shinR', model.legs?.[0]?.shin)
      this._captureDrive('thighL', model.legs?.[1]?.thigh)
      this._captureDrive('shinL', model.legs?.[1]?.shin)
      this._captureDrive('upperR', model.arms?.[0]?.shoulder, { rotationOnly: true })
      this._captureDrive('foreR', model.arms?.[0]?.forearm)
      this._captureDrive('upperL', model.arms?.[1]?.shoulder, { rotationOnly: true })
      this._captureDrive('foreL', model.arms?.[1]?.forearm)
    }

    // Tip-over: torque drops him; linear shove stays light so he falls, not flies.
    const raw = impulse ?? { x: 0, y: 1.2, z: -2.5 }
    const t = this.tuning
    const scale = t?.impulseScale ?? 0.55
    const hx = raw.x
    const hz = raw.z
    const hLen = Math.hypot(hx, hz) || 1
    const nx = hx / hLen
    const nz = hz / hLen
    const imp = {
      x: nx * Math.abs(hx) * scale * 0.28,
      y: Math.max(0.35, (raw.y || 0) * scale * 0.35),
      z: nz * Math.abs(hz) * scale * 0.28,
    }
    const tip = t?.tipTorque ?? 3.4
    const tipTorque = { x: nz * tip, y: 0, z: -nx * tip }
    const spin = t?.torque ?? 0
    hips.applyTorqueImpulse(
      {
        x: tipTorque.x * 0.85 + (Math.random() - 0.5) * spin * 0.2,
        y: (Math.random() - 0.5) * spin * 0.1,
        z: tipTorque.z * 0.85 + (Math.random() - 0.5) * spin * 0.2,
      },
      true,
    )
    torso.applyTorqueImpulse(
      {
        x: tipTorque.x + (Math.random() - 0.5) * spin * 0.25,
        y: (Math.random() - 0.5) * spin * 0.1,
        z: tipTorque.z + (Math.random() - 0.5) * spin * 0.25,
      },
      true,
    )
    hips.applyImpulse({ x: imp.x, y: imp.y, z: imp.z }, true)
    torso.applyImpulse({ x: imp.x * 0.35, y: imp.y * 0.25, z: imp.z * 0.35 }, true)

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

    // Bleed energy gradually — old ramp crushed flops into a mid-air plank.
    if (dampRamp && this._age > 0.25) {
      const damp = 0.9 + Math.min(3.5, (this._age - 0.25) * 1.6)
      const angDamp = 1.1 + Math.min(4.0, (this._age - 0.25) * 1.8)
      for (const body of Object.values(this.bodies)) {
        body.setLinearDamping(damp)
        body.setAngularDamping(angDamp)
      }
    }

    const quiet = maxSpeed < 0.45 && maxSpin < 1.1
    const settleGate = Math.min(0.55, settleMax * 0.35)
    if (quiet && (nearFloor || this._hitFloor || this._age > settleGate)) {
      this._stillTime += dt
    } else {
      this._stillTime = 0
    }

    const stillNeed = t?.stillTime ?? 0.18
    if (this._stillTime > stillNeed || this._age > settleMax) {
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
      this._setWorldMatrix(
        entry.object,
        this._worldM,
        entry.bindScale,
        entry.rotationOnly ? entry.bindPos : null,
      )
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
