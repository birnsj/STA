import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMusicScene } from '../../audio/useMusicScene.js'
import { cardFor } from '../../maps/episodeCards.js'
import { stardateAt } from '../../exploration/missionLog.js'
import { storyParagraphs } from '../../exploration/missionStory.js'

// The episode's story panels in game mode: the Captain's Log intro before play, Mission Accomplished once every
// objective is complete (or Mission Failed), then the Captain's Log outro once the away team has beamed out. Text comes from the map
// (briefing, outro) and the mission log; it may be generated later.

const paragraphsOf = (text) =>
  (text ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

const FADE_OUT_MS = 1200

// Space or Enter (outside a button) calls advance.
function useAdvanceKeys(advance) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return
      if (event.target instanceof HTMLButtonElement) return
      event.preventDefault()
      advance()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance])
}

// Leaving fades to black, then onLeave. Returns [leaving, leave].
// onLeave is read from a ref so a new callback identity (e.g. openMenu each render) does not reset the fade timer.
function useFadeOut(onLeave) {
  const [leaving, setLeaving] = useState(false)
  const onLeaveRef = useRef(onLeave)
  useEffect(() => {
    onLeaveRef.current = onLeave
  }, [onLeave])
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => onLeaveRef.current?.(), FADE_OUT_MS)
    return () => clearTimeout(timer)
  }, [leaving])
  return [leaving, () => setLeaving(true)]
}

// Like a film: letterbox bars over the slowly drifting episode card. bottom: the bottom bar's contents.
function Cinema({ map, label, onClick, leaving, bottom, children }) {
  const card = cardFor(map.card)
  return (
    <div className="mission-intro" onClick={onClick} role="dialog" aria-label={label}>
      {card && <img className="mission-intro-card" src={card.image} alt="" onError={(event) => (event.currentTarget.hidden = true)} />}
      <div className="mission-intro-shade" />
      {children}
      <div className="mission-intro-bar is-top" />
      <div className="mission-intro-bar is-bottom">{bottom}</div>
      <div className={`mission-intro-out${leaving ? ' is-on' : ''}`} style={{ transitionDuration: `${FADE_OUT_MS}ms` }} />
    </div>
  )
}

// The intro's timings (implementer picks): how long the episode title holds, then the waits before each step of the
// log: its heading, the briefing, then Begin Mission.
const TITLE_MS = 4500
const LOG_STEP_MS = [1200, 2200, 2000]

// Played like a film opening (designer request, 2026-10-11): the episode title over the slowly drifting episode card,
// then the Captain's Log over it, without a panel: its heading fades in first, then the whole briefing at once
// (designer markup, 2026-10-11). A click, Space or Enter moves on (the title ends; the log shows at once). Skip Intro
// begins at once. Begin Mission and Skip Intro fade to black first; the map then fades in from black (MapFadeIn).
export function MissionIntro({ map, onBegin }) {
  // Its own music over the exploration cue; that cue fades back in as the intro closes.
  useMusicScene('intro')
  const paragraphs = useMemo(() => paragraphsOf(map.briefing), [map])
  // UI state: 'title' or 'log', and how many of the log's steps have happened (heading, briefing, Begin Mission).
  const [stage, setStage] = useState('title')
  const [step, setStep] = useState(0)
  const done = stage === 'log' && step >= LOG_STEP_MS.length

  useEffect(() => {
    if (stage !== 'title') return
    const timer = setTimeout(() => setStage('log'), TITLE_MS)
    return () => clearTimeout(timer)
  }, [stage])
  useEffect(() => {
    if (stage !== 'log' || step >= LOG_STEP_MS.length) return
    const timer = setTimeout(() => setStep(step + 1), LOG_STEP_MS[step])
    return () => clearTimeout(timer)
  }, [stage, step])

  const [leaving, begin] = useFadeOut(onBegin)
  const advance = useCallback(() => {
    if (stage === 'title') setStage('log')
    else setStep(LOG_STEP_MS.length)
  }, [stage])
  useAdvanceKeys(advance)

  return (
    <Cinema
      map={map}
      label={`${map.episodeName || map.name}: Captain's Log`}
      onClick={done ? undefined : advance}
      leaving={leaving}
      bottom={
        done ? (
          <button type="button" className="combat-button is-primary is-advance mission-intro-begin" onClick={begin} autoFocus>
            Begin Mission
          </button>
        ) : (
          <>
            <span className="mission-intro-hint">Click to continue</span>
            <button
              type="button"
              className="mission-intro-skip"
              onClick={(event) => {
                event.stopPropagation()
                begin()
              }}
            >
              Skip Intro
            </button>
          </>
        )
      }
    >
      {stage === 'title' ? (
        <div className="mission-intro-title" style={{ animationDuration: `${TITLE_MS}ms` }}>
          <h1>{map.episodeName || map.name}</h1>
          {map.episodeName && <p>{map.name}</p>}
        </div>
      ) : (
        <div className="mission-intro-log">
          {/* Both are laid out from the start, so the heading doesn't move when the briefing appears. */}
          <p className={`mission-intro-line is-heading${step >= 1 ? ' is-shown' : ''}`}>Captain&apos;s log, stardate {stardateAt(map, 0)}.</p>
          <div className={`mission-intro-line mission-intro-body${step >= 2 ? ' is-shown' : ''}`}>
            {paragraphs.map((text, index) => (
              <p key={index}>{text}</p>
            ))}
          </div>
        </div>
      )}
    </Cinema>
  )
}

