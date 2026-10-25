// A background cue with fade-in/out. Lives outside React so a fade-out can finish after its screen unmounts.
// A cue is one file (it loops) or several (they play in random order). FULL_VOLUME is the mix level at 100% on the
// Settings slider.
const FULL_VOLUME = 0.6
const FADE_IN_MS = 3000
const FADE_OUT_MS = 1500
const TICK_MS = 30
// A native <audio> loop clicks when the file ends mid-sound and replays any silence at its start, so the loop is done
// by crossfading into a second player. Long enough to hide the timer's jitter, short enough to sound continuous.
const CROSSFADE_S = 0.4
const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchend', 'click']

// A random file from the list, never `last` when there is any other choice, so a cue does not repeat itself back to back.
export function pickNext(urls, last = null, random = Math.random) {
  const others = urls.length > 1 ? urls.filter((url) => url !== last) : urls
  return others[Math.min(others.length - 1, Math.floor(random() * others.length))]
}

// urls: one file or a list. loopStart (seconds): where a single file's repeats begin, so its leading silence is only
// heard the first time. Different files always start from their beginning.
export function createMusicTrack(urls, { loopStart = 0 } = {}) {
  const files = Array.isArray(urls) ? urls : [urls]
  let players = []
  let active = null
  let incoming = null
  let lastPlayed = null
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
        const player = new Audio()
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

  function load(player, url) {
    if (player.dataset.url === url) return
    player.dataset.url = url
    player.src = url
  }

  // The idle player already holds the next file by the time the current one ends, so the crossfade never waits on a download.
  function queueNext() {
    const idle = players.find((player) => player !== active)
    load(idle, pickNext(files, active.dataset.url))
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
      incoming.currentTime = files.length > 1 ? 0 : loopStart
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
        lastPlayed = active.dataset.url
        queueNext()
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
  // iPad/iPhone Safari only unlock audio when a tap ends (touchend/click), not on pointerdown.
  function retryOnFirstGesture() {
    if (awaitingGesture) return
    awaitingGesture = true
    const retry = () => {
      GESTURE_EVENTS.forEach((type) => window.removeEventListener(type, retry))
      awaitingGesture = false
      if (wanted) start()
    }
    GESTURE_EVENTS.forEach((type) => window.addEventListener(type, retry))
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
    // Each visit opens on a different file than the last one played.
    load(active, pickNext(files, lastPlayed))
    lastPlayed = active.dataset.url
    queueNext()
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
