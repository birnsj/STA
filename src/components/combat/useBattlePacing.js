import { useEffect, useState } from 'react'
import { awaitingDecision } from '../../combat/combatState.js'
import { aiDelay, AI_CHOICE_MS, AUTO_RESOLVE_MS, OPENING_BANNER_MS } from './battleHelpers.js'

// The battle's timers. Combat itself never waits on them: each only decides when the screen asks the reducer for the
// next step, so there is time to read a roll or watch a move. All of them hold while How to Play is open.
// openingBanner: the banner shown as a fight starts (null = none); the AI waits until it has played.
// aiControlled / auto / speed / partyAI / enemyAI: who the AI is playing and at what speed (auto: 'off' | 'running' | 'paused').
// hasPlan: Auto Combat is showing a party member's chosen button for a beat before it runs.
// turnUsedUp / holdingForExtra: the player's turn has no actions left, and its ring is open to buy an extra one.
// autoResolve: a rolled player attack that resolves by itself. beamingIn: the away team is still beaming in; the AI waits.
// Returns { openingDone }.
export default function useBattlePacing({
  state,
  dispatch,
  openingBanner,
  helpOpen,
  aiControlled,
  auto,
  speed,
  hasPlan,
  partyAI,
  enemyAI,
  turnUsedUp,
  holdingForExtra,
  autoEndMs,
  autoResolve,
  beamingIn = false,
}) {
  // The opening banner plays before anything else: the AI waits and the first turn banner follows it.
  const [openingDone, setOpeningDone] = useState(!openingBanner)
  useEffect(() => {
    if (openingDone) return undefined
    const timer = setTimeout(() => setOpeningDone(true), OPENING_BANNER_MS)
    return () => clearTimeout(timer)
  }, [openingDone])

  // AI turns (enemies, plus the party during Auto Combat): one step at a time, paced so it can be followed.
  // Paused while How to Play is open, the opening banner plays or Auto Combat is paused. The step itself is pure
  // (autoCombat.stepAI).
  useEffect(() => {
    if (state.outcome || !aiControlled || helpOpen || !openingDone || beamingIn || auto === 'paused') return undefined
    // An Injury on a party member waits for the player's Avoid Injury choice, a new Fatigue for the attribute choice, a
    // won opposed attack for the Counterattack choice (outside Auto Combat).
    if (awaitingDecision(state) && auto === 'off') return undefined
    const timer = setTimeout(() => dispatch({ type: 'aiStep', partyAI, enemyAI, partyAuto: auto !== 'off' }), (aiDelay(state) + (hasPlan ? AI_CHOICE_MS : 0)) / speed)
    return () => clearTimeout(timer)
  }, [state, aiControlled, dispatch, helpOpen, openingDone, beamingIn, auto, speed, hasPlan, partyAI, enemyAI])

  // With both actions used the turn passes on by itself (to the next Ready member, else to the enemies), after a pause so
  // the result can be read; never waiting for End Turn.
  useEffect(() => {
    if (!turnUsedUp || helpOpen || holdingForExtra) return undefined
    const timer = setTimeout(() => dispatch({ type: 'endTurn' }), autoEndMs)
    return () => clearTimeout(timer)
  }, [turnUsedUp, helpOpen, holdingForExtra, autoEndMs, dispatch])

  // A rolled player attack resolves on its own after a beat to read the dice, unless it would miss and a reroll is open.
  useEffect(() => {
    if (!autoResolve || helpOpen) return undefined
    const timer = setTimeout(() => dispatch({ type: 'resolveAttack' }), AUTO_RESOLVE_MS)
    return () => clearTimeout(timer)
  }, [autoResolve, helpOpen, dispatch, state.pending])

  return { openingDone }
}
