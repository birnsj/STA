// A challenge object's authored outcomes (challenges.json: always / onSuccess / onFailure / onComplication), by effect
// type. Each is (state, object, action, effect, ctx) -> state, applied in the authored order; ctx: { performerId,
// messages } (messages collects the texts the interaction panel shows). Unknown types change nothing.
import { isDown } from '../actors/controllers.js'
import { emitNoise, getNpcs } from '../exploration/awareness.js'
import { applyFlagChange } from '../exploration/missionFlags.js'
import { addLogEntry } from '../exploration/missionLog.js'
import { addKnowledgeFact, revealEntity } from '../exploration/partyKnowledge.js'
import { neutralizeHazard } from './environment.js'
import { withEnvironment } from './environmentState.js'

const traitKey = (name) => name.toLowerCase()
const withTraits = (state, traits) => ({ ...state, scenario: { ...state.scenario, traits } })
const withFlags = (state, flags) => ({ ...state, scenario: { ...state.scenario, flags } })

const setRuntime = (state, object, changes) => ({
  ...state,
  scenario: { ...state.scenario, objects: { ...state.scenario.objects, [object.id]: { ...object.runtime(state.scenario), ...changes } } },
})

const EFFECTS = {
  // The object's own runtime.
  // An unknown state changes nothing, the same rule as ChallengeObject.setState (a stranded object would match no action).
  setState: (state, object, action, effect) => (object.definition.states[effect.state] ? setRuntime(state, object, { state: effect.state }) : state),
  adjustDifficulty: (state, object, action, effect) => {
    const { difficultyMods } = object.runtime(state.scenario)
    const actionId = effect.actionId ?? action.id
    const previous = difficultyMods[actionId]?.change ?? 0
    return setRuntime(state, object, { difficultyMods: { ...difficultyMods, [actionId]: { change: previous + effect.change, label: effect.label ?? 'Situation' } } })
  },
  // The world clock stands still during combat, so there the lock lasts until the next combat round.
  lock: (state, object, action, effect) => {
    const { locks, combatLocks } = object.runtime(state.scenario)
    if (state.combat) return setRuntime(state, object, { combatLocks: { ...combatLocks, [action.id]: state.combat.round + 1 } })
    return setRuntime(state, object, { locks: { ...locks, [action.id]: state.world.time + effect.seconds } })
  },

  // Mission flags (missionFlags.js). changeFlag: { flag, op: 'set' | 'clear' | 'add', value }.
  setFlag: (state, object, action, effect) => withFlags(state, applyFlagChange(state.scenario.flags, { flag: effect.flag, op: 'set', value: effect.value })),
  changeFlag: (state, object, action, effect) => withFlags(state, applyFlagChange(state.scenario.flags, effect)),

  // NPCs (awareness.js).
  noise: (state, object, action, effect) => ({
    ...state,
    world: emitNoise(state.world, { position: object.position(), radius: effect.radius, intensity: effect.intensity ?? 1, source: `challenge:${object.id}` }),
  }),
  setNpcResponse: (state, object, action, effect) => {
    const npcs = Object.fromEntries(
      Object.entries(state.world.npcs).map(([id, npc]) => [id, npc.alertGroupId === effect.alertGroupId && (npc.responseType ?? null) === effect.from ? { ...npc, responseType: effect.to } : npc]),
    )
    return { ...state, world: { ...state.world, npcs } }
  },

  // Party Knowledge (partyKnowledge.js).
  revealNpcs: (state, object, action, effect, ctx) => {
    const near = getNpcs(state.world).filter((npc) => !isDown(npc) && object.distanceTo(npc.position) <= effect.radius)
    const partyKnowledge = near.reduce(
      (knowledge, npc) => revealEntity(knowledge, npc, { source: effect.source ?? 'sensor', identified: Boolean(effect.identified), time: state.world.time, observerId: ctx.performerId }),
      state.partyKnowledge,
    )
    return { ...state, partyKnowledge }
  },
  addFact: (state, object, action, effect) => ({
    ...state,
    partyKnowledge: addKnowledgeFact(state.partyKnowledge, effect.id, { text: effect.text, source: object.id, time: state.world.time }),
  }),

  // Create Trait (Book p.289): create a trait, remove one, or change its Potency (Book p.252).
  addTrait: (state, object, action, effect) => {
    const others = state.scenario.traits.filter((trait) => traitKey(trait.name) !== traitKey(effect.name))
    return withTraits(state, [...others, { name: effect.name, potency: effect.potency ?? 1, description: effect.description ?? '', source: object.id }])
  },
  removeTrait: (state, object, action, effect) => withTraits(state, state.scenario.traits.filter((trait) => traitKey(trait.name) !== traitKey(effect.name))),
  changePotency: (state, object, action, effect) =>
    withTraits(
      state,
      state.scenario.traits
        .map((trait) => (traitKey(trait.name) === traitKey(effect.name) ? { ...trait, potency: trait.potency + effect.change } : trait))
        .filter((trait) => trait.potency > 0),
    ),

  // Texts: the interaction panel's message, and an entry in the Captain's Log (missionLog.js).
  message: (state, object, action, effect, ctx) => {
    ctx.messages.push(effect.text)
    return state
  },
  addLogEntry: (state, object, action, effect) => addLogEntry(state, { kind: 'authored', text: effect.text }),

  // Environmental hazards (world/environment.js). { hazardId, mode: 'remove' | 'reduce' | 'stopSpread' | 'disableSource',
  // amount }: the hazard's own Neutralize task (world/EnvironmentalHazard.js, object id 'hazard:{id}') leaves hazardId out.
  neutralizeHazard: (state, object, action, effect) => {
    const hazardId = effect.hazardId ?? (object.id.startsWith('hazard:') ? object.id.slice('hazard:'.length) : null)
    if (!state.environment?.hazards?.[hazardId]) return state
    return withEnvironment(state, neutralizeHazard(state.environment, hazardId, effect.mode ?? 'remove', effect.amount ?? 1))
  },
}

export function applyObjectEffect(state, object, action, effect, ctx) {
  const apply = EFFECTS[effect.type]
  return apply ? apply(state, object, action, effect, ctx) : state
}
