import { useState } from 'react'
import { getAvailableActions, getDefinition, membersInRange, previewChallenge } from '../../exploration/challengeObjects.js'
import { getMembers } from '../../exploration/partyControl.js'
import { prepareAssist } from '../../rules/taskPreparation.js'

const signed = (value) => (value > 0 ? `+${value}` : `${value}`)
const firstName = (member) => member.character.name.split(' ')[0]
const complicationText = (task) => (task.complicationRange > 1 ? `${21 - task.complicationRange}-20` : '20')
const criticalText = (task) => (task.criticalRange > 1 ? `at or under ${task.criticalRange}` : 'on a 1')

// One approach in the list: what it uses and how hard it is, or why it can't be tried right now.
function ApproachButton({ entry, onChoose }) {
  const { action, available, reason } = entry
  const detail = action.routine ? 'No task needed' : `${action.task.attribute} + ${action.task.department} · Difficulty ${action.task.difficulty}`
  return (
    <button type="button" className="challenge-approach" disabled={!available} onClick={() => onChoose(action.id)}>
      <strong>{action.label}</strong>
      <span className="challenge-approach-detail">{detail}</span>
      <span className="challenge-approach-description">{reason ?? action.description}</span>
    </button>
  )
}

// The math that decides the task, before the roll: what the player is shown to confirm the attempt.
function CharacterMath({ performer, prepared, assist, assistant, action }) {
  const { task } = prepared
  return (
    <div className="challenge-math">
      <div className="challenge-math-row">
        <span>{task.attribute.name}</span>
        <b>{task.attribute.value}</b>
      </div>
      <div className="challenge-math-row">
        <span>{task.department.name}</span>
        <b>{task.department.value}</b>
      </div>
      <div className="challenge-math-row is-total">
        <span>Target Number</span>
        <b>{task.targetNumber}</b>
      </div>
      <div className="challenge-math-group">
        <div className="challenge-math-row is-total">
          <span>Difficulty</span>
          <b>{prepared.difficulty}</b>
        </div>
        {prepared.difficultyLines.map((line) => (
          <div key={line.label} className="challenge-math-row is-detail">
            <span>{line.label}</span>
            <b>{line.label.startsWith('Base') ? line.change : signed(line.change)}</b>
          </div>
        ))}
      </div>
      <p className="challenge-math-note">
        Focus: {prepared.focus ? <b>{prepared.focus}</b> : 'none that applies'}. Critical success (2 successes) {criticalText(task)}.
        {!prepared.focus && action.task.focuses?.length > 0 && <span className="challenge-math-hint"> Applicable focuses: {action.task.focuses.join(', ')}.</span>}
      </p>
      <p className="challenge-math-note">Complication on a roll of {complicationText(task)}.</p>
      <p className="challenge-math-note">
        Equipment: {prepared.equipment.length ? prepared.equipment.map((item) => `${item.name} (${item.note})`).join('; ') : 'nothing that applies'}.
      </p>
      {prepared.effects.map((effect) => (
        <p key={`${effect.source}${effect.name}${effect.note}`} className={`challenge-math-note ${effect.applied ? '' : 'is-inactive'}`}>
          {effect.source}: {effect.name}: {effect.note}.
        </p>
      ))}
      {prepared.blockers.map((blocker) => (
        <p key={blocker} className="challenge-math-blocker">
          {firstName(performer)} can't attempt this: {blocker}.
        </p>
      ))}
      <p className="challenge-math-note is-assist">
        {assist
          ? `${assistant.character.name} assists (${assist.approach.label}): ${assist.task.attribute.name} ${assist.task.attribute.value} + ${assist.task.department.name} ${assist.task.department.value} = Target Number ${assist.task.targetNumber}, rolling 1d20${assist.focus ? `, focus ${assist.focus} (critical ${criticalText(assist.task)})` : ''}. Their successes count only if ${firstName(performer)} scores at least one.`
          : 'No assistant.'}
      </p>
    </div>
  )
}

function Die({ die, label = null }) {
  const classes = ['challenge-die', die.successes ? 'is-success' : 'is-miss', die.critical ? 'is-critical' : '', die.complication ? 'is-complication' : ''].filter(Boolean).join(' ')
  return (
    <div className={classes}>
      <span className="challenge-die-face">{die.value}</span>
      <span className="challenge-die-tag">
        {die.complication ? 'Complication' : die.critical ? 'Critical: 2' : die.successes ? 'Success: 1' : 'No success'}
      </span>
      {label && <span className="challenge-die-owner">{label}</span>}
    </div>
  )
}

