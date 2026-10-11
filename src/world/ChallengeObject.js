// A challenge object (videogame adaptation, docs/world-objects.md): authored approaches resolved with the one STA 2E
// task (taskPreparation.js + taskResolver.js); the object's authored outcomes (objectEffects.js) then change the world:
// the map (a sealed door's tile), NPC awareness, Party Knowledge, scene traits and mission flags. The resolver decides
// success / failure / complications; the object decides what that means. The same object serves combat
// (exploration/combatLink.js): combat only decides who acts, what it costs and who assists.
import { isUp } from '../actors/controllers.js'
import data from '../data/adaptation/exploration/challenges.json'
import { checkCondition, checkConditions } from '../exploration/missionFlags.js'
import { getMembers } from '../exploration/partyControl.js'
import { rollPartyTask } from '../exploration/partyTaskRoll.js'
import { prepareAssist, prepareTask } from '../rules/taskPreparation.js'
import { recommendPerformers } from '../rules/taskRecommendation.js'
import { applyObjectEffect } from './objectEffects.js'
import { withMap } from './objects.js'
import { WorldObject } from './WorldObject.js'

// The action type an action takes in combat (Book p.288: a routine interaction is a minor action, an interaction
// needing a task is a major one), from its authored actionCost.combat.
export const combatCostOf = (action) => action.actionCost?.combat ?? (action.routine ? 'minor' : 'major')

export class ChallengeObject extends WorldObject {
  // The runtime record scenario.objects[id] starts from: the authored state, no locks or Difficulty changes, and the
  // map's own tiles under the object (shown again whenever the state has no tile of its own).
  createRuntime(map) {
    const originalTiles = this.tiles().map(({ x, y }) => map.tiles[y][x])
    return { state: this.definition.state, locks: {}, combatLocks: {}, difficultyMods: {}, originalTiles }
  }

  // [{ x, y, tile }]: what the map shows under the object in its current state.
  currentTiles(scenario) {
    const object = this.runtime(scenario)
    const stateTile = this.definition.states[object.state]?.tile
    return this.tiles().map(({ x, y }, index) => ({ x, y, tile: stateTile ?? object.originalTiles[index] }))
  }

  action(actionId) {
    return this.definition.actions.find((candidate) => candidate.id === actionId) ?? null
  }

  // How close (tiles, from the object's tile centre) a party member must stand to attempt or assist.
  inReach(point) {
    return this.distanceTo(point) <= data.interactRange
  }

  // Party members close enough (and able) to act on the object.
  membersInRange(party) {
    return getMembers(party).filter((member) => isUp(member) && this.inReach(member.position))
  }

  // requires.states, requires.flags { flag: value } (each must equal its value; an unset flag reads as false, 0 or '')
  // and requires.conditions [missionFlags.js conditions].
  meetsRequirements(scenario, requires = {}) {
    return (
      (!requires.states || requires.states.includes(this.runtime(scenario).state)) &&
      Object.entries(requires.flags ?? {}).every(([flag, value]) => checkCondition(scenario.flags, { flag, op: 'equals', value })) &&
      checkConditions(scenario.flags, requires.conditions)
    )
  }

  // The actions the object offers now: [{ action, available, reason }]. Actions whose requirements aren't met are not offered.
  availableActions(state) {
    const { scenario, world } = state
    const object = this.runtime(scenario)
    return this.definition.actions
      .filter((action) => this.meetsRequirements(scenario, action.requires))
      .map((action) => {
        const combatLock = object.combatLocks?.[action.id]
        if (state.combat && combatLock !== undefined && state.combat.round < combatLock) return { action, available: false, reason: 'Try again next round' }
        const lockedUntil = object.locks[action.id]
        if (lockedUntil !== undefined && world.time < lockedUntil) return { action, available: false, reason: `Try again in ${Math.ceil(lockedUntil - world.time)}s` }
        return { action, available: true, reason: null }
      })
  }

  // Every approach the object's radial menu lists, in authored order: those offered now (availableActions), plus those
  // with a lockedHint whose object state matches but whose other requirements aren't met yet, greyed with the hint as
  // their reason (so the player sees the easier and alternative ways in). Presentation only: an attempt still needs
  // availableActions.
  listedActions(state) {
    const offered = new Map(this.availableActions(state).map((entry) => [entry.action.id, entry]))
    const object = this.runtime(state.scenario)
    return this.definition.actions.flatMap((action) => {
      if (offered.has(action.id)) return [offered.get(action.id)]
      const stateMatches = !action.requires?.states || action.requires.states.includes(object.state)
      return action.lockedHint && stateMatches ? [{ action, available: false, reason: action.lockedHint }] : []
    })
  }

  combatCost(actionOrId) {
    return combatCostOf(typeof actionOrId === 'string' ? this.action(actionOrId) : actionOrId)
  }

  // The party always performs object tasks ('player' side, for side-limited trait rules). condition: the performer's
  // personal condition (Fatigue and Stress complications apply in exploration too). combatLines (combat only):
  // Difficulty changes combat adds to the task ([{ label, change }], e.g. a bought second Major).
  taskContext(scenario, actionId, condition, combatLines = []) {
    const mod = this.runtime(scenario).difficultyMods[actionId]
    return { traits: scenario.traits, side: 'player', condition, difficultyMod: mod?.change ?? 0, difficultyModLabel: mod?.label, extraLines: combatLines }
  }

