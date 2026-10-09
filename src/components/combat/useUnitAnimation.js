import { useEffect, useState } from 'react'
import { defeatAnimation, getSpriteAnimation } from '../../rules/appearance.js'
import { getWeapon } from '../../combat/weaponSystem.js'

// Actions in which the actor strikes its target (state.lastAction types); a failed Ambush strikes nobody.
const STRIKES = ['attack', 'counterattack', 'ambush']

const strikeAnimation = (action) => (getWeapon(action.weaponId)?.type === 'melee' ? 'melee' : 'attack')
const isStrikeBy = (action, id) => Boolean(action && STRIKES.includes(action.type) && action.actorId === id && action.weaponId && action.passed !== false)

// Which CharacterSprite animation a combatant plays (characterSprites.json): its strike when the last action was its
// attack, the fall when it is Defeated (already lying there if it was down before this board appeared), getting up
// (the fall backwards) when First Aid ends Defeated, walking, cover, or idle. Presentation only.
// Returns the CharacterSprite props: { animation, playKey, settled, reverse }.
export default function useUnitAnimation(combatant, { isWalking, lastAction, speed = 1 }) {
  const down = Boolean(combatant.condition?.defeated)
  const fall = defeatAnimation(combatant.condition, combatant.id)
  const strikeKey = isStrikeBy(lastAction, combatant.id) ? lastAction.key : null
  // seenStrike starts at the current action so a board that appears mid-fight doesn't replay an old shot.
  const [track, setTrack] = useState({ down, fall: down ? fall : null, settled: down, seenStrike: strikeKey, strike: null, gettingUp: null, playKey: 0 })

  // Adjusted while rendering (not in an effect) so the figure never shows a frame of the wrong pose.
  let next = track
  if (down !== next.down) {
    next = down ? { ...next, down, fall, settled: false, gettingUp: null, strike: null, playKey: next.playKey + 1 } : { ...next, down, gettingUp: next.fall, playKey: next.playKey + 1 }
  }
  if (strikeKey !== null && strikeKey !== next.seenStrike) {
    next = { ...next, seenStrike: strikeKey, strike: down ? null : strikeAnimation(lastAction), playKey: next.playKey + 1 }
  }
  if (next !== track) setTrack(next)

  // A strike and getting up play once, then the figure goes back to its loop.
  const oneShot = next.strike ?? next.gettingUp
  const oneShotKey = oneShot ? next.playKey : null
  useEffect(() => {
    if (oneShotKey === null) return undefined
    const timer = setTimeout(() => setTrack((current) => (current.playKey === oneShotKey ? { ...current, strike: null, gettingUp: null } : current)), (getSpriteAnimation(oneShot).seconds * 1000) / speed)
    return () => clearTimeout(timer)
  }, [oneShotKey, oneShot, speed])

  if (next.down) return { animation: next.fall, playKey: next.playKey, settled: next.settled, reverse: false }
  if (next.gettingUp) return { animation: next.gettingUp, playKey: next.playKey, settled: false, reverse: true }
  if (next.strike) return { animation: next.strike, playKey: next.playKey, settled: false, reverse: false }
  if (isWalking) return { animation: 'walk', playKey: 0, settled: false, reverse: false }
  return { animation: combatant.inCover ? 'cover' : 'idle', playKey: 0, settled: false, reverse: false }
}
