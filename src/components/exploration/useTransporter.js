import { useCallback, useEffect, useRef } from 'react'
import { playBeamInSound } from '../../audio/uiSounds.js'
import { BEAM_IN_MS } from '../combat/battleHelpers.js'

// The transporter beaming characters into the mission: returns beamIn(characters), which puts them beside the lead
// in a beam (explorationState.js startBeamIn) and lets them act once it has played.
export default function useTransporter(dispatch) {
  const timers = useRef(new Set())
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])
  return useCallback(
    (characters) => {
      if (!characters.length) return
      const ids = characters.map((character) => character.id)
      dispatch({ type: 'startBeamIn', characters })
      playBeamInSound(BEAM_IN_MS / 1000)
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        dispatch({ type: 'finishBeamIn', ids })
      }, BEAM_IN_MS)
      timers.current.add(timer)
    },
    [dispatch],
  )
}
