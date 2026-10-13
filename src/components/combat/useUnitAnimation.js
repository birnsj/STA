import { useEffect, useState } from 'react'
import { defeatAnimation, getSpriteAnimation } from '../../rules/appearance.js'
import { getWeapon } from '../../combat/weaponSystem.js'
import { SHOT_ACTIONS } from './battleHelpers.js'

const strikeAnimation = (action) => (getWeapon(action.weaponId)?.type === 'melee' ? 'melee' : 'attack')
// The strike plays when the roll is resolved (hit or miss), with the shot (battleHelpers shotOf); a failed Ambush
// strikes nobody.
const isStrikeBy = (action, id) =>
  Boolean(action && SHOT_ACTIONS.includes(action.type) && action.actorId === id && action.weaponId && (action.type !== 'ambush' || action.passed))

// Which CharacterSprite animation a combatant plays (characterSprites.json): its strike when the last action was its
// attack, the fall when it is Defeated (already lying there if it was down before this board appeared), getting up
// (the fall backwards) when First Aid ends Defeated, hands up once it has surrendered (already up if it had before this
// board appeared), running (every combat Move and Sprint; designer decision 2026-10-12), cover, or idle.
// Presentation only.
// hitDelayMs: when the last action is a shot at this combatant, how long until it lands; a fall it causes waits for it.
// Returns the CharacterSprite props: { animation, playKey, settled, reverse }.
export default function useUnitAnimation(combatant, { isWalking, lastAction, speed = 1, hitDelayMs = 0 }) {
  const down = Boolean(combatant.condition?.defeated)
  const surrendered = Boolean(combatant.surrendered)
  const fall = defeatAnimation(combatant.condition, combatant.id)
  const strikeKey = isStrikeBy(lastAction, combatant.id) ? lastAction.key : null
  // seenStrike starts at the current action so a board that appears mid-fight doesn't replay an old shot.
  const [track, setTrack] = useState({ down, fall: down ? fall : null, settled: down, fallHeld: false, surrendered, handsSettled: surrendered, seenStrike: strikeKey, strike: null, gettingUp: null, playKey: 0 })

  // Adjusted while rendering (not in an effect) so the figure never shows a frame of the wrong pose.
  let next = track
  if (down !== next.down) {
    next = down
      ? { ...next, down, fall, settled: false, fallHeld: hitDelayMs > 0, gettingUp: null, strike: null, playKey: next.playKey + 1 }
      : { ...next, down, fallHeld: false, gettingUp: next.fall, playKey: next.playKey + 1 }
  }
  if (surrendered !== next.surrendered) {
    next = { ...next, surrendered, handsSettled: false, strike: null, playKey: next.playKey + 1 }
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

  // A fall caused by a shot starts when the shot lands (a new playKey, so the fall plays from its first frame then).
  const heldKey = next.fallHeld ? next.playKey : null
  useEffect(() => {
    if (heldKey === null) return undefined
    const timer = setTimeout(() => setTrack((current) => (current.playKey === heldKey ? { ...current, fallHeld: false, playKey: current.playKey + 1 } : current)), hitDelayMs / speed)
    return () => clearTimeout(timer)
  }, [heldKey, hitDelayMs, speed])

  if (next.down && next.fallHeld) return { animation: combatant.inCover ? 'cover' : 'idle', playKey: 0, settled: false, reverse: false }
  if (next.down) return { animation: next.fall, playKey: next.playKey, settled: next.settled, reverse: false }
  if (next.gettingUp) return { animation: next.gettingUp, playKey: next.playKey, settled: false, reverse: true }
  if (next.strike) return { animation: next.strike, playKey: next.playKey, settled: false, reverse: false }
  if (next.surrendered) return { animation: 'surrender', playKey: next.playKey, settled: next.handsSettled, reverse: false }
  if (isWalking) return { animation: 'run', playKey: 0, settled: false, reverse: false }
  return { animation: combatant.inCover ? 'cover' : 'idle', playKey: 0, settled: false, reverse: false }
}
