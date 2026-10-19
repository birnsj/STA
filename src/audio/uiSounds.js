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

// A Klingon disruptor bolt (designer request, 2026-10-12: unlike the phaser's held beam): a short, harsh "pew" diving
// in pitch (square and sawtooth through a soft clipper), a crack of noise as it leaves the barrel and a low thump
// under it. Half the phaser's length, to match the travelling pulse drawn on the battlefield.
const DISRUPTOR_GAIN = 0.1
let clipCurve = null
function getClipCurve() {
  if (!clipCurve) {
    clipCurve = new Float32Array(256)
    for (let i = 0; i < clipCurve.length; i++) {
      const x = (i / (clipCurve.length - 1)) * 2 - 1
      clipCurve[i] = Math.tanh(3 * x)
    }
  }
  return clipCurve
}

function playDisruptor(audio, duration) {
  const length = duration * 0.5
  const start = audio.currentTime + LOOKAHEAD_S
  const end = start + length
  const peak = DISRUPTOR_GAIN * level
  const output = audio.createGain()
  output.gain.setValueAtTime(0, start)
  output.gain.linearRampToValueAtTime(peak, start + 0.005)
  output.gain.exponentialRampToValueAtTime(peak * 0.35, start + length * 0.45)
  output.gain.exponentialRampToValueAtTime(0.0001, end)

  const clipper = audio.createWaveShaper()
  clipper.curve = getClipCurve()
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(4200, start)
  filter.frequency.exponentialRampToValueAtTime(900, end)
  clipper.connect(filter).connect(output).connect(audio.destination)

  for (const [wave, frequency] of [
    ['square', 1500],
    ['sawtooth', 1520],
  ]) {
    const tone = audio.createOscillator()
    tone.type = wave
    tone.frequency.setValueAtTime(frequency, start)
    tone.frequency.exponentialRampToValueAtTime(140, end)
    tone.connect(clipper)
    tone.start(start)
    tone.stop(end + 0.02)
  }

  const thump = audio.createOscillator()
  const thumpGain = audio.createGain()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(120, start)
  thump.frequency.exponentialRampToValueAtTime(45, start + 0.12)
  thumpGain.gain.setValueAtTime(0, start)
  thumpGain.gain.linearRampToValueAtTime(DISRUPTOR_GAIN * 0.9 * level, start + 0.004)
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14)
  thump.connect(thumpGain).connect(audio.destination)
  thump.start(start)
  thump.stop(start + 0.16)

  playNoiseBurst(audio, { start, length: 0.07, gain: DISRUPTOR_GAIN * 0.7, filterType: 'bandpass', frequency: 2600, q: 0.8 })
}

const WEAPON_SOUNDS = { phaser: playPhaser, disruptor: playDisruptor, punch: playPunch }

// Combat attacks, by the weapon's attackSound id and the firing mode (stun / deadly). speed (Auto Combat 1x-4x) shortens
// a phaser with its beam. Opens or wakes the audio itself, since an AI shot can come before the next press; browsers
// still keep it silent until the player has interacted with the page at least once.
export function playWeaponSound(soundId, speed = 1, injuryMode = null) {
  const play = WEAPON_SOUNDS[soundId]
  if (!play || level === 0) return
  withRunningContext((audio) => play(audio, PHASER_SECONDS / speed, injuryMode))
}

// A destructible object's blast (world/environment.js explosions). Kind only changes the sound for now; the flipbook is
// still small/large by radius (designer request 2026-10-15). Radius 0–6 scales loudness and length a little.
const EXPLOSION_GAIN = 0.2
const EXPLOSION_KINDS = {
  plasma: { crackle: 0.55, thump: 90, crackleHz: 3200, length: 0.38 },
  conventional: { crackle: 0.7, thump: 70, crackleHz: 1800, length: 0.42 },
  electrical: { crackle: 0.45, thump: 110, crackleHz: 4000, length: 0.32 },
  gas: { crackle: 0.35, thump: 85, crackleHz: 1400, length: 0.48 },
  chemical: { crackle: 0.5, thump: 75, crackleHz: 2200, length: 0.4 },
  debris: { crackle: 0.65, thump: 55, crackleHz: 900, length: 0.5 },
}

