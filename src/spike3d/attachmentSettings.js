/**
 * Animation Viewer attachment knobs (hand sockets / sidearms).
 * Offsets are in HumanoidModel body units (multiplied by model._s in applyPose).
 */

export const DEFAULT_ATTACHMENT_SETTINGS = Object.freeze({
  // Left-hand weaponAttach rest pose (aim 0). Aim adds aimPosZ along +Z.
  weaponPosX: 0.2,
  weaponPosY: -1.05,
  weaponPosZ: 0.4,
  weaponAimPosZ: 0.25,
  // Extra degrees added after the hang→level blend (tip / twist / roll).
  weaponRotXDeg: 0,
  weaponRotYDeg: 0,
  weaponRotZDeg: 0,
  // Keep the phaser mesh visible even when the clip doesn’t draw a prop.
  forceShowWeapon: false,
})

export function cloneAttachmentSettings(src = DEFAULT_ATTACHMENT_SETTINGS) {
  return { ...DEFAULT_ATTACHMENT_SETTINGS, ...src }
}

/** Versioned JSON document for Save / Load in the Animation Viewer. */
export const ATTACHMENT_SETTINGS_VERSION = 1

export function serializeAttachmentSettings(settings) {
  return {
    schema: 'sta.attachmentSettings',
    version: ATTACHMENT_SETTINGS_VERSION,
    settings: cloneAttachmentSettings(settings),
  }
}

/**
 * Accept a saved document or a bare settings object.
 * @returns {{ settings: object } | { error: string }}
 */
export function parseAttachmentSettingsFile(data) {
  if (!data || typeof data !== 'object') return { error: 'Not a JSON object.' }
  const raw = data.settings && typeof data.settings === 'object' ? data.settings : data
  if (data.schema && data.schema !== 'sta.attachmentSettings') {
    return { error: 'Not an attachment settings file.' }
  }
  const settings = cloneAttachmentSettings(raw)
  settings.forceShowWeapon = Boolean(settings.forceShowWeapon)
  for (const field of ATTACHMENT_SETTING_FIELDS) {
    const n = Number(settings[field.key])
    if (!Number.isFinite(n)) {
      return { error: `Invalid value for ${field.key}.` }
    }
    settings[field.key] = Math.min(field.max, Math.max(field.min, n))
  }
  return { settings }
}

/** Slider / flag defs for the Attachments properties tab. */
export const ATTACHMENT_SETTING_FIELDS = [
  {
    group: 'Phaser socket',
    key: 'weaponPosX',
    label: 'Pos X',
    min: -2,
    max: 2,
    step: 0.05,
    help: 'Hand socket sideways offset (body units). Toward the thumb is +X on the left hand.',
  },
  {
    group: 'Phaser socket',
    key: 'weaponPosY',
    label: 'Pos Y',
    min: -3,
    max: 1,
    step: 0.05,
    help: 'Hand socket along the fingers (−Y into the palm / down the grip).',
  },
  {
    group: 'Phaser socket',
    key: 'weaponPosZ',
    label: 'Pos Z',
    min: -1,
    max: 2,
    step: 0.05,
    help: 'Hand socket forward/back at rest (aim 0).',
  },
  {
    group: 'Phaser socket',
    key: 'weaponAimPosZ',
    label: 'Aim +Z',
    min: 0,
    max: 1.5,
    step: 0.05,
    help: 'Extra forward push applied as aim rises (muzzle out from the palm).',
  },
  {
    group: 'Phaser tip',
    key: 'weaponRotXDeg',
    label: 'Tip °',
    min: -90,
    max: 90,
    step: 1,
    help: 'Extra pitch after the hang→level blend. Negative tips the muzzle down.',
  },
  {
    group: 'Phaser tip',
    key: 'weaponRotYDeg',
    label: 'Yaw °',
    min: -45,
    max: 45,
    step: 1,
    help: 'Extra yaw on the socket (twist the muzzle left/right).',
  },
  {
    group: 'Phaser tip',
    key: 'weaponRotZDeg',
    label: 'Roll °',
    min: -45,
    max: 45,
    step: 1,
    help: 'Extra roll on the socket (rotate the grip).',
  },
]

export const ATTACHMENT_FLAG_HELPS = Object.freeze({
  forceShowWeapon: 'Keep the Type-2 phaser mesh visible even on clips that do not draw a prop.',
})
