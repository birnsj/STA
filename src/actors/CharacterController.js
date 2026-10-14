// The base class of every character's controller (controllers.js picks the class for each actor). A controller holds
// behaviour only. The actor it controls (a party member or world NPC in exploration, a combatant in combat) stays
// plain data in the exploration or combat state, and the character it carries is the read-only RuntimeCharacter
// (character/runtimeCharacter.js). Every method takes the actor as it is now and returns a value, a new actor or an
// action; none changes anything in place, so the reducers, seeded replays and headless runs work as before.
import { gridToWorld } from '../exploration/tacticalGrid.js'
import { isDefeated, normalizeCondition } from '../rules/personalCondition.js'

export const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))
export const headingTo = (from, to) => Math.atan2(to.y - from.y, to.x - from.x)
// Exploration keeps a heading in radians; combat faces one of the eight grid directions.
export const headingToFacing = (heading) => {
  const x = Math.round(Math.cos(heading))
  const y = Math.round(Math.sin(heading))
  return x || y ? { x, y } : { x: 1, y: 0 }
}
export const facingToHeading = (facing) => Math.atan2(facing.y, facing.x)

export class CharacterController {
  // id: the actor's id (the same in the world and in a fight).
  constructor(id) {
    this.id = id
  }

  character(actor) {
    return actor.character
  }

  // Standing: not Defeated (rules/personalCondition.js). A Defeated character can't be selected, lead, follow, notice
  // or be noticed, and has no collision.
  isUp(actor) {
    return Boolean(actor) && !isDefeated(actor.condition)
  }

  // The direction the actor faces as a vector: its own facing where it keeps one (party members, combatants), else
  // its heading in radians (world NPCs).
  facing(actor) {
    return actor.facing ?? { x: Math.cos(actor.heading), y: Math.sin(actor.heading) }
  }

  // How the figure is drawn (components/maps/pixi/figures.js): its gait in exploration, and whether it lies down.
  // Combat's strikes and falls come from the last combat action (components/combat/unitPose.js).
  animationState(actor) {
    return { walking: Boolean(actor.moving), running: Boolean(actor.running), sneaking: Boolean(actor.sneaking), down: !this.isUp(actor) }
  }

  // ---------- combat ----------

  // The world actor as a combatant placement on its snapped cell (combat/combatSetup.js createCombatant). Its personal
  // condition (Stress, Injuries, Defeated) is the same object in the world and in the fight.
  toCombatant(actor, cell) {
    return { character: actor.character, position: cell, facing: headingToFacing(actor.heading), condition: normalizeCondition(actor.condition) }
  }

  // The world actor after the fight: it stands where the combatant ended, facing the same way, with its condition.
  fromCombatant(actor, combatant) {
    return { ...actor, position: gridToWorld(combatant.position), heading: facingToHeading(combatant.facing), condition: combatant.condition }
  }

  // Whether the player gives this character's orders (the combat screen waits for them instead of running the AI).
  isPlayerControlled() {
    return false
  }

  // Whether this character's combat prompts (Avoid Injury, the Fatigued attribute, a Counterattack) wait for the
  // player. Auto Combat answers them for the party (combat/autoCombat.js stepAI).
  answersPrompts(actor) {
    return this.isPlayerControlled(actor)
  }

  // The AI's next combat action for this combatant when it is the one acting. options: the AI choices of the combat
  // screen ({ partyAI, enemyAI, partyAmbush }). A character with no combat AI ends its turn.
  combatStep(state, self) {
    return { type: 'endTurn', decision: 'End turn', reason: `${self.character.name} has no combat AI.` }
  }

  // In a fight started in the world: a search when the combatant knows of no opponent, ahead of the normal AI.
  // ctx: { link (exploration/combatLink.js), partyAuto }. Returns a combat action, or null to let the AI play.
  searchStep() {
    return null
  }
}