function playExplosion(audio, kind, radius) {
  const mode = EXPLOSION_KINDS[kind] ?? EXPLOSION_KINDS.conventional
  const scale = 0.75 + 0.08 * Math.min(6, Math.max(0, radius ?? 1))
  const length = mode.length * scale
  const start = audio.currentTime + LOOKAHEAD_S
  const peak = EXPLOSION_GAIN * scale * level

  const thump = audio.createOscillator()
  const thumpGain = audio.createGain()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(mode.thump, start)
  thump.frequency.exponentialRampToValueAtTime(28, start + length * 0.7)
  thumpGain.gain.setValueAtTime(0, start)
  thumpGain.gain.linearRampToValueAtTime(peak, start + 0.008)
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  thump.connect(thumpGain).connect(audio.destination)
  thump.start(start)
  thump.stop(start + length + 0.02)

  playNoiseBurst(audio, { start, length: length * 0.55, gain: EXPLOSION_GAIN * mode.crackle * scale, filterType: 'bandpass', frequency: mode.crackleHz, q: 0.7 })
  playNoiseBurst(audio, { start: start + 0.02, length: length * 0.35, gain: EXPLOSION_GAIN * 0.35 * scale, filterType: 'lowpass', frequency: 400 })
}

// kind: destructibles.json explosionKinds; radius: blast tiles (Chebyshev).
export function playExplosionSound(kind, radius = 1) {
  if (level === 0) return
  withRunningContext((audio) => playExplosion(audio, kind, radius))
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

// One enveloped tone into `destination`: frequency glides from `from` to `to` over its length.
function playTone(audio, destination, { at, from, to = from, length, gain, wave = 'sine', attack = 0.01 }) {
  const tone = audio.createOscillator()
  const envelope = audio.createGain()
  tone.type = wave
  tone.frequency.setValueAtTime(from, at)
  tone.frequency.exponentialRampToValueAtTime(to, at + length)
  envelope.gain.setValueAtTime(0, at)
  envelope.gain.linearRampToValueAtTime(gain * level, at + attack)
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + length)
  tone.connect(envelope).connect(destination)
  tone.start(at)
  tone.stop(at + length + 0.01)
}

// The outcome tag after a request: a bright rising pair when it worked, a low falling pair when it didn't.
function playRequestTag(audio, at, passed, destination) {
  const notes = passed
    ? [
        [880, 0],
        [1320, 0.07],
      ]
    : [
        [330, 0],
        [220, 0.09],
      ]
  for (const [frequency, offset] of notes) playTone(audio, destination, { at: at + offset, from: frequency, length: passed ? 0.18 : 0.26, gain: 0.05, wave: 'triangle' })
}

// Persuade: a warm, rising major chord of soft sines with a slow vibrato, like a reasoned voice, then the outcome tag.
const PERSUADE_GAIN = 0.045
function playPersuade(audio, passed) {
  const start = audio.currentTime + LOOKAHEAD_S
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2400
  filter.connect(audio.destination)
  const vibrato = audio.createOscillator()
  const vibratoDepth = audio.createGain()
  vibrato.frequency.value = 5.5
  vibratoDepth.gain.value = 6
  vibrato.connect(vibratoDepth)
  for (const [frequency, offset] of [
    [392, 0],
    [494, 0.06],
    [587, 0.12],
  ]) {
    const at = start + offset
    const tone = audio.createOscillator()
    const envelope = audio.createGain()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(frequency, at)
    tone.frequency.linearRampToValueAtTime(frequency * 1.03, at + 0.5)
    vibratoDepth.connect(tone.frequency)
    envelope.gain.setValueAtTime(0, at)
    envelope.gain.linearRampToValueAtTime(PERSUADE_GAIN * level, at + 0.05)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.55)
    tone.connect(envelope).connect(filter)
    tone.start(at)
    tone.stop(at + 0.56)
  }
  vibrato.start(start)
  vibrato.stop(start + 0.7)
  playRequestTag(audio, start + 0.55, passed, filter)
}

