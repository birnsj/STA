import { useEffect, useState } from 'react'
import { advancePose, initialPose, poseInput, poseWakeAt, settlePose, shownPose } from './unitPose.js'

const clockNow = () => performance.now()

// Which CharacterSprite animation a combatant plays on the SVG board (unitPose.js decides; this keeps its track in
// state and wakes when it next changes by itself). Presentation only.
// hitDelayMs: when the last action is a shot at this combatant, how long until it lands; a fall it causes waits for it.
// Returns the CharacterSprite props: { animation, playKey, settled, reverse }.
export default function useUnitAnimation(combatant, { isWalking, lastAction, speed = 1, hitDelayMs = 0 }) {
  const input = poseInput(combatant, { lastAction, hitDelayMs, speed })
  const [track, setTrack] = useState(() => initialPose(input))

  // Adjusted while rendering (not in an effect) so the figure never shows a frame of the wrong pose.
  const next = advancePose(track, input, clockNow())
  if (next !== track) setTrack(next)

  const wakeAt = poseWakeAt(next)
  useEffect(() => {
    if (wakeAt === null) return undefined
    // Settled at no earlier than wakeAt: a timer can fire a moment early.
    const timer = setTimeout(() => setTrack((current) => settlePose(current, Math.max(performance.now(), wakeAt))), Math.max(0, wakeAt - performance.now()))
    return () => clearTimeout(timer)
  }, [wakeAt])

  return shownPose(next, { inCover: combatant.inCover, isWalking })
}