  // The character math before the roll: { prepared (leader), assist: { approach, task, focus, ... } | null }.
  // combatAssist (combat only): the assist combat has decided on (an Assist set up for the performer, or the commander's
  // Control + Command on a Direct), already prepared; it replaces the exploration assistant. combatLines: see taskContext.
  preview(state, { actionId, performerId, assistantId = null, assistIndex = 0, combatAssist = null, combatLines = [] }) {
    const action = this.action(actionId)
    if (action.routine) return { prepared: null, assist: null }
    const performer = state.party.members[performerId]
    const prepared = prepareTask(performer.character, action.task, this.taskContext(state.scenario, actionId, performer.condition, combatLines))
    // A combat Assist may carry the helper's talents (combat/combatTalents.js: Pack Tactics' bonus Momentum).
    const talentBonus = combatAssist?.talents?.bonusMomentum ?? 0
    if (combatAssist) return { prepared: talentBonus ? { ...prepared, bonusMomentum: prepared.bonusMomentum + talentBonus } : prepared, assist: combatAssist }
    const approach = assistantId && action.assist?.[assistIndex]
    const assistant = assistantId && state.party.members[assistantId]
    const assist = approach ? { approach, ...prepareAssist(assistant.character, approach, assistant.condition) } : null
    return { prepared, assist }
  }

  // Puts the object in another of its authored states from outside its own outcomes (a conversation's
  // setChallengeState), then retiles the map. retile: how the map follows (a conversation hands in its refreshMap hook).
  // The same state when stateId isn't one of the object's states.
  setState(state, stateId, retile = withMap) {
    if (!this.definition.states[stateId]) return state
    const runtime = { ...this.runtime(state.scenario), state: stateId }
    return retile({ ...state, scenario: { ...state.scenario, objects: { ...state.scenario.objects, [this.id]: runtime } } })
  }

  // Who of memberIds is the strongest choice for the action, each judged alone on the task their roll would use
  // (rules/taskRecommendation.js; guidance only). null for a routine action, which has no roll.
  recommend(state, actionId, memberIds) {
    const action = this.action(actionId)
    if (!action || action.routine) return null
    return recommendPerformers(memberIds.map((id) => ({ id, prepared: this.preview(state, { actionId, performerId: id }).prepared })))
  }

  // A player's attempt: { actionId, performerId, assistantId, assistIndex, purchase }. purchase (optional): bonus d20s
  // bought before the roll, { bonusDice, momentum } (rules/missionResources.js), paid from the mission's group Momentum
  // and/or by adding Threat. Afterwards the task's Momentum is saved to the group pool. Returns the new state with
  // lastTask (what the panel shows), a log entry and the map retiled; the very same state when the attempt isn't
  // allowed (combatLink.js relies on that identity). In combat, request.combatAssist replaces assistantId (see
  // preview) and the caller has already put the fighters' positions into party.members.
  attempt(state, request) {
    const { actionId, performerId, assistantId = null, assistIndex = 0, combatAssist = null } = request
    const offered = this.availableActions(state).find((entry) => entry.action.id === actionId)
    const inRange = this.membersInRange(state.party).map((member) => member.id)
    if (!offered?.available || !inRange.includes(performerId)) return state
    if (!combatAssist && assistantId && (assistantId === performerId || !inRange.includes(assistantId) || !offered.action.assist?.[assistIndex])) return state
    const { action } = offered

    const ctx = { performerId, messages: [] }
    const key = state.scenario.taskCount
    let result = null
    let preview = { prepared: null, assist: null }
    let effects = action.onSuccess ?? []
    let purchase = null
    let saving = null
    let next = { ...state, scenario: { ...state.scenario, taskCount: key + 1 } }
    if (!action.routine) {
      preview = this.preview(state, request)
      // No Momentum spends on challenge results yet, so it all goes to the group pool (partyTaskRoll.js).
      const roll = rollPartyTask(state, { prepared: preview.prepared, assist: preview.assist, purchase: request.purchase })
      if (!roll) return state
      ;({ result, purchase, saving } = roll)
      next = roll.state
      effects = [...(action.always ?? []), ...((result.success ? action.onSuccess : action.onFailure) ?? []), ...(result.complications ? (action.onComplication ?? []) : [])]
    }
    next = effects.reduce((current, effect) => applyObjectEffect(current, this, action, effect, ctx), next)
    const entry = {
      key,
      time: state.world.time,
      objectId: this.id,
      actionId,
      performerId,
      assistantId: preview.assist ? (combatAssist?.helperId ?? assistantId) : null,
      routine: Boolean(action.routine),
      success: result ? result.success : true,
      successes: result?.successes ?? null,
      momentumGenerated: result?.momentumGenerated ?? 0,
      momentumSaved: saving?.saved ?? 0,
      momentumLost: saving?.lost ?? 0,
      bonusDice: purchase?.bonusDice ?? 0,
      momentumSpentOnDice: purchase?.momentum ?? 0,
      threatAddedForDice: purchase?.threatAdded ?? 0,
      complications: result?.complications ?? 0,
    }
    next = { ...next, scenario: { ...next.scenario, log: [...next.scenario.log, entry] } }
    next = { ...next, lastTask: { ...entry, prepared: preview.prepared, assist: preview.assist, result, messages: ctx.messages } }
    return withMap(next)
  }
}
