// Blast get-up lifecycle sync (presentation only): request getUp → assign → playback → idle.
// FigureView keeps the previous texture until a sheet is ready. Always want getUp (so the sheet loads through the
// normal pipeline); start the play clock only when that texture is on the sprite; finish only when its progress
// reaches the end. Never finish getUp on a wall clock while fall is still displayed.

import { getUpAnimation } from '../../rules/appearance.js'

// After the prone hold: request getUp. FigureView holds the fall frame until the getup sheet assigns.
export function startGetUpWait({ playKey }) {
  return {
    gettingUp: getUpAnimation(),
    getUpPlaying: false,
    oneShotUntil: null,
    playKey,
  }
}

// Wanted pose while gettingUp is set — always getUp so SheetStore loads it. standingUp plants knockback.
export function shownGetUpPose(track) {
  if (!track?.gettingUp) return null
  return {
    animation: track.gettingUp,
    playKey: track.playKey,
    settled: false,
    reverse: false,
    standingUp: true,
  }
}

// First frame the getup texture is on the sprite: lock in playing so we do not restart on later pose syncs.
export function markGetUpPlaying(track) {
  if (!track?.gettingUp || track.getUpPlaying) return track
  return {
    ...track,
    getUpPlaying: true,
    oneShotUntil: null,
  }
}

// displayedName / progress come from the sprite layer that is actually drawn (not the wanted pose).
export function getUpPlaybackComplete(track, { displayedName = null, progress = 0 } = {}) {
  return Boolean(
    track?.gettingUp &&
      track.getUpPlaying &&
      displayedName === track.gettingUp &&
      progress >= 1,
  )
}

export function clearGetUp(track) {
  return {
    ...track,
    gettingUp: null,
    getUpPlaying: false,
    oneShotUntil: null,
  }
}

// Exploration: enter getUp immediately after the prone hold (startedAt null until the layer assigns getup).
export function startExploreGetUp({ playKey, now = null }) {
  return {
    phase: 'up',
    animation: getUpAnimation(),
    playKey,
    startedAt: now,
  }
}

export function exploreGetUpComplete(staggerPlay, { displayedName = null, progress = 0 } = {}) {
  if (!staggerPlay || staggerPlay.phase !== 'up' || staggerPlay.startedAt == null) return false
  return displayedName === staggerPlay.animation && progress >= 1
}
