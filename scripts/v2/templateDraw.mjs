// Freeform Template Piece renderer — Starship 32-thick wall faces (overlays, not map tiles).
// Footprint is item-space with the south tip at (0,0); PNG anchorX is that tip so board placement snaps correctly.
import { encodePng } from '../png.mjs'
import { RESOLUTION, render, renderLights, shade, rgb, scale, clamp01 } from './engine.mjs'
import { materialForKind } from './templateStarshipProps.mjs'
import { fittingForFace, starshipWallMaterial } from './templateWallFaces.mjs'

export function itemSize(w, d, h) {
  const corners = [
    [0, 0],
    [-w, 0],
    [0, -d],
    [-w, -d],
  ]
  let minX = Infinity
  let maxX = -Infinity
  let minY = 0
  for (const [dx, dy] of corners) {
    const sx = (dx - dy) / 2
    minX = Math.min(minX, sx)
    maxX = Math.max(maxX, sx)
    minY = Math.min(minY, (dx + dy) / 4 - h)
  }
  return {
    w: Math.max(1, Math.ceil(-minX) + Math.ceil(maxX)),
    h: Math.max(1, Math.ceil(-minY) || 1),
    anchorX: Math.ceil(-minX),
  }
}

function invAtZ(px, py, z, cx, ih) {
  const dx = px - cx + 2 * (py - ih + z)
  const dy = 2 * (py - ih + z) - (px - cx)
  return { dx, dy }
}

function inRect(dx, dy, x0, y0, x1, y1) {
  const xa = Math.min(x0, x1)
  const xb = Math.max(x0, x1)
  const ya = Math.min(y0, y1)
  const yb = Math.max(y0, y1)
  return dx >= xa && dx <= xb && dy >= ya && dy <= yb
}

function groundBottomY(px, x0, y0, x1, y1, cx, ih) {
  const corners = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
  const pts = corners.map(([dx, dy]) => [cx + (dx - dy) / 2, ih + (dx + dy) / 4])
  let maxY = -Infinity
  for (let i = 0; i < 4; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % 4]
    if ((a[0] <= px && b[0] >= px) || (b[0] <= px && a[0] >= px)) {
      if (Math.abs(b[0] - a[0]) < 1e-6) {
        maxY = Math.max(maxY, Math.max(a[1], b[1]))
        continue
      }
      const t = (px - a[0]) / (b[0] - a[0])
      maxY = Math.max(maxY, a[1] + t * (b[1] - a[1]))
    }
  }
  return Number.isFinite(maxY) ? maxY : null
}

// Rotate top-face UVs (0–32) with the piece yaw so floors/props turn on the isometric floor, not only walls.
function yawUv(u, v, turns) {
  const n = ((turns % 4) + 4) % 4
  let x = u
  let y = v
  for (let i = 0; i < n; i++) {
    const nextX = y
    const nextY = 32 - x
    x = nextX
    y = nextY
  }
  return [x, y]
}

// Screen left/right stay camera-locked after yaw+shiftToTip on a square; remap material faces so markings yaw too.
// 0: as drawn; 90/180: swap left↔right; 270: as drawn (top UV still turns).
function yawSideFace(face, turns) {
  if (face !== 'left' && face !== 'right') return face
  const n = ((turns % 4) + 4) % 4
  if (n === 1 || n === 2) return face === 'left' ? 'right' : 'left'
  return face
}

