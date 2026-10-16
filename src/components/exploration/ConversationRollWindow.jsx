import { assistCandidates, previewCheck, previewCheckAssist } from '../../conversation/conversationRuntime.js'
import { PreRollWindow, ResultWindow } from '../dice/RollWindow.jsx'

// A conversation's Task Check before the roll, in the roll window: who answers is picked before Talk (see
// ConversationPanel's answererId; no picking here); who assists and the bonus d20s are chosen in the window.
// There is no backing out of a check, so no Cancel.
export function CheckRollWindow({ state, node, performer, dispatch }) {
  const assistOptions = assistCandidates(state, performer.id).map((member) => ({ id: member.id, member, assist: previewCheckAssist(state, node, member.id), assistIndex: 0 }))
  return (
    <PreRollWindow
      title={node.label || 'Task Check'}
      performer={performer}
      prepared={previewCheck(state, node, performer.id)}
      assistOptions={assistOptions}
      resources={state.resources}
      onRoll={({ assistantId, purchase }) => dispatch({ type: 'conversationRoll', performerId: performer.id, assistantId, purchase })}
    />
  )
}

// The check just rolled; Continue closes the window.
export function CheckResultWindow({ state, lastCheck, onContinue }) {
  return (
    <ResultWindow
      title={lastCheck.label || 'Task Check'}
      lastTask={lastCheck}
      performer={state.party.members[lastCheck.performerId]}
      assistant={lastCheck.assistantId ? state.party.members[lastCheck.assistantId] : null}
      onContinue={onContinue}
    />
  )
}
