import { useEffect, useMemo, useRef, useState } from 'react'
import { getAttributeName, getDisciplineName } from '../../character/runtimeCharacter.js'
import { getMembers } from '../../exploration/partyControl.js'
import { MAX_MOMENTUM } from '../../rules/missionResources.js'
import { isDefeated } from '../../rules/personalCondition.js'
import { TASK_DICE } from '../../rules/taskResolver.js'
import { challengeFor } from '../../exploration/challengeObjects.js'
import { criticalText, formulaText } from '../task/taskText.js'
import RolledDice from '../dice/RolledDice.jsx'
import { PreRollWindow, ResultWindow } from '../dice/RollWindow.jsx'
import {
  TaskBlockers,
  TaskDevDetails,
  TaskDice,
  TaskDifficulty,
  TaskFocus,
  TaskFormula,
  TaskModifiers,
  TaskOutcome,
} from '../task/TaskMath.jsx'

// After a roll the result stays this long, then the panel and the dice fade out over RESULT_FADE_MS and the panel
// closes by itself (designer request: no Close needed to carry on). Matches .is-fading in exploration.css.
export const RESULT_HOLD_MS = 2500
export const RESULT_FADE_MS = 600

const firstName = (member) => member.character.name.split(' ')[0]
const usesText = (task) => `${getAttributeName(task.attribute)} + ${getDisciplineName(task.department)}`

// Every party member able to act, judged on this approach with the same task preparation the roll would use.
function recommendationFor(state, object, action) {
  if (!action) return null
  const memberIds = getMembers(state.party)
    .filter((member) => !isDefeated(member.condition))
    .map((member) => member.id)
  return object.recommend(state, action.id, memberIds)
}

// The math that decides the task, before the roll, for the chosen performer: what the player confirms.
// action: anything with the task spec as action.task (a conversation's Task Check passes { task: its spec }).
export function CharacterMath({ performer, prepared, assist, assistant, action }) {
  const { task } = prepared
  return (
    <div className="challenge-math">
      <p className="tm-performer">
        {performer.character.name} &middot; {usesText(action.task)}
      </p>
      <TaskBlockers blockers={prepared.blockers} task={task} />
      <TaskFormula task={task} />
      <TaskDifficulty difficulty={prepared.difficulty} lines={prepared.difficultyLines} />
      <TaskFocus task={task} focusOptions={action.task.focuses ?? []} />
      <TaskModifiers equipment={prepared.equipment} effects={prepared.effects} />
      <TaskDice
        task={task}
        assist={
          assist
            ? `${assistant.character.name} assists (${assist.approach.label}): ${formulaText(assist.task)}, rolling 1d20${assist.focus ? `, Focus ${assist.focus} (critical ${criticalText(assist.task)})` : ''}. Their successes count only if ${firstName(performer)} scores at least one.`
            : null
        }
      />
    </div>
  )
}

// Who may assist the approach (its authored assist approaches): every other member within reach, each with the
// approach that gives them the highest target number.
function assistOptionsFor(state, challenge, actionId, performerId, inRangeIds) {
  const approaches = challenge.action(actionId)?.assist ?? []
  if (!approaches.length) return []
  return inRangeIds
    .filter((id) => id !== performerId)
    .map((id) => {
      const choices = approaches.map((_, assistIndex) => ({ assistIndex, assist: challenge.preview(state, { actionId, performerId, assistantId: id, assistIndex }).assist }))
      const best = choices.reduce((top, choice) => (choice.assist.task.targetNumber > top.assist.task.targetNumber ? choice : top))
      return { id, member: state.party.members[id], ...best }
    })
}

