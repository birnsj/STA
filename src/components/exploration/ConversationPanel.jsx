import { useEffect, useMemo, useState } from 'react'
import { getAttributeName, getDisciplineName } from '../../character/runtimeCharacter.js'
import { checkAhead, getNode } from '../../conversation/conversationFormat.js'
import { availableOptions, checkCandidates, currentCheck, recommendCheck } from '../../conversation/conversationRuntime.js'
import { cardFor } from '../../maps/episodeCards.js'
import CombatPortrait from '../combat/CombatPortrait.jsx'
import { CheckResultWindow, CheckRollWindow } from './ConversationRollWindow.jsx'

const firstName = (member) => member.character.name.split(' ')[0]
const usesText = (node) => `${getAttributeName(node.attribute)} + ${getDisciplineName(node.department)}`
const bestText = (recommendation, nameOf) =>
  recommendation.bestIds.map((id) => `${nameOf(id)} (TN ${recommendation.entries[id].targetNumber} · D${recommendation.entries[id].difficulty})`).join(', ')

// Who answers (designer request, 2026-10-11: no picking in the stats window): the member picked on the NPC ring's party
// band before Talk, else the best at the check, else the selected or lead character; only members able to act.
// recommendation: recommendCheck for the check, or null for an option with no check.
function answererId(state, recommendation, pickedPerformerId, defaultPerformerId) {
  const ids = checkCandidates(state).map((member) => member.id)
  return [pickedPerformerId, recommendation?.bestIds[0], defaultPerformerId, ids[0]].find((id) => ids.includes(id)) ?? null
}

// One option of a Player Choice, with the portrait of who would say it on its right (answererId); one that leads
// straight to a check says what it tests and who is best at it.
function OptionButton({ state, option, pickedPerformerId, defaultPerformerId, onChoose }) {
  const check = checkAhead(state.conversation.definition, option.next)
  const recommendation = check ? recommendCheck(state, check) : null
  const speaker = state.party.members[answererId(state, recommendation, pickedPerformerId, defaultPerformerId)]
  return (
    <button type="button" className="challenge-approach conversation-option" onClick={() => onChoose(option.id)}>
      <span className="conversation-option-body">
        <strong>
          {check && <span className="conversation-option-check">[{usesText(check)}] </span>}
          {option.text}
        </strong>
        {check && <span className="challenge-approach-detail">Task Check &middot; Difficulty {check.difficulty}</span>}
        {recommendation?.bestIds.length > 0 && <span className="challenge-approach-best">&#9733; Best: {bestText(recommendation, (id) => firstName(state.party.members[id]))}</span>}
      </span>
      {speaker && (
        <span className="conversation-option-speaker" title={speaker.character.name}>
          <CombatPortrait character={speaker.character} className="conversation-option-portrait" />
        </span>
      )}
    </button>
  )
}

// The conversation with an NPC in exploration (conversation/conversationRuntime.js): the NPC's line and the player's
// options. A Task Check is rolled, and its result shown, in the roll window (designer request, 2026-10-15). UI state
// only; every step is an exploration action.
// onRecommend(recommendation | null): who is best at the check being answered, for the party cards to highlight.
// pickedPerformerId: who the player picked on the NPC ring before Talk (answers every check they can), or null.
export default function ConversationPanel({ state, dispatch, defaultPerformerId, pickedPerformerId = null, onRecommend = () => {}, dev = false }) {
  const conversation = state.conversation
  const npc = state.world.npcs[conversation.npcId]
  const episodeCard = cardFor(state.party.map.card)?.image ?? null
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

  // The latest roll stays in the window until Continue; a check that follows straight on opens after it.
  const [seenCheckKey, setSeenCheckKey] = useState(null)
  const showingResult = Boolean(lastCheck?.result) && lastCheck.key !== seenCheckKey
  const performer = check ? (state.party.members[answererId(state, recommendation, pickedPerformerId, defaultPerformerId)] ?? null) : null

  return (
    <>
      <div className="conversation-dock" onPointerDown={(event) => event.stopPropagation()}>
        <div className="combat-panel challenge-panel conversation-panel">
          {dev && <p className="challenge-state">{conversation.definition.name} &middot; node {conversation.nodeId ?? 'end'}</p>}

          {conversation.line && (
            <>
              <div className="conversation-line">
                <div className="conversation-line-body">
                  <p className="conversation-speaker">{conversation.line.speaker}</p>
                  <p className="conversation-text">{conversation.line.text}</p>
                </div>
                {npc?.character && (
                  <CombatPortrait character={npc.character} className="conversation-npc-portrait" style={episodeCard ? { backgroundImage: `url("${episodeCard}")` } : undefined} />
                )}
              </div>
              <div className="conversation-separator" role="separator" />
            </>
          )}

          {conversation.choiceId && (
            <div className="conversation-options">
              {options.map((option) => (
                <OptionButton
                  key={option.id}
                  state={state}
                  option={option}
                  pickedPerformerId={pickedPerformerId}
                  defaultPerformerId={defaultPerformerId}
                  onChoose={(optionId) => dispatch({ type: 'conversationChoose', optionId })}
                />
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
      </div>

      {showingResult ? (
        <CheckResultWindow key={lastCheck.key} state={state} lastCheck={lastCheck} onContinue={() => setSeenCheckKey(lastCheck.key)} />
      ) : (
        check && performer && <CheckRollWindow key={`${check.id}:${state.scenario.taskCount}`} state={state} node={check} performer={performer} dispatch={dispatch} />
      )}
    </>
  )
}
