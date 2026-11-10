import * as THREE from 'three'
import { TILE_H, TILE_W } from '../maps/iso.js'

// Match horizontal iso scale (TILE_W/2) so a 1×1×1 world box is not stretched tall on screen.
// (Using a larger value made humanoids read as spaghetti: height inflated vs shoulder width.)
export const WORLD_Y_TO_PX = TILE_W / 2

// Board (SVG) pixels from a Three world point (X tile, Y up, Z tile).
export function projectWorld(wx, wy, wz) {
  return {
    x: ((wx - wz) * TILE_W) / 2,
    y: ((wx + wz) * TILE_H) / 2 - wy * WORLD_Y_TO_PX,
  }
}

// Facing vector on the map ({ x, y } tile axes) → yaw around world Y (model faces +Z at yaw 0).
export function facingToYaw(facing) {
  if (!facing) return Math.PI / 4
  const x = Number(facing.x) || 0
  const y = Number(facing.y) || 0
  if (!x && !y) return Math.PI / 4
  // Model +Z is "south" in screen terms; map +y is one tile axis. atan2(x, y) keeps walk direction readable in iso.
  return Math.atan2(x, y)
}

/** Shared iso projection matrix (board px ↔ world). */
function applyIsoProjection(camera, viewBox) {
  const vb = viewBox
  const a = TILE_W / 2
  const b = TILE_H / 2
  const H = WORLD_Y_TO_PX
  const sx = 2 / vb.width
  const sy = 2 / vb.height

  // Height + tile depth: limbs self-occlude; walls/props (occluder boxes) hide people behind them.
  // Inter-character order is still painter clearDepth (each pass redraws occluders).
  const zTile = 0.008
  const zHeight = 0.14
  const zBias = 0.9

  const m = camera.projectionMatrix
  m.set(
    sx * a,
    0,
    -sx * a,
    -sx * vb.x - 1,
    -sy * b,
    sy * H,
    -sy * b,
    sy * vb.y + 1,
    -zTile,
    -zHeight,
    -zTile,
    zBias,
    0,
    0,
    0,
    1,
  )
  camera.projectionMatrixInverse.copy(m).invert()
  camera.matrixWorld.identity()
  camera.matrixWorldInverse.identity()
  camera.matrixAutoUpdate = false
}

/**
 * Orthographic camera whose projection maps world (wx,wy,wz) onto the SVG viewBox the same way projectWorld does.
 * Letterboxes the WebGL viewport with xMidYMid meet — same as Pixi/SVG — so feet land on the selection ring.
 */
export function syncIsoCamera(camera, viewBox, renderer) {
  const vb = viewBox
  if (!vb?.width || !vb?.height || !renderer) return
  applyIsoProjection(camera, vb)

  const canvas = renderer.domElement
  const cssW = canvas.clientWidth
  const cssH = canvas.clientHeight
  if (!cssW || !cssH) return

  // Same xMidYMid meet as Pixi/SVG. Pass CSS pixels — Three multiplies by pixelRatio itself.
  const fit = Math.min(cssW / vb.width, cssH / vb.height)
  const contentW = vb.width * fit
  const contentH = vb.height * fit
  const offsetX = (cssW - contentW) / 2
  const offsetTop = (cssH - contentH) / 2
  const offsetY = cssH - offsetTop - contentH // bottom-left origin
  renderer.setViewport(offsetX, offsetY, contentW, contentH)
  renderer.setScissor(offsetX, offsetY, contentW, contentH)
  renderer.setScissorTest(true)
}

/**
 * Same iso projection as syncIsoCamera, but the WebGL viewport fills the whole canvas (no meet letterbox).
 * Use when the viewBox aspect already matches the canvas (Animation Viewer locked-iso floor).
 */
export function syncIsoCameraFill(camera, viewBox, renderer) {
  const vb = viewBox
  if (!vb?.width || !vb?.height || !renderer) return
  applyIsoProjection(camera, vb)

  const canvas = renderer.domElement
  const cssW = canvas.clientWidth
  const cssH = canvas.clientHeight
  if (!cssW || !cssH) return

  renderer.setViewport(0, 0, cssW, cssH)
  renderer.setScissorTest(false)
}

export function makeIsoCamera() {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000)
  camera.matrixAutoUpdate = false
  return camera
}
