import * as THREE from 'three'

/**
 * Debug overlay for HumanoidModel's procedural joint tree (not a skinned Skeleton).
 * Parent under the scene (world space); call update() each frame while visible.
 */

function listJoints(model) {
  const joints = [model.hips, model.spine, model.torso, model.headRoot]
  for (const leg of model.legs ?? []) {
    joints.push(leg.thigh, leg.shin, leg.foot)
  }
  for (const arm of model.arms ?? []) {
    joints.push(arm.shoulder, arm.upper, arm.forearm, arm.hand)
  }
  return joints.filter(Boolean)
}

function listPairs(model) {
  const pairs = [
    [model.hips, model.spine],
    [model.spine, model.torso],
    [model.torso, model.headRoot],
  ]
  for (const leg of model.legs ?? []) {
    pairs.push([model.hips, leg.thigh], [leg.thigh, leg.shin], [leg.shin, leg.foot])
  }
  for (const arm of model.arms ?? []) {
    pairs.push([model.torso, arm.shoulder], [arm.shoulder, arm.upper], [arm.upper, arm.forearm], [arm.forearm, arm.hand])
  }
  return pairs.filter(([a, b]) => a && b)
}

export function createSkeletonOverlay(model, { jointRadius = 0.035 } = {}) {
  const group = new THREE.Group()
  group.name = 'skeleton_overlay'
  group.visible = false

  const joints = listJoints(model)
  const pairs = listPairs(model)

  const linePositions = new Float32Array(pairs.length * 6)
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x44ffcc,
    depthTest: false,
    transparent: true,
    opacity: 0.95,
  })
  const lines = new THREE.LineSegments(lineGeo, lineMat)
  lines.renderOrder = 999
  lines.frustumCulled = false
  group.add(lines)

  const sphereGeo = new THREE.SphereGeometry(jointRadius, 10, 8)
  const jointMat = new THREE.MeshBasicMaterial({
    color: 0xffcc33,
    depthTest: false,
    transparent: true,
    opacity: 0.95,
  })
  const markers = joints.map((joint) => {
    const mesh = new THREE.Mesh(sphereGeo, jointMat)
    mesh.renderOrder = 1000
    mesh.frustumCulled = false
    group.add(mesh)
    return { mesh, joint }
  })

  const _a = new THREE.Vector3()
  const _b = new THREE.Vector3()

  return {
    root: group,
    setVisible(on) {
      group.visible = Boolean(on)
    },
    update() {
      if (!group.visible) return
      let i = 0
      for (const [a, b] of pairs) {
        a.getWorldPosition(_a)
        b.getWorldPosition(_b)
        linePositions[i++] = _a.x
        linePositions[i++] = _a.y
        linePositions[i++] = _a.z
        linePositions[i++] = _b.x
        linePositions[i++] = _b.y
        linePositions[i++] = _b.z
      }
      lineGeo.attributes.position.needsUpdate = true
      lineGeo.computeBoundingSphere()
      for (const { mesh, joint } of markers) {
        joint.getWorldPosition(_a)
        mesh.position.copy(_a)
      }
    },
    dispose() {
      group.removeFromParent()
      lineGeo.dispose()
      lineMat.dispose()
      sphereGeo.dispose()
      jointMat.dispose()
    },
  }
}
