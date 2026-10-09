// Interface and combat sound effects, synthesized with Web Audio so no sound files are needed.
// The gains are mix levels at 100% on the Settings "Effects" slider; both sounds are meant to sit well under the music.
const HOVER_GAIN = 0.05
const PRESS_GAIN = 0.06
const PHASER_GAIN = 0.09
const PHASER_SECONDS = 0.55
const PUNCH_GAIN = 0.16
const FOOTSTEP_GAIN = 0.12
const MIN_HOVER_GAP_MS = 45
// A press usually re-renders what's under the pointer (new screen, re-sorted list), which would re-trigger a hover blip.
const HOVER_QUIET_AFTER_PRESS_MS = 300
// Scheduling slightly ahead of "now" keeps the attack from being clipped, which is heard as a click.
const LOOKAHEAD_S = 0.01

// What counts as "hovering something": controls and info-box items. Disabled buttons stay silent.
// data-ui-sound marks non-button targets (e.g. units on the combat map) that should blip on hover and beep on press.
const HOVER_TARGETS = 'button:not(:disabled), [role="option"], [role="radio"], .help-tip, a[href], select, input[type="range"], [data-ui-sound]'

// What counts as "pressing something": every enabled button, plus choice controls and links.
// data-ui-press marks targets that only beep on press (e.g. move tiles, where a blip per tile crossed would be noise).
const PRESS_TARGETS = 'button, [role="option"], [role="radio"], [role="checkbox"], [role="tab"], [aria-pressed], a[href], [data-ui-sound], [data-ui-press]'

let context = null
let level = 1
let lastHoverAt = 0
let lastPressAt = 0
let uninstall = null

function getContext() {
  if (!context) {
    // iPad/iPhone: "playback" lets these sounds play with the silent switch on, the same as the music.
    if (navigator.audioSession) navigator.audioSession.type = 'playback'
    context = new AudioContext()
  }
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

// Phaser shots by firing mode. Both are detuned oscillators with a warble through a band-pass, so they read as an
// energy beam rather than a buzz. Stun: a lighter, higher, fast-pulsing whine that barely drops. Deadly: a harsher,
// lower sawtooth with a sub-octave that dives in pitch, over a crackle of noise. Length roughly matches the beam at 1x.
const PHASER_MODES = {
  stun: { gain: 0.8, wave: 'triangle', tones: [2100, 2116], sub: false, drop: 0.86, warbleRate: 62, warbleDepth: 110, centre: 2400, q: 1.4, crackle: 0 },
  deadly: { gain: 1, wave: 'sawtooth', tones: [1180, 1192], sub: true, drop: 0.5, warbleRate: 30, warbleDepth: 60, centre: 1300, q: 0.9, crackle: 0.35 },
}

function playPhaser(audio, duration, injuryMode) {
  const mode = PHASER_MODES[injuryMode] ?? PHASER_MODES.deadly
  const start = audio.currentTime + LOOKAHEAD_S
  const end = start + duration
  const peak = PHASER_GAIN * mode.gain * level
  const output = audio.createGain()
  output.gain.setValueAtTime(0, start)
  output.gain.linearRampToValueAtTime(peak, start + 0.015)
  output.gain.setValueAtTime(peak, end - duration * 0.4)
  output.gain.exponentialRampToValueAtTime(0.0001, end)

  const filter = audio.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = mode.centre
  filter.Q.value = mode.q
  output.connect(filter).connect(audio.destination)

  const warble = audio.createOscillator()
  const warbleDepth = audio.createGain()
  warble.frequency.value = mode.warbleRate
  warbleDepth.gain.value = mode.warbleDepth
  warble.connect(warbleDepth)
  warble.start(start)
  warble.stop(end + 0.02)

  const frequencies = mode.sub ? [...mode.tones, mode.tones[0] / 2] : mode.tones
  for (const frequency of frequencies) {
    const tone = audio.createOscillator()
    tone.type = mode.wave
    tone.frequency.setValueAtTime(frequency, start)
    tone.frequency.exponentialRampToValueAtTime(frequency * mode.drop, end)
    warbleDepth.connect(tone.frequency)
    tone.connect(output)
    tone.start(start)
    tone.stop(end + 0.02)
  }
  if (mode.crackle) playNoiseBurst(audio, { start, length: duration, gain: PHASER_GAIN * mode.crackle, filterType: 'bandpass', frequency: 3000, q: 0.7 })
}

// One second of white noise per audio context, shared by every punch and footstep.
let noiseBuffer = null
function getNoise(audio) {
  if (noiseBuffer?.sampleRate !== audio.sampleRate) {
    noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate)
    const samples = noiseBuffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

// A short burst of filtered noise; offset picks a different stretch of the buffer so repeats don't sound identical.
function playNoiseBurst(audio, { start, length, gain, filterType, frequency, q = 1 }) {
  const source = audio.createBufferSource()
  source.buffer = getNoise(audio)
  const filter = audio.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = frequency
  filter.Q.value = q
  const envelope = audio.createGain()
  envelope.gain.setValueAtTime(0, start)
  envelope.gain.linearRampToValueAtTime(gain * level, start + 0.004)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + length)
  source.connect(filter).connect(envelope).connect(audio.destination)
  source.start(start, Math.random() * 0.8)
  source.stop(start + length + 0.02)
}

// An unarmed hit: a low body thump (a sine dropping in pitch) under a short slap of mid-range noise.
function playPunch(audio) {
  const start = audio.currentTime + LOOKAHEAD_S
  const thump = audio.createOscillator()
  const thumpGain = audio.createGain()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(150, start)
  thump.frequency.exponentialRampToValueAtTime(50, start + 0.14)
  thumpGain.gain.setValueAtTime(0, start)
  thumpGain.gain.linearRampToValueAtTime(PUNCH_GAIN * level, start + 0.005)
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18)
  thump.connect(thumpGain).connect(audio.destination)
  thump.start(start)
  thump.stop(start + 0.2)
  playNoiseBurst(audio, { start, length: 0.05, gain: PUNCH_GAIN * 0.6, filterType: 'bandpass', frequency: 1200, q: 0.8 })
}

