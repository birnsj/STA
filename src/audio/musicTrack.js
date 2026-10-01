// A looping background track with fade-in/out. Lives outside React so a fade-out can finish after its screen unmounts.
// FULL_VOLUME is the mix level at 100% on the Settings slider.
const FULL_VOLUME = 0.6
const FADE_IN_MS = 3000
const FADE_OUT_MS = 1500

export function createMusicTrack(url) {
  let audio = null
  let fadeTimer = null
  let wanted = false
  let level = 1
  const targetVolume = () => FULL_VOLUME * level

  function getAudio() {
    if (!audio) {
      audio = new Audio(url)
      audio.loop = true
      audio.volume = 0
    }
    return audio
  }

  // A timer rather than requestAnimationFrame, which stops in hidden tabs and would leave a fade unfinished.
  function fadeTo(target, durationMs, onDone) {
    const track = getAudio()
    clearInterval(fadeTimer)
    const from = track.volume
    const startedAt = performance.now()

    fadeTimer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs)
      track.volume = from + (target - from) * progress
      if (progress === 1) {
        clearInterval(fadeTimer)
        onDone?.()
      }
    }, 30)
  }

  // Browsers block audio until the player interacts with the page, so a blocked start retries on the first gesture.
  function retryOnFirstGesture() {
    const retry = () => {
      window.removeEventListener('pointerdown', retry)
      window.removeEventListener('keydown', retry)
      if (wanted) start()
    }
    window.addEventListener('pointerdown', retry)
    window.addEventListener('keydown', retry)
  }

  function start() {
    wanted = true
    const track = getAudio()
    if (!track.paused) {
      fadeTo(targetVolume(), FADE_IN_MS)
      return
    }
    track.volume = 0
    track.currentTime = 0
    track
      .play()
      .then(() => wanted && fadeTo(targetVolume(), FADE_IN_MS))
      .catch((error) => {
        if (error.name === 'NotAllowedError') retryOnFirstGesture()
      })
  }

  function stop() {
    wanted = false
    if (!audio || audio.paused) return
    fadeTo(0, FADE_OUT_MS, () => {
      if (!wanted) audio.pause()
    })
  }

  // Silences the player immediately; used when a development hot reload replaces the module that owns it.
  function silence() {
    clearInterval(fadeTimer)
    audio?.pause()
  }

  // 0..1 from the Settings slider. Applied at once while playing (any running fade-in is replaced) so dragging is audible.
  function setVolume(nextLevel) {
    level = Math.min(Math.max(nextLevel, 0), 1)
    if (wanted && audio && !audio.paused) {
      clearInterval(fadeTimer)
      audio.volume = targetVolume()
    }
  }

  return { start, stop, silence, setVolume }
}
