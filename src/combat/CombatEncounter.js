// A fight from start to finish. An instance holds nothing but its encounter definition (encounters.json); the fight itself
// is the plain combat state, owned by whichever reducer runs it (CombatScreen's, or the exploration state's for a fight
// in the world). Every method takes that state and returns a value or a new state, like the character controllers and
// world objects. Turn order stays in the pure turn modules (combatTurnOrder.js, turnActions.js, combatSelectors.js);
// the encounter only asks them.
import { allCombatActions } from './actions/registry.js'
import { autoCombatReducer } from './autoCombat.js'
import { createCombat } from './combatSetup.js'
import { getActiveCombatant, getTurnGroup } from './combatSelectors.js'
import { DEFAULT_ENCOUNTER_ID, getEncounter } from './encounters.js'

export class CombatEncounter {
  constructor(definition) {
    this.definition = definition
  }

  get id() {
    return this.definition.id
  }

  // A new fight (combatSetup.js createCombat): options as createCombat takes them, without the encounter id.
  start(options) {
    return createCombat({ ...options, encounterId: this.id })
  }

  // One step: a combat action, or { type: 'aiStep', ... } for the AI (autoCombat.js).
  reduce(state, action) {
    return autoCombatReducer(state, action)
  }

  activeCombatant(state) {
    return getActiveCombatant(state)
  }

  turnGroup(state) {
    return getTurnGroup(state)
  }

  // 'victory' | 'defeat' | null (combatTurnOrder.js withOutcome sets it).
  outcome(state) {
    return state?.outcome ?? null
  }

  isOver(state) {
    return Boolean(this.outcome(state))
  }

  // What this combatant could do now, and why not: [{ type, reason }] (reason null = available), for every action that
  // needs no target or other parameters. Targeted actions answer through combatActionFor(type).unavailableReason.
  availableActions(state, actor, params = {}) {
    return allCombatActions().map((action) => ({ type: action.type, reason: action.unavailableReason(state, actor, { type: action.type, ...params }) }))
  }
}

const ENCOUNTERS = new Map()

// The encounter for an id (one instance per definition, kept outside React state); a subclass may register itself for its
// id (WorldEncounter).
export function encounterFor(encounterId = DEFAULT_ENCOUNTER_ID) {
  if (!ENCOUNTERS.has(encounterId)) ENCOUNTERS.set(encounterId, new CombatEncounter(getEncounter(encounterId) ?? { id: encounterId }))
  return ENCOUNTERS.get(encounterId)
}

export function registerEncounter(encounter) {
  ENCOUNTERS.set(encounter.id, encounter)
  return encounter
}
