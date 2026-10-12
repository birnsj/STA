import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getAttributeName, getDisciplineName } from '../../character/runtimeCharacter.js'
import { checkAhead, getNode } from '../../conversation/conversationFormat.js'
import { availableOptions, checkCandidates, checkSpec, currentCheck, previewCheck, recommendCheck } from '../../conversation/conversationRuntime.js'
import { cardFor } from '../../maps/episodeCards.js'
import { checkDicePurchase } from '../../rules/missionResources.js'
import BonusDicePicker from '../BonusDicePicker.jsx'
import CombatPortrait from '../combat/CombatPortrait.jsx'
import { TaskDevDetails } from '../task/TaskMath.jsx'
import { CharacterMath, RESULT_FADE_MS, RESULT_HOLD_MS, RolledDice, TaskResultView } from './ChallengePanel.jsx'

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

// A Task Check waiting on the player: the math for whoever answers (answererId), bonus dice, and the roll.
// rollSlot: the element above the conversation box, where the Roll button goes; bonusSlot: the element in the box, under
// the NPC's line, where the bonus dice picker goes (each here until it exists).
function CheckView({ state, node, recommendation, defaultPerformerId, pickedPerformerId, rollSlot, bonusSlot, dispatch, dev }) {
  const [dicePurchase, setDicePurchase] = useState({ bonusDice: 0, momentum: 0 })
  const performer = state.party.members[answererId(state, recommendation, pickedPerformerId, defaultPerformerId)] ?? null
  const prepared = performer ? previewCheck(state, node, performer.id) : null
  const purchase = { bonusDice: dicePurchase.bonusDice, momentum: Math.min(dicePurchase.momentum, state.resources.momentum) }
  const purchaseCheck = checkDicePurchase(state.resources, purchase)
  const best = recommendation.bestIds
  const rollButton = (
    <button
      type="button"
      className="combat-button is-primary"
      disabled={!performer || !prepared?.possible || !purchaseCheck.valid}
      onClick={() => dispatch({ type: 'conversationRoll', performerId: performer.id, purchase })}
    >
      Roll {purchaseCheck.dice}d20
    </button>
  )
  const bonusDice = performer && <BonusDicePicker resources={state.resources} value={purchase} onChange={setDicePurchase} />
  const inSlot = (element, slot) => (slot ? createPortal(element, slot) : element)
  return (
    <>
      <h4>
        {node.label || 'Task Check'}: {usesText(node)} &middot; Difficulty {node.difficulty}
      </h4>
      {best.length > 0 && <p className="challenge-approach-best">&#9733; Best: {bestText(recommendation, (id) => firstName(state.party.members[id]))}</p>}
      {!performer && <p className="challenge-math-blocker">Nobody able to answer.</p>}
      {performer && (
        <>
          <CharacterMath performer={performer} prepared={prepared} assist={null} assistant={null} action={{ task: checkSpec(node) }} />
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
      {inSlot(rollButton, rollSlot)}
      {inSlot(bonusDice, bonusSlot)}
    </>
  )
}

// The dice of the last Task Check above the panel, where its Roll button was; they fade out after a moment, as an
// object's roll does above its ring.
function RecentRoll({ lastCheck, state }) {
  const [fading, setFading] = useState(false)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    const fade = setTimeout(() => setFading(true), RESULT_HOLD_MS)
    const hide = setTimeout(() => setGone(true), RESULT_HOLD_MS + RESULT_FADE_MS)
    return () => {
      clearTimeout(fade)
      clearTimeout(hide)
    }
  }, [])
  if (gone || !lastCheck.result) return null
  const { result } = lastCheck
  return (
    <div className={`conversation-roll-dice${fading ? ' is-fading' : ''}`}>
      <RolledDice result={result} performer={state.party.members[lastCheck.performerId]} assistant={null} />
      <p className={`ring-roll-outcome ${result.success ? 'is-success' : 'is-failure'}`}>{result.success ? 'Success' : 'Failure'}</p>
    </div>
  )
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

// The conversation with an NPC in exploration (conversation/conversationRuntime.js): the NPC's line, the player's
// options, a Task Check's roll and its result. UI state only; every step is an exploration action.
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
  const [rollSlot, setRollSlot] = useState(null)
  const [bonusSlot, setBonusSlot] = useState(null)

  // The box holds the conversation and keeps one size (its text scrolls); while a check waits, the bonus dice picker goes
  // in it under the NPC's line, and the Roll button, then the dice rolled, show centred just above it. A check's stats,
  // then its result, go in the stats and log area an object uses.
  return (
    <>
      <div className="conversation-dock" onPointerDown={(event) => event.stopPropagation()}>
        <div className="conversation-roll" ref={setRollSlot}>
          {lastCheck && <RecentRoll key={lastCheck.key} lastCheck={lastCheck} state={state} />}
        </div>
        <div className="combat-panel challenge-panel conversation-panel">
          <div className="challenge-header">
            <div>
              <h3>{npc?.name ?? 'Conversation'}</h3>
              {dev && <p className="challenge-state">{conversation.definition.name} &middot; node {conversation.nodeId ?? 'end'}</p>}
            </div>
          </div>

          {conversation.line && (
            <div className="conversation-line">
              <div className="conversation-line-body">
                <p className="conversation-speaker">{conversation.line.speaker}</p>
                <p className="conversation-text">{conversation.line.text}</p>
              </div>
              {npc?.character && (
                <CombatPortrait character={npc.character} className="conversation-npc-portrait" style={episodeCard ? { backgroundImage: `url("${episodeCard}")` } : undefined} />
              )}
            </div>
          )}

          {check && <div className="conversation-check-slot" ref={setBonusSlot} />}

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

      {(check || lastCheck) && (
        <div className="combat-panel challenge-panel is-docked" onPointerDown={(event) => event.stopPropagation()}>
          <div className="challenge-body">
            {check ? (
              <CheckView key={check.id} state={state} node={check} recommendation={recommendation} defaultPerformerId={defaultPerformerId} pickedPerformerId={pickedPerformerId} rollSlot={rollSlot} bonusSlot={bonusSlot} dispatch={dispatch} dev={dev} />
            ) : (
              <>
                <h4>
                  {lastCheck.label || 'Task Check'}: {state.party.members[lastCheck.performerId]?.character.name}
                </h4>
                <TaskResultView lastTask={lastCheck} performer={state.party.members[lastCheck.performerId]} assistant={null} showDice={false} />
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
