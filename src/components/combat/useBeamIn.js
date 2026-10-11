import { useContext, useEffect, useState } from 'react'
import { playBeamInSound } from '../../audio/uiSounds.js'
import { MapRevealedContext } from '../maps/mapReady.js'
import { BEAM_IN_MS } from './battleHelpers.js'

// The away team beaming in as a mission starts. It waits for the map to be seen (the fade from black lifting) and
// for held to clear (How to Play open), then plays once. enabled: false skips it (a fight started from the map).
// Returns 'waiting' (the party not drawn yet), 'beaming' or 'done'.
export default function useBeamIn({ enabled = true, held = false } = {}) {
  const revealed = useContext(MapRevealedContext)
  const [done, setDone] = useState(!enabled)
  const phase = done ? 'done' : revealed && !held ? 'beaming' : 'waiting'
  useEffect(() => {
    if (phase !== 'beaming') return undefined
    playBeamInSound(BEAM_IN_MS / 1000)
    const timer = setTimeout(() => setDone(true), BEAM_IN_MS)
    return () => clearTimeout(timer)
  }, [phase])
  return phase
}
