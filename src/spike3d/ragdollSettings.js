/**
 * Animation Viewer ragdoll knobs. Combat leaves HumanoidRagdoll.tuning null
 * so the hard-coded combat defaults stay unchanged.
 */
export const DEFAULT_RAGDOLL_SETTINGS = Object.freeze({
  // Knock (world impulse before HumanoidRagdoll's scale)
  power: 8.7,
  lift: 5.5,
  directionDeg: 156,
  impulseScale: 0.48,
  torque: 1.6,
  // Physics
  gravity: -11,
  linearDamping: 0.85,
  angularDamping: 1.15,
  friction: 1.35,
  restitution: 0.02,
  // Settle
  settleMaxAge: 1.6,
  floorFreezeDelay: 0.08,
  freezeOnFloor: true,
  dampRamp: true,
})

export function cloneRagdollSettings(src = DEFAULT_RAGDOLL_SETTINGS) {
  return { ...DEFAULT_RAGDOLL_SETTINGS, ...src }
}

/** Build the raw impulse vector the viewer passes into activate(). */
export function impulseFromRagdollSettings(settings) {
  const s = { ...DEFAULT_RAGDOLL_SETTINGS, ...settings }
  const rad = (Number(s.directionDeg) * Math.PI) / 180
  const power = Number(s.power) || 0
  return {
    x: Math.sin(rad) * power,
    y: Number(s.lift) || 0,
    z: Math.cos(rad) * power,
  }
}

/** Slider field definitions for the Animation Viewer panel. */
export const RAGDOLL_SETTING_FIELDS = [
  { group: 'Knock', key: 'power', label: 'Power', min: 0, max: 24, step: 0.1 },
  { group: 'Knock', key: 'lift', label: 'Lift', min: 0, max: 18, step: 0.1 },
  { group: 'Knock', key: 'directionDeg', label: 'Direction °', min: 0, max: 360, step: 1 },
  { group: 'Knock', key: 'impulseScale', label: 'Impulse scale', min: 0.05, max: 1.5, step: 0.01 },
  { group: 'Knock', key: 'torque', label: 'Torque', min: 0, max: 6, step: 0.05 },
  { group: 'Physics', key: 'gravity', label: 'Gravity', min: -30, max: -1, step: 0.5 },
  { group: 'Physics', key: 'linearDamping', label: 'Lin. damp', min: 0, max: 4, step: 0.05 },
  { group: 'Physics', key: 'angularDamping', label: 'Ang. damp', min: 0, max: 5, step: 0.05 },
  { group: 'Physics', key: 'friction', label: 'Friction', min: 0, max: 3, step: 0.05 },
  { group: 'Physics', key: 'restitution', label: 'Bounce', min: 0, max: 0.8, step: 0.01 },
  { group: 'Settle', key: 'settleMaxAge', label: 'Max time s', min: 0.3, max: 6, step: 0.05 },
  { group: 'Settle', key: 'floorFreezeDelay', label: 'Floor delay s', min: 0, max: 0.8, step: 0.01 },
]
