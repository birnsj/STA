// Interface sound effects, synthesized with Web Audio so no sound files are needed.
// The gains are mix levels at 100% on the Settings "Effects" slider; both sounds are meant to sit well under the music.
const HOVER_GAIN = 0.05
const PRESS_GAIN = 0.06
const MIN_HOVER_GAP_MS = 45
// A press usually re-renders what's under the pointer (new screen, re-sorted list), which would re-trigger a hover blip.
const HOVER_QUIET_AFTER_PRESS_MS = 300
// Scheduling slightly ahead of "now" keeps the attack from being clipped, which is heard as a click.
const LOOKAHEAD_S = 0.01

// What counts as "hovering something": controls and info-box items. Disabled buttons stay silent.
const HOVER_TARGETS = 'button:not(:disabled), [role="option"], [role="radio"], .help-tip, a[href], select, input[type="range"]'

// What counts as "pressing something": every enabled button, plus choice controls and links.
const PRESS_TARGETS = 'button, [role="option"], [role="radio"], [role="checkbox"], [role="tab"], [aria-pressed], a[href]'

let context = null
let level = 1
let lastHoverAt = 0
let lastPressAt = 0
let uninstall = null

function getContext() {
  if (!context) context = new AudioContext()
  return context
}

// Browsers start audio suspended until the player interacts. On a press, waiting for the resume
// means even the very first press is heard; hovers before any interaction stay silent.
function withRunningContext(play) {
  const audio = getContext()
  if (audio.state === 'running') play(audio)
  else audio.resume().then(() => play(audio)).catch(() => {})
}

// A soft console chirp: a rounded sine with a faint upper partial, a gentle attack (no click) and a short tail.
function playHoverBlip(audio) {
  const start = audio.currentTime + LOOKAHEAD_S
  const output = audio.createGain()
  output.gain.setValueAtTime(0, start)
  output.gain.linearRampToValueAtTime(HOVER_GAIN * level, start + 0.008)
  output.gain.exponentialRampToValueAtTime(0.0001, start + 0.11)

  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2600
  output.connect(filter).connect(audio.destination)

  for (const [frequency, gain] of [
    [1180, 1],
    [1770, 0.25],
  ]) {
    const tone = audio.createOscillator()
    const toneGain = audio.createGain()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(frequency, start)
    tone.frequency.linearRampToValueAtTime(frequency * 1.04, start + 0.06)
    toneGain.gain.value = gain
    tone.connect(toneGain).connect(output)
    tone.start(start)
    tone.stop(start + 0.12)
  }
}

// A console confirm: two quick rising beeps. Triangle waves keep the "computer" edge without a square wave's buzz.
function playPressBeep(audio) {
  const start = audio.currentTime + LOOKAHEAD_S
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 3200
  filter.connect(audio.destination)

  for (const [frequency, offset] of [
    [880, 0],
    [1320, 0.05],
  ]) {
    const at = start + offset
    const tone = audio.createOscillator()
    const envelope = audio.createGain()
    tone.type = 'triangle'
    tone.frequency.value = frequency
    envelope.gain.setValueAtTime(0, at)
    envelope.gain.linearRampToValueAtTime(PRESS_GAIN * level, at + 0.005)
    envelope.gain.setValueAtTime(PRESS_GAIN * level, at + 0.03)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.075)
    tone.connect(envelope).connect(filter)
    tone.start(at)
    tone.stop(at + 0.085)
  }
}

function isPressable(element) {
  return element && !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true'
}

// 0..1 from the Settings slider.
export function setEffectsVolume(nextLevel) {
  level = Math.min(Math.max(nextLevel, 0), 1)
}

// Delegated listeners for the whole app, so components don't each need sound code.
// Hover plays once per element entered; press plays on pointer down (or Enter/Space) so it feels immediate.
export function installUiSounds(root = document) {
  uninstall?.()
  let hovered = null
  let pointerX = null
  let pointerY = null

  // Chrome also fires pointerover when the page changes under a still cursor (scrolling, re-renders, new screens).
  // Those arrive at the last known position; only a real mouse movement should blip.
  const onMove = (event) => {
    pointerX = event.clientX
    pointerY = event.clientY
  }

  const onOver = (event) => {
    const target = event.target.closest?.(HOVER_TARGETS) ?? null
    const moved = event.clientX !== pointerX || event.clientY !== pointerY
    onMove(event)
    if (target === hovered) return
    hovered = target
    if (!moved) return
    const now = performance.now()
    if (!target || level === 0 || context?.state !== 'running') return
    if (now - lastPressAt < HOVER_QUIET_AFTER_PRESS_MS || now - lastHoverAt < MIN_HOVER_GAP_MS) return
    lastHoverAt = now
    playHoverBlip(context)
  }

  const press = (target) => {
    lastPressAt = performance.now()
    hovered = target.closest(HOVER_TARGETS)
    if (level > 0) withRunningContext(playPressBeep)
  }

  const onPointerDown = (event) => {
    if (event.button !== 0) return
    const target = event.target.closest?.(PRESS_TARGETS)
    if (isPressable(target)) press(target)
    else getContext().resume().catch(() => {})
  }

  const onKeyDown = (event) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return
    const target = event.target.closest?.(PRESS_TARGETS)
    if (isPressable(target)) press(target)
  }

  root.addEventListener('pointermove', onMove, { passive: true })
  root.addEventListener('pointerover', onOver)
  root.addEventListener('pointerdown', onPointerDown)
  root.addEventListener('keydown', onKeyDown)
  const cleanup = () => {
    root.removeEventListener('pointermove', onMove)
    root.removeEventListener('pointerover', onOver)
    root.removeEventListener('pointerdown', onPointerDown)
    root.removeEventListener('keydown', onKeyDown)
    if (uninstall === cleanup) uninstall = null
  }
  uninstall = cleanup
  return cleanup
}

// During development a hot reload replaces this module; remove the old listeners so two copies never play at once.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    uninstall?.()
    context?.close()
  })
}
