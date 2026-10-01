// Views are authored at a fixed design resolution and scaled as a whole, so text and controls keep their proportions.
// A future Settings screen only needs to change these settings; no screen depends on the window size.
export const DESIGN_RESOLUTION = { width: 1920, height: 1080 }

// fill: use the whole window; the stage extends along whichever axis the window has spare room (default).
// fit: show exactly the design size, letterboxed. fixed: always use fixedScale (1 = one design pixel per screen pixel).
export const DEFAULT_DISPLAY_SETTINGS = { scaleMode: 'fill', fixedScale: 1 }

// The modes offered on the Settings screen ('fixed' stays available to code but is not offered yet).
export const SCALE_MODE_OPTIONS = [
  { id: 'fill', label: 'Fill Window', description: 'Uses the whole window. The layout stretches to the window’s shape.' },
  { id: 'fit', label: 'Fit 16:9', description: 'Keeps the exact 1920×1080 layout, with black bars when the window is a different shape.' },
]

// Repairs saved settings from older versions or hand edits so the stage always gets a usable value.
export function normalizeDisplaySettings(saved) {
  const scaleMode = SCALE_MODE_OPTIONS.some((option) => option.id === saved?.scaleMode) ? saved.scaleMode : DEFAULT_DISPLAY_SETTINGS.scaleMode
  return { ...DEFAULT_DISPLAY_SETTINGS, scaleMode }
}

// Returns the scale and the stage size in design pixels.
export function getStageLayout(settings, design, viewport) {
  if (settings.scaleMode === 'fixed') return { scale: settings.fixedScale, ...design }
  const scale = Math.min(viewport.width / design.width, viewport.height / design.height)
  if (settings.scaleMode === 'fit') return { scale, ...design }
  return { scale, width: viewport.width / scale, height: viewport.height / scale }
}