// Intimidate: a low, distorted growl that swells and drops, a dissonant buzz on top and a heavy thump, then the tag.
const INTIMIDATE_GAIN = 0.1
function playIntimidate(audio, passed) {
  const start = audio.currentTime + LOOKAHEAD_S
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(400, start)
  filter.frequency.linearRampToValueAtTime(1400, start + 0.2)
  filter.frequency.exponentialRampToValueAtTime(300, start + 0.6)
  const shaper = audio.createWaveShaper()
  shaper.curve = getClipCurve()
  shaper.connect(filter).connect(audio.destination)
  playTone(audio, shaper, { at: start, from: 110, to: 70, length: 0.6, gain: INTIMIDATE_GAIN, wave: 'sawtooth', attack: 0.08 })
  playTone(audio, shaper, { at: start, from: 117, to: 74, length: 0.6, gain: INTIMIDATE_GAIN * 0.8, wave: 'sawtooth', attack: 0.08 })
  playTone(audio, filter, { at: start + 0.05, from: 233, to: 156, length: 0.45, gain: INTIMIDATE_GAIN * 0.35, wave: 'square', attack: 0.04 })
  playTone(audio, audio.destination, { at: start + 0.16, from: 130, to: 45, length: 0.3, gain: INTIMIDATE_GAIN * 1.4 })
  playNoiseBurst(audio, { start: start + 0.16, length: 0.12, gain: INTIMIDATE_GAIN * 0.6, filterType: 'lowpass', frequency: 500 })
  const tagFilter = audio.createBiquadFilter()
  tagFilter.type = 'lowpass'
  tagFilter.frequency.value = 2600
  tagFilter.connect(audio.destination)
  playRequestTag(audio, start + 0.6, passed, tagFilter)
}

// Persuade or Intimidate was just tried (exploration and combat). kind: 'persuade' | 'intimidate'; passed: it worked.
export function playRequestSound(kind, passed) {
  if (level === 0) return
  withRunningContext((audio) => (kind === 'intimidate' ? playIntimidate(audio, passed) : playPersuade(audio, passed)))
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

// A transporter: a shimmering chord of sines under a fast tremolo, over a low drone and a high sparkle of noise; it
// swells, holds, then fades. Beaming out the pitch rises as the figure dematerialises; beaming in it settles down
// from above as the figure solidifies.
const BEAM_OUT_GAIN = 0.07
const BEAM_OUT_CHORD = [
  [620, 0.5],
  [930, 0.3],
  [1240, 0.35],
  [1860, 0.22],
  [2790, 0.12],
]
function playTransporter(audio, duration, inbound) {
  const [pitchFrom, pitchTo] = inbound ? [1.3, 1] : [1, 1.3]
  const start = audio.currentTime + LOOKAHEAD_S
  const end = start + duration
  const peak = BEAM_OUT_GAIN * level
  const output = audio.createGain()
  output.gain.setValueAtTime(0, start)
  output.gain.linearRampToValueAtTime(peak, start + duration * 0.25)
  output.gain.setValueAtTime(peak, start + duration * 0.6)
  output.gain.exponentialRampToValueAtTime(0.0001, end)
  output.connect(audio.destination)

  const shimmer = audio.createGain()
  shimmer.gain.value = 0.6
  const tremolo = audio.createOscillator()
  const tremoloDepth = audio.createGain()
  tremolo.frequency.value = 17
  tremoloDepth.gain.value = 0.4
  tremolo.connect(tremoloDepth).connect(shimmer.gain)
  shimmer.connect(output)

  for (const [index, [frequency, gain]] of BEAM_OUT_CHORD.entries()) {
    const tone = audio.createOscillator()
    const toneGain = audio.createGain()
    tone.type = 'sine'
    tone.detune.value = index % 2 ? 6 : -6
    tone.frequency.setValueAtTime(frequency * pitchFrom, start)
    tone.frequency.exponentialRampToValueAtTime(frequency * pitchTo, end)
    toneGain.gain.value = gain
    tone.connect(toneGain).connect(shimmer)
    tone.start(start)
    tone.stop(end + 0.02)
  }

  const drone = audio.createOscillator()
  const droneGain = audio.createGain()
  drone.type = 'triangle'
  drone.frequency.setValueAtTime(inbound ? 210 : 155, start)
  drone.frequency.exponentialRampToValueAtTime(inbound ? 155 : 210, end)
  droneGain.gain.value = 0.35
  drone.connect(droneGain).connect(output)
  for (const node of [tremolo, drone]) {
    node.start(start)
    node.stop(end + 0.02)
  }
  playNoiseBurst(audio, { start, length: duration, gain: BEAM_OUT_GAIN * 0.5, filterType: 'highpass', frequency: 6500 })
}

// Beaming out: an enemy fleeing the battle, or the away team leaving the mission. seconds: the beam-out's length on
// screen, already scaled by the speed.
export function playBeamOutSound(seconds) {
  if (level === 0) return
  withRunningContext((audio) => playTransporter(audio, seconds, false))
}

// The away team beaming in as a mission starts. seconds: the beam-in's length on screen.
export function playBeamInSound(seconds) {
  if (level === 0) return
  withRunningContext((audio) => playTransporter(audio, seconds, true))
}

// Momentum gained: a bright rising arpeggio of bell-like sines with a shimmer on top, pitched higher the fuller the
// pool, so the player hears the bar climbing.
const MOMENTUM_GAIN = 0.07
const MOMENTUM_STEPS = [1, 1.26, 1.5, 2]
function playMomentumGain(audio, momentum) {
  const start = audio.currentTime + LOOKAHEAD_S
  const root = 520 * Math.pow(2, (Math.max(1, momentum) - 1) / 12)
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 5200
  filter.connect(audio.destination)
  MOMENTUM_STEPS.forEach((step, index) => {
    const at = start + index * 0.055
    const length = index === MOMENTUM_STEPS.length - 1 ? 0.45 : 0.16
    for (const [partial, gain] of [
      [1, 1],
      [2.01, 0.22],
    ]) {
      const tone = audio.createOscillator()
      const envelope = audio.createGain()
      tone.type = 'sine'
      tone.frequency.value = root * step * partial
      envelope.gain.setValueAtTime(0, at)
      envelope.gain.linearRampToValueAtTime(MOMENTUM_GAIN * gain * level, at + 0.006)
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + length)
      tone.connect(envelope).connect(filter)
      tone.start(at)
      tone.stop(at + length + 0.01)
    }
  })
  playNoiseBurst(audio, { start: start + 0.16, length: 0.3, gain: MOMENTUM_GAIN * 0.2, filterType: 'highpass', frequency: 7000 })
}

