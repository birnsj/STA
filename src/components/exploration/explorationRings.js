// The radial menus of exploration (ExplorationScreen.jsx): a party member's, a challenge object's and an NPC's, the
// ring's party band, and the card beside an NPC's ring. Pure: they build button lists from the exploration state.
import { controllerFor } from '../../actors/controllers.js'
import { SCAN_TRAIT } from '../../combat/combatScan.js'
import { dispositionName, isDown, STATE, stateName } from '../../exploration/awareness.js'
import { getAvailableActions, getDefinition, objectsInReach } from '../../exploration/challengeObjects.js'
import { canScan, canScanNpc, scanRadius } from '../../exploration/partyScan.js'
import { npcButtonPerformer, ringPartyView } from '../../exploration/ringParty.js'
import { getEquippedItems } from '../../rules/equipment.js'
import { getFaction } from '../../rules/factions.js'
import { conditionSummary, getProtection, isDefeated, normalizeCondition } from '../../rules/personalCondition.js'
import { objectFor } from '../../world/objects.js'

const NOT_BUILT = 'Not built yet.'

// A party member's radial menu (right-click on them; designer decision, 2026-10-09): Scan, Use, Switch, Search,
// First Aid, Attack, Interact, Sneak and Beam Out (2026-10-11), each for that character only. Use, Search, First Aid
// and Attack are shown but not built yet (they may later act on objects).
// actions: { scan, switchTo, interact(objectId), sneak, beamOut }.
export function memberMenuButtons(state, member, actions) {
  const up = !isDefeated(member.condition)
  const scan = canScan(state, member.id)
  const radius = scanRadius(member.character)
  const objectId = up ? objectsInReach(state, [member.id]).find((definition) => getAvailableActions(state, definition.id).length)?.id : null
  const name = member.character.name
  const isOnlySelected = state.party.selectedIds.length === 1 && state.party.selectedIds[0] === member.id
  const unbuilt = (id, label, icon) => ({ id, label, icon, enabled: false, title: `${label}: ${NOT_BUILT}` })
  return [
    { id: 'scan', label: 'Scan', icon: 'scan', enabled: scan.possible, title: scan.possible ? `Scan (Reason + Science): location and environment, plus life signs and enemies within ${radius} tiles.` : `Scan: ${scan.reason}`, onClick: actions.scan },
    unbuilt('useItem', 'Use', 'useItem'),
    { id: 'switch', label: 'Switch', icon: 'switch', enabled: up && !isOnlySelected, title: `Switch to ${name}: select them and make them the lead.`, onClick: actions.switchTo },
    unbuilt('search', 'Search', 'search'),
    unbuilt('firstAid', 'First Aid', 'firstAid'),
    unbuilt('attack', 'Attack', 'attack'),
    {
      id: 'interact',
      label: 'Interact',
      icon: 'interact',
      enabled: Boolean(objectId),
      title: objectId ? `Interact: ${getDefinition(state.scenario, objectId).name}` : 'Interact: nothing in reach.',
      onClick: () => actions.interact(objectId),
    },
    { id: 'sneak', label: 'Sneak', icon: 'sneak', enabled: up, active: member.sneaking, title: `Sneak: ${name} crouches and moves slowly, harder to notice.`, onClick: actions.sneak },
    {
      id: 'beamOut',
      label: 'Beam Out',
      icon: 'beamOut',
      enabled: !state.conversation,
      title: state.conversation ? 'Beam Out: not during a conversation.' : `Beam Out: ${name} beams up and leaves the mission. Once everyone has beamed out, the mission ends.`,
      onClick: actions.beamOut,
    },
  ]
}

// A challenge object's radial menu (left click on it while in reach): one button per approach it offers now. open(actionId)
// opens the interaction panel on that approach; activeId: the approach the open panel is on (lit).
export function objectMenuButtons(state, objectId, open, activeId = null) {
  return objectFor(state.scenario, objectId)
    .listedActions(state)
    .map(({ action, available, reason }) => ({
      id: action.id,
      label: action.label,
      icon: action.icon ?? 'interact',
      enabled: available,
      active: action.id === activeId,
      title: available ? `${action.label}: ${action.description}` : reason,
      onClick: () => open(action.id),
    }))
}

// The character who would scan this NPC: the one picked on the ring's party band when they can, else the selected
// characters (the lead first): the first who can, else the first of them with the reason.
// Returns { member, check } or null when nobody is picked or selected.
function npcScanner(state, npcId, pickedId = null) {
  const { party } = state
  if (pickedId && canScanNpc(state, pickedId, npcId).possible) return { member: party.members[pickedId], check: canScanNpc(state, pickedId, npcId) }
  const ids = [party.leaderId, ...party.selectedIds.filter((id) => id !== party.leaderId)].filter((id) => party.selectedIds.includes(id))
  if (!ids.length) return null
  const checks = ids.map((id) => ({ member: party.members[id], check: canScanNpc(state, id, npcId) }))
  return checks.find(({ check }) => check.possible) ?? checks[0]
}

