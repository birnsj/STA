// Destructible objects and hazards in a fight (world/environment.js). state.environment is the fight's copy of the
// world's environment (WorldEncounter.js hands it in and takes it back); state.map shows each object's tile and what smoke
// hides. Blasts and hazards hurt through combatInjuries.js inflictInjury: when Avoid Injury is possible,
// Stress (or Threat) is spent immediately — no prompt (designer 2026-10-15). Weapon hits still ask as usual.
import { getRangeBand, hasLineOfFire, tileDistance } from './rangeSystem.js'
import { getAttackTaskSpec, getCombatantWeapon, getRangeModifier } from './weaponSystem.js'
import { canTakeCover } from './coverSystem.js'
import { getAttackTask } from './combatAttacks.js'
import { inflictInjury } from './combatInjuries.js'
import { addLog, updateCombatant } from './combatLog.js'
import { canAfford, isActive } from './combatSelectors.js'
import { countHazards } from '../dev/hazardPerf.js'
import { perfEnd, perfOff, perfStart } from '../dev/perfProbe.js'
import { normalizeCondition } from '../rules/personalCondition.js'
import { damageObject, hazardRound, hitText, injuryFromHit, isStanding, OBJECT_ATTACK_DIFFICULTY, objectDamage } from '../world/environment.js'
import { syncHazardAfflictions } from '../world/hazardAfflictions.js'

// Who a blast or hazard can catch: every combatant still in the fight, whatever their side.
export const blastActors = (state) =>
  Object.values(state.combatants)
    .filter(isActive)
    .map(({ id, position }) => ({ id, position }))

// The objects still standing that may be shot (the editor can make one unattackable).
export const standingObjects = (state) => Object.values(state.environment?.destructibles ?? {}).filter((record) => isStanding(record) && record.attackable)

// Cover follows the map: a destroyed object no longer covers anyone, thin smoke covers whoever stands in it.
function refreshCover(state, before) {
  if (state.map === before) return state
  return Object.values(state.combatants)
    .filter(isActive)
    .reduce((next, combatant) => {
      const inCover = canTakeCover(next.map, combatant.position)
      return inCover === combatant.inCover ? next : updateCombatant(next, combatant.id, { inCover })
    }, state)
}

// The hits a blast or hazard round dealt, each as an Injury. Returns { state, lines }.
export function applyEnvironmentHits(state, hits) {
  let next = state
  const lines = []
  hits.forEach((hit, index) => {
    const target = next.combatants[hit.targetId]
    if (!target || !isActive(target)) return
    const injury = injuryFromHit(target.character, hit, `${state.seed}-${state.log.length}-env${index}-${target.id}`)
    lines.push(`${target.character.name} is ${hitText(hit)}.`)
    const result = inflictInjury(next, null, target.id, injury)
    next = result.state
    lines.push(...result.lines)
  })
  return { state: next, lines }
}

// An environment result (damageObject / hazardRound) applied to the fight. Returns { state, lines }.
function applyResult(state, result, { syncAfflictions = false } = {}) {
  let placed = refreshCover({ ...state, environment: result.environment, map: result.map }, state.map)
  let hits = result.hits
  if (syncAfflictions) {
    const subjects = Object.values(placed.combatants)
      .filter(isActive)
      .map((combatant) => ({ id: combatant.id, position: combatant.position, character: combatant.character, condition: combatant.condition }))
    const synced = syncHazardAfflictions(subjects, hits, result.environment)
    hits = synced.hits
    synced.afflictionsById.forEach((afflictions, id) => {
      const combatant = placed.combatants[id]
      if (!combatant) return
      placed = updateCombatant(placed, id, { condition: { ...normalizeCondition(combatant.condition), afflictions } })
    })
  }
  const applied = applyEnvironmentHits(placed, hits)
  return { state: applied.state, lines: [...result.lines, ...applied.lines] }
}

// Apply a deferred object shot after the beam has played (AttackObjectAction sets pendingObjectHit).
export function applyPendingObjectHit(state) {
  const pending = state.pendingObjectHit
  if (!pending) return state
  const before = state.environment?.explosions ?? []
  const hit = damageObjectInCombat({ ...state, pendingObjectHit: null }, pending.objectId, pending.damage)
  let next = hit.lines.length ? addLog(hit.state, hit.lines) : hit.state
  const explosions = (next.environment?.explosions ?? []).filter((blast) => !before.includes(blast)).map((blast) => blast.id)
  if (next.lastAction?.type === 'attackObject' && next.lastAction.key === pending.key) {
    next = { ...next, lastAction: { ...next.lastAction, explosions, awaiting: false } }
  }
  return next
}

// Structure damage to an object (a shot, a hazard), with any explosions it sets off. Returns { state, lines }.
export function damageObjectInCombat(state, objectId, amount) {
  if (!state.environment?.destructibles?.[objectId]) return { state, lines: [] }
  return applyResult(state, damageObject(state.environment, state.map, objectId, amount, blastActors(state)))
}

// Book (Core p.327): a lingering hazard inflicts its Injury at the start of each round. Returns { state, lines }.
export function combatHazardRound(state) {
  if (!state.environment || perfOff('hazards')) return { state, lines: [] }
  const started = perfStart()
  countHazards(state.environment)
  const result = applyResult(state, hazardRound(state.environment, state.map, blastActors(state)), { syncAfflictions: true })
  perfEnd('hazard.round', started)
  return result
}

// Everything the Task panel and the AI need before shooting an object, like previewAttack for a combatant.
// PROTOTYPE RULE: the weapon's attack task at OBJECT_ATTACK_DIFFICULTY plus the range modifier (the attack's base
// Difficulty is replaced; scene traits and the character's own task effects still apply); an object never defends.
export function previewObjectAttack(state, attackerId, objectId, weaponId, fromPosition) {
  const attacker = state.combatants[attackerId]
  const record = state.environment?.destructibles?.[objectId]
  const weapon = attacker && getCombatantWeapon(attacker, weaponId)
  if (!attacker || !weapon || !record) return { available: false, reason: 'Choose a target.' }
  const position = fromPosition ?? attacker.position
  const distance = tileDistance(position, record.position)
  const band = getRangeBand(distance)
  const range = getRangeModifier(weapon, band)
  const prepared = getAttackTask(state, attackerId, weaponId)
  const difficulty = Math.max(0, prepared.difficulty - getAttackTaskSpec(weapon).baseDifficulty + OBJECT_ATTACK_DIFFICULTY + range.modifier)
  const base = {
    weapon,
    record,
    distance,
    band,
    rangeModifier: range.modifier,
    task: { ...prepared.task, difficulty },
    prepared,
    damage: objectDamage(record, weapon.severity),
    explosion: record.explosion,
    difficultyLines: [
      { label: 'Object', change: OBJECT_ATTACK_DIFFICULTY },
      ...prepared.difficultyLines.slice(1),
      ...(range.modifier ? [{ label: `Range: ${band.name}`, change: range.modifier }] : []),
    ],
  }
  if (!isStanding(record)) return { ...base, available: false, reason: 'Already destroyed.' }
  if (!record.attackable) return { ...base, available: false, reason: "Can't be attacked." }
  if (!canAfford(state, attacker, 'attack')) return { ...base, available: false, reason: 'No Major action left.' }
  if (!prepared.possible) return { ...base, available: false, reason: prepared.blockers.join('; ') }
  if (!range.available) return { ...base, available: false, reason: `Out of range (${band.name}).` }
  if (!hasLineOfFire(state.map, position, record.position)) return { ...base, available: false, reason: 'No line of fire.' }
  return { ...base, available: true, reason: null }
}
