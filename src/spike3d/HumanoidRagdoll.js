import * as THREE from 'three'

/**
 * Capsule/box ragdoll driven by Rapier. Visuals are separate from the animated model
 * but sized from its joints when available so the flop matches the procedural figure.
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
    this.root = new THREE.Group()
    this.root.name = 'humanoid_ragdoll'
    this.scene.add(this.root)

    this.bodies = {}
    this.visuals = {}
    this.joints = []
    this._owned = []
    this.settled = false
    this._age = 0
    this._stillTime = 0

    // Prefer shared materials from the live figure so shirt/hair colours match.
    this.matRobe = materials.robe ?? this._mat(0xd9a92c)
    this.matRobeDk = materials.robeDk ?? this._mat(0x20212b)
    this.matSkin = materials.skin ?? this._mat(0xe0ab86)
    this.matHood = materials.hood ?? this._mat(0x5a3a22)
    this.matBoot = materials.boots ?? this._mat(0x121217)
  }

  _mat(color) {
    const m = new THREE.MeshStandardMaterial({
      color,
      metalness: 0,
      roughness: 0.88,
    })
    this._owned.push(m)
    return m
  }

  _addVisualBox(name, size, material) {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2])
    this._owned.push(geo)
    const mesh = new THREE.Mesh(geo, material)
    mesh.castShadow = false
    mesh.receiveShadow = false
    this.root.add(mesh)
    this.visuals[name] = mesh
    return mesh
  }

  _addVisualCapsule(name, radius, length, material) {
    const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, length), 6, 12)
    this._owned.push(geo)
    const mesh = new THREE.Mesh(geo, material)
    mesh.castShadow = false
    mesh.receiveShadow = false
    this.root.add(mesh)
    this.visuals[name] = mesh
    return mesh
  }

  _createBody(name, translation, rotation, colliderDesc, mass) {
    const R = this.RAPIER
    const rbDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(translation.x, translation.y, translation.z)
      .setCanSleep(true)
      // Slightly sticky so the first bounce doesn't skate across the deck.
      .setLinearDamping(0.85)
      .setAngularDamping(1.15)
      .setCcdEnabled(true)
    if (rotation) rbDesc.setRotation(rotation)
    const body = this.world.createRigidBody(rbDesc)
    colliderDesc.setMass(mass).setFriction(1.35).setRestitution(0.02)
    this.world.createCollider(colliderDesc, body)
    this.bodies[name] = body
    return body
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
    this._age = 0
    this._stillTime = 0
    this.root.visible = true

    modelRoot.updateWorldMatrix(true, true)
    const u = this.u
    const R = this.RAPIER
    const model = modelRoot.userData?.humanoidModel ?? null

    const hipsWP = this._wp(model?.hips, this._wp(modelRoot, new THREE.Vector3()))
    const torsoWP = this._wp(model?.torso ?? model?.chest, hipsWP.clone().add(new THREE.Vector3(0, 0.45 * u, 0)))
    const headWP = this._wp(model?.headRoot, hipsWP.clone().add(new THREE.Vector3(0, 0.95 * u, 0)))

    const qRoot = new THREE.Quaternion()
    modelRoot.getWorldQuaternion(qRoot)
    const rot = { x: qRoot.x, y: qRoot.y, z: qRoot.z, w: qRoot.w }

    // Hips / pelvis
    this._addVisualBox('hips', [0.3 * u, 0.2 * u, 0.22 * u], this.matRobeDk)
    this._createBody('hips', hipsWP, rot, R.ColliderDesc.cuboid(0.15 * u, 0.1 * u, 0.11 * u), 3.2)

    // Torso / chest — slightly above hips sample
    const torsoPos = { x: torsoWP.x, y: torsoWP.y + 0.18 * u, z: torsoWP.z }
    this._addVisualBox('torso', [0.34 * u, 0.5 * u, 0.24 * u], this.matRobe)
    this._createBody('torso', torsoPos, rot, R.ColliderDesc.cuboid(0.17 * u, 0.25 * u, 0.12 * u), 4.8)

    // Head
    const headPos = { x: headWP.x, y: headWP.y + 0.08 * u, z: headWP.z }
    this._addVisualCapsule('head', 0.11 * u, 0.1 * u, this.matSkin)
    this._createBody('head', headPos, rot, R.ColliderDesc.ball(0.12 * u), 1.1)

    const thighLen = 0.38 * u
    const shinLen = 0.36 * u
    const upperLen = 0.3 * u
    const foreLen = 0.28 * u
    const sideSign = [1, -1]

    for (let i = 0; i < 2; i += 1) {
      const side = sideSign[i]
      const tag = side > 0 ? 'L' : 'R'
      const leg = model?.legs?.[i]
      const arm = model?.arms?.[i]

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
      this._addVisualCapsule(`thigh${tag}`, 0.07 * u, thighLen * 0.72, this.matRobeDk)
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
      this._addVisualCapsule(`shin${tag}`, 0.06 * u, shinLen * 0.55, this.matRobeDk)
      this._createBody(
        `shin${tag}`,
        shinPos,
        rot,
        R.ColliderDesc.capsule(shinLen * 0.22, 0.055 * u),
        1.5,
      )
      // Boot tip for mass at the feet
      this._addVisualCapsule(`boot${tag}`, 0.055 * u, 0.08 * u, this.matBoot)
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
      this._addVisualCapsule(`upper${tag}`, 0.055 * u, upperLen * 0.65, this.matRobe)
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
      this._addVisualCapsule(`fore${tag}`, 0.045 * u, foreLen * 0.55, this.matSkin)
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

    // Impulse: strong lift + throw, but not Bloodbound-cultist violent.
    const raw = impulse ?? { x: 0, y: 6, z: -10 }
    const scale = 0.72
    const imp = { x: raw.x * scale, y: Math.max(5, raw.y * scale), z: raw.z * scale }
    const point = hitPoint ?? torsoPos
    torso.applyImpulseAtPoint(imp, point, true)
    hips.applyImpulse({ x: imp.x * 0.65, y: Math.max(4, imp.y * 0.5) + 3, z: imp.z * 0.65 }, true)
    head.applyImpulse({ x: imp.x * 0.35, y: imp.y * 0.3 + 1.5, z: imp.z * 0.35 }, true)
    for (const tag of ['L', 'R']) {
      this.bodies[`thigh${tag}`]?.applyImpulse({ x: imp.x * 0.18, y: imp.y * 0.12, z: imp.z * 0.18 }, true)
      this.bodies[`upper${tag}`]?.applyImpulse({ x: imp.x * 0.22, y: imp.y * 0.16, z: imp.z * 0.22 }, true)
    }

    torso.applyTorqueImpulse(
      {
        x: (Math.random() - 0.5) * 2.5,
        y: (Math.random() - 0.5) * 3.5,
        z: (Math.random() - 0.5) * 2.5,
      },
      true,
    )

    this.physics.registerRagdoll(this)
    this.syncFromPhysics()
  }

  /**
   * Ramp damping after the hit, then freeze once motion dies out on the floor.
   */
  tickSettle(dt) {
    if (!this.active || this.settled) return
    this._age += dt

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

    // Bleed energy after the first bounce so he plants on the deck.
    if (this._age > 0.18) {
      const damp = 1.1 + Math.min(6, this._age * 2.2)
      const angDamp = 1.4 + Math.min(7, this._age * 2.4)
      for (const body of Object.values(this.bodies)) {
        body.setLinearDamping(damp)
        body.setAngularDamping(angDamp)
      }
    }

    const quiet = maxSpeed < 0.35 && maxSpin < 0.9
    if (quiet && (nearFloor || this._age > 0.9)) this._stillTime += dt
    else this._stillTime = 0

    if (this._stillTime > 0.28 || this._age > 4.2) {
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
  }

  syncFromPhysics() {
    if (!this.active) return
    for (const [name, body] of Object.entries(this.bodies)) {
      const mesh = this.visuals[name]
      if (!mesh || !body) continue
      const t = body.translation()
      const r = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      mesh.quaternion.set(r.x, r.y, r.z, r.w)
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
    for (const mesh of Object.values(this.visuals)) {
      this.root.remove(mesh)
      mesh.geometry?.dispose?.()
    }
    this.visuals = {}
    this.active = false
    this.settled = false
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
