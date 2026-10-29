// Sheet preview for SpriteSheetsScreen: PNG on an extended iso floor, wheel zoom at cursor, left-drag pan.
import { useEffect, useMemo, useRef, useState } from 'react'
import { getSpriteMetrics } from '../../rules/appearance.js'
import { inferCharacterSheetGrid, resolvePreviewAnimation } from '../../rules/spriteCatalogue.js'
import { spriteUrl } from '../../maps/spriteFiles.js'
import {
  detectStripLayout,
  environmentTileMeta,
  floorLayout,
  paintIsoFloor,
  strokeStripGrid,
  strokeTileClipBox,
  tileClipBox,
} from './isoFloorPattern.js'
const FACINGS = getSpriteMetrics().directions
const MIN_ZOOM = 0.05
const MAX_ZOOM = 8
// Browsers reject canvases past ~16k–32k on a side. Migrated fidget/fall sheets are wider than that
// (e.g. 23552×2560), so the preview paints at a shrink that still fits.
const MAX_PREVIEW_EDGE = 8192

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      // SPA HTML fallbacks decode as a broken/"empty" image — treat as failure so we do not paint a blank stage.
      if (!image.naturalWidth || !image.naturalHeight) reject(new Error('not an image'))
      else resolve(image)
    }
    image.onerror = () => reject(new Error('load failed'))
    image.src = src
  })
}

function paintSheet(canvas, image, grid, spritePath = null, animRange = null) {
  if (!canvas || !image) return null
  const sheetW = image.naturalWidth
  const sheetH = image.naturalHeight
  if (!sheetW || !sheetH) return null
  const layout = floorLayout(sheetW, sheetH, grid, spritePath)
  const previewScale = Math.min(1, MAX_PREVIEW_EDGE / layout.stageW, MAX_PREVIEW_EDGE / layout.stageH)
  const stageW = Math.max(1, Math.round(layout.stageW * previewScale))
  const stageH = Math.max(1, Math.round(layout.stageH * previewScale))
  // Assigning width/height resets the bitmap; only do it here, never via React props after paint.
  canvas.width = stageW
  canvas.height = stageH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(previewScale, 0, 0, previewScale, 0, 0)
  ctx.imageSmoothingEnabled = previewScale < 1
  ctx.clearRect(0, 0, layout.stageW, layout.stageH)
  paintIsoFloor(ctx, layout, grid, spritePath)
  ctx.drawImage(image, layout.marginX, layout.marginY)
  if (grid && grid.columns >= 1 && grid.rows >= 1) {
    const cellW = sheetW / grid.columns
    const cellH = sheetH / grid.rows
    const ox = layout.marginX
    const oy = layout.marginY
    // Highlight the selected animation's columns (all facing rows) so the preview matches the sheet.
    if (animRange?.frames > 0) {
      const startCol = Math.max(0, Math.min(grid.columns - 1, animRange.start ?? 0))
      const endCol = Math.max(startCol + 1, Math.min(grid.columns, startCol + animRange.frames))
      const hx = ox + startCol * cellW
      const hw = (endCol - startCol) * cellW
      ctx.save()
      ctx.fillStyle = 'rgba(255, 180, 40, 0.22)'
      ctx.fillRect(hx, oy, hw, sheetH)
      ctx.strokeStyle = 'rgba(255, 210, 90, 0.95)'
      ctx.lineWidth = Math.max(2 / previewScale, Math.round(Math.min(cellW, cellH) / 40))
      ctx.strokeRect(hx + 0.5, oy + 0.5, hw - 1, sheetH - 1)
      ctx.restore()
    }
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 200, 80, 0.85)'
    ctx.lineWidth = Math.max(1 / previewScale, Math.round(Math.min(cellW, cellH) / 80))
    ctx.beginPath()
    for (let i = 0; i <= grid.columns; i += 1) {
      const x = Math.round(ox + i * cellW) + (i === grid.columns ? -0.5 : 0.5)
      ctx.moveTo(x, oy)
      ctx.lineTo(x, oy + sheetH)
    }
    for (let i = 0; i <= grid.rows; i += 1) {
      const y = Math.round(oy + i * cellH) + (i === grid.rows ? -0.5 : 0.5)
      ctx.moveTo(ox, y)
      ctx.lineTo(ox + sheetW, y)
    }
    ctx.stroke()
    ctx.restore()
  } else {
    const strip = detectStripLayout(sheetW, sheetH, spritePath)
    if (strip) strokeStripGrid(ctx, layout, strip)
    else strokeTileClipBox(ctx, tileClipBox(layout, spritePath))
  }
  // Zoom/fit use the painted bitmap size; guides stay in full sheet space via previewScale.
  return { ...layout, stageW, stageH, previewScale }
}

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function fitZoom(stageW, stageH, viewW, viewH) {
  if (!stageW || !stageH || !viewW || !viewH) return 1
  const pad = 16
  return Math.min((viewW - pad) / stageW, (viewH - pad) / stageH, 1)
}

