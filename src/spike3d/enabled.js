// Spike 3D: procedural Three.js figures on exploration and combat maps.
// Default ON (Phase E). F1 toggles sprites ↔ 3D for debug. Preference is per browser tab.

const STORAGE_KEY = 'sta.spike3d.enabled'

export function isSpike3dPreferred() {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}

export function setSpike3dPreferred(on) {
  try {
    sessionStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* private mode */
  }
}

export function toggleSpike3dPreferred() {
  const next = !isSpike3dPreferred()
  setSpike3dPreferred(next)
  return next
}
