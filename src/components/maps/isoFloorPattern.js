// Floor / tile guides under Sprite Sheets — a continuous 64×64-world iso grid (64×32 diamonds)
// that fills the stage, including margin past the PNG on every side.
//
// Character sheets: diamonds at ×resolution; origin at the first frame’s feet.
// Environment / other: diamonds at file scale (×N when the PNG is N×64 wide); origin at the
// tile floor centre (engine CY). Walls also get top-face guide strokes.
import { TILE_H, TILE_W } from '../../maps/iso.js'
import { TILE_IMAGE, TILES } from '../../maps/mapFormat.js'
import {
  CHARACTER_HAZARD_FRAME,
  EXPLOSION_FRAMES,
  EXPLOSION_STRIP_PX,
  HAZARD_FRAME,
  HAZARD_FRAMES,
} from './environmentArt.js'

const FILL_A = '#0c181c'
const FILL_B = '#142428'
const STROKE = 'rgba(140, 180, 190, 0.35)'
const GUIDE = 'rgba(120, 200, 220, 0.95)'
const CLIP_STROKE = 'rgba(255, 220, 60, 1)'
const CLIP_FILL = 'rgba(255, 220, 60, 0.06)'

const DESIGN_W = 64
const DESIGN_H = 96
const DESIGN_CX = 32
const DESIGN_CY = 80

// Design frame sizes to try when guessing a horizontal flipbook (hazards, explosions, etc.).
const STRIP_DESIGNS = [
  { w: HAZARD_FRAME.width, h: HAZARD_FRAME.height },
  { w: CHARACTER_HAZARD_FRAME.width, h: CHARACTER_HAZARD_FRAME.height },
  { w: EXPLOSION_STRIP_PX.small, h: EXPLOSION_STRIP_PX.small },
  { w: EXPLOSION_STRIP_PX.large, h: EXPLOSION_STRIP_PX.large },
  { w: 64, h: 96 },
  { w: 64, h: 128 },
]
const STRIP_FRAME_COUNTS = [HAZARD_FRAMES, EXPLOSION_FRAMES, 4, 6, 10, 12, 16, 5, 3, 2]

// How many board tiles of empty floor past each edge of the PNG.
export const FLOOR_MARGIN_TILES = 8

function diamondPath(ctx, cx, cy, halfW, halfH) {
  ctx.beginPath()
  ctx.moveTo(cx, cy - halfH)
  ctx.lineTo(cx + halfW, cy)
  ctx.lineTo(cx, cy + halfH)
  ctx.lineTo(cx - halfW, cy)
  ctx.closePath()
}

export function fillIsoRect(ctx, originX, originY, tileW, tileH, left, top, width, height) {
  const halfW = tileW / 2
  const halfH = tileH / 2
  const toTile = (sx, sy) => ({
    tx: sx / tileW + sy / tileH,
    ty: sy / tileH - sx / tileW,
  })
  const corners = [
    toTile(left - originX, top - originY),
    toTile(left + width - originX, top - originY),
    toTile(left - originX, top + height - originY),
    toTile(left + width - originX, top + height - originY),
  ]
  const tx0 = Math.floor(Math.min(...corners.map((c) => c.tx))) - 1
  const tx1 = Math.ceil(Math.max(...corners.map((c) => c.tx))) + 1
  const ty0 = Math.floor(Math.min(...corners.map((c) => c.ty))) - 1
  const ty1 = Math.ceil(Math.max(...corners.map((c) => c.ty))) + 1
  const line = Math.max(1, Math.round(Math.min(tileW, tileH) / 64))
  for (let ty = ty0; ty <= ty1; ty += 1) {
    for (let tx = tx0; tx <= tx1; tx += 1) {
      const cx = originX + ((tx - ty) * tileW) / 2
      const cy = originY + ((tx + ty) * tileH) / 2
      diamondPath(ctx, cx, cy, halfW, halfH)
      ctx.fillStyle = (tx + ty) & 1 ? FILL_B : FILL_A
      ctx.fill()
      ctx.strokeStyle = STROKE
      ctx.lineWidth = line
      ctx.stroke()
    }
  }
}

function strokeGuideDiamond(ctx, cx, cy, tileW, tileH) {
  diamondPath(ctx, cx, cy, tileW / 2, tileH / 2)
  ctx.strokeStyle = GUIDE
  ctx.lineWidth = Math.max(2, Math.round(tileW / 64))
  ctx.stroke()
}

function tileForPath(spritePath) {
  const clean = String(spritePath || '').split('?')[0]
  if (!clean) return null
  return (
    TILES.find(
      (tile) =>
        tile.image === clean ||
        tile.altImage === clean ||
        tile.big?.image === clean ||
        tile.panelImages?.x === clean ||
        tile.panelImages?.y === clean,
    ) ?? null
  )
}

