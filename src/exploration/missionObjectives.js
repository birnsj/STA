// Objectives that move by themselves (videogame adaptation, no book rule): a map objective's activeWhen / completeWhen
// conditions (mapFormat.js) are checked against the mission flags after every exploration update. A met completeWhen
// makes it complete (even if it was never active); a met activeWhen makes an objective nobody has started active.
// Neither ever moves one back. Pure: exploration state in, exploration state out.
import { checkConditions, objectiveFlag, objectiveStatus } from './missionFlags.js'

function step(flags, objectives) {
  let next = flags
  objectives.forEach((objective) => {
    const status = objectiveStatus(next, objective.id)
    if (status === 'complete') return
    if (objective.completeWhen?.length && checkConditions(next, objective.completeWhen)) next = { ...next, [objectiveFlag(objective.id)]: 'complete' }
    else if (!status && objective.activeWhen?.length && checkConditions(next, objective.activeWhen)) next = { ...next, [objectiveFlag(objective.id)]: 'active' }
  })
  return next
}

export function updateObjectives(state) {
  const objectives = state?.party?.map?.objectives ?? []
  if (!state?.scenario || !objectives.some((objective) => objective.activeWhen?.length || objective.completeWhen?.length)) return state
  // One objective's change can meet another's conditions, so repeat until nothing moves (each pass only moves forward).
  let flags = state.scenario.flags
  for (let pass = 0; pass <= objectives.length; pass += 1) {
    const next = step(flags, objectives)
    if (next === flags) break
    flags = next
  }
  return flags === state.scenario.flags ? state : { ...state, scenario: { ...state.scenario, flags } }
}

// The flag a fight sets on each NPC it leaves down or surrendered, for objectives and conversations to read.
export const defeatedFlag = (npcId) => `defeated.${npcId}`
