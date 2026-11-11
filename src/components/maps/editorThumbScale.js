// Shared Assets / GeSourcePalette thumbnail size (S M L XL). Same localStorage key so both rails stay in sync.
export const THUMB_SCALE_KEY = 'sta-editor-thumb-scale'

export const THUMB_SCALES = [
  { id: 's', label: 'S', cols: 4, title: 'Small thumbnails' },
  { id: 'm', label: 'M', cols: 3, title: 'Medium thumbnails' },
  { id: 'l', label: 'L', cols: 2, title: 'Large thumbnails' },
  { id: 'xl', label: 'XL', cols: 1, title: 'Extra-large thumbnails' },
]

export function loadThumbScale() {
  try {
    const saved = localStorage.getItem(THUMB_SCALE_KEY)
    if (THUMB_SCALES.some((entry) => entry.id === saved)) return saved
  } catch {
    /* ignore */
  }
  return 's'
}

export function thumbColsForScale(scaleId) {
  return THUMB_SCALES.find((entry) => entry.id === scaleId)?.cols ?? 4
}

export function saveThumbScale(scaleId) {
  try {
    localStorage.setItem(THUMB_SCALE_KEY, scaleId)
  } catch {
    /* ignore */
  }
}