function stripFromDesign(sheetW, sheetH, frames, designW, designH, kind) {
  if (frames < 2 || designW < 1 || designH < 1) return null
  if (sheetH % designH !== 0) return null
  const scale = sheetH / designH
  if (scale < 1 || scale > 8) return null
  const expectedW = designW * scale * frames
  // Prefer an exact design match; otherwise trust equal file divisions when the count fits.
  let columns = frames
  let frameW = sheetW / frames
  if (Math.abs(sheetW - expectedW) < 1) frameW = designW * scale
  else if (sheetW % frames !== 0) return null
  if (frameW < 1 || !Number.isFinite(frameW)) return null
  return {
    columns,
    rows: 1,
    frameW,
    frameH: sheetH,
    designW: frameW / scale,
    designH,
    scale,
    kind,
  }
}

// Horizontal flipbook: known hazard/effect paths first, then guess from sheet size.
export function detectStripLayout(sheetW, sheetH, spritePath = null) {
  if (sheetW < 2 || sheetH < 1 || sheetW <= sheetH * 1.25) return null
  const clean = String(spritePath || '').split('?')[0]

  if (/\/hazards\/character\//.test(clean)) {
    return stripFromDesign(
      sheetW,
      sheetH,
      HAZARD_FRAMES,
      CHARACTER_HAZARD_FRAME.width,
      CHARACTER_HAZARD_FRAME.height,
      'character-hazard',
    )
  }
  if (/\/hazards\/[^/]+\.png$/.test(clean) && !/wallScar/.test(clean)) {
    return stripFromDesign(sheetW, sheetH, HAZARD_FRAMES, HAZARD_FRAME.width, HAZARD_FRAME.height, 'hazard')
  }
  const explosion = clean.match(/explosion-(small|large)/)
  if (explosion) {
    const px = EXPLOSION_STRIP_PX[explosion[1]]
    return stripFromDesign(sheetW, sheetH, EXPLOSION_FRAMES, px, px, 'explosion')
  }

  let best = null
  const consider = (candidate, score) => {
    if (!candidate) return
    if (!best || score > best.score) best = { ...candidate, score }
  }

  for (const { w: dw, h: dh } of STRIP_DESIGNS) {
    if (sheetH % dh !== 0) continue
    const scale = sheetH / dh
    if (scale < 1 || scale > 8) continue
    const fw = dw * scale
    if (sheetW % fw !== 0) continue
    const columns = sheetW / fw
    if (columns < 2 || columns > 64) continue
    const score =
      (STRIP_FRAME_COUNTS.includes(columns) ? 40 : 0) +
      (columns === HAZARD_FRAMES ? 30 : 0) +
      (dw === dh ? 10 : 0) +
      (Number.isInteger(scale) ? 5 : 0) -
      Math.abs(columns - HAZARD_FRAMES)
    consider(
      {
        columns,
        rows: 1,
        frameW: fw,
        frameH: sheetH,
        designW: dw,
        designH: dh,
        scale,
        kind: 'strip',
      },
      score,
    )
  }

  // Square / near-square cells (floor fire 2048×256 → 8×256; fall-sheet-preview 2416×304 → 8×302).
  {
    const columns = Math.round(sheetW / sheetH)
    if (columns >= 2 && columns <= 64) {
      const frameW = sheetW / columns
      const slack = Math.abs(frameW - sheetH) / sheetH
      if (slack <= 0.02) {
        let scale = 1
        let designW = frameW
        let designH = sheetH
        for (const size of [64, 128, 96, 48, 256, 112]) {
          if (sheetH % size === 0 && sheetH / size <= 8) {
            scale = sheetH / size
            designW = frameW / scale
            designH = size
            break
          }
        }
        consider(
          {
            columns,
            rows: 1,
            frameW,
            frameH: sheetH,
            designW,
            designH,
            scale,
            kind: 'strip',
          },
          (columns === HAZARD_FRAMES ? 80 : 45) +
            (slack < 0.001 ? 10 : 0) +
            (Number.isInteger(scale) ? 5 : 0),
        )
      }
    }
  }

  if (!best) return null
  const { score: _score, ...strip } = best
  return strip
}

// Tile size + margin for any sheet (characters, environment, effects, dice).
export function floorLayout(sheetW, sheetH, grid = null, spritePath = null) {
  let scale = 1
  if (grid?.resolution > 0) scale = grid.resolution
  else {
    const strip = detectStripLayout(sheetW, sheetH, spritePath)
    if (strip?.scale > 0) scale = strip.scale
    else if (sheetW % DESIGN_W === 0 && sheetW / DESIGN_W <= 8) scale = sheetW / DESIGN_W
  }

  const tileW = TILE_W * scale
  const tileH = TILE_H * scale
  const marginX = Math.round(tileW * FLOOR_MARGIN_TILES)
  const marginY = Math.round(tileH * FLOOR_MARGIN_TILES)
  return {
    scale,
    tileW,
    tileH,
    marginX,
    marginY,
    stageW: sheetW + marginX * 2,
    stageH: sheetH + marginY * 2,
    sheetW,
    sheetH,
  }
}

