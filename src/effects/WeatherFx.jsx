import { useEffect, useRef } from 'react'
import { between, WEATHER_KINDS } from './weatherKinds.js'
import './effects.css'

// A weather overlay for a positioned parent: a canvas that redraws the weather's layers every frame (layer settings in
// weather.json, layer kinds in weatherKinds.js). Clicks pass through it to whatever is underneath.
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// A flash (lightning, an ion discharge, a power flicker): a double flicker that fades out, then a random wait for the next.
function flashAlpha(state, dt, range) {
  state.wait -= dt
  if (state.wait > 0) return 0
  const age = -state.wait
  if (age > 0.6) {
    state.wait = between(range)
    return 0
  }
  const flicker = age < 0.08 ? 1 : age < 0.16 ? 0.25 : 0.8
  return 0.55 * flicker * (1 - age / 0.6)
}

// Extra room drawn around the view when following a board, so streaks, fog banks and sparks near an edge aren't cut off.
const FOLLOW_PAD = 200

// The board's box on the canvas, in canvas CSS pixels. Measuring forces a style and layout pass, so it is only done when
// something is resized, never per frame.
function measureBoard(board, canvas) {
  const rect = canvas.getBoundingClientRect()
  const boardRect = board.getBoundingClientRect()
  if (!rect.width) return null
  const css = canvas.clientWidth / rect.width
  return { left: (boardRect.left - rect.left) * css, top: (boardRect.top - rect.top) * css, width: boardRect.width * css, height: boardRect.height * css }
}

// Where a board's world origin sits on the canvas and how many canvas pixels one world pixel takes. The camera pans by
// writing the viewBox directly (outside React), so it is read from there each frame; reading the attribute forces no
// layout, unlike getScreenCTM. The SVG's default preserveAspectRatio (xMidYMid meet) centres the viewBox in its box.
function boardView(board, box) {
  const viewBox = board.viewBox.baseVal
  if (!box || !viewBox?.width || !viewBox.height) return null
  const scale = Math.min(box.width / viewBox.width, box.height / viewBox.height)
  return {
    scale,
    x: box.left + (box.width - viewBox.width * scale) / 2 - viewBox.x * scale,
    y: box.top + (box.height - viewBox.height * scale) / 2 - viewBox.y * scale,
  }
}