// Group Momentum went up (exploration and combat). momentum: the new total.
export function playMomentumSound(momentum) {
  if (level === 0) return
  withRunningContext((audio) => playMomentumGain(audio, momentum))
}

// Momentum spent or lost: a short falling pair of soft tones, pitched from the total that was just left.
const MOMENTUM_LOSS_GAIN = 0.06
function playMomentumLoss(audio, momentum) {
  const start = audio.currentTime + LOOKAHEAD_S
  const root = 440 * Math.pow(2, Math.max(0, momentum) / 12)
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2800
  filter.connect(audio.destination)
  for (const [step, offset, length, gain] of [
    [1, 0, 0.14, 1],
    [0.75, 0.07, 0.28, 0.85],
  ]) {
    const at = start + offset
    const tone = audio.createOscillator()
    const envelope = audio.createGain()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(root * step, at)
    tone.frequency.linearRampToValueAtTime(root * step * 0.92, at + length)
    envelope.gain.setValueAtTime(0, at)
    envelope.gain.linearRampToValueAtTime(MOMENTUM_LOSS_GAIN * gain * level, at + 0.005)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length)
    tone.connect(envelope).connect(filter)
    tone.start(at)
    tone.stop(at + length + 0.01)
  }
}

// Group Momentum went down (spent or lost). momentum: the new total.
export function playMomentumLossSound(momentum) {
  if (level === 0) return
  withRunningContext((audio) => playMomentumLoss(audio, momentum))
}

