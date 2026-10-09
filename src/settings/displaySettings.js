// Views are authored at a fixed design resolution and scaled as a whole, so text and controls keep their proportions.
// A future Settings screen only needs to change these settings; no screen depends on the window size.
export const DESIGN_RESOLUTION = { width: 1920, height: 1080 }

// fill: use the whole window; the stage extends along whichever axis the window has spare room (default).
// fit: show exactly the design size, letterboxed. fixed: always use fixedScale (1 = one design pixel per screen pixel).
// guideHighlight: the box in character creation that moves to the next section to fill in (src/effects/GuideHighlight.jsx).
// helpHints: the hint box at the top of combat and exploration (what to click next).
export const DEFAULT_DISPLAY_SETTINGS = { scaleMode: 'fill', fixedScale: 1, guideHighlight: true, helpHints: true }

// The modes offered on the Settings screen ('fixed' stays available to code but is not offered yet).
export const SCALE_MODE_OPTIONS = [
  { id: 'fill', label: 'Fill Window', description: 'Uses the whole window. The layout stretches to the window’s shape, within normal widescreen limits.' },
  { id: 'fit', label: 'Fit 16:9', description: 'Keeps the exact 1920×1080 layout, with black bars when the window is a different shape.' },
]

// Repairs saved settings from older versions or hand edits so the stage always gets a usable value.
export function normalizeDisplaySettings(saved) {
  const scaleMode = SCALE_MODE_OPTIONS.some((option) => option.id === saved?.scaleMode) ? saved.scaleMode : DEFAULT_DISPLAY_SETTINGS.scaleMode
  const flag = (key) => (typeof saved?.[key] === 'boolean' ? saved[key] : DEFAULT_DISPLAY_SETTINGS[key])
  return { ...DEFAULT_DISPLAY_SETTINGS, scaleMode, guideHighlight: flag('guideHighlight'), helpHints: flag('helpHints') }
}

// Fill mode stretches the stage only within this shape range; beyond it (tall tablets and phones, very wide
// monitors) the stage stops at the limit and the rest is black bars, so panels never become absurdly tall or wide.
export const FILL_ASPECT_RANGE = { min: 16 / 10, max: 21 / 9 }

// Returns the scale and the stage size in design pixels.
export function getStageLayout(settings, design, viewport) {
  if (settings.scaleMode === 'fixed') return { scale: settings.fixedScale, ...design }
  if (settings.scaleMode === 'fit') {
    return { scale: Math.min(viewport.width / design.width, viewport.height / design.height), ...design }
  }
  const aspect = Math.min(Math.max(viewport.width / viewport.height, FILL_ASPECT_RANGE.min), FILL_ASPECT_RANGE.max)
  const stage = aspect >= design.width / design.height
    ? { width: design.height * aspect, height: design.height }
    : { width: design.width, height: design.width / aspect }
  return { scale: Math.min(viewport.width / stage.width, viewport.height / stage.height), ...stage }
}
