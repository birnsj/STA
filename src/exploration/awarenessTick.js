import { isDown, isUp } from '../actors/actorStatus.js'
import { controllerFor } from '../actors/controllers.js'
import { alertGroup, appendWorldEvents, clampSimulationDelta, NOISE_SHOW_SECONDS } from './awareness.js'

// Advances NPC perception and behaviour. Controller dispatch lives here so the pure awareness rules remain a leaf
// dependency of NPCController instead of forming an actors ↔ awareness import cycle.
export function tickWorld(world, party, rawSeconds) {
  const seconds = clampSimulationDelta(rawSeconds)
  if (!seconds) return world
  const time = world.time + seconds
  const members = party.memberIds.map((id) => party.members[id]).filter(isUp)
  const events = []
  const emit = (event) => events.push(event)
  const npcs = {}
  const alerts = []
  world.npcIds.forEach((id) => {
    if (isDown(world.npcs[id])) {
      npcs[id] = world.npcs[id]
      return
    }
    const others = world.npcIds.filter((other) => other !== id).map((other) => world.npcs[other])
    const npc = world.npcs[id]
    const result = controllerFor(npc).exploreTick(npc, { map: world.map, members, others, time, seconds, emit })
    npcs[id] = result.npc
    alerts.push(...result.alerts)
  })
  let next = appendWorldEvents({ ...world, time, npcs, noises: world.noises.filter((noise) => time - noise.time < NOISE_SHOW_SECONDS) }, events)
  alerts.forEach((alert) => {
    next = alertGroup(next, alert.groupId, alert)
  })
  return next
}
