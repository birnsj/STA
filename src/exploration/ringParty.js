// The away team on the outer ring of a challenge object's or an NPC's radial menu (designer request 2026-10-11): who
// could do the button being considered and who is best at it by their stats. Guidance only, from the same
// recommendation the panels use (rules/taskRecommendation.js). Only members within interact range of the object or
// NPC appear on the band (designer 2026-10-16).
import combatActionData from '../data/adaptation/combat/actions.json'
import partyActionData from '../data/adaptation/exploration/partyActions.json'
import { isDefeated } from '../rules/personalCondition.js'
import { prepareTask } from '../rules/taskPreparation.js'
import { recommendPerformers } from '../rules/taskRecommendation.js'
import { challengeFor, INTERACT_RANGE } from './challengeObjects.js'
import { previewObjectShot } from './explorationEnvironment.js'
import { getMembers } from './partyControl.js'
import { canScanNpc } from './partyScan.js'
import { canAskNpc, SOCIAL_KINDS } from './partySocial.js'

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Party members close enough to appear on this target's ring band (up, and within interact range for objects / NPCs).
function bandMembers(state, target) {
  const members = getMembers(state.party)
  if (target.objectId) {
    const challenge = challengeFor(state, target.objectId)
    return challenge ? challenge.membersInRange(state.party) : []
  }
  if (target.npcId) {
    const npc = state.world.npcs[target.npcId]
    if (!npc) return []
    return members.filter((member) => !isDefeated(member.condition) && distance(member.position, npc.position) <= INTERACT_RANGE)
  }
  return members.filter((member) => !isDefeated(member.condition))
}

const partyTask = (id) => partyActionData.actions.find((action) => action.id === id).task
// The combat Persuade and Intimidate pairings are opposed tasks with no Difficulty of their own (0); ranked at the same
// placeholder Difficulty 2 as the party actions (partyActions.json), or every member would tie at a sure success.
const socialTask = (id) => ({ ...combatActionData.tasks[id], difficulty: 2 })

// The task each NPC ring button ranks the party on. Scan, Attack and First Aid: the party actions (Attack and First Aid
// are the book pairings, Core p.290, p.292). Persuade and Intimidate: the combat pairings (designer decisions, Oct 2026).
// Talk: Persuade's Presence + Command (implementer proposal, designer request 2026-10-11 "the most appropriate player
// according to stats"; a conversation's own checks vary). Info, Go To and Use Item have none.
const NPC_BUTTON_TASKS = {
  talk: socialTask('persuade'),
  scan: partyTask('scan'),
  persuade: socialTask('persuade'),
  intimidate: socialTask('intimidate'),
  firstAid: partyTask('firstAid'),
  attack: partyTask('attack'),
}

// target: { objectId }, { npcId } or { destructibleId }; buttonId: the ring button being considered (null: none yet).
// Returns { hasTask, allTied, bestIds, members: [{ id, available, reason, targetNumber, difficulty, chance, possible, best }] }.
// members: only those in interact range of an object or NPC (or up, for a destructible). available: whether they could
// be the one to do it now; reason: why not.
export function ringPartyView(state, target, buttonId) {
  const members = bandMembers(state, target)
  const blocked = Object.fromEntries(members.map((member) => [member.id, null]))
  let recommendation = null

  if (target.destructibleId && buttonId === 'fire') {
    // Fire on a destructible object (explorationEnvironment.js): each member's best shot, ranked on its attack task.
    const shots = Object.fromEntries(members.map((member) => [member.id, previewObjectShot(state, member.id, target.destructibleId)]))
    for (const member of members) blocked[member.id] = shots[member.id].available ? null : shots[member.id].reason
    recommendation = recommendPerformers(members.filter((member) => !blocked[member.id]).map((member) => ({ id: member.id, prepared: shots[member.id].prepared })))
  } else if (target.objectId && buttonId) {
    const challenge = challengeFor(state, target.objectId)
    recommendation = challenge.recommend(state, buttonId, members.map((member) => member.id))
  } else if (target.npcId && NPC_BUTTON_TASKS[buttonId]) {
    if (buttonId === 'scan') for (const member of members) blocked[member.id] = canScanNpc(state, member.id, target.npcId).reason
    if (SOCIAL_KINDS.includes(buttonId)) for (const member of members) blocked[member.id] = canAskNpc(state, member.id, target.npcId, buttonId).reason
    const task = NPC_BUTTON_TASKS[buttonId]
    recommendation = recommendPerformers(
      members
        .filter((member) => !blocked[member.id])
        .map((member) => ({ id: member.id, prepared: prepareTask(member.character, task, { traits: state.scenario.traits, side: 'player', condition: member.condition }) })),
    )
  }

  return {
    hasTask: Boolean(recommendation),
    allTied: Boolean(recommendation?.allTied),
    bestIds: recommendation?.bestIds ?? [],
    members: members.map((member) => {
      const entry = recommendation?.entries[member.id]
      return {
        id: member.id,
        available: !blocked[member.id],
        reason: blocked[member.id],
        targetNumber: entry?.targetNumber ?? null,
        difficulty: entry?.difficulty ?? null,
        chance: entry?.chance ?? null,
        possible: entry ? entry.possible : null,
        best: Boolean(recommendation?.bestIds.includes(member.id)),
      }
    }),
  }
}

// Who fires on a destructible object from its ring: the member picked on the band when their shot is possible, else
// the best by stats, else null (nobody has a shot).
export function destructibleShooter(state, objectId, pickedId = null) {
  const view = ringPartyView(state, { destructibleId: objectId }, 'fire')
  if (pickedId && view.members.some((entry) => entry.id === pickedId && entry.available)) return pickedId
  return view.bestIds[0] ?? view.members.find((entry) => entry.available)?.id ?? null
}

// Who does an NPC ring button that has no performer of its own (Talk's checks, Attack's opening): the member picked on
// the band when they are in range, else the best by stats (the first when several tie), else null.
export function npcButtonPerformer(state, npcId, buttonId, pickedId = null) {
  const view = ringPartyView(state, { npcId }, buttonId)
  if (pickedId && view.members.some((entry) => entry.id === pickedId && entry.available)) return pickedId
  return view.bestIds[0] ?? view.members.find((entry) => entry.available)?.id ?? null
}