// Dice tumbling on a table: hard little clacks (a click of bright noise with a short high "tock" under it), close
// together at first and spreading out as the dice slow, then a last settling clack. seconds: how long they tumble.
const DICE_GAIN = 0.1
// Dice of one roll start a little apart (staggered); one rattle covers them all.
const DICE_RATTLE_GAP_MS = 400
let lastRattleAt = -Infinity
function playDiceRattle(audio, seconds) {
  const start = audio.currentTime + LOOKAHEAD_S
  const clack = (at, gain) => {
    playNoiseBurst(audio, { start: at, length: 0.025, gain: DICE_GAIN * gain, filterType: 'bandpass', frequency: 2800 + Math.random() * 2400, q: 2.5 })
    const filter = audio.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 900
    filter.connect(audio.destination)
    playTone(audio, filter, { at, from: 1900 + Math.random() * 1500, length: 0.03, gain: DICE_GAIN * 0.35 * gain, wave: 'triangle', attack: 0.002 })
  }
  let at = 0
  let gap = 0.035
  while (at < seconds) {
    clack(start + at, 0.55 + Math.random() * 0.45)
    at += gap * (0.6 + Math.random() * 0.8)
    gap *= 1.22
  }
  clack(start + seconds, 0.8)
}

// A die starts tumbling (components/dice/D20.jsx). seconds: its tumble.
export function playDiceRollSound(seconds) {
  const now = performance.now()
  if (level === 0 || now - lastRattleAt < DICE_RATTLE_GAP_MS) return
  lastRattleAt = now
  withRunningContext((audio) => playDiceRattle(audio, seconds))
}

// A roll's result, once its dice have landed. Success: a bright rising major arpeggio of bell-like tones that rings
// on as a chord. Failure: a low two-note fall on a muted, slightly buzzy tone.
const ROLL_RESULT_GAIN = 0.06
function playRollResult(audio, success) {
  const start = audio.currentTime + LOOKAHEAD_S
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = success ? 5000 : 1100
  filter.connect(audio.destination)
  if (success) {
    for (const [frequency, offset] of [
      [784, 0],
      [988, 0.07],
      [1175, 0.14],
      [1568, 0.21],
    ]) {
      const length = 0.7 - offset
      playTone(audio, filter, { at: start + offset, from: frequency, length, gain: ROLL_RESULT_GAIN, attack: 0.006 })
      playTone(audio, filter, { at: start + offset, from: frequency * 2.01, length: length * 0.5, gain: ROLL_RESULT_GAIN * 0.2, attack: 0.006 })
    }
    return
  }
  for (const [from, to, offset, length] of [
    [330, 311, 0, 0.2],
    [247, 220, 0.18, 0.5],
  ]) {
    playTone(audio, filter, { at: start + offset, from, to, length, gain: ROLL_RESULT_GAIN * 1.3, wave: 'sawtooth', attack: 0.01 })
    playTone(audio, filter, { at: start + offset, from: from / 2, to: to / 2, length, gain: ROLL_RESULT_GAIN, attack: 0.01 })
  }
}

// A roll succeeded or failed (object challenges, conversation Task Checks, combat), as its result is shown.
export function playRollResultSound(success) {
  if (level === 0) return
  withRunningContext((audio) => playRollResult(audio, success))
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

// Inventory pickup / drop (exploration). Gains sit under UI beeps and well under music.
const ITEM_PICKUP_GAIN = 0.08
const ITEM_DROP_GAIN = 0.09

// One short enveloped tone (or noise) into destination.
function playItemTone(audio, destination, { at, from, to = from, length, gain, wave = 'sine', attack = 0.004 }) {
  const tone = audio.createOscillator()
  const envelope = audio.createGain()
  tone.type = wave
  tone.frequency.setValueAtTime(from, at)
  if (to !== from) tone.frequency.linearRampToValueAtTime(to, at + length)
  envelope.gain.setValueAtTime(0, at)
  envelope.gain.linearRampToValueAtTime(gain, at + attack)
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + length)
  tone.connect(envelope).connect(destination)
  tone.start(at)
  tone.stop(at + length + 0.02)
}

function playItemNoise(audio, destination, { at, length, gain, frequency = 1800, type = 'bandpass' }) {
  const bufferSize = Math.max(1, Math.floor(audio.sampleRate * length))
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
  const source = audio.createBufferSource()
  source.buffer = buffer
  const filter = audio.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = 0.8
  const envelope = audio.createGain()
  envelope.gain.setValueAtTime(0, at)
  envelope.gain.linearRampToValueAtTime(gain, at + 0.004)
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + length)
  source.connect(filter).connect(envelope).connect(destination)
  source.start(at)
  source.stop(at + length + 0.02)
}