function hitPrism(px, py, prism, cx, ih, yawTurns = 0) {
  const { x0, y0, x1, y1, z0, z1 } = prism
  const top = invAtZ(px, py, z1, cx, ih)
  if (inRect(top.dx, top.dy, x0, y0, x1, y1)) {
    const w = Math.max(1e-6, Math.abs(x1 - x0))
    const d = Math.max(1e-6, Math.abs(y1 - y0))
    const alongX = w >= d
    let u = alongX ? ((top.dy - Math.min(y0, y1)) / d) * 32 : ((top.dx - Math.min(x0, x1)) / w) * 32
    let v = alongX ? ((top.dx - Math.min(x0, x1)) / w) * 32 : ((top.dy - Math.min(y0, y1)) / d) * 32
    ;[u, v] = yawUv(u, v, yawTurns)
    return {
      face: 'top',
      lightFace: 'top',
      u,
      v,
      depth: z1,
    }
  }
  if (z1 <= z0) return null
  const bottom = groundBottomY(px, x0, y0, x1, y1, cx, ih)
  if (bottom == null) return null
  if (py > bottom + 0.01 || py < bottom - (z1 - z0) - 0.01) return null
  const z = z0 + (bottom - py)
  if (z < z0 - 0.01 || z > z1 + 0.01) return null
  const mid = invAtZ(px, py, Math.min(z1, Math.max(z0, z)), cx, ih)
  if (!inRect(mid.dx, mid.dy, x0, y0, x1, y1)) {
    const xa = Math.min(x0, x1)
    const xb = Math.max(x0, x1)
    const ya = Math.min(y0, y1)
    const yb = Math.max(y0, y1)
    const pad = 0.6
    if (mid.dx < xa - pad || mid.dx > xb + pad || mid.dy < ya - pad || mid.dy > yb + pad) return null
  }
  const xa = Math.min(x0, x1)
  const xb = Math.max(x0, x1)
  const ya = Math.min(y0, y1)
  const yb = Math.max(y0, y1)
  const w = Math.max(1e-6, xb - xa)
  const d = Math.max(1e-6, yb - ya)
  const alongX = w >= d
  // Nearest footprint edge decides the face. A fixed 0.75px "near end" threshold left the thick
  // (32) tip face classified as left/right with u pinned at 0 or 32 — fittings smeared across the end.
  const distMinX = mid.dx - xa
  const distMaxX = xb - mid.dx
  const distMinY = mid.dy - ya
  const distMaxY = yb - mid.dy
  const nearest = Math.min(distMinX, distMaxX, distMinY, distMaxY)
  // Square posts (32×32 corner): no preferred run axis — every vertical side is a wall face.
  // Straight walls still classify short tips as 'end' (no fittings); material paints bulkhead detail there too.
  const square = Math.abs(w - d) <= 1
  const onXEdge = nearest === distMinX || nearest === distMaxX
  const onEnd = square ? false : alongX ? onXEdge : nearest === distMinY || nearest === distMaxY
  // lightFace stays on the camera side; material face yaws so fittings move without breaking iso lighting.
  const lightFace = onEnd ? 'end' : px <= cx ? 'left' : 'right'
  const face = yawSideFace(lightFace, yawTurns)
  // Long faces: u runs along the run. End caps: u runs across the thickness (was using run UV → stretch).
  // Square: u always along the hit edge (X-edge → along Y, Y-edge → along X).
  let u
  if (square) {
    u = onXEdge ? clamp01((mid.dy - ya) / d) * 32 : clamp01((mid.dx - xa) / w) * 32
  } else if (onEnd) {
    const across = alongX ? mid.dy - ya : mid.dx - xa
    const span = alongX ? d : w
    u = clamp01(across / span) * 32
  } else {
    const along = alongX ? mid.dx - xa : mid.dy - ya
    const span = alongX ? w : d
    u = clamp01(along / span) * 32
  }
  // Run UV along the face also turns with yaw so panel markings stay glued to the object.
  if (yawTurns % 2 === 1) u = 32 - u
  return {
    face,
    lightFace,
    u,
    v: z - z0,
    depth: z,
  }
}

function shiftToTip(prisms) {
  let maxX = -Infinity
  let maxY = -Infinity
  let maxH = 0
  let minX = Infinity
  let minY = Infinity
  for (const p of prisms) {
    minX = Math.min(minX, p.x0, p.x1)
    maxX = Math.max(maxX, p.x0, p.x1)
    minY = Math.min(minY, p.y0, p.y1)
    maxY = Math.max(maxY, p.y0, p.y1)
    maxH = Math.max(maxH, p.z1)
  }
  // Keep tip semantics: content lives in ≤0; shift so max corner is at 0.
  const ox = -maxX
  const oy = -maxY
  const w = Math.max(1, Math.ceil(maxX - minX))
  const d = Math.max(1, Math.ceil(maxY - minY))
  const size = itemSize(w, d, maxH)
  const shifted = prisms.map((p) => ({
    ...p,
    x0: p.x0 + ox,
    y0: p.y0 + oy,
    x1: p.x1 + ox,
    y1: p.y1 + oy,
  }))
  return { size, shifted }
}

