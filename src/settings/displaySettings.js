// Views are authored at a fixed design resolution and scaled as a whole, so text and controls keep their proportions.
// A future Settings screen only needs to change these settings; no screen depends on the window size.
export const DESIGN_RESOLUTION = { width: 1920, height: 1080 }

// fill: use the whole window; the stage extends along whichever axis the window has spare room (default).
// fit: show exactly the design size, letterboxed. fixed: always use fixedScale (1 = one design pixel per screen pixel).
// guideHighlight: the box in character and starship creation that moves to the next section to fill in (src/effects/GuideHighlight.jsx).
// creationSummary: the Step Complete report that opens when a creation screen is finished (and the Summary button).
// helpHints: the hint box above the party cards in combat and exploration (what to click next), and whether How to
// Play opens by itself on the first fight after Load Episode.
// objectivePulse: on the exploration map, the tag over an object an active objective is on pulses.
// wallFade: how walls in front of a character fade on the maps: 'room' (the room's front walls and whole wall sections)
// or 'single' (one block at a time, only those hiding a character).
// missionIntro: the Captain's Log intro before a mission's map (MissionStory.jsx MissionIntro); off goes straight in.
// missionOutro: the Captain's Log outro once the away team has beamed out (MissionOutro); off leaves the mission at once.
// tooltips: the hover boxes drawn from title / data-tip attributes (components/TitleTips.jsx).
// cameraFollow: combat and exploration start with the view following the acting character (the camera button still
// changes it during play).
// itemPlacementPreview: the green/red footprint shown while positioning a ground inventory item in play or the editor.
// wasdCoast: how far the camera keeps sliding after WASD / arrow keys are released (0 = stop at once, 100 = the
// current coast). Pointer-drag coast is unchanged.
// partyAI / enemyAI: which Auto Combat brain plays each side (ids must match PARTY_AIS / ENEMY_AIS in autoCombat.js);
// Party AI only runs while Auto Combat is on, Enemy AI runs every enemy turn.
export const DEFAULT_DISPLAY_SETTINGS = {
  scaleMode: 'fill',
  fixedScale: 1,
  guideHighlight: true,
  creationSummary: true,
  helpHints: true,
  objectivePulse: true,
  wallFade: 'room',
  missionIntro: true,
  missionOutro: true,
  tooltips: true,
  cameraFollow: true,
  itemPlacementPreview: true,
  wasdCoast: 100,
  partyAI: 'classic',
  enemyAI: 'classic',
}
const WALL_FADE_MODES = ['room', 'single']
// Kept here (not imported from autoCombat) so Node tests can load this file without Vite JSON imports.
const COMBAT_AI_IDS = new Set(['classic', 'planner', 'squad', 'aggressive', 'cautious', 'lookahead', 'random'])

// The modes offered on the Settings screen ('fixed' stays available to code but is not offered yet).
export const SCALE_MODE_OPTIONS = [
  { id: 'fill', label: 'Fill Window', description: 'Uses the whole window. The layout stretches to the window’s shape, within normal widescreen limits.' },
  { id: 'fit', label: 'Fit 16:9', description: 'Keeps the exact 1920×1080 layout, with black bars when the window is a different shape.' },
]

// Repairs saved settings from older versions or hand edits so the stage always gets a usable value.
export function normalizeDisplaySettings(saved) {
  const scaleMode = SCALE_MODE_OPTIONS.some((option) => option.id === saved?.scaleMode) ? saved.scaleMode : DEFAULT_DISPLAY_SETTINGS.scaleMode
  const flag = (key) => (typeof saved?.[key] === 'boolean' ? saved[key] : DEFAULT_DISPLAY_SETTINGS[key])
  const wallFade = WALL_FADE_MODES.includes(saved?.wallFade) ? saved.wallFade : DEFAULT_DISPLAY_SETTINGS.wallFade
  const coast = Number(saved?.wasdCoast)
  const wasdCoast = Number.isFinite(coast) ? Math.min(100, Math.max(0, Math.round(coast))) : DEFAULT_DISPLAY_SETTINGS.wasdCoast
  const partyAI = COMBAT_AI_IDS.has(saved?.partyAI) ? saved.partyAI : DEFAULT_DISPLAY_SETTINGS.partyAI
  const enemyAI = COMBAT_AI_IDS.has(saved?.enemyAI) ? saved.enemyAI : DEFAULT_DISPLAY_SETTINGS.enemyAI
  return {
    ...DEFAULT_DISPLAY_SETTINGS,
    scaleMode,
    guideHighlight: flag('guideHighlight'),
    creationSummary: flag('creationSummary'),
    helpHints: flag('helpHints'),
    objectivePulse: flag('objectivePulse'),
    wallFade,
    missionIntro: flag('missionIntro'),
    missionOutro: flag('missionOutro'),
    tooltips: flag('tooltips'),
    cameraFollow: flag('cameraFollow'),
    itemPlacementPreview: flag('itemPlacementPreview'),
    wasdCoast,
    partyAI,
    enemyAI,
  }
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