const WEAPON_SOUNDS = { phaser: playPhaser, punch: playPunch }

// Combat attacks, by the weapon's attackSound id and the firing mode (stun / deadly). speed (Auto Combat 1x-4x) shortens
// a phaser with its beam. Opens or wakes the audio itself, since an AI shot can come before the next press; browsers
// still keep it silent until the player has interacted with the page at least once.
export function playWeaponSound(soundId, speed = 1, injuryMode = null) {
  const play = WEAPON_SOUNDS[soundId]
  if (!play || level === 0) return
  withRunningContext((audio) => play(audio, PHASER_SECONDS / speed, injuryMode))
}

// A death: a voice-like "aagh" falling away (a wavering sawtooth through two vowel formants), then the body hitting the
// floor (a thump plus a mid-range slap of noise). The formants and slap keep it audible on laptop speakers, which drop
// most of a low thump.
const DEATH_GAIN = 0.22
const DEATH_FORMANTS = [
  [750, 6, 1],
  [1200, 8, 0.6],
]
// A vocal sound: a wavering sawtooth through vowel formants, sliding from pitch to pitch * drop over length seconds.
function playVoice(audio, { start, gain, pitch, drop, length, hold }) {
  const output = audio.createGain()
  output.gain.setValueAtTime(0, start)
  output.gain.linearRampToValueAtTime(gain * level, start + 0.04)
  output.gain.setValueAtTime(gain * level, start + hold)
  output.gain.exponentialRampToValueAtTime(0.0001, start + length)
  output.connect(audio.destination)

  const voice = audio.createOscillator()
  voice.type = 'sawtooth'
  voice.frequency.setValueAtTime(pitch, start)
  voice.frequency.exponentialRampToValueAtTime(pitch * drop, start + length)
  const wobble = audio.createOscillator()
  const wobbleDepth = audio.createGain()
  wobble.frequency.value = 7
  wobbleDepth.gain.value = pitch * 0.04
  wobble.connect(wobbleDepth).connect(voice.frequency)
  for (const [frequency, q, formantLevel] of DEATH_FORMANTS) {
    const formant = audio.createBiquadFilter()
    formant.type = 'bandpass'
    formant.frequency.setValueAtTime(frequency, start)
    formant.frequency.exponentialRampToValueAtTime(frequency * 0.7, start + length)
    formant.Q.value = q
    const formantGain = audio.createGain()
    formantGain.gain.value = formantLevel * 3
    voice.connect(formant).connect(formantGain).connect(output)
  }
  for (const node of [voice, wobble]) {
    node.start(start)
    node.stop(start + length + 0.05)
  }
}

// A body hitting the floor: a thump plus a mid-range slap of noise.
function playBodyFall(audio, fall, gain) {
  const thump = audio.createOscillator()
  const thumpGain = audio.createGain()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(160, fall)
  thump.frequency.exponentialRampToValueAtTime(50, fall + 0.18)
  thumpGain.gain.setValueAtTime(0, fall)
  thumpGain.gain.linearRampToValueAtTime(gain * level, fall + 0.005)
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, fall + 0.25)
  thump.connect(thumpGain).connect(audio.destination)
  thump.start(fall)
  thump.stop(fall + 0.27)
  playNoiseBurst(audio, { start: fall, length: 0.14, gain: gain * 0.8, filterType: 'bandpass', frequency: 700, q: 0.7 })
}