// Flat albedo — iso lighting from shade() only. Used by Dimension Kit (solid but lit).
export function solidMaterial(hex) {
  const albedo = typeof hex === 'string' ? rgb(hex) : hex
  return {
    height: () => 0,
    surface: (_u, _v, face) => ({
      albedo: face === 'top' ? albedo : scale(albedo, face === 'end' ? 0.72 : face === 'left' ? 0.82 : 0.64),
      spec: 0.2,
      shininess: 26,
      ao: face === 'top' ? 1 : 0.94,
    }),
  }
}

// face: wall look (templateWallFaces). material: floor/prop kind (templateStarshipProps). material wins when set.
// colour: solid hex (or prism.colour) for Dimension Kit — skips wall/prop materials.
// yawTurns: 0–3 quarter turns CCW around the tip (same as makeTemplatePieces yaw). Floors/props need this so
// markings turn; walls also get correct face/UV after the prism yaw.
export function paintPrismsAA(prisms, { subsamples = 3, face = 'plain', material = null, colour = null, yawTurns = 0, bloom = 0.45 } = {}) {
  const { size, shifted } = shiftToTip(prisms)
  const cx = size.anchorX
  const ih = size.h
  const turns = ((yawTurns % 4) + 4) % 4
  const materialOf = (prism) => {
    if (prism.colour) return solidMaterial(prism.colour)
    if (colour) return solidMaterial(colour)
    const h = Math.max(1, (prism.z1 ?? 0) - (prism.z0 ?? 0))
    // Per-prism material (e.g. console screen) wins over the piece-level kind.
    const prop = materialForKind(prism.material ?? material)
    if (prop) return prop
    return starshipWallMaterial(h, fittingForFace(face, h))
  }
  const scene = (px, py) => {
    let best = null
    for (const prism of shifted) {
      const hit = hitPrism(px, py, prism, cx, ih, turns)
      if (!hit) continue
      if (!best || hit.depth > best.depth) best = { ...hit, material: materialOf(prism) }
    }
    if (!best) return null
    // Keep fitting emit on the base so thumbs and the board stay lit; the overlay blinks brighter on top.
    return shade(best.material, best.u, best.v, best.face, best.lightFace ?? best.face)
  }
  const width = size.w * RESOLUTION
  const height = size.h * RESOLUTION
  // Solid Dimension pieces stay clean: less bloom than Starship fittings.
  const bytes = render(scene, { width, height, subsamples, bloom: colour || prisms.some((p) => p.colour) ? Math.min(bloom, 0.28) : bloom, bloomRadius: 3 })
  return { png: encodePng(width, height, bytes), bytes, size: { w: size.w, h: size.h, anchorX: size.anchorX }, width, height }
}

// Emission-only layer for Template Piece animation overlays (same size/anchor as paintPrismsAA).
export function paintPrismsLightsAA(prisms, { face = 'plain', material = null, yawTurns = 0, gain = 1.2 } = {}) {
  const { size, shifted } = shiftToTip(prisms)
  const cx = size.anchorX
  const ih = size.h
  const turns = ((yawTurns % 4) + 4) % 4
  const materialOf = (prism) => {
    const h = Math.max(1, (prism.z1 ?? 0) - (prism.z0 ?? 0))
    const prop = materialForKind(prism.material ?? material)
    if (prop) return prop
    return starshipWallMaterial(h, fittingForFace(face, h))
  }
  const scene = (px, py) => {
    let best = null
    for (const prism of shifted) {
      const hit = hitPrism(px, py, prism, cx, ih, turns)
      if (!hit) continue
      if (!best || hit.depth > best.depth) best = { ...hit, material: materialOf(prism) }
    }
    if (!best) return null
    return shade(best.material, best.u, best.v, best.face, best.lightFace ?? best.face)
  }
  const width = size.w * RESOLUTION
  const height = size.h * RESOLUTION
  const bytes = renderLights(scene, ['lights'], { width, height, gain, bloomRadius: 4 })
  return { png: encodePng(width, height, bytes), size: { w: size.w, h: size.h, anchorX: size.anchorX } }
}

export { rgb, scale }
