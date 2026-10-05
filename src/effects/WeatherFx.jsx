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

// virtualWidth: draws as if the overlay were this many pixels wide, then shrinks it to fit, so a small picture (an episode
// card) shows a miniature of the board's weather instead of oversized funnels and rings.
export default function WeatherFx({ fx, virtualWidth = null }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fx) return undefined
    const ctx = canvas.getContext('2d')
    const still = reducedMotion()
    let width = 0
    let height = 0
    let layers = []
    const flash = { wait: fx.flash ? between(fx.flash.every) : Infinity }

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
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
      for (const { layer, kind, state } of layers) {
        if (!still) kind.step(state, layer, dt, time, width, height)
        kind.draw(ctx, state, layer, time, width, height)
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

    const observer = new ResizeObserver(() => {
      resize()
      if (still) draw(0, 0)
    })
    observer.observe(canvas)
    resize()
    if (still) draw(0, 0)
    else frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      ctx.clearRect(0, 0, width, height)
    }
  }, [fx, virtualWidth])

  if (!fx) return null
  return <canvas ref={canvasRef} className="weather-fx" aria-hidden="true" />
}