// What happened: the dice, the count against the Difficulty, Momentum and complications, and the object's outcome.
function TaskResultView({ lastTask, performer, assistant }) {
  const { result, messages } = lastTask
  if (!result) {
    return (
      <div className="challenge-result is-success">
        <p className="challenge-result-verdict">Done</p>
        {messages.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </div>
    )
  }
  return (
    <div className={`challenge-result ${result.success ? 'is-success' : 'is-failure'}`}>
      <p className="challenge-result-line">
        Target Number {result.targetNumber} · Difficulty {result.difficulty}
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
      <p className="challenge-result-verdict">
        {result.successes} success{result.successes === 1 ? '' : 'es'} vs Difficulty {result.difficulty}: {result.success ? 'SUCCESS' : 'FAILURE'}
      </p>
      {result.success && (
        <p className="challenge-result-line">
          Momentum generated: {result.momentumGenerated}
          {result.bonusMomentum ? ` (+${result.bonusMomentum} bonus)` : ''}. Recorded in the task log; there is no Momentum pool to bank it in yet.
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
export default function ChallengePanel({ state, objectId, defaultPerformerId, dispatch, onClose }) {
  const [actionId, setActionId] = useState(null)
  const [performerId, setPerformerId] = useState(null)
  const [assistantId, setAssistantId] = useState(null)
  const [assistIndex, setAssistIndex] = useState(0)
  const [resultKey, setResultKey] = useState(null)

  const { scenario } = state
  const definition = getDefinition(scenario, objectId)
  const object = scenario.objects[objectId]
  const stateInfo = definition.states[object.state] ?? {}
  const entries = getAvailableActions(state, objectId)
  const inRange = membersInRange(state.party, definition)
  const inRangeIds = inRange.map((member) => member.id)
  const action = definition.actions.find((candidate) => candidate.id === actionId) ?? null
  const showingResult = resultKey !== null && state.lastTask?.key === resultKey

  const performer = state.party.members[inRangeIds.includes(performerId) ? performerId : inRangeIds.includes(defaultPerformerId) ? defaultPerformerId : inRangeIds[0]] ?? null
  const assistant = assistantId && assistantId !== performer?.id && inRangeIds.includes(assistantId) ? state.party.members[assistantId] : null
  const approachIndex = action?.assist?.[assistIndex] ? assistIndex : 0
  const preview = action && performer ? previewChallenge(state, { objectId, actionId, performerId: performer.id, assistantId: assistant && action.assist ? assistant.id : null, assistIndex: approachIndex }) : null

  const back = () => {
    setActionId(null)
    setResultKey(null)
  }
  const attempt = () => {
    setResultKey(scenario.taskCount)
    dispatch({ type: 'challenge', objectId, actionId, performerId: performer.id, assistantId: assistant && action.assist ? assistant.id : null, assistIndex: approachIndex })
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
          {entries.length ? entries.map((entry) => <ApproachButton key={entry.action.id} entry={entry} onChoose={setActionId} />) : <p className="challenge-state">Nothing to do here right now.</p>}
        </>
      )}

      {!showingResult && action && (
        <>
          <h4>{action.label}</h4>
          <p className="challenge-state">{action.description}</p>
          {!performer && <p className="challenge-math-blocker">Nobody is close enough.</p>}
          {performer && !action.routine && (
            <>
              <div className="challenge-pick">
                <span>Who attempts it</span>
                <div className="challenge-pick-options">
                  {getMembers(state.party).map((member) => {
                    const reachable = inRangeIds.includes(member.id)
                    const shown = reachable ? previewChallenge(state, { objectId, actionId, performerId: member.id }).prepared : null
                    return (
                      <button key={member.id} type="button" className="combat-button is-small" aria-pressed={member.id === performer.id} disabled={!reachable} title={reachable ? '' : 'Too far away'} onClick={() => setPerformerId(member.id)}>
                        {firstName(member)} {shown ? `TN ${shown.task.targetNumber}${shown.focus ? ' ★' : ''}` : '(too far)'}
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
                          {firstName(member)} TN {prepareAssist(member.character, action.assist[approachIndex]).task.targetNumber}
                        </button>
                      ))}
                  </div>
                ) : (
                  <span className="challenge-math-hint">No one can help with this approach.</span>
                )}
              </div>
              {assistant && action.assist.length > 1 && (
                <div className="challenge-pick">
                  <span>How they help</span>
                  <div className="challenge-pick-options">
                    {action.assist.map((approach, index) => (
                      <button key={approach.label} type="button" className="combat-button is-small" aria-pressed={index === approachIndex} onClick={() => setAssistIndex(index)}>
                        {approach.label} ({approach.attribute} + {approach.department})
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <CharacterMath performer={performer} prepared={preview.prepared} assist={preview.assist} assistant={assistant} action={action} />
            </>
          )}
          <div className="challenge-actions">
            <button type="button" className="combat-button is-small" onClick={back}>
              Back
            </button>
            <button type="button" className="combat-button is-small is-primary" disabled={!performer || (preview?.prepared && !preview.prepared.possible)} onClick={attempt}>
              {action.routine ? action.label : 'Attempt (roll 2d20)'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
