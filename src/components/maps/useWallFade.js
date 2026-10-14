import { useState } from 'react'
import { NO_WALL_FADE, sameWallFade, wallFadeStep } from '../../maps/wallFade.js'
import { useDisplaySettings } from '../../settings/DisplaySettingsContext.js'

// The fading blocks to draw see-through for these figures ([{ id, position }]), remembering the last frame's so walls
// fade by room and stay faded until a figure is clear of them (maps/wallFade.js). Settings > Wall Fade picks whole
// rooms and sections, or one block at a time.
export default function useWallFade(map, figures, bigGroups) {
  const mode = useDisplaySettings().wallFade
  const [memory, setMemory] = useState(NO_WALL_FADE)
  const next = wallFadeStep(map, figures, bigGroups, memory, mode)
  if (!sameWallFade(next, memory)) setMemory(next)
  return next.keys
}
