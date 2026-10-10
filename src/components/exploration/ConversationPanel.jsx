import { useEffect, useMemo, useState } from 'react'
import { getAttributeName, getDisciplineName } from '../../character/runtimeCharacter.js'
import { checkAhead, getNode } from '../../conversation/conversationFormat.js'
import { availableOptions, checkCandidates, checkSpec, currentCheck, previewCheck, recommendCheck } from '../../conversation/conversationRuntime.js'
import { checkDicePurchase } from '../../rules/missionResources.js'
import BonusDicePicker from '../BonusDicePicker.jsx'
import { TaskDevDetails } from '../task/TaskMath.jsx'
import { CharacterMath, TaskResultView } from './ChallengePanel.jsx'

const firstName = (member) => member.character.name.split(' ')[0]
const usesText = (node) => `${getAttributeName(node.attribute)} + ${getDisciplineName(node.department)}`
const bestText = (recommendation, nameOf) =>
  recommendation.bestIds.map((id) => `${nameOf(id)} (TN ${recommendation.entries[id].targetNumber} · D${recommendation.entries[id].difficulty})`).join(', ')

// A Task Check waiting on the player: who answers (anyone in the away team able to act; the best highlighted), the
// math for that character, bonus dice, and the roll.
function CheckView({ state, node, recommendation, defaultPerformerId, dispatch, dev }) {
  const [performerId, setPerformerId] = useState(null)
  const [dicePurchase, setDicePurchase] = useState({ bonusDice: 0, momentum: 0 })
  const candidates = checkCandidates(state)
  const ids = candidates.map((member) => member.id)
  const pick = [performerId, recommendation.bestIds[0], defaultPerformerId, ids[0]].find((id) => ids.includes(id))
  const performer = state.party.members[pick] ?? null
  const prepared = performer ? previewCheck(state, node, performer.id) : null
  const purchase = { bonusDice: dicePurchase.bonusDice, momentum: Math.min(dicePurchase.momentum, state.resources.momentum) }
  const purchaseCheck = checkDicePurchase(state.resources, purchase)
  const best = recommendation.bestIds
  return (
    <>
      <h4>
        {node.label || 'Task Check'}: {usesText(node)} &middot; Difficulty {node.difficulty}
      </h4>
      {best.length > 0 && <p className="challenge-approach-best">&#9733; Best: {bestText(recommendation, (id) => firstName(state.party.members[id]))}</p>}
      <div className="challenge-pick">
        <span>Who answers</span>
        <div className="challenge-pick-options">
          {candidates.map((member) => {
            const entry = recommendation.entries[member.id]
            return (
              <button
                key={member.id}
                type="button"
                className={`combat-button is-small challenge-performer${best.includes(member.id) ? ' is-best' : ''}`}
                aria-pressed={member.id === performer?.id}
                title={entry ? `TN ${entry.targetNumber}, Difficulty ${entry.difficulty}${entry.focus ? `, Focus ${entry.focus}` : ', no applicable Focus'}` : ''}
                onClick={() => setPerformerId(member.id)}
              >
                {best.includes(member.id) ? '★ ' : ''}
                {firstName(member)} {entry?.targetNumber != null ? `TN ${entry.targetNumber} · D${entry.difficulty}` : ''}
                {entry?.focus ? ' · Focus' : ''}
              </button>
            )
          })}
        </div>
      </div>
      {performer && (
        <>
          <CharacterMath performer={performer} prepared={prepared} assist={null} assistant={null} action={{ task: checkSpec(node) }} />
          <BonusDicePicker resources={state.resources} value={purchase} onChange={setDicePurchase} />
          {dev && (
            <TaskDevDetails
              prepared={prepared}
              task={{ ...prepared.task, difficulty: prepared.difficulty }}
              bonusDice={purchase.bonusDice}
              rows={[
                ['Character', performer.character.name],
                ['Check', `${node.id}: ${node.label}`],
              ]}
            />
          )}
        </>
      )}
      <div className="challenge-actions">
        <button
          type="button"
          className="combat-button is-small is-primary"
          disabled={!performer || !prepared?.possible || !purchaseCheck.valid}
          onClick={() => dispatch({ type: 'conversationRoll', performerId: performer.id, purchase })}
        >
          Roll {purchaseCheck.dice}d20
        </button>
      </div>
    </>
  )
}

// One option of a Player Choice; one that leads straight to a check says what it tests and who is best at it.
function OptionButton({ state, option, onChoose }) {
  const check = checkAhead(state.conversation.definition, option.next)
  const recommendation = check ? recommendCheck(state, check) : null
  return (
    <button type="button" className="challenge-approach conversation-option" onClick={() => onChoose(option.id)}>
      <strong>
        {check && <span className="conversation-option-check">[{usesText(check)}] </span>}
        {option.text}
      </strong>
      {check && <span className="challenge-approach-detail">Task Check &middot; Difficulty {check.difficulty}</span>}
      {recommendation?.bestIds.length > 0 && <span className="challenge-approach-best">&#9733; Best: {bestText(recommendation, (id) => firstName(state.party.members[id]))}</span>}
    </button>
  )
}

// The conversation with an NPC in exploration (conversation/conversationRuntime.js): the NPC's line, the player's
// options, a Task Check's roll and its result. UI state only; every step is an exploration action.
// onRecommend(recommendation | null): who is best at the check being answered, for the party cards to highlight.
export default function ConversationPanel({ state, dispatch, defaultPerformerId, onRecommend = () => {}, dev = false }) {
  const conversation = state.conversation
  const npc = state.world.npcs[conversation.npcId]
  const node = conversation.nodeId ? getNode(conversation.definition, conversation.nodeId) : null
  const check = currentCheck(state)
  const options = availableOptions(state)
  const { lastCheck } = conversation
  const recommendation = useMemo(() => (check ? recommendCheck(state, check) : null), [state, check])

  const checkLabel = check?.label || (check ? 'Task Check' : null)
  useEffect(() => {
    onRecommend(recommendation ? { ...recommendation, label: checkLabel } : null)
  }, [recommendation, checkLabel, onRecommend])
  useEffect(() => () => onRecommend(null), [onRecommend])

  const leave = () => dispatch({ type: 'conversationLeave' })
  const canContinue = !conversation.ended && node?.type === 'npc' && !conversation.choiceId

  return (
    <div className="combat-panel challenge-panel conversation-panel" onPointerDown={(event) => event.stopPropagation()}>
      <div className="challenge-header">
        <div>
          <h3>{npc?.name ?? 'Conversation'}</h3>
          {dev && <p className="challenge-state">{conversation.definition.name} &middot; node {conversation.nodeId ?? 'end'}</p>}
        </div>
        <button type="button" className="combat-button is-small" onClick={leave}>
          {conversation.ended ? 'Close' : 'Leave'}
        </button>
      </div>

      {lastCheck && (
        <div className="conversation-check-result">
          <h4>
            {lastCheck.label || 'Task Check'}: {state.party.members[lastCheck.performerId]?.character.name}
          </h4>
          <TaskResultView lastTask={lastCheck} performer={state.party.members[lastCheck.performerId]} assistant={null} />
        </div>
      )}

      {conversation.line && (
        <div className="conversation-line">
          <p className="conversation-speaker">{conversation.line.speaker}</p>
          <p className="conversation-text">{conversation.line.text}</p>
        </div>
      )}

      {check && <CheckView key={check.id} state={state} node={check} recommendation={recommendation} defaultPerformerId={defaultPerformerId} dispatch={dispatch} dev={dev} />}

      {conversation.choiceId && (
        <div className="conversation-options">
          {options.map((option) => (
            <OptionButton key={option.id} state={state} option={option} onChoose={(optionId) => dispatch({ type: 'conversationChoose', optionId })} />
          ))}
          {!options.length && <p className="challenge-state">Nothing more to say.</p>}
        </div>
      )}

      {(canContinue || conversation.ended) && (
        <div className="challenge-actions">
          <button type="button" className="combat-button is-small is-primary" onClick={canContinue ? () => dispatch({ type: 'conversationContinue' }) : leave}>
            {canContinue ? 'Continue' : 'End conversation'}
          </button>
        </div>
      )}
    </div>
  )
}
