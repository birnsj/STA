// Freeform Template Piece renderer — Starship 32-thick wall faces (overlays, not map tiles).
// Footprint is item-space with the south tip at (0,0); PNG anchorX is that tip so board placement snaps correctly.
import { encodePng } from '../png.mjs'
import { RESOLUTION, render, shade, rgb, scale, clamp01 } from './engine.mjs'
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

function hitPrism(px, py, prism, cx, ih) {
  const { x0, y0, x1, y1, z0, z1 } = prism
  const top = invAtZ(px, py, z1, cx, ih)
  if (inRect(top.dx, top.dy, x0, y0, x1, y1)) {
    const w = Math.max(1e-6, Math.abs(x1 - x0))
    const d = Math.max(1e-6, Math.abs(y1 - y0))
    const alongX = w >= d
    return {
      face: 'top',
      u: alongX ? ((top.dy - Math.min(y0, y1)) / d) * 32 : ((top.dx - Math.min(x0, x1)) / w) * 32,
      v: alongX ? ((top.dx - Math.min(x0, x1)) / w) * 32 : ((top.dy - Math.min(y0, y1)) / d) * 32,
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
  const w = Math.abs(x1 - x0)
  const d = Math.abs(y1 - y0)
  const alongX = w >= d
  // Long faces = left/right; short ends get 'end' material.
  const nearEnd =
    alongX
      ? mid.dx <= Math.min(x0, x1) + 0.75 || mid.dx >= Math.max(x0, x1) - 0.75
      : mid.dy <= Math.min(y0, y1) + 0.75 || mid.dy >= Math.max(y0, y1) - 0.75
  const face = nearEnd ? 'end' : px <= cx ? 'left' : 'right'
  const span = Math.max(1e-6, alongX ? w : d)
  const along = alongX ? mid.dx - Math.min(x0, x1) : mid.dy - Math.min(y0, y1)
  return {
    face,
    u: clamp01(along / span) * 32,
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

// face: wall look (templateWallFaces). material: floor/prop kind (templateStarshipProps). material wins when set.
export function paintPrismsAA(prisms, { subsamples = 3, face = 'plain', material = null } = {}) {
  const { size, shifted } = shiftToTip(prisms)
  const cx = size.anchorX
  const ih = size.h
  const materialOf = (prism) => {
    const h = Math.max(1, (prism.z1 ?? 0) - (prism.z0 ?? 0))
    const prop = material ? materialForKind(material) : null
    if (prop) return prop
    return starshipWallMaterial(h, fittingForFace(face, h))
  }
  const scene = (px, py) => {
    let best = null
    for (const prism of shifted) {
      const hit = hitPrism(px, py, prism, cx, ih)
      if (!hit) continue
      if (!best || hit.depth > best.depth) best = { ...hit, material: materialOf(prism) }
    }
    if (!best) return null
    return shade(best.material, best.u, best.v, best.face)
  }
  const width = size.w * RESOLUTION
  const height = size.h * RESOLUTION
  const bytes = render(scene, { width, height, subsamples, bloom: 0.45, bloomRadius: 3 })
  return { png: encodePng(width, height, bytes), size: { w: size.w, h: size.h, anchorX: size.anchorX } }
}

export { rgb, scale }
