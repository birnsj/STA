import { useEffect, useMemo, useState } from 'react'
import { getAttributeName, getDisciplineName } from '../../character/runtimeCharacter.js'
import { getAvailableActions, getDefinition, membersInRange, previewChallenge } from '../../exploration/challengeObjects.js'
import { getMembers } from '../../exploration/partyControl.js'
import { checkDicePurchase, MAX_MOMENTUM } from '../../rules/missionResources.js'
import { isDefeated } from '../../rules/personalCondition.js'
import { recommendPerformers } from '../../rules/taskRecommendation.js'
import { prepareAssist } from '../../rules/taskPreparation.js'
import BonusDicePicker from '../BonusDicePicker.jsx'
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

const firstName = (member) => member.character.name.split(' ')[0]
const usesText = (task) => `${getAttributeName(task.attribute)} + ${getDisciplineName(task.department)}`

// Every party member able to act, judged on this approach with the same task preparation the roll would use.
function recommendationFor(state, objectId, action) {
  if (!action || action.routine) return null
  const members = getMembers(state.party).filter((member) => !isDefeated(member.condition))
  return recommendPerformers(members.map((member) => ({ id: member.id, prepared: previewChallenge(state, { objectId, actionId: action.id, performerId: member.id }).prepared })))
}

// One approach in the list: what it uses and how hard it is (or that it needs no roll), who is best at it, or why it
// can't be tried right now.
function ApproachButton({ entry, recommendation, nameOf, onChoose }) {
  const { action, available, reason } = entry
  const best = recommendation?.bestIds ?? []
  return (
    <button type="button" className="challenge-approach" disabled={!available} onClick={() => onChoose(action.id)}>
      <strong>{action.label}</strong>
      <span className="challenge-approach-detail">{action.routine ? 'No roll required' : `${usesText(action.task)} · Difficulty ${action.task.difficulty}`}</span>
      {best.length > 0 && (
        <span className="challenge-approach-best">
          &#9733; Best: {best.map((id) => `${nameOf(id)} (TN ${recommendation.entries[id].targetNumber} · D${recommendation.entries[id].difficulty})`).join(', ')}
        </span>
      )}
      <span className="challenge-approach-description">{reason ?? action.description}</span>
    </button>
  )
}

