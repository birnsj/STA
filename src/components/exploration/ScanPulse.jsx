import { useEffect, useRef } from 'react'
import { project, TILE_H, TILE_W } from '../../maps/iso.js'
import { scanSweepSeconds } from './scanSweep.js'

const POINTS = 96
// How often the arcs re-roll their jagged shape: often enough to crackle, slow enough not to strobe.
const CRACKLE_MS = 70
// [jitter, stroke opacity] of each arc: the wobble around the ring as a fraction of its radius.
const ARCS = [
  [0.035, 1],
  [0.05, 0.75],
  [0.025, 0.9],
]

// A jagged ellipse in world pixels: each point's distance from the centre wobbles by up to `jitter`, so the ring
// reads as an electric arc rather than a clean line. `seed` changes the wobble pattern.
function arcPath(rx, ry, jitter, seed) {
  const points = []
  for (let i = 0; i < POINTS; i++) {
    const angle = (i / POINTS) * Math.PI * 2
    const wobble = 1 + jitter * Math.sin(i * 2.7 + seed) * Math.cos(i * 1.3 + seed * 2.3)
    points.push(`${(Math.cos(angle) * rx * wobble).toFixed(1)},${(Math.sin(angle) * ry * wobble).toFixed(1)}`)
  }
  return `M${points.join('L')}Z`
}

// Ease-out: the ring leaves fast and slows as it reaches the edge of the scan.
const easeOut = (t) => 1 - (1 - t) ** 3

// The tricorder sweep of a party Scan: an electric ring that spreads along the floor from the scanner out to the scan's
// radius, then fades. origin: the scanner's position in tiles; radius: the scan radius in tiles (scan.json);
// speed: Auto Combat speed (1 in exploration); onDone: the sweep has finished. A circle on the floor is an ellipse on
// the isometric map. Drawn at its true size each frame (not scaled), so the line width stays crisp and the browser
// doesn't re-rasterise a stretched shape.
export default function ScanPulse({ origin, radius, speed = 1, onDone }) {
  const groupRef = useRef(null)
  const glowRef = useRef(null)
  const arcRefs = useRef([])
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  useEffect(() => {
    const fullRx = (radius * TILE_W) / Math.SQRT2
    const fullRy = (radius * TILE_H) / Math.SQRT2
    const durationMs = (scanSweepSeconds(radius) * 1000) / Math.max(speed, 0.01)
    const start = performance.now()
    let frame = 0
    let seed = 0
    let lastCrackle = -Infinity
    const draw = (now) => {
      const t = Math.min(1, (now - start) / durationMs)
      const grow = 0.02 + 0.98 * easeOut(t)
      const rx = fullRx * grow
      const ry = fullRy * grow
      if (now - lastCrackle >= CRACKLE_MS / Math.max(speed, 0.01)) {
        seed = Math.random() * 100
        lastCrackle = now
      }
      const fade = t < 0.08 ? t / 0.08 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1
      groupRef.current?.setAttribute('opacity', fade.toFixed(3))
      glowRef.current?.setAttribute('rx', rx.toFixed(1))
      glowRef.current?.setAttribute('ry', ry.toFixed(1))
      ARCS.forEach(([jitter], index) => arcRefs.current[index]?.setAttribute('d', arcPath(rx, ry, jitter, seed + index * 17)))
      if (t < 1) frame = requestAnimationFrame(draw)
      else onDoneRef.current?.()
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [radius, speed])

  const centre = project(origin)
  return (
    <g ref={groupRef} className="fx-scan-pulse" transform={`translate(${centre.x} ${centre.y})`} opacity="0" pointerEvents="none">
      <ellipse ref={glowRef} className="fx-scan-pulse-glow" cx="0" cy="0" rx="0" ry="0" />
      {ARCS.map(([, opacity], index) => (
        <path key={index} ref={(node) => (arcRefs.current[index] = node)} className={`fx-scan-pulse-arc is-arc-${index}`} strokeOpacity={opacity} d="" />
      ))}
    </g>
  )
}