function playDeath(audio) {
  const start = audio.currentTime + LOOKAHEAD_S
  playVoice(audio, { start, gain: DEATH_GAIN, pitch: 240, drop: 0.46, length: 0.8, hold: 0.25 })
  playBodyFall(audio, start + 0.6, DEATH_GAIN)
}

// A combatant killed (a Minor NPC's Deadly defeat) or left Dying.
export function playDeathSound() {
  if (level === 0) return
  withRunningContext(playDeath)
}

// A stun knockout: a short, higher grunt cut off as they drop, then the body falling sooner and softer than a death.
const KNOCKOUT_GAIN = 0.15
function playKnockout(audio) {
  const start = audio.currentTime + LOOKAHEAD_S
  playVoice(audio, { start, gain: KNOCKOUT_GAIN, pitch: 300, drop: 0.75, length: 0.22, hold: 0.06 })
  playBodyFall(audio, start + 0.3, KNOCKOUT_GAIN)
}

// A combatant knocked out (Defeated by a Stun attack, or a Minor NPC left unconscious).
export function playKnockoutSound() {
  if (level === 0) return
  withRunningContext(playKnockout)
}

// A tricorder sweep: a run of quick sine chirps alternating between two pitches and climbing as it goes, over a faint
// high hiss, ending on a brighter "reading taken" double chirp.
const SCAN_GAIN = 0.05
const SCAN_SECONDS = 1.1
const SCAN_CHIRPS_PER_SECOND = 14
function playScan(audio) {
  const start = audio.currentTime + LOOKAHEAD_S
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 4200
  filter.connect(audio.destination)

  const chirp = (at, frequency, length, gain) => {
    const tone = audio.createOscillator()
    const envelope = audio.createGain()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(frequency, at)
    tone.frequency.linearRampToValueAtTime(frequency * 1.06, at + length)
    envelope.gain.setValueAtTime(0, at)
    envelope.gain.linearRampToValueAtTime(gain * level, at + 0.006)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length)
    tone.connect(envelope).connect(filter)
    tone.start(at)
    tone.stop(at + length + 0.01)
  }

  const count = Math.round(SCAN_SECONDS * SCAN_CHIRPS_PER_SECOND)
  for (let i = 0; i < count; i++) {
    const climb = 1 + (0.35 * i) / count
    chirp(start + i / SCAN_CHIRPS_PER_SECOND, (i % 2 ? 2200 : 1650) * climb, 0.045, SCAN_GAIN)
  }
  const end = start + SCAN_SECONDS
  chirp(end + 0.02, 2900, 0.07, SCAN_GAIN * 1.2)
  chirp(end + 0.1, 3500, 0.12, SCAN_GAIN * 1.2)
  playNoiseBurst(audio, { start, length: SCAN_SECONDS, gain: SCAN_GAIN * 0.25, filterType: 'highpass', frequency: 5000 })
}

// The Scan action (exploration and combat). Opens or wakes the audio itself, like the weapon sounds.
export function playScanSound() {
  if (level === 0) return
  withRunningContext(playScan)
}

// One footstep: a soft, low noise scuff. Alternate feet are pitched slightly differently so a walk doesn't sound mechanical.
// loudness scales the step (0..1), e.g. softer while sneaking.
export function playFootstep(stepIndex = 0, loudness = 1) {
  if (level === 0 || loudness <= 0) return
  withRunningContext((audio) => {
    const start = audio.currentTime + LOOKAHEAD_S
    playNoiseBurst(audio, { start, length: 0.07, gain: FOOTSTEP_GAIN * loudness, filterType: 'lowpass', frequency: stepIndex % 2 ? 620 : 760 })
  })
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
    // A tap also sends pointerover just before the press; only a mouse really hovers.
    if (event.pointerType && event.pointerType !== 'mouse') return
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

  // iPad/iPhone Safari refuse to start audio on pointerdown; the end of the same tap is allowed, so the first tap
  // unlocks audio here (its beep is then heard slightly late, every later one on time).
  const onTapEnd = () => {
    if (level > 0 && context?.state !== 'running') getContext().resume().catch(() => {})
  }

  root.addEventListener('pointermove', onMove, { passive: true })
  root.addEventListener('pointerover', onOver)
  root.addEventListener('pointerdown', onPointerDown)
  root.addEventListener('keydown', onKeyDown)
  root.addEventListener('touchend', onTapEnd, { passive: true })
  root.addEventListener('click', onTapEnd)
  const cleanup = () => {
    root.removeEventListener('pointermove', onMove)
    root.removeEventListener('pointerover', onOver)
    root.removeEventListener('pointerdown', onPointerDown)
    root.removeEventListener('keydown', onKeyDown)
    root.removeEventListener('touchend', onTapEnd)
    root.removeEventListener('click', onTapEnd)
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
