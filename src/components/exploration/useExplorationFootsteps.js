import { useEffect, useRef } from 'react'
import { playFootstep } from '../../audio/uiSounds.js'

// Presentation only: the away team's footsteps in exploration, one per stride of ground actually covered.
// Several members walking together are mixed down a little so a group isn't much louder than one character.
const GAITS = {
  sneak: { stride: 0.8, loudness: 0.45 },
  walk: { stride: 1.2, loudness: 1 },
  run: { stride: 1.6, loudness: 1.3 },
}

const gaitOf = (member) => (member.sneaking ? GAITS.sneak : member.running ? GAITS.run : GAITS.walk)

// members: the party members this frame (partyControl.js). active false (e.g. during combat) keeps them silent.
export default function useExplorationFootsteps(members, active = true) {
  const tracks = useRef(new Map())
  useEffect(() => {
    const seen = new Set()
    const mixdown = Math.max(1, members.filter((member) => member.moving).length) ** 0.25
    members.forEach((member) => {
      seen.add(member.id)
      const track = tracks.current.get(member.id)
      if (!track) {
        tracks.current.set(member.id, { position: member.position, travelled: null, steps: 0 })
        return
      }
      const moved = Math.hypot(member.position.x - track.position.x, member.position.y - track.position.y)
      track.position = member.position
      if (!active || !member.moving) {
        track.travelled = null
        return
      }
      const gait = gaitOf(member)
      // The first step lands as soon as a character sets off.
      if (track.travelled === null) track.travelled = 0
      else {
        track.travelled += moved
        if (track.travelled < gait.stride) return
        track.travelled %= gait.stride
      }
      track.steps += 1
      playFootstep(track.steps, gait.loudness / mixdown)
    })
    tracks.current.forEach((_, id) => {
      if (!seen.has(id)) tracks.current.delete(id)
    })
  }, [members, active])
}
