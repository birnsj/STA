import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { playBeamOutSound } from '../../audio/uiSounds.js'
import { BEAM_OUT_MS } from '../combat/battleHelpers.js'
import { perfEnd, perfOff, perfStart } from '../../dev/perfProbe.js'
import { isMissionAccomplished, isMissionFailed } from '../../exploration/missionObjectives.js'
import { createWorldTickCadence, takeWorldTick } from '../../exploration/worldClock.js'

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
  // UI state: null | 'accomplished' | 'failed' (the banner is up) | 'dismissed' (Return to Game) | 'exiting' (Exit Mission).
  const [ending, setEnding] = useState(null)
  const beaming = party.memberIds.some((id) => party.members[id].beaming)
  // Mission Failed (designer decision, 2026-10-12) shows once the fight that failed it has ended and offers only Exit
  // Mission; it wins over Mission Accomplished.
  const failed = !inCombat && !beaming && isMissionFailed(state)
  const accomplished = !failed && !inCombat && !talking && !beaming && isMissionAccomplished(state)
  const next = failed ? (ending === 'failed' || ending === 'exiting' ? null : 'failed') : accomplished && !ending ? 'accomplished' : null
  useEffect(() => {
    if (!next) return
    const timer = setTimeout(() => setEnding(next), ACCOMPLISHED_DELAY_MS)
    return () => clearTimeout(timer)
  }, [next])
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
      if (!ids.length) return
      dispatch({ type: 'startBeamOut', ids })
      playBeamOutSound(BEAM_OUT_MS / 1000)
      const timer = setTimeout(() => {
        beamTimers.current.delete(timer)
        dispatch({ type: 'beamOut', ids })
      }, BEAM_OUT_MS)
      beamTimers.current.add(timer)
    },
    [dispatch],
  )
  const exitMission = () => {
    setEnding('exiting')
    if (talking) dispatch({ type: 'conversationLeave' })
    startBeamOut(party.memberIds.filter((id) => !party.members[id].beaming))
  }
  // Exit Mission on the result of the fight that failed the mission: the fight ends, then the away team beams out
  // (a beam can't start while the fight is on), with no Mission Failed banner between.
  const exitAfterFight = useRef(false)
  const exitMissionFromFight = () => {
    setEnding('exiting')
    exitAfterFight.current = true
    dispatch({ type: 'endCombat' })
  }
  useEffect(() => {
    if (inCombat || !exitAfterFight.current) return
    exitAfterFight.current = false
    startBeamOut(party.memberIds.filter((id) => !party.members[id].beaming))
  }, [inCombat, party, startBeamOut])

  return {
    ending,
    dismiss: () => setEnding('dismissed'),
    beaming,
    outro,
    // The world stops while the banner is up and once the outro shows.
    paused: ending === 'accomplished' || ending === 'failed' || outro,
    confirmExit,
    askExitMission,
    cancelExit: () => setConfirmExit(false),
    confirmBeamOutId,
    askBeamOut: setConfirmBeamOutId,
    cancelBeamOut: () => setConfirmBeamOutId(null),
    startBeamOut,
    exitMission,
    exitMissionFromFight,
  }
}

// The world runs in real time, capped at sixty React commits per second while running.
// flushSync: rendered and committed inside this frame's callback. Left to React's scheduler, the commit landed after the
// frame was painted, so each frame showed the previous frame's step; with uneven frame times (a missed vsync) the
// characters then moved in uneven jumps against the camera, which is updated inside the frame.
export function useWorldClock(dispatch, running) {
  useEffect(() => {
    if (!running) return
    let frame
    const cadence = createWorldTickCadence(performance.now())
    const step = (now) => {
      const seconds = takeWorldTick(cadence, now)
      if (seconds !== null && !perfOff('tick')) {
        const started = perfStart()
        flushSync(() => dispatch({ type: 'tick', seconds }))
        perfEnd('world.frame', started)
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [dispatch, running])
}
