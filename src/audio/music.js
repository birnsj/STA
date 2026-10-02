import { createMusicTrack } from './musicTrack.js'

// The one music track: starts on the main menu and keeps playing through character creation and Settings.
// The file opens with about 1.16 s of silence; repeats skip most of it so the loop has no dead air.
export const music = createMusicTrack(new URL('../../music/STVmountain.mp3', import.meta.url).href, { loopStart: 1.1 })

// During development a hot reload replaces this module; silence the old player so it can't keep playing orphaned.
if (import.meta.hot) {
  import.meta.hot.dispose(() => music.silence())
}
