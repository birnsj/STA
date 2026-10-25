import { cueFiles } from './musicCues.js'
import { createMusicTrack } from './musicTrack.js'

// The cues. The files live in music/ at the project root (local only, not in git: see .gitignore) and are fetched when
// a cue first plays rather than bundled, so a checkout without the soundtrack still builds and runs, silently.
const url = (file) => `${import.meta.env.BASE_URL}music/${file}.mp3`

// Which cue plays: the view's own, unless a scene inside it asks for another (a fight in the exploration view, the
// Captain's Log intro). A view with no cue stays silent whatever its scenes ask, so the dev map editor's play-test is
// quiet. When the scene lets go, the view's cue fades back in. Switching fades one out while the next fades in.
let viewCue = null
let sceneCue = null
// The episode's own music (a map's `music`, see musicCues.js), or null for the defaults.
let episodeMusic = null
let playing = null
let level = 1

// One player per distinct list of files, so two cues that end up with the same files share one and keep playing across
// the switch.
const tracks = new Map()
function trackFor(name) {
  const files = cueFiles(name, ['menu', 'creation'].includes(name) ? null : episodeMusic)
  const key = files.join('|')
  if (!tracks.has(key)) {
    const track = createMusicTrack(files.map(url))
    track.setVolume(level)
    tracks.set(key, track)
  }
  return tracks.get(key)
}

function apply() {
  const next = viewCue ? trackFor(sceneCue ?? viewCue) : null
  if (next === playing) return
  playing?.stop()
  next?.start()
  playing = next
}

// name: menu, creation, exploration, combat, intro, outro, or null for a view with no music.
export function setViewCue(name) {
  viewCue = name
  apply()
}

export function setSceneCue(name) {
  sceneCue = name
  apply()
}

// The playing episode's music while its screens are up; null on leaving. Changing it switches a cue that is playing.
// switchNow false (on leaving): the next view's own cue change settles what plays, so the defaults are not started
// for a moment on the way out.
export function setEpisodeMusic(music, switchNow = true) {
  episodeMusic = music ?? null
  if (switchNow) apply()
}

// 0..1 from the Settings slider, for every cue.
export function setMusicVolume(next) {
  level = next
  for (const track of tracks.values()) track.setVolume(level)
}

// During development a hot reload replaces this module; silence the old players so they can't keep playing orphaned.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const track of tracks.values()) track.silence()
  })
}
