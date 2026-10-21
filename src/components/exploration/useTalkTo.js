import { useCallback, useEffect, useRef, useState } from 'react'
import { loadConversation } from '../../conversation/conversationFiles.js'
import { conversationIdFor } from '../../conversation/defaultConversations.js'

// Talking to an NPC from the exploration board: open the conversation now when they are in talk range, or walk over first
// and open it once they are.
//
// talkable: the NPCs in talk range right now (npcsInTalkRange). onOpened: called when a conversation opens (the screen
// closes an object's panel then).
//
// Returns:
//   talkTo(npc)            load the NPC's conversation and open it
//   talkWhenInReach(npcId) the party is walking over: open the conversation as soon as that NPC is in reach
//   cancelPendingTalk()    drop that request (a click elsewhere, Escape, another errand)
//   talkError              why the last conversation couldn't be opened (its file is missing or broken), or null
export default function useTalkTo({ state, dispatch, talkable, onOpened }) {
  const [talkError, setTalkError] = useState(null)
  // { npcId, combatId }: the NPC the party is walking over to talk to, and the last fight when asked. A fight since the
  // request cancels it.
  const [pendingTalk, setPendingTalk] = useState(null)
  const lastCombatId = state.lastCombat?.id ?? null

  const talkTo = useCallback(
    (npc) => {
      loadConversation(conversationIdFor(npc))
        .then((definition) => {
          setTalkError(null)
          onOpened?.()
          setPendingTalk(null)
          dispatch({ type: 'talk', npcId: npc.id, definition })
        })
        .catch((error) => {
          setPendingTalk(null)
          setTalkError(`${npc.name}: ${error.message}`)
        })
    },
    [dispatch, onOpened],
  )

  const talkWhenInReach = useCallback((npcId) => setPendingTalk({ npcId, combatId: lastCombatId }), [lastCombatId])
  const cancelPendingTalk = useCallback(() => setPendingTalk(null), [])

  // Open the conversation as soon as the walking party brings the NPC within reach.
  const pendingTalkNpc = pendingTalk && pendingTalk.combatId === lastCombatId ? talkable.find((npc) => npc.id === pendingTalk.npcId) : null
  const requestedTalkRef = useRef(null)
  useEffect(() => {
    if (!pendingTalkNpc || requestedTalkRef.current === pendingTalk) return
    requestedTalkRef.current = pendingTalk
    talkTo(pendingTalkNpc)
  }, [pendingTalkNpc, pendingTalk, talkTo])

  return { talkError, talkTo, talkWhenInReach, cancelPendingTalk }
}
