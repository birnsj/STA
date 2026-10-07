// The general actions on the exploration action buttons (data: exploration/partyActions.json) and who in the away team
// is best suited to each. A recommendation only: nothing is rolled from here yet.
import actionData from '../data/adaptation/exploration/partyActions.json'
import { isDefeated } from '../rules/personalCondition.js'
import { prepareTask } from '../rules/taskPreparation.js'
import { recommendPerformers } from '../rules/taskRecommendation.js'

export const PARTY_ACTIONS = actionData.actions

// members: getMembers(party). traits: the scene traits in play (scenario.traits). Defeated members can't act and are
// left out. Returns the recommendation shape the party cards read ({ bestIds, entries, allTied, label }), or null
// (no action, or one without a task, which anyone can do).
export function recommendPartyAction(members, actionId, traits = []) {
  const action = PARTY_ACTIONS.find((candidate) => candidate.id === actionId)
  if (!action?.task) return null
  const able = members.filter((member) => !isDefeated(member.condition))
  const candidates = able.map((member) => ({
    id: member.id,
    prepared: prepareTask(member.character, action.task, { traits, side: 'player', condition: member.condition }),
  }))
  return { ...recommendPerformers(candidates), label: action.label }
}
