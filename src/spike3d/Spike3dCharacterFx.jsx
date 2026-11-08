import { useEffect, useRef, useState } from 'react'
import { CHARACTER_HAZARD_FRAME, HAZARD_FRAMES, characterHazardOverlayLook } from '../components/maps/environmentArt.js'
import { shotHitGlowAlpha } from '../components/maps/pixi/effects.js'
import { getSpriteMetrics } from '../rules/appearance.js'
import { resolveHazardOverlayDisplay } from '../world/characterHazardOverlay.js'

// Pixi hazard / hit-glow sit under the Three canvas while spike3d is on, so they never read on the mesh.
// These SVG marks live in the board overlay (above Spike3d) and track the same figure centres as the rings.

const DISPLAY_SCALE = getSpriteMetrics().displayScale ?? 1
const HAZARD_SCALE = 1.05 * DISPLAY_SCALE
const HAZARD_Y = -40
const HAZARD_LOOP_MS = 1000
const GLOW_Y = -28

function cssColour(colour) {
  if (typeof colour === 'number' && Number.isFinite(colour)) {
    return `#${(colour >>> 0).toString(16).padStart(6, '0')}`
  }
  if (typeof colour === 'string' && colour.trim()) return colour
  return '#ffffff'
}

function holdingHazard(figure) {
  const pose = figure.pose?.animation
  return Boolean(
    figure.down ||
      figure.blastReact ||
      figure.pose?.standingUp ||
      pose === 'getUp' ||
      (typeof pose === 'string' && pose.startsWith('fall')),
  )
}

/**
 * figures: board figures that may carry hazardOverlay / hitGlow (exploration or combat).
 * Renders above the Spike3d canvas inside the SVG viewBox.
 */
export default function Spike3dCharacterFx({ figures }) {
  const [, setFrame] = useState(0)
  const heldRef = useRef(new Map())
  const glowStartedRef = useRef(new Map())

  useEffect(() => {
    let id = 0
    const tick = () => {
      setFrame((n) => (n + 1) % 1_000_000)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])

  const now = performance.now()
  const held = heldRef.current
  const glowStarted = glowStartedRef.current
  const liveGlowKeys = new Set()
  const marks = []

  for (const figure of figures) {
    if (!figure?.centre || figure.beam === 'waiting') continue
    const { x, y } = figure.centre

    const resolved = resolveHazardOverlayDisplay(figure.hazardOverlay || null, {
      holding: holdingHazard(figure),
      heldType: held.get(figure.id) ?? null,
    })
    if (resolved.held) held.set(figure.id, resolved.held)
    else held.delete(figure.id)

    const look = resolved.type ? characterHazardOverlayLook(resolved.type) : null
    const hazardFrame = look ? Math.floor((now / HAZARD_LOOP_MS) * HAZARD_FRAMES) % HAZARD_FRAMES : 0
    const hazardW = CHARACTER_HAZARD_FRAME.width * HAZARD_SCALE
    const hazardH = CHARACTER_HAZARD_FRAME.height * HAZARD_SCALE
    const hazardY = y + (figure.down ? HAZARD_Y * 0.45 : HAZARD_Y) - hazardH * 0.55

    const glow = figure.hitGlow
    let glowAlpha = 0
    let glowColour = null
    if (glow?.colour && glow.key != null) {
      const key = `${figure.id}:${glow.key}`
      liveGlowKeys.add(key)
      if (!glowStarted.has(key)) glowStarted.set(key, now)
      glowAlpha = shotHitGlowAlpha(glow, now - glowStarted.get(key))
      glowColour = cssColour(glow.colour)
    }

    if (!look && glowAlpha <= 0.01) continue
    marks.push({ id: figure.id, x, y, look, hazardFrame, hazardW, hazardH, hazardY, glowAlpha, glowColour })
  }

  for (const key of [...glowStarted.keys()]) {
    if (!liveGlowKeys.has(key)) glowStarted.delete(key)
  }

  return (
    <g className="spike3d-character-fx" pointerEvents="none">
      {marks.map((mark) => (
        <g key={mark.id}>
          {mark.glowAlpha > 0.01 && mark.glowColour && (
            <g opacity={mark.glowAlpha} style={{ mixBlendMode: 'screen' }}>
              <ellipse cx={mark.x} cy={mark.y + GLOW_Y} rx={34} ry={46} fill={mark.glowColour} opacity={0.7} />
              <ellipse cx={mark.x} cy={mark.y + GLOW_Y} rx={22} ry={32} fill={mark.glowColour} opacity={0.55} />
              <ellipse cx={mark.x} cy={mark.y + GLOW_Y} rx={12} ry={18} fill="#ffffff" opacity={0.45} />
            </g>
          )}
          {mark.look && (
            <svg
              x={mark.x - mark.hazardW / 2}
              y={mark.hazardY}
              width={mark.hazardW}
              height={mark.hazardH}
              viewBox={`${mark.hazardFrame * CHARACTER_HAZARD_FRAME.width} 0 ${CHARACTER_HAZARD_FRAME.width} ${CHARACTER_HAZARD_FRAME.height}`}
              overflow="hidden"
            >
              <image
                href={mark.look.href}
                width={CHARACTER_HAZARD_FRAME.width * HAZARD_FRAMES}
                height={CHARACTER_HAZARD_FRAME.height}
                preserveAspectRatio="none"
                opacity={0.88}
              />
            </svg>
          )}
        </g>
      ))}
    </g>
  )
}
