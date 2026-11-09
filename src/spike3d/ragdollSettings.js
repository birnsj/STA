/**
 * Animation Viewer ragdoll knobs. Combat leaves HumanoidRagdoll.tuning null
 * so combat uses the tip-over defaults inside activate().
 *
 * Goal: a readable human fall-down (tip + limb hinges), not a chaotic blast.
 */
export const DEFAULT_RAGDOLL_SETTINGS = Object.freeze({
  // Knock — tipTorque drops him; shove stays gentle so he falls, not flies
  power: 1.4,
  lift: 0.6,
  directionDeg: 180,
  impulseScale: 0.55,
  tipTorque: 3.6,
  torque: 0,
  // When true, each flop rolls a fresh directionDeg (0–359).
  randomDirection: false,
  // Physics — heavy angular damp keeps the tip readable
  gravity: -14,
  linearDamping: 1.0,
  angularDamping: 3.2,
  friction: 1.35,
  restitution: 0.01,
  // Settle — let him finish the tip before freeze
  settleMaxAge: 2.8,
  floorFreezeDelay: 0.6,
  stillTime: 0.25,
  freezeOnFloor: false,
  dampRamp: false,
})

export function cloneRagdollSettings(src = DEFAULT_RAGDOLL_SETTINGS) {
  return { ...DEFAULT_RAGDOLL_SETTINGS, ...src }
}

/** Versioned JSON document for Save / Load in the Animation Viewer. */
export const RAGDOLL_SETTINGS_VERSION = 1

export function serializeRagdollSettings(settings) {
  return {
    schema: 'sta.ragdollSettings',
    version: RAGDOLL_SETTINGS_VERSION,
    settings: cloneRagdollSettings(settings),
  }
}

/**
 * Accept a saved document or a bare settings object.
 * @returns {{ settings: object } | { error: string }}
 */
export function parseRagdollSettingsFile(data) {
  if (!data || typeof data !== 'object') return { error: 'Not a JSON object.' }
  const raw = data.settings && typeof data.settings === 'object' ? data.settings : data
  if (data.schema && data.schema !== 'sta.ragdollSettings') {
    return { error: 'Not a ragdoll settings file.' }
  }
  const settings = cloneRagdollSettings(raw)
  // Booleans can arrive as other types from hand-edited JSON.
  settings.randomDirection = Boolean(settings.randomDirection)
  settings.freezeOnFloor = Boolean(settings.freezeOnFloor)
  settings.dampRamp = Boolean(settings.dampRamp)
  for (const field of RAGDOLL_SETTING_FIELDS) {
    const n = Number(settings[field.key])
    if (!Number.isFinite(n)) {
      return { error: `Invalid value for ${field.key}.` }
    }
    settings[field.key] = Math.min(field.max, Math.max(field.min, n))
  }
  return { settings }
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
  {
    group: 'Knock',
    key: 'power',
    label: 'Shove',
    min: 0,
    max: 12,
    step: 0.1,
    help: 'Horizontal knock strength. Keep low so he tips over instead of flying across the stage.',
  },
  {
    group: 'Knock',
    key: 'lift',
    label: 'Lift',
    min: 0,
    max: 10,
    step: 0.1,
    help: 'Upward part of the knock impulse. A little lift helps the fall start; too much launches him.',
  },
  {
    group: 'Knock',
    key: 'directionDeg',
    label: 'Direction °',
    min: 0,
    max: 360,
    step: 1,
    help: 'Compass heading of the shove (0° = +Z). Disabled while Random is on.',
  },
  {
    group: 'Knock',
    key: 'tipTorque',
    label: 'Tip torque',
    min: 0,
    max: 10,
    step: 0.1,
    help: 'Rotational tip that starts the fall. This is the main “readable tip-over” knob.',
  },
  {
    group: 'Knock',
    key: 'impulseScale',
    label: 'Impulse scale',
    min: 0.05,
    max: 1.5,
    step: 0.01,
    help: 'Global multiplier on the knock impulse applied to every body part.',
  },
  {
    group: 'Knock',
    key: 'torque',
    label: 'Random spin',
    min: 0,
    max: 4,
    step: 0.05,
    help: 'Extra random angular impulse. Leave at 0 for a clean tip; raise for messier flailing.',
  },
  {
    group: 'Physics',
    key: 'gravity',
    label: 'Gravity',
    min: -30,
    max: -1,
    step: 0.5,
    help: 'World gravity (negative Y). Stronger pull makes him hit the floor sooner.',
  },
  {
    group: 'Physics',
    key: 'linearDamping',
    label: 'Lin. damp',
    min: 0,
    max: 4,
    step: 0.05,
    help: 'Damps sliding speed. Higher values kill skid after he lands.',
  },
  {
    group: 'Physics',
    key: 'angularDamping',
    label: 'Ang. damp',
    min: 0,
    max: 5,
    step: 0.05,
    help: 'Damps spinning. High angular damp keeps the tip readable instead of a tumble.',
  },
  {
    group: 'Physics',
    key: 'friction',
    label: 'Friction',
    min: 0,
    max: 3,
    step: 0.05,
    help: 'Floor / body friction. Higher grips sooner; lower lets limbs slide.',
  },
  {
    group: 'Physics',
    key: 'restitution',
    label: 'Bounce',
    min: 0,
    max: 0.8,
    step: 0.01,
    help: 'How much bodies rebound on contact. Keep near 0 so he does not bounce off the floor.',
  },
  {
    group: 'Settle',
    key: 'settleMaxAge',
    label: 'Max time s',
    min: 0.3,
    max: 6,
    step: 0.05,
    help: 'Hard cap on how long the ragdoll sim runs before it freezes in place.',
  },
  {
    group: 'Settle',
    key: 'floorFreezeDelay',
    label: 'Floor delay s',
    min: 0,
    max: 0.8,
    step: 0.01,
    help: 'After the first floor contact, wait this long before freeze-on-floor can lock him (if that flag is on).',
  },
  {
    group: 'Settle',
    key: 'stillTime',
    label: 'Still time s',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    help: 'How long he must stay nearly still before settle considers him done.',
  },
]

/** Checkbox tips for the Animation Viewer ragdoll panel (not slider fields). */
export const RAGDOLL_FLAG_HELPS = Object.freeze({
  randomDirection: 'Each Apply & flop rolls a fresh shove direction (0–359°) instead of using Direction °.',
  freezeOnFloor: 'Lock the pose soon after he hits the floor (after Floor delay), instead of waiting for still settle.',
  dampRamp: 'Ramp damping up over the fall so motion dies off smoothly toward settle.',
})
