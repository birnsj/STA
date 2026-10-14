import { useEffect, useState } from 'react'
import { TILE_H, TILE_W } from '../../maps/iso.js'
import { TALL_WALL_EXTRA } from '../../maps/wallFade.js'
import { playFootstep } from '../../audio/uiSounds.js'

// What the combat boards (Battlefield, SVG; PixiBattlefield) share: the view, where the badges go over a figure, the
// walk along a move. Presentation only.

// The camera (useCamera) picks which 1024 x 576 window of the world is shown.
export const VIEW = { width: 1024, height: 576 }
// Extra world space around the map so its edges can be scrolled out from under the HUD panels.
const HUD_MARGIN = { x: 200, top: 150, bottom: 110 }

export const worldBounds = (map) => ({
  minX: -(map.height * TILE_W) / 2 - HUD_MARGIN.x,
  maxX: (map.width * TILE_W) / 2 + HUD_MARGIN.x,
  minY: -TILE_H / 2 - TALL_WALL_EXTRA - HUD_MARGIN.top,
  maxY: ((map.width + map.height - 1) * TILE_H) / 2 + HUD_MARGIN.bottom,
})

// Above a standing figure's head (the sprites reach about 63px over their feet; designer request, 2026-10-12): its
// Stress bar, the turn's action points above that, and a Surrendered / Retreating label on top.
export const BAR_Y = -76
export const POINTS_Y = -88
export const LABEL_Y = -102

// Hover callbacks fire for a mouse only: a tap on a touch screen also sends hover events, which would fight the tap.
export const mouseOnly = (callback) => (event) => {
  if (event.pointerType === 'mouse') callback()
}

// Presentation only: walks the last moved unit along its path one tile at a time. Combat state has already moved it.
export function useMoveAnimation(lastMove, msPerTile) {
  const key = lastMove?.key ?? null
  const [step, setStep] = useState({ key, index: Infinity })
  if (step.key !== key) setStep({ key, index: 0 })
  const animating = Boolean(lastMove) && step.key === key && step.index < lastMove.path.length - 1
  useEffect(() => {
    if (!animating) return undefined
    playFootstep(step.index)
    const timer = setTimeout(() => setStep((current) => ({ ...current, index: current.index + 1 })), msPerTile)
    return () => clearTimeout(timer)
  }, [animating, step.index, msPerTile])
  if (!animating) return null
  const here = lastMove.path[step.index]
  const next = lastMove.path[step.index + 1]
  return { id: lastMove.combatantId, position: here, facing: { x: Math.sign(next.x - here.x), y: Math.sign(next.y - here.y) } }
}
