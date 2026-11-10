/**
 * Animation Viewer studio key light. Orbit / height / distance sliders
 * move a point light around the preview figure.
 */

export const DEFAULT_VIEWER_LIGHT_SETTINGS = Object.freeze({
  // Spherical placement around mid-body (matches the old fixed sun roughly).
  azimuthDeg: 50,
  elevationDeg: 55,
  distance: 14,
  intensity: 1.15,
  // Soft fill under the key so the figure doesn’t go flat when the lamp moves.
  hemiIntensity: 0.55,
  showMarker: true,
})

export function cloneViewerLightSettings(src = DEFAULT_VIEWER_LIGHT_SETTINGS) {
  return { ...DEFAULT_VIEWER_LIGHT_SETTINGS, ...src }
}

export const VIEWER_LIGHT_SETTING_FIELDS = [
  {
    group: 'Position',
    key: 'azimuthDeg',
    label: 'Orbit',
    min: 0,
    max: 360,
    step: 1,
    help: 'Spin the lamp around the figure (0° = +Z).',
  },
  {
    group: 'Position',
    key: 'elevationDeg',
    label: 'Height',
    min: -15,
    max: 89,
    step: 1,
    help: 'Lamp elevation above the deck (−15° = below feet).',
  },
  {
    group: 'Position',
    key: 'distance',
    label: 'Distance',
    min: 2,
    max: 28,
    step: 0.1,
    help: 'How far the lamp sits from mid-body.',
  },
  {
    group: 'Brightness',
    key: 'intensity',
    label: 'Key intensity',
    min: 0,
    max: 3,
    step: 0.05,
    help: 'Point-light strength on the figure.',
  },
  {
    group: 'Brightness',
    key: 'hemiIntensity',
    label: 'Fill intensity',
    min: 0,
    max: 1.5,
    step: 0.05,
    help: 'Hemisphere fill so the dark side stays readable.',
  },
]

export const VIEWER_LIGHT_GROUPS = [...new Set(VIEWER_LIGHT_SETTING_FIELDS.map((f) => f.group))]

export const VIEWER_LIGHT_FLAG_HELPS = {
  showMarker: 'Show a small sphere at the lamp so you can see where the sliders put it.',
}

/** World position of the key light from spherical sliders (origin = mid-body). */
export function lightPositionFromSettings(settings) {
  const s = { ...DEFAULT_VIEWER_LIGHT_SETTINGS, ...settings }
  const az = (Number(s.azimuthDeg) * Math.PI) / 180
  const el = (Number(s.elevationDeg) * Math.PI) / 180
  const d = Math.max(0.5, Number(s.distance) || 1)
  const cosEl = Math.cos(el)
  return {
    x: Math.sin(az) * cosEl * d,
    y: Math.sin(el) * d,
    z: Math.cos(az) * cosEl * d,
  }
}
