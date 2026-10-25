// What each cue plays and how an episode (a map file) overrides it. Pure data and helpers, no audio, so the map format,
// the editor and the tests can use it. File names are the MP3s in music/, without ".mp3".

// The default files of every cue. A list plays in random order (see musicTrack.js).
export const DEFAULT_CUE_FILES = {
  menu: ['menu01'],
  creation: ['creation01', 'creation02'],
  exploration: ['explore01', 'explore02', 'explore03'],
  combat: ['combat01', 'combat02', 'combat03'],
  intro: ['epintro01'],
  outro: ['epoutro01'],
}

// The cues an episode can change, in the order the editor shows them, and whether each takes one file or several.
export const EPISODE_CUES = [
  { id: 'intro', label: 'Captain\u2019s Log intro', several: false },
  { id: 'exploration', label: 'Exploration', several: true },
  { id: 'combat', label: 'Combat', several: true },
  { id: 'outro', label: 'Captain\u2019s Log outro', several: false },
]

// A file name that is safe to put in a URL path.
const FILE_NAME = /^[\w.-]+$/
const isFileName = (value) => typeof value === 'string' && FILE_NAME.test(value)

// An episode with nothing changed: every cue plays its defaults.
export const emptyMusic = () => ({ intro: null, exploration: [], combat: [], outro: null })

// A map file's `music` (anything, including nothing) as { intro, outro: file name or null, exploration, combat: [file names] }.
export function normalizeMusic(raw) {
  const own = raw && typeof raw === 'object' ? raw : {}
  const single = (value) => (isFileName(value) ? value : null)
  const several = (value) => [...new Set((Array.isArray(value) ? value : []).filter(isFileName))]
  return { intro: single(own.intro), exploration: several(own.exploration), combat: several(own.combat), outro: single(own.outro) }
}

// What goes on disk: only the cues that were changed, or undefined when none were.
export function serializeMusic(music) {
  const own = normalizeMusic(music)
  const out = {}
  if (own.intro) out.intro = own.intro
  if (own.exploration.length) out.exploration = own.exploration
  if (own.combat.length) out.combat = own.combat
  if (own.outro) out.outro = own.outro
  return Object.keys(out).length ? out : undefined
}

// The files a cue plays for an episode: its own when the episode set any, else the defaults.
export function cueFiles(name, music = null) {
  const own = music?.[name]
  const list = Array.isArray(own) ? own : own ? [own] : []
  const valid = list.filter(isFileName)
  return valid.length ? valid : DEFAULT_CUE_FILES[name]
}