// Distinct grab chirps per items.json category (clothing, utility, scanner, weapon, medical, engineering).
function playItemPickupByCategory(audio, category) {
  const start = audio.currentTime + LOOKAHEAD_S
  const out = audio.createGain()
  out.connect(audio.destination)
  const g = ITEM_PICKUP_GAIN * level

  switch (category) {
    case 'medical':
      // Soft glass / hypospray: high rising glass ping.
      playItemTone(audio, out, { at: start, from: 1400, to: 2100, length: 0.1, gain: g, wave: 'sine' })
      playItemTone(audio, out, { at: start + 0.03, from: 2100, to: 2600, length: 0.08, gain: g * 0.45, wave: 'triangle' })
      break
    case 'engineering':
      // Metal tool clink.
      playItemTone(audio, out, { at: start, from: 920, to: 640, length: 0.07, gain: g * 1.1, wave: 'triangle' })
      playItemTone(audio, out, { at: start + 0.025, from: 1800, to: 1100, length: 0.06, gain: g * 0.5, wave: 'square' })
      break
    case 'weapon':
      // Heavier grip / holster clack.
      playItemTone(audio, out, { at: start, from: 220, to: 160, length: 0.08, gain: g * 1.2, wave: 'triangle' })
      playItemNoise(audio, out, { at: start, length: 0.05, gain: g * 0.55, frequency: 900, type: 'lowpass' })
      playItemTone(audio, out, { at: start + 0.04, from: 480, to: 360, length: 0.07, gain: g * 0.6, wave: 'sine' })
      break
    case 'scanner':
      // Tricorder-ish electronic tick-up.
      playItemTone(audio, out, { at: start, from: 980, to: 980, length: 0.04, gain: g * 0.7, wave: 'square' })
      playItemTone(audio, out, { at: start + 0.045, from: 1320, to: 1680, length: 0.09, gain: g, wave: 'sine' })
      break
    case 'utility':
      // PADD / chip: plastic-plastic soft taps.
      playItemTone(audio, out, { at: start, from: 700, to: 820, length: 0.06, gain: g, wave: 'triangle' })
      playItemTone(audio, out, { at: start + 0.05, from: 900, to: 760, length: 0.07, gain: g * 0.7, wave: 'sine' })
      break
    case 'clothing':
      // Soft fabric rustle.
      playItemNoise(audio, out, { at: start, length: 0.12, gain: g * 0.85, frequency: 1400, type: 'bandpass' })
      playItemTone(audio, out, { at: start + 0.02, from: 320, to: 280, length: 0.1, gain: g * 0.35, wave: 'sine' })
      break
    default:
      playItemTone(audio, out, { at: start, from: 880, to: 1100, length: 0.09, gain: g, wave: 'sine' })
  }
}

// Soft place / set-down when an item hits the ground (or is released onto the world).
function playItemDropTone(audio) {
  const start = audio.currentTime + LOOKAHEAD_S
  const out = audio.createGain()
  out.connect(audio.destination)
  const g = ITEM_DROP_GAIN * level
  playItemNoise(audio, out, { at: start, length: 0.08, gain: g * 0.7, frequency: 420, type: 'lowpass' })
  playItemTone(audio, out, { at: start, from: 180, to: 90, length: 0.12, gain: g, wave: 'sine', attack: 0.006 })
  playItemTone(audio, out, { at: start + 0.03, from: 360, to: 200, length: 0.08, gain: g * 0.4, wave: 'triangle' })
}

// category: items.json category id (medical, engineering, weapon, scanner, utility, clothing).
export function playItemPickup(category) {
  if (level === 0) return
  withRunningContext((audio) => playItemPickupByCategory(audio, category))
}

export function playItemDrop() {
  if (level === 0) return
  withRunningContext(playItemDropTone)
}

// For a board drawn without an element under the pointer (the Pixi combat board): the hover blip and press beep a
// data-ui-sound (or, press only, data-ui-press) element gets from the listeners below.
export function playBoardHover() {
  const now = performance.now()
  if (level === 0 || context?.state !== 'running') return
  if (now - lastPressAt < HOVER_QUIET_AFTER_PRESS_MS || now - lastHoverAt < MIN_HOVER_GAP_MS) return
  lastHoverAt = now
  playHoverBlip(context)
}

export function playBoardPress() {
  lastPressAt = performance.now()
  if (level > 0) withRunningContext(playPressBeep)
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