// Draws one layer repeated across the view, offset and scaled with the board, so it stays over the same tiles.
// zoom is relative to the board's scale when the layer was made, which keeps the first frame looking as it always did.
function drawFollowing(ctx, ratio, entry, time, width, height, view, zoom) {
  const { layer, kind, state } = entry
  const [spanX, spanY] = kind.period(width, height)
  const marginX = (spanX - width) / 2
  const marginY = (spanY - height) / 2
  const left = -view.x / zoom - FOLLOW_PAD
  const top = -view.y / zoom - FOLLOW_PAD
  const right = (width - view.x) / zoom + FOLLOW_PAD
  const bottom = (height - view.y) / zoom + FOLLOW_PAD
  for (let column = Math.floor((left + marginX) / spanX); column <= Math.floor((right + marginX) / spanX); column++) {
    for (let row = Math.floor((top + marginY) / spanY); row <= Math.floor((bottom + marginY) / spanY); row++) {
      ctx.setTransform(ratio * zoom, 0, 0, ratio * zoom, ratio * (view.x + zoom * column * spanX), ratio * (view.y + zoom * row * spanY))
      kind.draw(ctx, state, layer, time, width, height)
    }
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
}

// virtualWidth: draws as if the overlay were this many pixels wide, then shrinks it to fit, so a small picture (an episode
// card) shows a miniature of the board's weather instead of oversized funnels and rings.
// follow: a selector for the board SVG beside the overlay; ground weather (rain, fog, sparks...) then pans and zooms with
// that board's camera, while sky and screen effects (aurora, lightning, meteors, scanlines, tints) stay on screen.
export default function WeatherFx({ fx, virtualWidth = null, follow = null }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fx) return undefined
    const ctx = canvas.getContext('2d')
    const still = reducedMotion()
    let width = 0
    let height = 0
    let layers = []
    let ratio = 1
    let baseScale = null
    const flash = { wait: fx.flash ? between(fx.flash.every) : Infinity }
    // The followed board and its measured box; measured again after a resize or when the board element is replaced.
    let board = null
    let boardBox = null
    const followedView = () => {
      const current = canvas.parentElement?.querySelector(follow)
      if (!current) return null
      // observe() reports once straight away, so it is only called for a new board element; calling it on every
      // remeasure would clear the box again and measure every frame.
      if (current !== board) {
        board = current
        boardBox = null
        boardObserver.disconnect()
        boardObserver.observe(board)
      }
      boardBox ??= measureBoard(board, canvas)
      return boardView(board, boardBox)
    }
    const remeasure = () => {
      boardBox = null
    }
    const boardObserver = new ResizeObserver(remeasure)
    window.addEventListener('resize', remeasure)

    const resize = () => {
      ratio = window.devicePixelRatio || 1
      baseScale = null
      const scale = virtualWidth && canvas.clientWidth ? canvas.clientWidth / virtualWidth : 1
      width = canvas.clientWidth / scale
      height = canvas.clientHeight / scale
      canvas.width = Math.round(canvas.clientWidth * ratio)
      canvas.height = Math.round(canvas.clientHeight * ratio)
      ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0)
      layers = (fx.layers ?? [])
        .filter((layer) => WEATHER_KINDS[layer.kind])
        .map((layer) => ({ layer, kind: WEATHER_KINDS[layer.kind], state: WEATHER_KINDS[layer.kind].make(layer, width, height) }))
    }

    const draw = (time, dt) => {
      ctx.clearRect(0, 0, width, height)
      if (fx.tint) {
        ctx.fillStyle = fx.tint
        ctx.fillRect(0, 0, width, height)
      }
      const view = follow ? followedView() : null
      if (view) baseScale ??= view.scale
      for (const entry of layers) {
        const { layer, kind, state } = entry
        if (!still) kind.step(state, layer, dt, time, width, height)
        if (view && kind.period) drawFollowing(ctx, ratio, entry, time, width, height, view, view.scale / baseScale)
        else kind.draw(ctx, state, layer, time, width, height)
      }
      if (fx.pulse) {
        const [low, high] = fx.pulse.alpha
        const wave = still ? 0.5 : 0.5 + 0.5 * Math.sin((time * Math.PI * 2) / fx.pulse.period)
        ctx.fillStyle = `rgba(${fx.pulse.colour}, ${low + (high - low) * wave})`
        ctx.fillRect(0, 0, width, height)
      }
      const flashLevel = still || !fx.flash ? 0 : flashAlpha(flash, dt, fx.flash.every)
      if (flashLevel > 0) {
        ctx.fillStyle = `rgba(${fx.flash.colour}, ${flashLevel})`
        ctx.fillRect(0, 0, width, height)
      }
    }

    let frame = 0
    let last = performance.now()
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      draw(now / 1000, dt)
      frame = requestAnimationFrame(tick)
    }

    // A still overlay draws once, unless it follows a board, which it must keep tracking as the camera moves.
    const drawOnce = still && !follow
    const observer = new ResizeObserver(() => {
      resize()
      remeasure()
      if (drawOnce) draw(0, 0)
    })
    observer.observe(canvas)
    resize()
    if (drawOnce) draw(0, 0)
    else frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      boardObserver.disconnect()
      window.removeEventListener('resize', remeasure)
      ctx.clearRect(0, 0, width, height)
    }
  }, [fx, virtualWidth, follow])

  if (!fx) return null
  return <canvas ref={canvasRef} className="weather-fx" aria-hidden="true" />
}
