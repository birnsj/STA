import { useCallback, useEffect, useRef, useState } from 'react'
import { MapReadyContext } from './mapReady.js'
import { sheetsSettled } from './useRecolouredSheet.js'
import './maps.css'

// Never stay black longer than this, even if an image never answers.
const MAX_WAIT_MS = 5000
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

// An episode's map opens from black: the cover fades out once the map is painted and the figures' sprite sheets have
// loaded, so nothing pops in. Only the first map painted under it counts (a fight started later from the map doesn't
// fade again).
export default function MapFadeIn({ children }) {
  // 'waiting' (black) -> 'fading' -> 'done' (cover removed).
  const [stage, setStage] = useState('waiting')
  const started = useRef(false)

  const reveal = useCallback(() => {
    if (!started.current) {
      started.current = true
      setStage('fading')
    }
  }, [])

  const onMapReady = useCallback(() => {
    if (started.current) return
    // A frame first, so the figures mounted with the map have asked for their sheets; then two more after they have
    // settled, so the recoloured figures are drawn before the cover lifts.
    nextFrame()
      .then(sheetsSettled)
      .then(nextFrame)
      .then(nextFrame)
      .then(reveal)
  }, [reveal])

  useEffect(() => {
    const timer = setTimeout(reveal, MAX_WAIT_MS)
    return () => clearTimeout(timer)
  }, [reveal])

  return (
    <MapReadyContext.Provider value={onMapReady}>
      {children}
      {stage !== 'done' && (
        <div
          className={`map-fade-in${stage === 'fading' ? ' is-fading' : ''}`}
          aria-hidden="true"
          onTransitionEnd={() => setStage('done')}
        />
      )}
    </MapReadyContext.Provider>
  )
}
