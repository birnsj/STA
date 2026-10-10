// The Captain's Log (videogame adaptation; missionLog.json): entries about the episode, each stamped with the world
// time it happened. The map supplies the briefing and the starting stardate; objectives come from the map and their
// mission flags. Entries: { id, time, kind: 'objective' | 'check' | 'authored', text }.
import data from '../data/adaptation/exploration/missionLog.json'
import { objectiveFlag } from './missionFlags.js'

export const createMissionLog = () => ({ entries: [], nextId: 1 })

// The stardate at a world time on this map, to one decimal place.
export function stardateAt(map, time) {
  const start = Number.isFinite(map?.stardate) ? map.stardate : data.defaultStardate
  const steps = Math.floor(Math.max(0, time) / data.stepSeconds)
  return (Math.round((start + steps * data.stardateStep) * 10) / 10).toFixed(1)
}

export function addLogEntry(state, { kind = 'authored', text }) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return state
  const log = state.missionLog ?? createMissionLog()
  const entry = { id: log.nextId, time: state.world.time, kind, text: trimmed }
  return { ...state, missionLog: { entries: [...log.entries, entry], nextId: log.nextId + 1 } }
}

// Entries for the map's objectives that became active or complete between two states.
export function logObjectiveChanges(previous, next) {
  if (previous.scenario.flags === next.scenario.flags) return next
  return (next.party.map.objectives ?? []).reduce((state, objective) => {
    const flag = objectiveFlag(objective.id)
    const before = previous.scenario.flags[flag]
    const after = state.scenario.flags[flag]
    if (before === after) return state
    const title = objective.title || objective.id
    if (after === 'active') return addLogEntry(state, { kind: 'objective', text: `New objective: ${title}.` })
    if (after === 'complete') return addLogEntry(state, { kind: 'objective', text: `Objective complete: ${title}.` })
    return state
  }, next)
}