// The math that decides the task, before the roll, for the chosen performer: what the player confirms.
function CharacterMath({ performer, prepared, assist, assistant, action }) {
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

// What happened: the task as rolled, each die and what it scored, the count against the Difficulty, Momentum and
// complications, and the object's outcome.
function TaskResultView({ lastTask, performer, assistant }) {
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
      <div className="challenge-dice">
        {result.dice.map((die, index) => (
          <Die key={`d${index}`} die={die} label={firstName(performer)} />
        ))}
        {result.assist && <Die die={result.assist} label={`${firstName(assistant)} (TN ${result.assist.targetNumber})`} />}
      </div>
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

// The interaction with one challenge object: choose an approach, who attempts it and who (if anyone) assists, see
// the math, confirm, see the dice and the outcome. UI state only; the attempt itself is the 'challenge' action.
// onRecommend(recommendation | null): who is best at the approach being considered, for the party cards to highlight.
// dev: show the raw task details (debug).
export default function ChallengePanel({ state, objectId, defaultPerformerId, dispatch, onClose, onRecommend = () => {}, dev = false }) {
  const [actionId, setActionId] = useState(null)
  const [performerId, setPerformerId] = useState(null)
  const [assistantId, setAssistantId] = useState(null)
  const [assistIndex, setAssistIndex] = useState(0)
  const [resultKey, setResultKey] = useState(null)
  const [dicePurchase, setDicePurchase] = useState({ bonusDice: 0, momentum: 0 })

  const { scenario } = state
  const definition = getDefinition(scenario, objectId)
  const object = scenario.objects[objectId]
  const stateInfo = definition.states[object.state] ?? {}
  const entries = getAvailableActions(state, objectId)
  const inRange = membersInRange(state.party, definition)
  const inRangeIds = inRange.map((member) => member.id)
  const action = definition.actions.find((candidate) => candidate.id === actionId) ?? null
  const showingResult = resultKey !== null && state.lastTask?.key === resultKey
  const nameOf = (id) => firstName(state.party.members[id])

  const performer = state.party.members[inRangeIds.includes(performerId) ? performerId : inRangeIds.includes(defaultPerformerId) ? defaultPerformerId : inRangeIds[0]] ?? null
  const assistant = assistantId && assistantId !== performer?.id && inRangeIds.includes(assistantId) ? state.party.members[assistantId] : null
  const approachIndex = action?.assist?.[assistIndex] ? assistIndex : 0
  const preview = action && performer ? previewChallenge(state, { objectId, actionId, performerId: performer.id, assistantId: assistant && action.assist ? assistant.id : null, assistIndex: approachIndex }) : null
  const recommendation = useMemo(() => {
    if (showingResult) return null
    const considered = getDefinition(state.scenario, objectId).actions.find((candidate) => candidate.id === actionId) ?? null
    return recommendationFor(state, objectId, considered)
  }, [state, objectId, actionId, showingResult])

  // The party cards highlight the best choice only while an approach is being considered.
  const actionLabel = action?.label
  useEffect(() => {
    onRecommend(recommendation ? { ...recommendation, label: actionLabel } : null)
  }, [recommendation, actionLabel, onRecommend])
  useEffect(() => () => onRecommend(null), [onRecommend])

  // The pool can change after the choice, so the Momentum part never exceeds what it holds now.
  const purchase = { bonusDice: dicePurchase.bonusDice, momentum: Math.min(dicePurchase.momentum, state.resources.momentum) }
  const purchaseCheck = checkDicePurchase(state.resources, purchase)

  const back = () => {
    setActionId(null)
    setResultKey(null)
    setDicePurchase({ bonusDice: 0, momentum: 0 })
  }
  const attempt = () => {
    setResultKey(scenario.taskCount)
    dispatch({ type: 'challenge', objectId, actionId, performerId: performer.id, assistantId: assistant && action.assist ? assistant.id : null, assistIndex: approachIndex, purchase })
    setDicePurchase({ bonusDice: 0, momentum: 0 })
  }

  return (
    <div className="combat-panel challenge-panel" onPointerDown={(event) => event.stopPropagation()}>
      <div className="challenge-header">
        <div>
          <h3>{definition.name}</h3>
          <p className="challenge-state">
            {stateInfo.label ?? object.state}. {stateInfo.description}
          </p>
        </div>
        <button type="button" className="combat-button is-small" onClick={onClose}>
          Close
        </button>
      </div>

      {showingResult && (
        <>
          <h4>
            {state.lastTask.routine ? action?.label : `${action?.label}: ${state.party.members[state.lastTask.performerId].character.name}`}
          </h4>
          <TaskResultView lastTask={state.lastTask} performer={state.party.members[state.lastTask.performerId]} assistant={state.lastTask.assistantId ? state.party.members[state.lastTask.assistantId] : null} />
          {dev && state.lastTask.prepared && (
            <TaskDevDetails
              prepared={state.lastTask.prepared}
              task={{ ...state.lastTask.prepared.task, difficulty: state.lastTask.prepared.difficulty }}
              bonusDice={state.lastTask.bonusDice}
              result={state.lastTask.result}
              rows={[
                ['Character', state.party.members[state.lastTask.performerId].character.name],
                ['Action', action?.label],
                ['Momentum spent on dice', state.lastTask.momentumSpentOnDice],
                ['Threat added for dice', state.lastTask.threatAddedForDice],
              ]}
            />
          )}
          <div className="challenge-actions">
            <button type="button" className="combat-button is-small" onClick={back}>
              Other approaches
            </button>
            <button type="button" className="combat-button is-small is-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}

      {!showingResult && !action && (
        <>
          <h4>Approaches</h4>
          {entries.length ? (
            entries.map((entry) => <ApproachButton key={entry.action.id} entry={entry} recommendation={recommendationFor(state, objectId, entry.action)} nameOf={nameOf} onChoose={setActionId} />)
          ) : (
            <p className="challenge-state">Nothing to do here right now.</p>
          )}
        </>
      )}

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
              <div className="challenge-pick">
                <span>Who attempts it</span>
                <div className="challenge-pick-options">
                  {getMembers(state.party).map((member) => {
                    const reachable = inRangeIds.includes(member.id)
                    const entry = recommendation?.entries[member.id]
                    return (
                      <button
                        key={member.id}
                        type="button"
                        className="combat-button is-small challenge-performer"
                        aria-pressed={member.id === performer.id}
                        disabled={!reachable}
                        title={reachable ? (entry ? `TN ${entry.targetNumber}, Difficulty ${entry.difficulty}${entry.focus ? `, Focus ${entry.focus}` : ', no applicable Focus'}` : '') : 'Too far away: move closer to attempt it'}
                        onClick={() => setPerformerId(member.id)}
                      >
                        {firstName(member)} {entry?.targetNumber != null ? `TN ${entry.targetNumber} · D${entry.difficulty}` : ''}
                        {entry?.focus ? ' · Focus' : ''}
                        {!reachable && ' (too far)'}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="challenge-pick">
                <span>Assist</span>
                {action.assist ? (
                  <div className="challenge-pick-options">
                    <button type="button" className="combat-button is-small" aria-pressed={!assistant} onClick={() => setAssistantId(null)}>
                      No assistant
                    </button>
                    {inRange
                      .filter((member) => member.id !== performer.id)
                      .map((member) => (
                        <button key={member.id} type="button" className="combat-button is-small" aria-pressed={assistant?.id === member.id} onClick={() => setAssistantId(member.id)}>
                          {firstName(member)} TN {prepareAssist(member.character, action.assist[approachIndex], member.condition).task.targetNumber}
                        </button>
                      ))}
                  </div>
                ) : (
                  <span className="tm-help">No one can help with this approach.</span>
                )}
              </div>
              {assistant && action.assist.length > 1 && (
                <div className="challenge-pick">
                  <span>How they help</span>
                  <div className="challenge-pick-options">
                    {action.assist.map((approach, index) => (
                      <button key={approach.label} type="button" className="combat-button is-small" aria-pressed={index === approachIndex} onClick={() => setAssistIndex(index)}>
                        {approach.label} ({usesText(approach)})
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <CharacterMath performer={performer} prepared={preview.prepared} assist={preview.assist} assistant={assistant} action={action} />
              <BonusDicePicker resources={state.resources} value={purchase} onChange={setDicePurchase} />
              {dev && (
                <TaskDevDetails
                  prepared={preview.prepared}
                  task={{ ...preview.prepared.task, difficulty: preview.prepared.difficulty }}
                  bonusDice={purchase.bonusDice}
                  rows={[
                    ['Character', performer.character.name],
                    ['Action', `${definition.name}: ${action.label}`],
                    ['Momentum cost (dice)', purchaseCheck.momentum ?? 0],
                    ['Threat cost (dice)', purchaseCheck.threatAdded ?? 0],
                  ]}
                />
              )}
            </>
          )}
          <div className="challenge-actions">
            <button type="button" className="combat-button is-small" onClick={back}>
              Back
            </button>
            <button
              type="button"
              className="combat-button is-small is-primary"
              disabled={!performer || (preview?.prepared && !preview.prepared.possible) || (!action.routine && !purchaseCheck.valid)}
              onClick={attempt}
            >
              {action.routine ? action.label : `Attempt (roll ${purchaseCheck.dice}d20)`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
