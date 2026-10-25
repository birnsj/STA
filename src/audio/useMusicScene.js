import { useEffect } from 'react'
import { setEpisodeMusic, setSceneCue } from './music.js'

// While mounted with a cue name, that cue plays over the view's own (see music.js); null leaves the view's cue playing.
export function useMusicScene(cue) {
  useEffect(() => {
    if (!cue) return undefined
    setSceneCue(cue)
    return () => setSceneCue(null)
  }, [cue])
}

// While mounted, the episode's cues (intro, exploration, combat, outro) play the tracks its map names (map.music);
// null leaves the defaults.
export function useEpisodeMusic(music) {
  useEffect(() => {
    setEpisodeMusic(music)
    return () => setEpisodeMusic(null, false)
  }, [music])
}
