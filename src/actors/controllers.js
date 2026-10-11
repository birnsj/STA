// Which controller runs each actor. Every actor has one controller instance per kind, kept here outside the game state
// (the state stays plain data); an actor whose kind changes (an NPC turning hostile) gets the other kind's instance.
import { isHostile } from '../exploration/awareness.js'
import { EnemyController } from './EnemyController.js'
import { NPCController } from './NPCController.js'
import { PlayerController } from './PlayerController.js'

// Looked up when needed, not at load, so modules that import each other in a circle load in any order.
const controllerClass = (controllerId) => ({ player: PlayerController, npc: NPCController, enemy: EnemyController })[controllerId]

// Party members and combatants carry a controllerId (partyControl.js, combatSetup.js). A world NPC's follows its
// attitude, so every change of disposition or response (an attack, the end of a fight, a conversation) switches it: one
// that would fight the away team (awareness.js isHostile) is an enemy. Anything else without one is a party member.
export function controllerIdOf(actor) {
  if (actor.controllerId) return actor.controllerId
  if (actor.side) return actor.side === 'player' ? 'player' : 'enemy'
  if (actor.awareness) return isHostile(actor) ? 'enemy' : 'npc'
  return 'player'
}

const instances = new Map()

export function controllerFor(actor) {
  const controllerId = controllerIdOf(actor)
  const key = `${controllerId}:${actor.id}`
  let controller = instances.get(key)
  if (!controller) {
    controller = new (controllerClass(controllerId))(actor.id)
    instances.set(key, controller)
  }
  return controller
}

// Shorthands for the questions every system asks about a character.
export const isUp = (actor) => Boolean(actor) && controllerFor(actor).isUp(actor)
export const isDown = (actor) => !isUp(actor)
export const isPlayerControlled = (actor) => controllerFor(actor).isPlayerControlled(actor)
