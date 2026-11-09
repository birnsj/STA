import RAPIER from '@dimforge/rapier3d-compat'

/** Shared Rapier world (ported from Bloodbound PhysicsWorld). */
export class PhysicsWorld {
  constructor(rapier, world) {
    this.RAPIER = rapier
    this.world = world
    this._ragdolls = new Set()
    this._accumulator = 0
    this.fixedDt = 1 / 120
    this._statics = []
    // collider.handle → 'floor' | 'wall' | 'prop' (ragdoll settle uses this)
    this._colliderKind = new Map()
    this._eventQueue = new rapier.EventQueue(true)
  }

  // Softer than real-world so blast flops read clearly (impulse is tuned with this).
  static async create(gravity = { x: 0, y: -11, z: 0 }) {
    await RAPIER.init()
    const world = new RAPIER.World(gravity)
    // Finer steps cut wall tunneling when a limb is flung at a bulkhead.
    world.timestep = 1 / 120
    return new PhysicsWorld(RAPIER, world)
  }

  colliderKind(handle) {
    return this._colliderKind.get(handle) ?? null
  }

  addStaticBox(center, halfExtents, kind = 'wall') {
    const R = this.RAPIER
    const desc = R.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z)
    const body = this.world.createRigidBody(desc)
    const collider = this.world.createCollider(
      R.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setFriction(0.95)
        .setRestitution(0.05)
        .setActiveCollisionTypes(R.ActiveCollisionTypes.DEFAULT)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
      body,
    )
    this._colliderKind.set(collider.handle, kind === 'floor' ? 'floor' : kind === 'prop' ? 'prop' : 'wall')
    this._statics.push(body)
    return body
  }

  addLevelColliders(colliders = []) {
    for (const c of colliders) {
      if (!c) continue
      const kind = c.kind === 'floor' ? 'floor' : c.kind === 'prop' ? 'prop' : 'wall'
      const cx = (c.minX + c.maxX) * 0.5
      const cy = (c.minY + c.maxY) * 0.5
      const cz = (c.minZ + c.maxZ) * 0.5
      // Pad walls/props in XZ so fast ragdolls don't tunnel a 1-tile bulkhead in one step.
      const pad = kind === 'floor' ? 0 : 0.14
      const hx = Math.max(0.05, (c.maxX - c.minX) * 0.5 + pad)
      const hy = Math.max(0.05, (c.maxY - c.minY) * 0.5)
      const hz = Math.max(0.05, (c.maxZ - c.minZ) * 0.5 + pad)
      this.addStaticBox({ x: cx, y: cy, z: cz }, { x: hx, y: hy, z: hz }, kind)
    }
  }

  registerRagdoll(ragdoll) {
    this._ragdolls.add(ragdoll)
  }

  unregisterRagdoll(ragdoll) {
    this._ragdolls.delete(ragdoll)
  }

  step(dt) {
    if (!this.world) return
    const clamped = Math.min(dt, 0.05)
    this._accumulator += clamped
    let steps = 0
    while (this._accumulator >= this.fixedDt && steps < 8) {
      this.world.step(this._eventQueue)
      this._drainCollisionEvents()
      this._accumulator -= this.fixedDt
      steps += 1
    }
    for (const ragdoll of this._ragdolls) {
      ragdoll.tickSettle?.(clamped)
      ragdoll.syncFromPhysics?.()
    }
  }

  _drainCollisionEvents() {
    if (!this._eventQueue || this._ragdolls.size === 0) {
      this._eventQueue?.clear?.()
      return
    }
    this._eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return
      const kind1 = this._colliderKind.get(h1)
      const kind2 = this._colliderKind.get(h2)
      // One side is level geometry; the other belongs to a ragdoll limb.
      for (const ragdoll of this._ragdolls) {
        if (!ragdoll.active || ragdoll.settled) continue
        const mine1 = ragdoll.ownsCollider?.(h1)
        const mine2 = ragdoll.ownsCollider?.(h2)
        if (mine1 && kind2) ragdoll.onLevelContact?.(kind2, h1)
        else if (mine2 && kind1) ragdoll.onLevelContact?.(kind1, h2)
      }
    })
  }

  dispose() {
    for (const ragdoll of [...this._ragdolls]) {
      ragdoll.dispose?.()
    }
    this._ragdolls.clear()
    this._colliderKind.clear()
    this._eventQueue?.free?.()
    this._eventQueue = null
    this.world?.free?.()
    this.world = null
  }
}
