// What the away team knows about the NPCs in the world, as opposed to what the camera shows. Each party member perceives
// from where they stand; the party's knowledge is everything any of them has perceived (they share what they find).
// The same layer runs in exploration (every frame) and in Combat Type 1 (after every action), from world/cell positions
// only, never from what is on screen.
//
// Per NPC: { state, observerIds, source, identified, lastKnownPosition, lastSeenTime, lastObserverId }
// - UNKNOWN: never perceived (no entry is kept).
// - VISIBLE: at least one party member perceives it now; observerIds lists who. lastKnownPosition follows it.
// - KNOWN: perceived before but not now; lastKnownPosition stays where it was last perceived (no live tracking).
// sightings: { [memberId]: [npc ids it perceives now] } keeps each character's own perception apart from the party's.
import data from '../data/adaptation/exploration/partyPerception.json'
import { hasLineOfSight } from './awareness.js'
import { distance } from './navigation.js'

export const KNOWLEDGE = { UNKNOWN: 'UNKNOWN', VISIBLE: 'VISIBLE', KNOWN: 'KNOWN' }
export const VISION_RANGE = data.baseVisionRange
const UNKNOWN_ENTRY = { state: KNOWLEDGE.UNKNOWN, observerIds: [], source: null, identified: false, lastKnownPosition: null, lastSeenTime: null, lastObserverId: null }

// facts: { [factId]: { text, source, time, objectId } } things the team has learned that aren't NPC positions (e.g. from
// a scan), from the same knowledge the rest of the game reads.
export const createPartyKnowledge = () => ({ entities: {}, sightings: {}, facts: {} })

// Plain sight: in range and in line of sight, all around (party members are actively looking about).
// Later perception (concealment, sensors, Talents) adds detection sources beside this one rather than changing it.
export const seesVisually = (map, from, to) => distance(from, to) <= VISION_RANGE && hasLineOfSight(map, from, to)

// observers: [{ id, position }] party members able to perceive; entities: [{ id, position }] NPCs; time: world seconds.
export function updatePartyKnowledge(knowledge, map, observers, entities, time) {
  const sightings = Object.fromEntries(observers.map((observer) => [observer.id, []]))
  const entries = { ...knowledge.entities }
  entities.forEach((entity) => {
    const observerIds = observers.filter((observer) => seesVisually(map, observer.position, entity.position)).map((observer) => observer.id)
    observerIds.forEach((id) => sightings[id].push(entity.id))
    const entry = entries[entity.id]
    if (observerIds.length) {
      entries[entity.id] = {
        state: KNOWLEDGE.VISIBLE,
        observerIds,
        source: 'visual',
        identified: true,
        lastKnownPosition: { ...entity.position },
        lastSeenTime: time,
        lastObserverId: observerIds.includes(entry?.lastObserverId) ? entry.lastObserverId : observerIds[0],
      }
    } else if (entry && entry.state === KNOWLEDGE.VISIBLE) {
      entries[entity.id] = { ...entry, state: KNOWLEDGE.KNOWN, observerIds: [] }
    }
  })
  return { ...knowledge, entities: entries, sightings }
}

// A non-visual detection (sensor, tricorder, scripted): the party learns where something is now, without seeing it.
// identified false = only that something is there (e.g. a life sign). Never downgrades a Visible entry.
export function revealEntity(knowledge, entity, { source, identified = false, time, observerId = null }) {
  const entry = knowledge.entities[entity.id]
  if (entry?.state === KNOWLEDGE.VISIBLE) return knowledge
  const revealed = {
    state: KNOWLEDGE.KNOWN,
    observerIds: [],
    source,
    identified: Boolean(entry?.identified) || identified,
    lastKnownPosition: { ...entity.position },
    lastSeenTime: time,
    lastObserverId: observerId,
  }
  return { ...knowledge, entities: { ...knowledge.entities, [entity.id]: revealed } }
}

export const addKnowledgeFact = (knowledge, id, fact) => ({ ...knowledge, facts: { ...knowledge.facts, [id]: fact } })

export const getEntityKnowledge = (knowledge, id) => knowledge.entities[id] ?? UNKNOWN_ENTRY
export const isVisibleToParty = (knowledge, id) => getEntityKnowledge(knowledge, id).state === KNOWLEDGE.VISIBLE
// Whether a party member perceives this NPC themselves (not only through the party).
export const isDirectObserver = (knowledge, memberId, id) => Boolean(knowledge.sightings[memberId]?.includes(id))
