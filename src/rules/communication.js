// Whether one character can make themselves heard by another (Book p.288 Direct: "select one ally who can hear you").
// Prototype hook (actions.json communication): within audibleRangeTiles of each other, or both carrying a working
// communicator (an item with the communication tag). comms (from the scene, optional): { remoteBlocked, reason } blocks
// communicators (jamming, comms disabled, isolation); being within earshot still works.
import actionData from '../data/adaptation/combat/actions.json'
import { getEquippedItems } from './equipment.js'

const { audibleRangeTiles, itemTag } = actionData.communication

const tileDistance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
export const hasCommunicator = (character) => getEquippedItems(character).some((item) => item.tags?.includes(itemTag))

// from / to: { character, position }. Returns { possible, via: 'voice' | 'communicator' | null, reason }.
export function canCommunicate(from, to, comms = null) {
  if (tileDistance(from.position, to.position) <= audibleRangeTiles) return { possible: true, via: 'voice', reason: null }
  if (!hasCommunicator(from.character) || !hasCommunicator(to.character)) return { possible: false, via: null, reason: `${to.character.name} is out of earshot and not both of you carry a communicator.` }
  if (comms?.remoteBlocked) return { possible: false, via: null, reason: `${to.character.name} is out of earshot; communicators are down${comms.reason ? ` (${comms.reason})` : ''}.` }
  return { possible: true, via: 'communicator', reason: null }
}