// onExit(): beam the away team out and end the mission. onReturn(): keep playing (Exit Mission ends it later).
export function MissionAccomplished({ map, onExit, onReturn }) {
  return (
    <div className="combat-modal-backdrop mission-accomplished-backdrop">
      <div className="combat-modal is-victory" role="dialog" aria-modal="true" aria-labelledby="mission-accomplished-title">
        <h2 id="mission-accomplished-title" className="combat-modal-title">
          Mission Accomplished
        </h2>
        <p className="combat-modal-text">{map.episodeName || map.name}</p>
        <div className="combat-modal-actions">
          <button type="button" className="combat-button" onClick={onReturn}>
            Return to Game
          </button>
          <button type="button" className="combat-button is-primary" onClick={onExit} autoFocus>
            Exit Mission
          </button>
        </div>
      </div>
    </div>
  )
}

// The mission failed (an NPC the map marks Must survive went down or surrendered): only Exit Mission. names: who.
export function MissionFailed({ map, names, partyLost = false, onExit }) {
  return (
    <div className="combat-modal-backdrop mission-accomplished-backdrop">
      <div className="combat-modal is-defeat" role="dialog" aria-modal="true" aria-labelledby="mission-failed-title">
        <h2 id="mission-failed-title" className="combat-modal-title">
          Mission Failed
        </h2>
        <p className="combat-modal-text">{map.episodeName || map.name}</p>
        {names.length > 0 && <p className="combat-modal-text">We failed to protect {names.join(', ')}.</p>}
        {names.length === 0 && partyLost && <p className="combat-modal-text">The away team was taken out of the fight.</p>}
        <div className="combat-modal-actions">
          <button type="button" className="combat-button is-primary" onClick={onExit} autoFocus>
            Exit Mission
          </button>
        </div>
      </div>
    </div>
  )
}

// Shown in place of the outro text when the away team left before every objective was complete and the map has no
// abandoned outro of its own (implementer placeholder until the designer words it).
const ABANDONED_TEXT = 'The away team beamed out before the mission was complete. Mission abandoned.'
// The same when the mission failed and the map has no failed outro of its own (implementer placeholder).
const failedText = (names, partyLost) =>
  names.length
    ? `We failed to protect ${names.join(', ')}. Mission failed.`
    : partyLost
      ? 'The away team was taken out of the fight. Mission failed.'
      : 'We failed to protect someone in our care. Mission failed.'

// The outro's timings (implementer picks): the wait before the heading, before the first paragraph, between the
// others, and after the last one before the exit button.
const OUTRO_HEADING_MS = 1200
const OUTRO_FIRST_MS = 2200
const OUTRO_PARAGRAPH_MS = 3200
const OUTRO_END_MS = 1500

// The mission told as a story (designer request, 2026-10-11): over the episode card like the intro, "Captain's log,
// stardate …" fades in, then the outro text (or the abandoned line) and the mission log retold as prose
// (missionStory.js), one paragraph at a time. A click, Space or Enter shows the rest at once. The exit button fades
// to black, then onDone. result: 'accomplished', 'abandoned' (the mission ended before every objective was complete)
// or 'failed' (failedNames: who was killed; partyLost: the away team lost a fight).
export function MissionOutro({ map, time, entries, result = 'accomplished', failedNames = [], partyLost = false, exitLabel, onDone }) {
  useMusicScene('outro')
  const paragraphs = useMemo(() => {
    const own = { accomplished: map.outro, abandoned: map.outroAbandoned, failed: map.outroFailed }[result]
    const fallback = { abandoned: ABANDONED_TEXT, failed: failedText(failedNames, partyLost) }[result]
    const opening = paragraphsOf(own)
    return [...(fallback && !opening.length ? [fallback] : opening), ...storyParagraphs(entries)]
  }, [result, failedNames, partyLost, map, entries])
  // UI state: how many lines are showing (the heading is the first); one more than every line once the exit shows.
  const [step, setStep] = useState(0)
  const lineCount = paragraphs.length + 1
  const done = step > lineCount
  useEffect(() => {
    if (done) return
    const wait = step === 0 ? OUTRO_HEADING_MS : step === 1 ? OUTRO_FIRST_MS : step === lineCount ? OUTRO_END_MS : OUTRO_PARAGRAPH_MS
    const timer = setTimeout(() => setStep(step + 1), wait)
    return () => clearTimeout(timer)
  }, [step, done, lineCount])

  // A long story scrolls: the newest paragraph is kept in view.
  const logRef = useRef(null)
  const lineRefs = useRef([])
  useEffect(() => {
    const log = logRef.current
    const latest = lineRefs.current[Math.min(step, lineCount) - 1]
    if (!log || !latest) return
    const bottom = latest.offsetTop + latest.offsetHeight - log.clientHeight
    if (bottom > log.scrollTop) log.scrollTo({ top: bottom, behavior: 'smooth' })
  }, [step, lineCount])

  const advance = useCallback(() => setStep(lineCount + 1), [lineCount])
  useAdvanceKeys(advance)

  return (
    <Cinema
      map={map}
      label={`${map.episodeName || map.name}: mission report`}
      onClick={done ? undefined : advance}
      leaving={false}
      bottom={
        done ? (
          <button type="button" className="combat-button is-primary mission-intro-begin" onClick={onDone} autoFocus>
            {exitLabel}
          </button>
        ) : (
          <span className="mission-intro-hint">Click to continue</span>
        )
      }
    >
      <div className="mission-intro-log is-story" ref={logRef}>
        <p ref={(element) => (lineRefs.current[0] = element)} className={`mission-intro-line is-heading${step >= 1 ? ' is-shown' : ''}`}>
          Captain&apos;s log, stardate {stardateAt(map, time)}.
        </p>
        {paragraphs.map((text, index) => (
          <p key={index} ref={(element) => (lineRefs.current[index + 1] = element)} className={`mission-intro-line${step >= index + 2 ? ' is-shown' : ''}`}>
            {text}
          </p>
        ))}
      </div>
    </Cinema>
  )
}
