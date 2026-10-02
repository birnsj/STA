// A looping background track with fade-in/out. Lives outside React so a fade-out can finish after its screen unmounts.
// FULL_VOLUME is the mix level at 100% on the Settings slider.
const FULL_VOLUME = 0.6
const FADE_IN_MS = 3000
const FADE_OUT_MS = 1500
const TICK_MS = 30
// A native <audio> loop clicks when the file ends mid-sound and replays any silence at its start, so the loop is done
// by crossfading into a second player. Long enough to hide the timer's jitter, short enough to sound continuous.
const CROSSFADE_S = 0.4

// loopStart (seconds): where repeats begin, so a file's leading silence is only heard the first time.
export function createMusicTrack(url, { loopStart = 0 } = {}) {
  let players = []
  let active = null
  let incoming = null
  let crossfadeStartedAt = 0
  let ticker = null
  let fade = null
  let master = 0
  let level = 1
  let wanted = false
  let starting = false
  let awaitingGesture = false

  function getPlayers() {
    if (!players.length) {
      players = [0, 1].map(() => {
        const player = new Audio(url)
        player.preload = 'auto'
        player.volume = 0
        // Backup only: if timers are throttled (hidden tab, minimized window) and the crossfade starts late,
        // the music still continues instead of stopping at the end of the file.
        player.loop = true
        return player
      })
    }
    return players
  }

  // A timer rather than requestAnimationFrame, which stops in hidden tabs and would leave a fade unfinished.
  function tick() {
    const now = performance.now()
    if (fade) {
      const progress = Math.min(1, (now - fade.startedAt) / fade.durationMs)
      master = fade.from + (fade.to - fade.from) * progress
      if (progress === 1) {
        const onDone = fade.onDone
        fade = null
        onDone?.()
      }
    }
    if (!active || active.paused) return

    if (!incoming && Number.isFinite(active.duration) && active.currentTime >= active.duration - CROSSFADE_S) {
      incoming = players.find((player) => player !== active)
      incoming.currentTime = loopStart
      incoming.volume = 0
      incoming.play().catch(() => {})
      crossfadeStartedAt = now
    }

    let mix = 0
    if (incoming) {
      mix = Math.min(1, (now - crossfadeStartedAt) / (CROSSFADE_S * 1000))
      if (mix === 1) {
        active.pause()
        active = incoming
        incoming = null
        mix = 0
      }
    }

    const volume = FULL_VOLUME * level * master
    active.volume = volume * (1 - mix)
    if (incoming) incoming.volume = volume * mix
  }

  function fadeTo(to, durationMs, onDone) {
    fade = { from: master, to, startedAt: performance.now(), durationMs, onDone }
    ticker ??= setInterval(tick, TICK_MS)
  }

  function halt() {
    clearInterval(ticker)
    ticker = null
    fade = null
    incoming = null
    players.forEach((player) => player.pause())
  }

  // Browsers block audio until the player interacts with the page, so a blocked start retries on the first gesture.
  function retryOnFirstGesture() {
    if (awaitingGesture) return
    awaitingGesture = true
    const retry = () => {
      window.removeEventListener('pointerdown', retry)
      window.removeEventListener('keydown', retry)
      awaitingGesture = false
      if (wanted) start()
    }
    window.addEventListener('pointerdown', retry)
    window.addEventListener('keydown', retry)
  }

  function start() {
    wanted = true
    getPlayers()
    if (active && !active.paused) {
      fadeTo(1, FADE_IN_MS)
      return
    }
    // A second start while the first play() is still pending (e.g. React StrictMode) would rewind the track.
    if (starting) return
    starting = true
    halt()
    active = players[0]
    active.currentTime = 0
    active.volume = 0
    master = 0
    active
      .play()
      .then(() => {
        starting = false
        if (wanted) fadeTo(1, FADE_IN_MS)
        else halt()
      })
      .catch((error) => {
        starting = false
        if (error.name === 'NotAllowedError') retryOnFirstGesture()
      })
  }

  function stop() {
    wanted = false
    if (!active || active.paused) return
    fadeTo(0, FADE_OUT_MS, () => {
      if (!wanted) halt()
    })
  }

  // Silences the player immediately; used when a development hot reload replaces the module that owns it.
  function silence() {
    wanted = false
    halt()
  }

  // 0..1 from the Settings slider. Applied on the next tick, on top of any running fade, so dragging is audible.
  function setVolume(nextLevel) {
    level = Math.min(Math.max(nextLevel, 0), 1)
    if (ticker === null && active && !active.paused) tick()
  }

  return { start, stop, silence, setVolume }
}
