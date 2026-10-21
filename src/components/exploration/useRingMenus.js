import { useCallback, useState } from 'react'

// Which radial menu is open on the exploration board: a party member's, an NPC's, a challenge object's, a destructible's
// or a ground item's. Only one is ever open (opening one closes the others), so this holds a single { kind, id } and not
// one id per kind. Whether the open one is still showable (visible, in reach, not in combat) is for the screen to decide.
//
// Returns the open id for each kind (null when another kind, or none, is open) and:
//   showXMenu(id)          open it, closing any other
//   toggleXMenu(id)        same, but a second click on the open one closes it
//   closeMenu(kind)        close it only if it is the open one (a click on another ring's button never closes this one)
//   closeAllMenus()        close whichever is open
export default function useRingMenus() {
  const [menu, setMenu] = useState(null)

  const show = useCallback((kind, id) => setMenu((current) => (current?.kind === kind && current.id === id ? current : { kind, id })), [])
  const toggle = useCallback((kind, id) => setMenu((current) => (current?.kind === kind && current.id === id ? null : { kind, id })), [])
  const closeMenu = useCallback((kind) => setMenu((current) => (current?.kind === kind ? null : current)), [])
  const closeAllMenus = useCallback(() => setMenu(null), [])

  const showMemberMenu = useCallback((id) => show('member', id), [show])
  const toggleMemberMenu = useCallback((id) => toggle('member', id), [toggle])
  const showNpcMenu = useCallback((id) => show('npc', id), [show])
  const toggleNpcMenu = useCallback((id) => toggle('npc', id), [toggle])
  const toggleObjectMenu = useCallback((id) => toggle('object', id), [toggle])
  const toggleDestructibleMenu = useCallback((id) => toggle('destructible', id), [toggle])
  const toggleGroundItemMenu = useCallback((id) => toggle('groundItem', id), [toggle])

  const idFor = (kind) => (menu?.kind === kind ? menu.id : null)

  return {
    menuMemberId: idFor('member'),
    menuNpcId: idFor('npc'),
    menuObjectId: idFor('object'),
    menuDestructibleId: idFor('destructible'),
    menuGroundItemId: idFor('groundItem'),
    showMemberMenu,
    toggleMemberMenu,
    showNpcMenu,
    toggleNpcMenu,
    toggleObjectMenu,
    toggleDestructibleMenu,
    toggleGroundItemMenu,
    closeMenu,
    closeAllMenus,
  }
}
