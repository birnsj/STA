import { useState } from 'react'
import { NO_WALL_FADE, sameWallFade, wallFadeStep } from '../../maps/wallFade.js'

// The fading blocks to draw see-through for these figures ([{ id, position }]), remembering the last frame's so walls
// fade by room and stay faded until a figure is clear of them (maps/wallFade.js).
export default function useWallFade(map, figures, bigGroups) {
  const [memory, setMemory] = useState(NO_WALL_FADE)
  const next = wallFadeStep(map, figures, bigGroups, memory)
  if (!sameWallFade(next, memory)) setMemory(next)
  return next.keys
}
