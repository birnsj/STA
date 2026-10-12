import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getAttributeName, getDisciplineName } from '../../character/runtimeCharacter.js'
import { getMembers } from '../../exploration/partyControl.js'
import { MAX_MOMENTUM } from '../../rules/missionResources.js'
import { isDefeated } from '../../rules/personalCondition.js'
import { TASK_DICE } from '../../rules/taskResolver.js'
import { objectFor } from '../../world/objects.js'
import { criticalText, dieVerdict, formulaText } from '../task/taskText.js'
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

function Die({ die, label = null }) {
  const verdict = dieVerdict(die)
  return (
    <div className={`challenge-die is-${verdict.kind}`}>
      <span className="challenge-die-face">{die.value}</span>
      <span className="challenge-die-tag">{verdict.text}</span>
      {label && <span className="challenge-die-owner">{label}</span>}
    </div>
  )
}

// Each die rolled and what it scored, the assistant's last.
export function RolledDice({ result, performer, assistant }) {
  return (
    <div className="challenge-dice">
      {result.dice.map((die, index) => (
        <Die key={`d${index}`} die={die} label={firstName(performer)} />
      ))}
      {result.assist && <Die die={result.assist} label={`${firstName(assistant)} (TN ${result.assist.targetNumber})`} />}
    </div>
  )
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

// The stats and log of one challenge-object approach: the math before the roll, then the result. The object's ring
// picks the approach and its party band who attempts it (pickedPerformerId; else the best within reach); there is no
// assist and no bought dice. UI state only; the attempt itself is the 'challenge' action.
// onRecommend(recommendation | null): who is best at the approach, for the party cards to highlight.
// dev: show the raw task details (debug). initialActionId: the approach picked on the object's ring. onClose: the
// panel is done, from Close or by itself once a result has been shown.
// rollSlot: the element of the slot above the object's ring, where the Attempt button and the dice go (until it
// exists the Attempt button stays in the panel). onActionChange(actionId | null): the approach shown changed.
export default function ChallengePanel({
  state,
  objectId,
  initialActionId = null,
  pickedPerformerId = null,
  rollSlot = null,
  onActionChange = () => {},
  dispatch,
  onClose,
  onRecommend = () => {},
  dev = false,
}) {
  const [actionId] = useState(initialActionId)
  const [resultKey, setResultKey] = useState(null)

  const { scenario } = state
  const challenge = objectFor(scenario, objectId)
  const { definition } = challenge
  const object = challenge.runtime(scenario)
  const stateInfo = definition.states[object.state] ?? {}
  const inRangeIds = challenge.membersInRange(state.party).map((member) => member.id)
  const action = challenge.action(actionId)
  const showingResult = resultKey !== null && state.lastTask?.key === resultKey

  const recommendation = useMemo(() => {
    if (showingResult) return null
    const considered = objectFor(state.scenario, objectId)
    return recommendationFor(state, considered, considered.action(actionId))
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
  useEffect(() => {
    if (!showingResult || hovered) return undefined
    const timer = setTimeout(() => setFading(true), RESULT_HOLD_MS)
    return () => clearTimeout(timer)
  }, [showingResult, hovered])
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

  const attempt = () => {
    setResultKey(scenario.taskCount)
    dispatch({ type: 'challenge', objectId, actionId, performerId: performer.id, assistantId: null, assistIndex: 0, purchase: { bonusDice: 0, momentum: 0 } })
  }

  const attemptButton = action && (
    <button type="button" className="combat-button is-small is-primary" disabled={!performer || (preview?.prepared && !preview.prepared.possible)} onClick={attempt}>
      {action.routine ? action.label : `Attempt (roll ${TASK_DICE}d20)`}
    </button>
  )
  const lastRoll = showingResult ? state.lastTask : null
  const ringRoll =
    rollSlot &&
    createPortal(
      <div className={`ring-roll${fadeClass}`} onPointerDown={(event) => event.stopPropagation()}>
        {lastRoll?.result && (
          <>
            <RolledDice
              result={lastRoll.result}
              performer={state.party.members[lastRoll.performerId]}
              assistant={lastRoll.assistantId ? state.party.members[lastRoll.assistantId] : null}
            />
            <p className={`ring-roll-outcome ${lastRoll.result.success ? 'is-success' : 'is-failure'}`}>{lastRoll.result.success ? 'Success' : 'Failure'}</p>
          </>
        )}
        {!showingResult && attemptButton}
      </div>,
      rollSlot,
    )

  return (
    <div
      className={`combat-panel challenge-panel is-docked${fadeClass}`}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerEnter={holdOpen}
      onPointerLeave={() => setHovered(false)}
    >
      {ringRoll}
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
              showDice={!rollSlot}
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
  )
}
