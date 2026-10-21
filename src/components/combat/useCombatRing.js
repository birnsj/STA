import { useCallback, useState } from 'react'

// UI state of the action ring drawn around a unit on the battlefield (UnitActionRing). None of it is game state.
//
// Returns:
//   ringId       the unit whose action buttons are shown (a clicked enemy or party member; `object:<id>` for a challenge
//                object), or null
//   ringInfo     whether that unit's Info card is open
//   ringPick     the party member picked on the ring's party band (or, for Guard / First Aid / Direct / Assist, the target)
//   ringHover    the action button last hovered, for the band's odds
//   rollSlot     the element above the ring where bonus dice are shown (set by the ring's slotRef)
//   closeRing()  put the ring away: clears all five
// The setters are returned as they are: the screen sets these together with the chosen action, target and move
// destination, which are not part of the ring.
export default function useCombatRing() {
  const [ringId, setRingId] = useState(null)
  const [ringInfo, setRingInfo] = useState(false)
  const [ringPick, setRingPick] = useState(null)
  const [ringHover, setRingHover] = useState(null)
  const [rollSlot, setRollSlot] = useState(null)

  const closeRing = useCallback(() => {
    setRingId(null)
    setRingInfo(false)
    setRingPick(null)
    setRingHover(null)
    setRollSlot(null)
  }, [])

  return { ringId, setRingId, ringInfo, setRingInfo, ringPick, setRingPick, ringHover, setRingHover, rollSlot, setRollSlot, closeRing }
}
