import { createMusicTrack } from './musicTrack.js'

// The one music track: starts on the main menu and keeps playing through character creation and Settings.
// The file opens with about 1.16 s of silence; repeats skip most of it so the loop has no dead air.
// It is served from public/music/ (local only, not in git: see .gitignore), so it is fetched when it first plays
// rather than bundled, and a checkout without the soundtrack still builds and runs, silently.
export const music = createMusicTrack(`${import.meta.env.BASE_URL}music/STVmountain.mp3`, { loopStart: 1.1 })

// During development a hot reload replaces this module; silence the old player so it can't keep playing orphaned.
if (import.meta.hot) {
  import.meta.hot.dispose(() => music.silence())
}
