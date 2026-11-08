import * as THREE from 'three'

// Soft foot blob for the Three overlay. Pixi draws the floor, so directional shadows never land —
// this fake contact shadow is what grounds the figure on Deck 10.

let sharedTexture = null

function shadowTexture() {
  if (sharedTexture) return sharedTexture
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.48)
  g.addColorStop(0, 'rgba(0,0,0,0.55)')
  g.addColorStop(0.45, 'rgba(0,0,0,0.22)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  sharedTexture = new THREE.CanvasTexture(canvas)
  sharedTexture.colorSpace = THREE.SRGBColorSpace
  sharedTexture.needsUpdate = true
  return sharedTexture
}

/** Ellipse on the floor under the feet. Parent at actor root; stays world-flat. */
export function createContactShadow({ width = 0.95, depth = 0.55 } = {}) {
  const geo = new THREE.PlaneGeometry(width, depth)
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'contact_shadow'
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.02
  mesh.renderOrder = -1
  mesh.frustumCulled = false
  return mesh
}
