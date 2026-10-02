// Volume per sound category, 0-100. Each category gets a slider on the Settings screen; add more here (voice).
export const AUDIO_CATEGORIES = [
  { id: 'music', label: 'Music' },
  { id: 'effects', label: 'Effects' },
]

export const DEFAULT_AUDIO_SETTINGS = { music: 60, effects: 60 }

// Repairs saved settings from older versions or hand edits so every category has a usable volume.
export function normalizeAudioSettings(saved) {
  return Object.fromEntries(
    AUDIO_CATEGORIES.map(({ id }) => {
      const value = Number(saved?.[id])
      return [id, Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 0), 100) : DEFAULT_AUDIO_SETTINGS[id]]
    }),
  )
}