export default function SpriteSheetPreview({
  path,
  version,
  character = null,
  animation = null,
  animNames = [],
  onAnimationChange = null,
  facing = 's',
  onFacingChange = null,
  loop = false,
  onLoopChange = null,
}) {
  const wrapRef = useRef(null)
  const sheetCanvasRef = useRef(null)
  const animCanvasRef = useRef(null)
  const sheetImageRef = useRef(null)
  const layoutRef = useRef(null)
  const zoomRef = useRef(1)
  const stageRef = useRef({ width: 0, height: 0, sheetW: 0, sheetH: 0 })
  const [stage, setStage] = useState({ width: 0, height: 0, sheetW: 0, sheetH: 0 })
  const [failed, setFailed] = useState(false)
  const [inferredGrid, setInferredGrid] = useState(null)
  // Preview playhead 0..frames-1; scrub or Pause freezes; Play resumes from the current frame.
  const [animFrame, setAnimFrame] = useState(0)
  const [animPlaying, setAnimPlaying] = useState(true)
  const animPlaybackRef = useRef({
    scrubbing: false,
    playing: true,
    playStart: 0,
    baseFrame: 0,
    frame: 0,
  })
  // Always a number so every category can pan (fit is just a zoom value, not a separate layout mode).
  const [zoom, setZoom] = useState(1)
  const [fit, setFit] = useState(1)
  const src = spriteUrl(path, version)
  const grid = character?.grid ?? inferredGrid
  // Stable dep so parent re-renders do not reload the PNG (grid is a new object each enrich).
  const gridKey = character?.grid
    ? `${character.grid.columns}x${character.grid.rows}@${character.grid.resolution}:${character.grid.frame?.width}x${character.grid.frame?.height}`
    : `infer:${path}`
  const sheetAnim = useMemo(() => {
    const base = animation ? resolvePreviewAnimation(path, animation, grid, character) : null
    if (!base) return null
    // Editor-only: Loop checkbox forces repeat even when the sheet anim is once/hold.
    return loop ? { ...base, play: 'loop' } : base
  }, [
    animation,
    path,
    character,
    loop,
    // grid object identity changes; key on the cell layout that affects frame slicing
    grid?.columns,
    grid?.rows,
    grid?.resolution,
    grid?.frame?.width,
    grid?.frame?.height,
    grid?.anchor?.x,
    grid?.anchor?.y,
  ])
  const setZoomBoth = (next) => {
    zoomRef.current = next
    setZoom(next)
  }

  const applyCanvasSize = (nextZoom) => {
    const canvas = sheetCanvasRef.current
    const { width, height } = stageRef.current
    if (!canvas || !width) return
    canvas.style.width = `${Math.round(width * nextZoom)}px`
    canvas.style.height = `${Math.round(height * nextZoom)}px`
    canvas.style.maxWidth = 'none'
    canvas.style.maxHeight = 'none'
    // Force layout so following scroll math sees the new size.
    void canvas.offsetWidth
  }

  // Zoom the canvas around a client point: padding does not scale, only the bitmap does.
  const zoomAroundClient = (to, clientX, clientY) => {
    const wrap = wrapRef.current
    const canvas = sheetCanvasRef.current
    if (!wrap || !canvas) return
    const from = zoomRef.current
    if (to === from) return
    const scale = to / from
    const wrapRect = wrap.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    const mouseX = clientX - wrapRect.left
    const mouseY = clientY - wrapRect.top
    // Offset within the canvas before resize (canvas top-left stays fixed in content space).
    const ox = clientX - canvasRect.left
    const oy = clientY - canvasRect.top
    const canvasContentLeft = wrap.scrollLeft + (canvasRect.left - wrapRect.left)
    const canvasContentTop = wrap.scrollTop + (canvasRect.top - wrapRect.top)
    applyCanvasSize(to)
    setZoomBoth(to)
    wrap.scrollLeft = canvasContentLeft + ox * scale - mouseX
    wrap.scrollTop = canvasContentTop + oy * scale - mouseY
  }

  const paintLoadedSheet = (image, { recenter = false, fitToView = false } = {}) => {
    const paintGrid = character?.grid ?? inferCharacterSheetGrid(path, image.naturalWidth, image.naturalHeight)
    setInferredGrid(character?.grid ? null : paintGrid)
    const highlight =
      sheetAnim && !character?.isMask
        ? { start: sheetAnim.start ?? 0, frames: Math.max(1, sheetAnim.frames ?? 1) }
        : null
    const layout = paintSheet(sheetCanvasRef.current, image, paintGrid, path, highlight)
    if (!layout) return
    layoutRef.current = layout
    const nextStage = { width: layout.stageW, height: layout.stageH, sheetW: layout.sheetW, sheetH: layout.sheetH }
    stageRef.current = nextStage
    setStage(nextStage)
    if (fitToView) {
      const wrap = wrapRef.current
      const nextFit = wrap
        ? fitZoom(layout.stageW, layout.stageH, wrap.clientWidth, wrap.clientHeight)
        : 1
      setFit(nextFit)
      setZoomBoth(nextFit)
      applyCanvasSize(nextFit)
    } else {
      applyCanvasSize(zoomRef.current)
    }
    if (!recenter) return
    // Centre the sheet in the stage after layout.
    requestAnimationFrame(() => {
      const el = wrapRef.current
      const canvas = sheetCanvasRef.current
      if (!el || !canvas) return
      el.scrollLeft = Math.max(0, (canvas.offsetWidth - el.clientWidth) / 2)
      el.scrollTop = Math.max(0, (canvas.offsetHeight - el.clientHeight) / 2)
    })
  }

  useEffect(() => {
    let cancelled = false
    let retries = 0
    setFailed(false)
    setInferredGrid(null)
    sheetImageRef.current = null
    const paintWhenReady = (image) => {
      if (cancelled) return
      // When the previous sheet failed, the canvas was unmounted; wait for it to remount.
      if (!sheetCanvasRef.current) {
        if (retries++ < 30) {
          requestAnimationFrame(() => paintWhenReady(image))
          return
        }
        setFailed(true)
        return
      }
      try {
        paintLoadedSheet(image, { recenter: true, fitToView: true })
        setFailed(false)
      } catch {
        setFailed(true)
      }
    }
    loadImage(src)
      .then((image) => {
        if (cancelled) return
        sheetImageRef.current = image
        paintWhenReady(image)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [src, gridKey, path])

  // Re-tint the sheet grid when Anim changes without reloading the PNG or resetting zoom.
  useEffect(() => {
    const image = sheetImageRef.current
    if (!image || !sheetCanvasRef.current || failed) return
    try {
      paintLoadedSheet(image, { recenter: false, fitToView: false })
    } catch {
      /* keep prior paint */
    }
  }, [sheetAnim?.start, sheetAnim?.frames, sheetAnim?.name, animation])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return undefined

    // Zoom toward the cursor: the canvas point under the mouse stays under the mouse.
    const onWheel = (event) => {
      event.preventDefault()
      if (!stageRef.current.width) return
      const to = clampZoom(zoomRef.current * (event.deltaY < 0 ? 1.12 : 1 / 1.12))
      zoomAroundClient(to, event.clientX, event.clientY)
    }

    // Grab-pan: the stage point under the mouse stays under the mouse while dragging.
    let drag = null
    const onPointerDown = (event) => {
      if (event.button !== 0 && event.button !== 1) return
      event.preventDefault()
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: wrap.scrollLeft,
        top: wrap.scrollTop,
      }
      wrap.classList.add('is-panning')
      wrap.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      // Keep the grabbed stage point locked under the cursor.
      wrap.scrollLeft = drag.left - (event.clientX - drag.x)
      wrap.scrollTop = drag.top - (event.clientY - drag.y)
    }
    const endDrag = (event) => {
      if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return
      drag = null
      wrap.classList.remove('is-panning')
    }
    const onAuxClick = (event) => {
      if (event.button === 1) event.preventDefault()
    }

    wrap.addEventListener('wheel', onWheel, { passive: false })
    wrap.addEventListener('pointerdown', onPointerDown)
    wrap.addEventListener('pointermove', onPointerMove)
    wrap.addEventListener('pointerup', endDrag)
    wrap.addEventListener('pointercancel', endDrag)
    wrap.addEventListener('lostpointercapture', endDrag)
    wrap.addEventListener('auxclick', onAuxClick)
    return () => {
      wrap.removeEventListener('wheel', onWheel)
      wrap.removeEventListener('pointerdown', onPointerDown)
      wrap.removeEventListener('pointermove', onPointerMove)
      wrap.removeEventListener('pointerup', endDrag)
      wrap.removeEventListener('pointercancel', endDrag)
      wrap.removeEventListener('lostpointercapture', endDrag)
      wrap.removeEventListener('auxclick', onAuxClick)
      wrap.classList.remove('is-panning')
    }
  }, [stage.width, stage.height])

  useEffect(() => {
    if (!sheetAnim || !src || character?.isMask) return undefined
    let cancelled = false
    let frameId = 0
    const playback = animPlaybackRef.current
    playback.scrubbing = false
    playback.playing = true
    playback.baseFrame = 0
    playback.frame = 0
    playback.playStart = performance.now()
    setAnimFrame(0)
    setAnimPlaying(true)
    loadImage(src).then((image) => {
      if (cancelled) return
      const canvas = animCanvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const { width, height } = sheetAnim.sheet.frame
      const res = sheetAnim.sheet.resolution ?? 1
      const frames = Math.max(1, sheetAnim.frames)
      canvas.width = width
      canvas.height = height
      const row = Math.max(0, FACINGS.indexOf(facing))

      const draw = (now) => {
        if (cancelled) return
        let local
        if (playback.scrubbing || !playback.playing) {
          local = Math.min(frames - 1, Math.max(0, playback.frame))
        } else {
          const elapsed = (now - playback.playStart) / 1000
          let progress = playback.baseFrame / frames + elapsed / Math.max(0.001, sheetAnim.seconds)
          if (sheetAnim.play === 'loop') progress = progress - Math.floor(progress)
          else progress = Math.min(1, Math.max(0, progress))
          local = Math.min(frames - 1, Math.floor(progress * frames))
          if (sheetAnim.play !== 'loop' && progress >= 1) {
            local = frames - 1
            playback.playing = false
            playback.frame = local
            setAnimPlaying(false)
            setAnimFrame(local)
          } else if (playback.frame !== local) {
            playback.frame = local
            setAnimFrame(local)
          }
        }
        const col = sheetAnim.start + local
        ctx.clearRect(0, 0, width, height)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(image, col * width * res, row * height * res, width * res, height * res, 0, 0, width, height)
        frameId = requestAnimationFrame(draw)
      }
      frameId = requestAnimationFrame(draw)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
    }
  }, [sheetAnim, src, facing, animation, version, path, loop, character?.isMask])

  const animFrameCount = Math.max(1, sheetAnim?.frames ?? 1)
  const onAnimScrub = (value) => {
    const frame = Math.min(animFrameCount - 1, Math.max(0, Number(value) || 0))
    const playback = animPlaybackRef.current
    playback.scrubbing = true
    playback.playing = false
    playback.frame = frame
    setAnimPlaying(false)
    setAnimFrame(frame)
  }
  const onAnimScrubEnd = () => {
    const playback = animPlaybackRef.current
    playback.scrubbing = false
    playback.baseFrame = playback.frame
    playback.playStart = performance.now()
  }
  const toggleAnimPlay = () => {
    const playback = animPlaybackRef.current
    if (playback.playing) {
      playback.playing = false
      playback.baseFrame = playback.frame
      setAnimPlaying(false)
      return
    }
    // Restart from the beginning when a non-loop clip already finished on the last frame.
    if (sheetAnim?.play !== 'loop' && playback.frame >= animFrameCount - 1) {
      playback.frame = 0
      playback.baseFrame = 0
      setAnimFrame(0)
    } else {
      playback.baseFrame = playback.frame
    }
    playback.scrubbing = false
    playback.playing = true
    playback.playStart = performance.now()
    setAnimPlaying(true)
  }

  const expectedCell = grid
    ? {
        designW: grid.frame.width,
        designH: grid.frame.height,
        pixelW: grid.frame.width * grid.resolution,
        pixelH: grid.frame.height * grid.resolution,
        resolution: grid.resolution,
        columns: grid.columns,
        rows: grid.rows,
        sheetW: grid.width,
        sheetH: grid.height,
      }
    : null

  const fileCell =
    grid && stage.sheetW > 0
      ? {
          pixelW: stage.sheetW / grid.columns,
          pixelH: stage.sheetH / grid.rows,
        }
      : null

  const sizeMismatch =
    expectedCell && fileCell
      ? Math.round(fileCell.pixelW) !== expectedCell.pixelW ||
        Math.round(fileCell.pixelH) !== expectedCell.pixelH ||
        stage.sheetW !== expectedCell.sheetW ||
        stage.sheetH !== expectedCell.sheetH
      : false

  const strip =
    !grid && stage.sheetW > 0 ? detectStripLayout(stage.sheetW, stage.sheetH, path) : null
  const clip =
    !grid && !strip && stage.sheetW > 0
      ? tileClipBox(
          layoutRef.current ?? floorLayout(stage.sheetW, stage.sheetH, null, path),
          path,
        )
      : null
  const clipShort =
    clip && Math.round(clip.fileH) > stage.sheetH
      ? Math.round(clip.fileH) - stage.sheetH
      : 0
  const tileMeta = !grid && path ? environmentTileMeta(path) : null

  const canvasStyle =
    stage.width > 0
      ? {
          width: `${Math.round(stage.width * zoom)}px`,
          height: `${Math.round(stage.height * zoom)}px`,
          maxWidth: 'none',
          maxHeight: 'none',
        }
      : undefined

  const zoomLabel = Math.abs(zoom - fit) < 0.001 ? 'Fit' : `${Math.round(zoom * 100)}%`

  const goFit = () => {
    const wrap = wrapRef.current
    const layout = layoutRef.current
    if (!wrap || !layout) {
      setZoomBoth(fit)
      applyCanvasSize(fit)
      return
    }
    const next = fitZoom(layout.stageW, layout.stageH, wrap.clientWidth, wrap.clientHeight)
    setFit(next)
    setZoomBoth(next)
    applyCanvasSize(next)
    requestAnimationFrame(() => {
      const el = wrapRef.current
      const canvas = sheetCanvasRef.current
      if (!el || !canvas) return
      el.scrollLeft = Math.max(0, (canvas.offsetWidth - el.clientWidth) / 2)
      el.scrollTop = Math.max(0, (canvas.offsetHeight - el.clientHeight) / 2)
    })
  }

  const goOneX = () => {
    const wrap = wrapRef.current
    if (!wrap) {
      applyCanvasSize(1)
      setZoomBoth(1)
      return
    }
    const wrapRect = wrap.getBoundingClientRect()
    zoomAroundClient(1, wrapRect.left + wrap.clientWidth / 2, wrapRect.top + wrap.clientHeight / 2)
  }

  return (
    <div className="ss-preview-visual">
      <div className="ss-zoom-bar">
        <span className="me-text">Zoom {zoomLabel}</span>
        <button type="button" className="me-button" onClick={goFit}>
          Fit
        </button>
        <button type="button" className="me-button" onClick={goOneX}>
          1×
        </button>
        <span className="me-text ss-zoom-hint">Wheel zooms at cursor · left-drag pans under cursor</span>
      </div>
      <div ref={wrapRef} className="ss-sheet-wrap">
        {failed && (
          <p className="me-text ss-preview-error">Could not load or preview this PNG.</p>
        )}
        <canvas
          ref={sheetCanvasRef}
          className="ss-sheet-canvas"
          style={{ ...canvasStyle, display: failed ? 'none' : undefined }}
          aria-label="Sprite sheet with iso floor grid"
        />
      </div>
      {stage.sheetW > 0 && (
        <div className="ss-size-block">
          {expectedCell && (
            <p className="ss-sprite-size">
              Paint cell <strong>{expectedCell.designW}×{expectedCell.designH}</strong>
              <span className="me-text"> design</span>
              {' · '}
              <strong>{expectedCell.pixelW}×{expectedCell.pixelH}px</strong>
              <span className="me-text"> in file (×{expectedCell.resolution})</span>
            </p>
          )}
          {fileCell && (
            <p className="ss-sprite-size is-file">
              File cell <strong>{Math.round(fileCell.pixelW)}×{Math.round(fileCell.pixelH)}px</strong>
              {sizeMismatch ? <span className="ss-mismatch"> · differs from paint cell</span> : null}
            </p>
          )}
          {strip && (
            <p className="ss-sprite-size">
              Strip <strong>{strip.columns}×{strip.rows}</strong>
              <span className="me-text"> frames</span>
              {' · '}
              <strong>{Math.round(strip.designW)}×{Math.round(strip.designH)}</strong>
              <span className="me-text"> design</span>
              {' · '}
              <strong>{Math.round(strip.frameW)}×{Math.round(strip.frameH)}px</strong>
              <span className="me-text"> each (×{strip.scale})</span>
            </p>
          )}
          {clip && (
            <p className="ss-sprite-size">
              Yellow clip <strong>{clip.designW}×{clip.designH}</strong>
              <span className="me-text"> design</span>
              {' · '}
              <strong>{Math.round(clip.fileW)}×{Math.round(clip.fileH)}px</strong>
              <span className="me-text"> on board</span>
              {tileMeta?.id ? <span className="me-text"> · {tileMeta.id}</span> : null}
              {clipShort > 0 ? (
                <span className="ss-mismatch"> · PNG short by {clipShort}px</span>
              ) : null}
            </p>
          )}
          <p className="me-text ss-size">
            {expectedCell ? (
              <>
                Grid {expectedCell.columns}×{expectedCell.rows} → sheet {expectedCell.sheetW}×{expectedCell.sheetH}
                {' · '}
              </>
            ) : null}
            File {stage.sheetW}×{stage.sheetH}
          </p>
          <p className="me-text ss-size-hint">
            Iso floor extends past the sheet on every side (preview only). Yellow boxes mark single-tile clips or
            auto-detected strip frames. Yellow lines on character sheets are animation frames. Export downloads the PNG
            over transparency — no floor or guides. Paint, keep the same sheet size on Import.
          </p>
        </div>
      )}
      {sheetAnim && !character?.isMask && (
        <div className="ss-anim-preview" aria-label={`Animation ${animation}`}>
          <div className="ss-anim-preview-main">
            <canvas ref={animCanvasRef} width={sheetAnim.sheet.frame.width} height={sheetAnim.sheet.frame.height} />
            <div className="ss-anim-controls">
              {animNames.length > 0 && onAnimationChange && (
                <label className="me-text">
                  Anim{' '}
                  <select
                    className="me-select"
                    value={animation ?? ''}
                    onChange={(event) => onAnimationChange(event.target.value || null)}
                  >
                    {animNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {onLoopChange && (
                <label className="me-text ss-loop-check">
                  <input type="checkbox" checked={loop} onChange={(event) => onLoopChange(event.target.checked)} />{' '}
                  Loop
                </label>
              )}
              {onFacingChange && (
                <button
                  type="button"
                  className="me-button"
                  title="Cycle preview facing"
                  onClick={() => {
                    const i = Math.max(0, FACINGS.indexOf(facing))
                    onFacingChange(FACINGS[(i + 1) % FACINGS.length])
                  }}
                >
                  Angle {facing}
                </button>
              )}
            </div>
          </div>
          <div className="ss-anim-scrub me-sliders">
            <button
              type="button"
              className={`me-button${animPlaying ? ' is-on' : ''}`}
              aria-pressed={animPlaying}
              title={animPlaying ? 'Pause' : 'Play'}
              onClick={toggleAnimPlay}
            >
              {animPlaying ? 'Pause' : 'Play'}
            </button>
            <label className="ss-anim-scrub-track me-text">
              Frame
              <input
                type="range"
                min={0}
                max={animFrameCount - 1}
                step={1}
                value={Math.min(animFrame, animFrameCount - 1)}
                aria-label="Animation frame"
                onChange={(event) => onAnimScrub(event.target.value)}
                onPointerDown={(event) => onAnimScrub(event.currentTarget.value)}
                onPointerUp={onAnimScrubEnd}
                onPointerCancel={onAnimScrubEnd}
                onKeyUp={onAnimScrubEnd}
              />
            </label>
            <span className="me-text ss-anim-scrub-label">
              {Math.min(animFrame, animFrameCount - 1) + 1}/{animFrameCount}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
