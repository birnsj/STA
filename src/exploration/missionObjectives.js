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

// The mission is accomplished once every one of the map's objectives is complete (designer decision, 2026-10-11). A map
// without objectives never ends by itself.
export function isMissionAccomplished(state) {
  const objectives = state?.party?.map?.objectives ?? []
  return objectives.length > 0 && objectives.every((objective) => objectiveStatus(state.scenario?.flags, objective.id) === 'complete')
}

// The flag a fight sets on each NPC it leaves down, surrendered or fled, for objectives and conversations to read.
export const defeatedFlag = (npcId) => `defeated.${npcId}`

// Mission failure (designer decision, 2026-10-12): the away team must never fight an NPC the map marks mustSurvive. Any
// fight with one in it (attacked, turned hostile) fails the mission when it ends, however it ends: taken down, surrendered,
// fled or still standing.
export const mustSurviveIds = (map) => (map?.npcs ?? []).filter((npc) => npc.mustSurvive).map((npc) => npc.id)

// The marked NPCs in a fight (combat state), in the map's order.
export const foughtNpcIds = (combat, ids) => ids.filter((id) => Boolean(combat?.combatants[id]))

// state.missionFailed: { npcIds } once failed (never cleared), or absent.
export const isMissionFailed = (state) => Boolean(state?.missionFailed)
export const failedNpcNames = (state) => (state?.missionFailed?.npcIds ?? []).map((id) => state.world.npcs[id]?.name ?? id)