// An NPC's radial menu (left click on an NPC the party can see; designer requests 2026-10-09): Talk, when they have a
// conversation (out of reach, the selected characters walk over first); Scan (one selected character scans them); Info
// (a card beside the ring); Attack; Go To. Persuade, Intimidate, Use Item and First Aid are shown but not built yet.
// actions: { talk, scan, info, attack, goTo }; infoOpen: whether the card is showing; pickedId: the member picked on the
// party band (they scan when they can, and open fire; unpicked, the best at Attack does).
export function npcMenuButtons(state, npc, inTalkRange, infoOpen, actions, pickedId = null) {
  const up = !isDown(npc)
  const canTalk = controllerFor(npc).canTalk(npc)
  const talkTitle = !npc.conversationId ? `${npc.name} has nothing to say.` : !up ? `${npc.name} can't talk now.` : inTalkRange ? `Talk to ${npc.name}.` : `Walk over to ${npc.name} and talk.`
  const scanner = npcScanner(state, npc.id, pickedId)
  const scanTitle = !scanner ? 'Scan: select a character first.' : scanner.check.possible ? `${scanner.member.character.name} scans ${npc.name} (Reason + Science): condition and equipment.` : `Scan (${scanner.member.character.name}): ${scanner.check.reason}`
  const attacker = state.party.members[npcButtonPerformer(state, npc.id, 'attack', pickedId)]
  const unbuilt = (id, label, icon) => ({ id, label, icon, enabled: false, title: `${label}: ${NOT_BUILT}` })
  return [
    { id: 'talk', label: 'Talk', icon: 'talk', enabled: canTalk, title: talkTitle, onClick: actions.talk },
    { id: 'scan', label: 'Scan', icon: 'scan', enabled: Boolean(scanner?.check.possible), title: scanTitle, onClick: () => actions.scan(scanner.member.id) },
    unbuilt('persuade', 'Persuade', 'persuade'),
    unbuilt('intimidate', 'Intimidate', 'intimidate'),
    { id: 'info', label: 'Info', icon: 'info', enabled: true, active: infoOpen, title: infoOpen ? 'Hide what the party knows about them.' : `What the party knows about ${npc.name}.`, onClick: actions.info, keepOpen: true },
    unbuilt('useItem', 'Use Item', 'useItem'),
    unbuilt('firstAid', 'First Aid', 'firstAid'),
    { id: 'attack', label: 'Attack', icon: 'attack', enabled: up, title: !up ? `${npc.name} is down.` : attacker ? `Attack ${npc.name}: ${attacker.character.name} opens fire, starting a fight.` : `Attack ${npc.name}: starts a fight.`, onClick: actions.attack },
    { id: 'goTo', label: 'Go To', icon: 'move', enabled: true, title: `Walk the selected characters over to ${npc.name}.`, onClick: actions.goTo },
  ]
}

// The ring's party band (exploration/ringParty.js): each member's TN for the button last hovered, a star on the best,
// and the member picked to do the next action (clicking a slice picks or unpicks them).
// target: { objectId } or { npcId }; buttons: the ring's buttons; hoveredId: the button last hovered (null: none yet).
export function ringPartyBand(state, target, buttons, hoveredId, pickedId, onPick) {
  const button = buttons.find((candidate) => candidate.id === hoveredId) ?? null
  const view = ringPartyView(state, target, button?.id ?? null)
  const caption = !button ? 'Hover an action: who is best at it' : !view.hasTask ? `${button.label}: no roll to compare` : view.allTied ? `${button.label}: all equally suited` : `Best at ${button.label}`
  const slices = view.members.map((entry) => {
    const { character } = state.party.members[entry.id]
    const picked = entry.id === pickedId
    const odds = !view.hasTask
      ? null
      : entry.reason ?? (entry.possible ? `TN ${entry.targetNumber}, Difficulty ${entry.difficulty}, ${Math.round(entry.chance * 100)}% chance` : "Can't succeed.")
    const label = !view.hasTask ? null : !entry.available ? '-' : entry.possible ? `${entry.best ? '\u2605 ' : ''}TN ${entry.targetNumber}` : "Can't"
    return {
      id: entry.id,
      character,
      label,
      best: entry.best,
      picked,
      available: entry.available,
      title: [`${character.name}${odds ? `: ${odds}` : ''}`, picked ? 'Picked for the next action. Click to unpick.' : 'Click to pick them for the next action.'].join('\n'),
    }
  })
  return { caption, slices, onPick }
}
const AWARENESS_ORDER = [STATE.UNAWARE, STATE.SUSPICIOUS, STATE.INVESTIGATING, STATE.ALERTED, STATE.COMBAT_READY]

// The card beside an NPC's ring: what the party can see, plus their condition and equipment once a scan has succeeded.
export function npcInfo(state, npc) {
  const { character } = npc
  const factionName = (npc.faction && npc.faction !== character.faction?.id ? getFaction(npc.faction)?.name : character.faction?.name) ?? 'Unknown'
  const noticed = state.party.memberIds.map((id) => npc.awareness[id]?.state ?? STATE.UNAWARE).sort((a, b) => AWARENESS_ORDER.indexOf(b) - AWARENESS_ORDER.indexOf(a))[0]
  const rows = [
    ['Species', character.species?.name || 'Unknown'],
    ['Faction', factionName],
    ['Disposition', dispositionName(npc.disposition)],
    ['Noticed you', isDown(npc) ? 'Down' : stateName(noticed ?? STATE.UNAWARE)],
  ]
  const scan = state.npcScans?.[npc.id]
  const tips = []
  if (scan?.success) {
    const condition = normalizeCondition(npc.condition)
    rows.push(['Condition', conditionSummary(character, condition) || 'Unhurt'])
    rows.push(['Protection', `Stun ${getProtection(character, { injuryType: 'stun' }).value} / Deadly ${getProtection(character, { injuryType: 'deadly' }).value}`])
    const gear = getEquippedItems(character).map((item) => item.name)
    rows.push(['Equipment', gear.length ? gear.join(', ') : 'None'])
    tips.push(`Scanned by ${state.party.members[scan.memberId]?.character.name ?? 'the away team'}.`)
    tips.push(`In a fight it starts scanned, with the trait ${SCAN_TRAIT.name}: your attacks on it are easier.`)
  } else if (scan) {
    tips.push('Scan failed: no clear readings. Scan again to retry.')
  } else {
    tips.push('Scan them for their condition and equipment.')
  }
  return { title: npc.name, rows, tips }
}
