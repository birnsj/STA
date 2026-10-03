import { useEffect, useState } from 'react'
import { loadMap } from '../../maps/mapFiles.js'

// For combat setup screens: loads the map file the episode chosen in Load Episode plays on.
export default function useEpisodeMap(mapId) {
  const [loaded, setLoaded] = useState(null)
  const [problem, setProblem] = useState(null)
  useEffect(() => {
    let cancelled = false
    loadMap(mapId)
      .then((map) => {
        if (cancelled) return
        setLoaded(map)
        setProblem(null)
      })
      .catch((error) => !cancelled && setProblem(`Could not load map ${mapId}: ${error.message}`))
    return () => {
      cancelled = true
    }
  }, [mapId])
  const map = loaded?.id === mapId ? loaded : null
  return { map, problem }
}