// Origin of tile (0,0) in stage pixels (sheet sits at marginX/marginY).
function floorOrigin(layout, grid, spritePath) {
  const { marginX, marginY, tileW, tileH, scale, sheetW, sheetH } = layout

  if (grid?.columns >= 1 && grid?.rows >= 1 && grid.resolution > 0) {
    const ax = (grid.anchor?.x ?? grid.frame?.width / 2 ?? TILE_W / 2) * grid.resolution
    const ay = (grid.anchor?.y ?? grid.frame?.height ?? TILE_W) * grid.resolution
    return { originX: marginX + ax, originY: marginY + ay, guides: null }
  }

  const designH = sheetH / scale
  const extra = Math.max(0, designH - DESIGN_H)
  const floorCx = marginX + DESIGN_CX * scale
  const floorCy = marginY + (DESIGN_CY + extra) * scale
  const tile = tileForPath(spritePath)
  const blockH = tile?.height > 0 ? tile.height : 0
  const guides = {
    floor: { x: floorCx, y: floorCy },
    top: blockH > 0 ? { x: floorCx, y: marginY + (DESIGN_CY - blockH + extra) * scale } : null,
  }
  // Prefer the tile floor centre when it falls on the sheet; otherwise stage centre.
  if (sheetW >= DESIGN_W * scale * 0.5) return { originX: floorCx, originY: floorCy, guides }
  return { originX: marginX + tileW / 2, originY: marginY + tileH / 2, guides: null }
}

// Paints the extended floor into a stage-sized canvas. Sheet art is drawn by the caller at (marginX, marginY).
export function paintIsoFloor(ctx, layout, grid = null, spritePath = null) {
  const { stageW, stageH, tileW, tileH } = layout
  ctx.fillStyle = FILL_A
  ctx.fillRect(0, 0, stageW, stageH)
  const { originX, originY, guides } = floorOrigin(layout, grid, spritePath)
  fillIsoRect(ctx, originX, originY, tileW, tileH, 0, 0, stageW, stageH)
  if (guides?.floor) strokeGuideDiamond(ctx, guides.floor.x, guides.floor.y, tileW, tileH)
  if (guides?.top) strokeGuideDiamond(ctx, guides.top.x, guides.top.y, tileW, tileH)
}

export function environmentTileMeta(spritePath) {
  const tile = tileForPath(spritePath)
  return tile ? { id: tile.id, height: tile.height ?? 0, imageHeight: tile.imageHeight ?? null } : null
}

// The rectangle the board draws this tile into (tiles.json imageSize / imageHeight), in stage pixels.
// Bottom-aligned on the PNG — same footing as tileImageBox. Only for single env tiles (not wide strips).
export function tileClipBox(layout, spritePath) {
  if (!layout || layout.sheetW < 1) return null
  const tile = tileForPath(spritePath)
  // Hazard / effect strips are many frames wide; a centered 64×h box would sit in empty gutters.
  if (!tile) return null
  const designW = tile.big ? TILE_IMAGE.width * 2 : TILE_IMAGE.width
  const designH = tile.imageHeight > 0 ? tile.imageHeight : TILE_IMAGE.height
  const { scale, marginX, marginY, sheetW, sheetH } = layout
  const w = designW * scale
  const h = designH * scale
  // Sheet must be about one tile (or one big tile) wide — otherwise this is not the board clip.
  if (sheetW > w * 1.25) return null
  return {
    x: marginX + (sheetW - w) / 2,
    y: marginY + sheetH - h,
    w,
    h,
    designW,
    designH,
    fileW: w,
    fileH: h,
    tileId: tile.id,
    blockHeight: tile.height ?? 0,
  }
}

export function strokeTileClipBox(ctx, box) {
  if (!box) return
  // Stroke just outside the clip so the yellow box stays visible when it matches the PNG edge.
  const line = Math.max(3, Math.round(box.w / 48))
  const pad = line / 2
  ctx.save()
  ctx.fillStyle = CLIP_FILL
  ctx.strokeStyle = CLIP_STROKE
  ctx.lineWidth = line
  ctx.fillRect(box.x, box.y, box.w, box.h)
  ctx.strokeRect(box.x - pad, box.y - pad, box.w + line, box.h + line)
  ctx.restore()
}

// Yellow frame grid over a detected horizontal strip (one box per flipbook cell).
export function strokeStripGrid(ctx, layout, strip) {
  if (!layout || !strip?.columns) return
  const { marginX, marginY, sheetH } = layout
  const line = Math.max(2, Math.round(strip.frameW / 64))
  ctx.save()
  ctx.strokeStyle = CLIP_STROKE
  ctx.fillStyle = CLIP_FILL
  ctx.lineWidth = line
  for (let i = 0; i < strip.columns; i += 1) {
    const x = marginX + i * strip.frameW
    const y = marginY
    ctx.fillRect(x, y, strip.frameW, sheetH)
    ctx.strokeRect(x + 0.5, y + 0.5, strip.frameW - 1, sheetH - 1)
  }
  ctx.restore()
}
