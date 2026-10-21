import { useCallback, useState } from 'react'

// UI state of a challenge object's interaction panel (ChallengePanel) and the ring it shares with the board. None of it
// is game state: whether the panel is actually showing (the object in reach, no conversation) is for the screen to work
// out from the exploration state.
//
// Returns:
//   interaction                 { objectId, actionId, performerId } of the object whose panel is open, the approach picked
//                               on its ring (null: the panel lists them) and the member picked on the ring's party band
//                               (null: the selection decides); null when none is open. The party can still move while it
//                               is open (designer decision: never pause the players); walking out of reach closes it.
//   openInteraction(id, actionId, performerId) / closeInteraction()
//   panelActionId               the approach the open panel is on (lit on the object's ring)
//   rollSlot                    the element above that ring where the panel puts its Roll button and dice (null: they
//                               stay in the panel)
//   objectRoll                  the open panel's Roll for the object's ring (ChallengePanel onRollChange), or null
//   recommendation              who is best at the approach being considered (party card highlight), from a panel or a
//                               conversation's roll
export default function useChallengeInteraction() {
  const [interaction, setInteraction] = useState(null)
  const [panelActionId, setPanelActionId] = useState(null)
  const [rollSlot, setRollSlot] = useState(null)
  const [objectRoll, setObjectRoll] = useState(null)
  const [recommendation, setRecommendation] = useState(null)

  const openInteraction = useCallback(
    (objectId, actionId = null, performerId = null) => setInteraction(objectId ? { objectId, actionId, performerId } : null),
    [],
  )
  const closeInteraction = useCallback(() => setInteraction(null), [])

  // The panel recomputes on every world tick (most animation frames); keeping the old object when nothing changed
  // stops each tick from forcing a second render of the whole screen.
  const updateRecommendation = useCallback((next) => {
    setRecommendation((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next))
  }, [])

  return {
    interaction,
    interactionId: interaction?.objectId ?? null,
    openInteraction,
    closeInteraction,
    panelActionId,
    setPanelActionId,
    rollSlot,
    setRollSlot,
    objectRoll,
    setObjectRoll,
    recommendation,
    updateRecommendation,
  }
}
