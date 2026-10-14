import { useEffect, useRef } from 'react'
import { playBeamOutSound, playDeathSound, playKnockoutSound, playRequestSound, playScanSound, playWeaponSound } from '../../audio/uiSounds.js'
import { isDead, isDying } from '../../rules/personalCondition.js'
import { BEAM_OUT_MS, SHOT_FIRE_MS, shotOf } from './battleHelpers.js'

// The sounds of state.lastAction, played once per action, in time with its effects on the board (actionEffects.js):
// the weapon fires SHOT_FIRE_MS into the attacker's strike, and the knockout or death sound waits until the shot lands.
// All divided by the Auto Combat speed.
export default function useActionSounds(state, speed) {
  const action = state.lastAction
  const shot = shotOf(state, action)
  // Speed is read from a ref so changing it mid-shot doesn't fire the sound a second time.
  const speedRef = useRef(speed)
  useEffect(() => {
    speedRef.current = speed
  }, [speed])
  const actionKey = action?.key
  const scanned = action?.type === 'scan'
  const request = action?.type === 'persuade' || action?.type === 'intimidate' ? action.type : null
  const requestPassed = Boolean(action?.passed)
  const fled = action?.type === 'flee'
  const attackSound = shot?.sound ?? null
  const injuryMode = shot?.injuryMode ?? null
  const impactMs = shot?.impactMs ?? 0
  // Taken out by this action: killed or left Dying (death sound), otherwise knocked out (knockout sound).
  const downed = action?.removed && action.targetId ? state.combatants[action.targetId]?.condition : null
  const downSound = downed ? (isDead(downed) || isDying(downed) ? 'death' : 'knockout') : null
  useEffect(() => {
    const timers = []
    const later = (ms, play) => (ms > 0 ? timers.push(setTimeout(play, ms / speedRef.current)) : play())
    if (attackSound) later(SHOT_FIRE_MS, () => playWeaponSound(attackSound, speedRef.current, injuryMode))
    if (scanned) playScanSound()
    if (request) playRequestSound(request, requestPassed)
    if (fled) playBeamOutSound(BEAM_OUT_MS / 1000 / speedRef.current)
    if (downSound === 'death') later(impactMs, playDeathSound)
    if (downSound === 'knockout') later(impactMs, playKnockoutSound)
    return () => timers.forEach(clearTimeout)
  }, [actionKey, attackSound, injuryMode, impactMs, scanned, request, requestPassed, fled, downSound])
}
