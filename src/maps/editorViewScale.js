// Map editor View → View scale: how large the editor chrome appears. The stage is still 16:9; a higher percent uses a
// smaller design size so ScaledStage's CSS scale grows. Dropdowns use EditorSelect so menus stay in-stage.
import { DESIGN_RESOLUTION } from '../settings/displaySettings.js'

export const EDITOR_VIEW_SCALE_KEY = 'sta-editor-view-scale'
export const EDITOR_VIEW_SCALES = [
  { id: 100, label: '100%', hint: 'Default (1920×1080 design)' },
  { id: 115, label: '115%', hint: 'Slightly larger UI' },
  { id: 125, label: '125%', hint: 'Comfortable on smaller monitors' },
  { id: 150, label: '150%', hint: 'Large UI' },
]

export function loadEditorViewScale() {
  try {
    const saved = Number(localStorage.getItem(EDITOR_VIEW_SCALE_KEY))
    if (EDITOR_VIEW_SCALES.some((entry) => entry.id === saved)) return saved
  } catch {
    /* ignore */
  }
  return 100
}

export function saveEditorViewScale(percent) {
  try {
    localStorage.setItem(EDITOR_VIEW_SCALE_KEY, String(percent))
  } catch {
    /* ignore */
  }
}

// Design pixels for ScaledStage: larger percent → smaller design → larger on-screen controls.
export function editorStageSize(percent = loadEditorViewScale()) {
  const factor = Math.max(100, Number(percent) || 100) / 100
  return {
    width: Math.round(DESIGN_RESOLUTION.width / factor),
    height: Math.round(DESIGN_RESOLUTION.height / factor),
  }
}
