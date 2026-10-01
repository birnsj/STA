import { createMusicTrack } from './musicTrack.js'

// The one music track: starts on the main menu and keeps playing through character creation and Settings.
export const music = createMusicTrack(new URL('../../music/STVmountain.mp3', import.meta.url).href)

// During development a hot reload replaces this module; silence the old player so it can't keep playing orphaned.
if (import.meta.hot) {
  import.meta.hot.dispose(() => music.silence())
}
