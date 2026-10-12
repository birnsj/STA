import { useCallback, useEffect, useRef, useState } from 'react'
import { BEAM_OUT_MS } from '../combat/battleHelpers.js'
import { isMissionAccomplished } from '../../exploration/missionObjectives.js'

// How long the map stays up after the last objective completes before Mission Accomplished shows (implementer pick),
// so the roll or line that finished it can be seen.
const ACCOMPLISHED_DELAY_MS = 1500

// The mission's end (designer requests, 2026-10-11): once every objective is complete, and no fight or conversation is
// going on, Mission Accomplished shows (the world stops meanwhile): Exit Mission beams the away team out, Return to
// Game plays on. Exit Mission in the Formation panel does the same at any time, after a confirmation, and each
// member's ring has Beam Out for them alone. With everyone beamed out the Captain's Log outro shows.
// Returns the UI state the screen and MissionEndDialogs.jsx read, and the actions that change it.
export default function useMissionEnding({ state, dispatch, inCombat, talking }) {
  const { party } = state
  // UI state: null | 'accomplished' (the banner is up) | 'dismissed' (it has been answered).
  const [ending, setEnding] = useState(null)
  const beaming = party.memberIds.some((id) => party.members[id].beaming)
  const accomplished = !inCombat && !talking && !beaming && isMissionAccomplished(state)
  useEffect(() => {
    if (!accomplished || ending) return
    const timer = setTimeout(() => setEnding('accomplished'), ACCOMPLISHED_DELAY_MS)
    return () => clearTimeout(timer)
  }, [accomplished, ending])
  const outro = !inCombat && party.memberIds.length === 0

  // UI state: whether Exit Mission is waiting for confirmation; the member whose Beam Out is.
  const [confirmExit, setConfirmExit] = useState(false)
  const askExitMission = useCallback(() => setConfirmExit(true), [setConfirmExit])
  const [confirmBeamOutId, setConfirmBeamOutId] = useState(null)
  const beamTimers = useRef(new Set())
  useEffect(() => {
    const timers = beamTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])
  const startBeamOut = useCallback(
    (ids) => {
      dispatch({ type: 'startBeamOut', ids })
      const timer = setTimeout(() => {
        beamTimers.current.delete(timer)
        dispatch({ type: 'beamOut', ids })
      }, BEAM_OUT_MS)
      beamTimers.current.add(timer)
    },
    [dispatch],
  )
  const exitMission = () => {
    setEnding('dismissed')
    if (talking) dispatch({ type: 'conversationLeave' })
    startBeamOut(party.memberIds.filter((id) => !party.members[id].beaming))
  }

  return {
    ending,
    dismiss: () => setEnding('dismissed'),
    beaming,
    outro,
    // The world stops while the banner is up and once the outro shows.
    paused: ending === 'accomplished' || outro,
    confirmExit,
    askExitMission,
    cancelExit: () => setConfirmExit(false),
    confirmBeamOutId,
    askBeamOut: setConfirmBeamOutId,
    cancelBeamOut: () => setConfirmBeamOutId(null),
    startBeamOut,
    exitMission,
  }
}

// The world runs in real time: one step per animation frame while running.
export function useWorldClock(dispatch, running) {
  useEffect(() => {
    if (!running) return
    let frame
    let last = performance.now()
    const step = (now) => {
      dispatch({ type: 'tick', seconds: (now - last) / 1000 })
      last = now
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [dispatch, running])
}