// What happened: the task as rolled, each die and what it scored, the count against the Difficulty, Momentum and
// complications, and the object's outcome. A conversation's Task Check shows its roll with this too.
// showDice: false when the dice are shown elsewhere (above the object's ring).
export function TaskResultView({ lastTask, performer, assistant, showDice = true }) {
  const { result, messages, prepared } = lastTask
  if (!result) {
    return (
      <div className="challenge-result is-success">
        <p className="tm-no-roll">No roll required</p>
        <p className="tm-help">Routine action: done.</p>
        {messages.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </div>
    )
  }
  const { task } = prepared
  return (
    <div className={`challenge-result ${result.success ? 'is-success' : 'is-failure'}`}>
      <p className="challenge-result-line">{formulaText(task)}</p>
      <p className="challenge-result-line">
        Critical success {criticalText(task)}
        {task.focus ? ` (Focus: ${task.focus})` : ' (no applicable Focus)'} &middot; Difficulty {result.difficulty}
      </p>
      {showDice && <RolledDice result={result} performer={performer} assistant={assistant} />}
      {result.assist && (
        <p className="challenge-result-line">
          {result.assist.counted ? `${firstName(assistant)}'s ${result.assist.successes} success${result.assist.successes === 1 ? '' : 'es'} counted.` : `${firstName(assistant)}'s die doesn't count: ${firstName(performer)} scored no successes.`}
        </p>
      )}
      <TaskOutcome result={result} difficulty={result.difficulty} autoFail={task.autoFail} />
      {lastTask.bonusDice > 0 && (
        <p className="challenge-result-line">
          Bought {lastTask.bonusDice} bonus d20{lastTask.bonusDice === 1 ? '' : 's'}: {lastTask.momentumSpentOnDice} Momentum spent, {lastTask.threatAddedForDice} Threat added.
        </p>
      )}
      {result.success && (
        <p className="challenge-result-line">
          {result.bonusMomentum ? `Includes ${result.bonusMomentum} bonus Momentum, which can't be saved. ` : ''}Saved to the group pool: {lastTask.momentumSaved}
          {lastTask.momentumLost ? `; ${lastTask.momentumLost} lost (the pool holds at most ${MAX_MOMENTUM})` : ''}.
        </p>
      )}
      {result.complicationsRolled > 0 && (
        <p className="challenge-result-line is-complication">
          Complications: {result.complications}
          {result.complicationsIgnored ? ` (${result.complicationsIgnored} ignored)` : ''}
        </p>
      )}
      {messages.map((text) => (
        <p key={text} className="challenge-result-message">
          {text}
        </p>
      ))}
    </div>
  )
}

// The stats of one challenge-object approach. The object's ring picks the approach and its party band who attempts it
// (pickedPerformerId; else the best within reach). A roll happens in the roll window (designer request, 2026-10-15):
// the ring's Roll opens it, the assist and bought dice are chosen there, and it shows the result until Continue, which
// closes the panel too. A routine action happens at once and its result shows here. UI state only; the attempt itself
// is the 'challenge' action.
// onRecommend(recommendation | null): who is best at the approach, for the party cards to highlight.
// dev: show the raw task details (debug). initialActionId: the approach picked on the object's ring. onClose: the
// panel is done, from Close or by itself once a result has been shown.
// rollSlot: the slot above the object's ring; with it the attempt is the ring's Roll arc (onRollChange), without it
// the Attempt button stays in the panel. onActionChange(actionId | null): the approach
// shown changed. onRollChange({ icon, label, title, enabled, onClick } | null): the ring's Roll arc, once a member
// within reach is picked.
export default function ChallengePanel({
  state,
  objectId,
  initialActionId = null,
  pickedPerformerId = null,
  rollSlot = null,
  onActionChange = () => {},
  onRollChange = () => {},
  dispatch,
  onClose,
  onRecommend = () => {},
  dev = false,
}) {
  const [actionId] = useState(initialActionId)
  const [resultKey, setResultKey] = useState(null)
  // UI state: the roll window is open before the roll.
  const [rolling, setRolling] = useState(false)

  const { scenario } = state
  // A hazard's Neutralize task (world/EnvironmentalHazard.js) is gone once it succeeds: the panel keeps the one it
  // opened with to show the result.
  const found = challengeFor(state, objectId)
  const [opened, setOpened] = useState(found)
  if (found && found !== opened) setOpened(found)
  const challenge = found ?? opened
  const { definition } = challenge
  const object = challenge.runtime(scenario)
  const stateInfo = definition.states[object.state] ?? {}
  const inRangeIds = challenge.membersInRange(state.party).map((member) => member.id)
  const action = challenge.action(actionId)
  const showingResult = resultKey !== null && state.lastTask?.key === resultKey
  const rolledResult = showingResult && Boolean(state.lastTask.result)

  const recommendation = useMemo(() => {
    if (showingResult) return null
    const considered = challengeFor(state, objectId)
    return considered ? recommendationFor(state, considered, considered.action(actionId)) : null
  }, [state, objectId, actionId, showingResult])
  const bestInRange = (recommendation?.bestIds ?? []).find((id) => inRangeIds.includes(id))
  const performer = state.party.members[inRangeIds.includes(pickedPerformerId) ? pickedPerformerId : (bestInRange ?? inRangeIds[0])] ?? null
  const preview = action && performer ? challenge.preview(state, { actionId, performerId: performer.id, assistantId: null, assistIndex: 0 }) : null

  // The party cards highlight the best choice only while an approach is being considered.
  const actionLabel = action?.label
  useEffect(() => {
    onRecommend(recommendation ? { ...recommendation, label: actionLabel } : null)
  }, [recommendation, actionLabel, onRecommend])
  useEffect(() => () => onRecommend(null), [onRecommend])
  useEffect(() => onActionChange(actionId), [actionId, onActionChange])
  useEffect(() => () => onActionChange(null), [onActionChange])

  // The result closes itself; the pointer resting on the panel holds it open (and stops a fade) so it can be read.
  const [hovered, setHovered] = useState(false)
  const [fading, setFading] = useState(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  // A rolled result waits in the roll window for Continue instead.
  useEffect(() => {
    if (!showingResult || rolledResult || hovered) return undefined
    const timer = setTimeout(() => setFading(true), RESULT_HOLD_MS)
    return () => clearTimeout(timer)
  }, [showingResult, rolledResult, hovered])
  useEffect(() => {
    if (!fading) return undefined
    const timer = setTimeout(() => onCloseRef.current(), RESULT_FADE_MS)
    return () => clearTimeout(timer)
  }, [fading])
  const holdOpen = () => {
    setHovered(true)
    setFading(false)
  }
  const fadeClass = fading ? ' is-fading' : ''

  const roll = ({ assistantId, assistIndex, purchase }) => {
    setRolling(false)
    setResultKey(scenario.taskCount)
    dispatch({ type: 'challenge', objectId, actionId, performerId: performer.id, assistantId, assistIndex, purchase })
  }
  const attempt = () => {
    if (action.routine) roll({ assistantId: null, assistIndex: 0, purchase: { bonusDice: 0, momentum: 0 } })
    else setRolling(true)
  }
  const attemptRef = useRef(attempt)
  useEffect(() => {
    attemptRef.current = attempt
  })

  const impossible = Boolean(preview?.prepared && !preview.prepared.possible)
  const attemptButton = action && (
    <button type="button" className="combat-button is-small is-primary" disabled={showingResult || rolling || !performer || impossible} onClick={attempt}>
      {action.routine ? action.label : `Attempt (roll ${TASK_DICE}d20)`}
    </button>
  )

  // The ring's Roll arc: only once someone within reach is picked on its party band.
  const routine = Boolean(action?.routine)
  const ringReady = Boolean(action) && inRangeIds.includes(pickedPerformerId)
  const rollEnabled = ringReady && !showingResult && !rolling && !impossible
  const performerName = performer?.character.name
  const rollTitle = !ringReady
    ? null
    : impossible
      ? `${performerName} can't attempt this (see the panel).`
      : routine
        ? `${action.label}: ${performerName} does it (no roll).`
        : `Roll ${TASK_DICE}d20: ${performerName} attempts ${action.label}.`
  const actionName = action?.label
  useEffect(() => {
    onRollChange(ringReady ? { icon: routine ? 'check' : 'roll', label: routine ? actionName : null, title: rollTitle, enabled: rollEnabled, onClick: () => attemptRef.current() } : null)
  }, [ringReady, routine, actionName, rollTitle, rollEnabled, onRollChange])
  useEffect(() => () => onRollChange(null), [onRollChange])
  const lastTask = state.lastTask
  const rollWindow = rolledResult ? (
    <ResultWindow
      key={lastTask.key}
      title={action?.label ?? definition.name}
      lastTask={lastTask}
      performer={state.party.members[lastTask.performerId]}
      assistant={lastTask.assistantId ? state.party.members[lastTask.assistantId] : null}
      onContinue={onClose}
    />
  ) : (
    rolling &&
    performer &&
    preview?.prepared && (
      <PreRollWindow
        title={action.label}
        performer={performer}
        prepared={preview.prepared}
        assistOptions={assistOptionsFor(state, challenge, actionId, performer.id, inRangeIds)}
        resources={state.resources}
        onRoll={roll}
        onCancel={() => setRolling(false)}
      />
    )
  )

  return (
    <>
    {rollWindow}
    <div
      className={`combat-panel challenge-panel is-docked${fadeClass}`}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerEnter={holdOpen}
      onPointerLeave={() => setHovered(false)}
    >
      <div className="challenge-body">
        <h3>{definition.name}</h3>
        <p className="challenge-state">
          {stateInfo.label ?? object.state}. {stateInfo.description}
        </p>

        {showingResult && (
          <>
            <h4>
              {state.lastTask.routine ? action?.label : `${action?.label}: ${state.party.members[state.lastTask.performerId].character.name}`}
            </h4>
            <TaskResultView
              lastTask={state.lastTask}
              performer={state.party.members[state.lastTask.performerId]}
              assistant={state.lastTask.assistantId ? state.party.members[state.lastTask.assistantId] : null}
              showDice={false}
            />
            {dev && state.lastTask.prepared && (
              <TaskDevDetails
                prepared={state.lastTask.prepared}
                task={{ ...state.lastTask.prepared.task, difficulty: state.lastTask.prepared.difficulty }}
                bonusDice={state.lastTask.bonusDice}
                result={state.lastTask.result}
                rows={[
                  ['Character', state.party.members[state.lastTask.performerId].character.name],
                  ['Action', action?.label],
                ]}
              />
            )}
          </>
        )}

        {!showingResult && !action && <p className="challenge-state">Pick an approach on the ring.</p>}

        {!showingResult && action && (
          <>
            <h4>{action.label}</h4>
            <p className="challenge-state">{action.description}</p>
            {!performer && <p className="challenge-math-blocker">Nobody is close enough.</p>}
            {action.routine && (
              <div className="challenge-math">
                <p className="tm-no-roll">No roll required</p>
                <p className="tm-help">Routine action: it simply happens. Stats matter only when the outcome is uncertain.</p>
              </div>
            )}
            {performer && !action.routine && (
              <>
                <CharacterMath performer={performer} prepared={preview.prepared} assist={null} assistant={null} action={action} />
                {dev && (
                  <TaskDevDetails
                    prepared={preview.prepared}
                    task={{ ...preview.prepared.task, difficulty: preview.prepared.difficulty }}
                    bonusDice={0}
                    rows={[
                      ['Character', performer.character.name],
                      ['Action', `${definition.name}: ${action.label}`],
                    ]}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
      <div className="challenge-actions">
        {!rollSlot && !showingResult && attemptButton}
        <button type="button" className="combat-button is-small" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
    </>
  )
}
