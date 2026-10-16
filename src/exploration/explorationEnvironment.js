// Destructible objects and hazards outside combat (world/environment.js). Designer decisions (2026-10-12, 2026-10-15): a
// party member can fire on a destructible object from its ring; a hazard round passes every HAZARD_ROUND_SECONDS of world
// time; blasts and hazards auto-spend Stress (or Threat) when Avoid Injury is possible — no prompt. NPCs who cannot Avoid
// (or choose not to via injuryPolicy) are settled at once. An explosion is loud (awareness.json combatNoise.explosion),
// and a hostile NPC close by that knows something is wrong starts a fight afterwards.
import { isDown, isUp } from '../actors/controllers.js'
import { getAttributeName } from '../character/runtimeCharacter.js'
import { toBattleMap } from '../combat/battleMap.js'
import { armedForWorldCombat } from '../combat/encounters.js'
import { chooseAvoidInjury, chooseFatigueAttribute } from '../combat/injuryPolicy.js'
import { tileKey } from '../combat/battleMap.js'
import { blastFaceOrigin, blastThrow, isExplosionInjury } from '../rules/appearance.js'

// Match combat battleHelpers objectShotImpactMs: laser on screen before boom; pulse waits to land.
const objectHitDelayMs = (weapon) => (weapon.shotStyle === 'pulse' ? 500 : 670)
import { getRangeBand, hasLineOfFire, tileDistance } from '../combat/rangeSystem.js'
import { getAttackTaskSpec, getCharacterWeapons, getRangeModifier } from '../combat/weaponSystem.js'
import awarenessData from '../data/adaptation/exploration/awareness.json'
import { countHazards } from '../dev/hazardPerf.js'
import { perfEnd, perfOff, perfStart } from '../dev/perfProbe.js'
import { avoidInjury, chooseFatiguedAttribute, getAvoidOption, injuryText, injuryTypeName, normalizeCondition, takeHit } from '../rules/personalCondition.js'
import { prepareTask } from '../rules/taskPreparation.js'
import { damageObject, hazardRound, HAZARD_ROUND_SECONDS, hitText, injuryFromHit, isStanding, needsHazardRounds, OBJECT_ATTACK_DIFFICULTY, objectDamage } from '../world/environment.js'
import { withEnvironment } from '../world/environmentState.js'
import { hazardChallengeId } from '../world/EnvironmentalHazard.js'
import { syncHazardAfflictions } from '../world/hazardAfflictions.js'
import { emitNoise, getNpcs, isHostile, joinsCombat, STATE } from './awareness.js'
import { attemptChallenge } from './challengeObjects.js'
import { MODE, startCombat } from './combatLink.js'
import { addLogEntry } from './missionLog.js'
import { getMembers, withAbleSelection } from './partyControl.js'
import { rollPartyTask } from './partyTaskRoll.js'
import { gridToWorld, worldToGrid } from './tacticalGrid.js'

// How close (tiles) a hostile NPC that has noticed something must be for a shot at an object to start a fight
// (prototype placeholder).
export const OBJECT_FIGHT_RADIUS = 12

// Everyone a blast or hazard can catch: the party members and NPCs still standing (on their tiles).
export function explorationActors(state) {
  const members = getMembers(state.party).filter((member) => isUp(member) && !member.beaming)
  const npcs = getNpcs(state.world).filter((npc) => !isDown(npc) && !npc.fled)
  return [...members, ...npcs].map((actor) => ({ id: actor.id, position: worldToGrid(actor.position) }))
}

const actorOf = (state, id) => state.party.members[id] ?? state.world.npcs[id] ?? null
const nameOf = (actor) => actor.character?.name ?? actor.name ?? actor.id

function withCondition(state, id, condition) {
  if (state.party.members[id]) return { ...state, party: { ...state.party, members: { ...state.party.members, [id]: { ...state.party.members[id], condition } } } }
  return { ...state, world: { ...state.world, npcs: { ...state.world.npcs, [id]: { ...state.world.npcs[id], condition } } } }
}

function withActor(state, id, patch) {
  if (state.party.members[id]) return { ...state, party: { ...state.party, members: { ...state.party.members, [id]: { ...state.party.members[id], ...patch } } } }
  if (state.world.npcs[id]) return { ...state, world: { ...state.world, npcs: { ...state.world.npcs, [id]: { ...state.world.npcs[id], ...patch } } } }
  return state
}

// Tiles other standing characters occupy (blast landing must not stack onto them).
function occupiedBlastKeys(state, exceptId) {
  const keys = new Set()
  for (const member of getMembers(state.party)) {
    if (member.id === exceptId || isDown(member)) continue
    keys.add(tileKey(worldToGrid(member.position)))
  }
  for (const npc of getNpcs(state.world)) {
    if (npc.id === exceptId || isDown(npc) || npc.fled) continue
    keys.add(tileKey(worldToGrid(npc.position)))
  }
  return keys
}

// Move them to where the blast throws them so they get up on that tile (stops at walls and occupied tiles). Facing
// looks back at the explosive; the slide still uses the outward throw. Clears walk orders.
function thrownByBlast(state, id, injury) {
  const throw_ = blastThrow(state.party.map, injury, id, occupiedBlastKeys(state, id))
  if (!throw_) return { blastReact: { injury }, facing: blastFaceOrigin(injury, id, injury.source?.at) }
  const react = { injury, from: throw_.from, land: throw_.land, facing: throw_.facing }
  const facing = { ...throw_.look }
  if (throw_.land.x === throw_.from.x && throw_.land.y === throw_.from.y) return { blastReact: react, facing }
  return {
    blastReact: react,
    position: gridToWorld(throw_.land),
    facing,
    path: [],
    moving: false,
    running: false,
    order: null,
    pace: null,
  }
}

const avoidOption = (state, actor, injury) =>
  getAvoidOption(actor.character, normalizeCondition(actor.condition), injury, { threat: state.resources.threat, avoidedThisScene: state.avoidedThisScene ?? [] })

// The answer to an Injury: avoided (Stress, or Threat for a notable NPC) or suffered. Returns { state, lines }.
// PROTOTYPE: outside combat, a character who becomes Fatigued has the attribute chosen by injuryPolicy.js's rule
// (the lowest one their weapons don't attack with); combat asks the player.
function settleInjury(state, id, injury, avoid) {
  const actor = actorOf(state, id)
  if (!actor) return { state, lines: [] }
  const name = nameOf(actor)
  const condition = normalizeCondition(actor.condition)
  const option = avoidOption(state, actor, injury)
  if (avoid && option.possible) {
    const avoided = avoidInjury(actor.character, condition, injury, option.kind)
    let next = withCondition(state, id, avoided.condition)
    // Blast: stagger fall + get-up, and stand on the tile they land on (not slide back to the old one).
    if (isExplosionInjury(injury)) next = withActor(next, id, thrownByBlast(next, id, injury))
    const lines = []
    if (option.kind === 'threat') {
      next = { ...next, resources: { ...next.resources, threat: next.resources.threat - option.cost }, avoidedThisScene: [...(next.avoidedThisScene ?? []), actor.character.id] }
      lines.push(`${name} avoids the Injury (${option.cost} Threat).`)
    } else {
      lines.push(`${name} avoids the Injury: takes ${avoided.taken} Stress.`)
    }
    if (avoided.complication) lines.push(`${name} suffers a complication: ${avoided.complication.name}.`)
    if (avoided.becameFatigued) {
      const { attributeId } = chooseFatigueAttribute({ combatant: { character: actor.character, weaponIds: getCharacterWeapons(actor.character).map((weapon) => weapon.id) } })
      next = withCondition(next, id, chooseFatiguedAttribute(avoided.condition, attributeId))
      lines.push(`${name} is Fatigued and shuts down ${getAttributeName(attributeId)}.`)
    }
    return { state: next, lines }
  }
  const hit = takeHit(actor.character, condition, injury)
  const minor = !hit.injuries.includes(injury)
  const lines = [
    ...(option.reason && avoid ? [`Cannot Avoid Injury: ${option.reason}`] : []),
    minor ? `${name} is Defeated (${injuryTypeName(injury.type)}).` : `${name} suffers a ${injuryText(injury)} and is Defeated${hit.dying ? ' (Dying)' : ''}.`,
  ]
  // Defeated: fall comes from condition; blasts still throw them to the landing tile (blastReact keeps from/land for the slide).
  // Always clear walk orders so a stunned/dead body does not keep sliding from a leftover move.
  const halted = { order: null, path: [], pace: null, moving: false, running: false, blastReact: null }
  const downed = isExplosionInjury(injury) ? { ...halted, ...thrownByBlast(state, id, injury) } : halted
  let next = withActor(withCondition(state, id, hit), id, downed)
  // Party member: drop them out of the selection / lead once they go down mid-exploration.
  if (next.party?.members?.[id]) next = { ...next, party: withAbleSelection(next.party) }
  return { state: next, lines }
}

// The blast and hazard hits of an environment result. Designer decision (2026-10-15): blasts and hazards always spend
// Stress (or Threat for notables) when Avoid Injury is possible — no prompt, so play is not interrupted. NPCs and anyone
// who cannot Avoid are settled the usual way. Weapon Avoid Injury in combat is unchanged. Returns { state, lines }.
function applyHits(state, hits) {
  let next = state
  const lines = []
  hits.forEach((hit, index) => {
    const actor = actorOf(next, hit.targetId)
    if (!actor || isDown(actor)) return
    const injury = injuryFromHit(actor.character, hit, `${state.seed}-env${next.environment.sequence}-${next.environment.round}-${index}-${actor.id}`)
    lines.push(`${nameOf(actor)} is ${hitText(hit)} (${injuryTypeName(injury.type)}, Severity ${injury.severity}).`)
    const option = avoidOption(next, actor, injury)
    const avoid = next.party.members[actor.id] ? option.possible : chooseAvoidInjury({ option })
    const settled = settleInjury(next, actor.id, injury, avoid)
    next = settled.state
    lines.push(...settled.lines)
  })
  return { state: next, lines }
}

// The first queued prompt with its option worked out now (an earlier answer may have changed it), or null.
export function currentInjuryPrompt(state) {
  const prompt = state.injuryPrompts?.[0]
  if (!prompt) return null
  const member = state.party.members[prompt.targetId]
  return member ? { ...prompt, member, option: avoidOption(state, member, prompt.injury) } : null
}

// The player's answer to the first queued prompt ({ avoid }). Prompts that can no longer be avoided are suffered.
export function answerInjuryPrompt(state, avoid) {
  const [prompt, ...rest] = state.injuryPrompts ?? []
  if (!prompt) return state
  const settled = settleInjury({ ...state, injuryPrompts: rest }, prompt.targetId, prompt.injury, avoid)
  return settled.lines.reduce((next, text) => addLogEntry(next, { kind: 'environment', text }), settled.state)
}

// After the fall / getUp stagger has finished playing (presentation). Clears the marker and faces the explosive.
export function clearBlastReact(state, id) {
  const actor = actorOf(state, id)
  if (!actor?.blastReact) return state
  const { injury, land, from } = actor.blastReact
  const cell = land ?? from ?? (actor.position ? worldToGrid(actor.position) : null)
  return withActor(state, id, {
    blastReact: null,
    ...(injury ? { facing: blastFaceOrigin(injury, id, cell) } : {}),
  })
}

const logLines = (state, lines) => lines.reduce((next, text) => addLogEntry(next, { kind: 'environment', text }), state)

// The noise of a shot or blast at a tile (awareness.json combatNoise).
function noise(state, kind, cell, sourceId) {
  const info = awarenessData.combatNoise[kind]
  return info ? { ...state, world: emitNoise(state.world, { position: gridToWorld(cell), radius: info.radius, intensity: info.intensity, source: sourceId }) } : state
}

// An environment result applied to the exploration: the new environment (world map and hazard objects follow), the hits,
// the explosions' noise and the log. Returns the state.
function applyResult(state, result, sourceId, { syncAfflictions = false } = {}) {
  let next = withEnvironment(state, result.environment)
  let hits = result.hits
  if (syncAfflictions) {
    const subjects = explorationActors(next).map(({ id, position }) => {
      const actor = actorOf(next, id)
      return { id, position, character: actor?.character, condition: actor?.condition }
    })
    const synced = syncHazardAfflictions(subjects, hits, result.environment)
    hits = synced.hits
    synced.afflictionsById.forEach((afflictions, id) => {
      const actor = actorOf(next, id)
      if (!actor) return
      next = withCondition(next, id, { ...normalizeCondition(actor.condition), afflictions })
    })
  }
  const applied = applyHits(next, hits)
  next = applied.state
  result.explosions.forEach((explosion) => {
    next = noise(next, 'explosion', explosion.position, sourceId)
  })
  return logLines(next, [...result.lines, ...applied.lines])
}

// ---------- firing on an object ----------

// The member's best weapon for the shot: in range, then most Structure damage, then the easiest. A member with no
// weapon of their own has the standard issue the party bar shows and a fight would give them.
function shotOptions(state, member, record) {
  const from = worldToGrid(member.position)
  const distance = tileDistance(from, record.position)
  const band = getRangeBand(distance)
  return getCharacterWeapons(armedForWorldCombat(member.character))
    .map((weapon) => ({ weapon, range: getRangeModifier(weapon, band) }))
    .filter(({ range }) => range.available)
    .map(({ weapon, range }) => {
      const spec = getAttackTaskSpec(weapon)
      const task = { attribute: spec.attribute, department: spec.department, difficulty: OBJECT_ATTACK_DIFFICULTY, focuses: weapon.focuses, tags: spec.tags, traitRules: spec.traitRules }
      const context = { traits: state.scenario?.traits ?? [], side: 'player', condition: normalizeCondition(member.condition), extraLines: range.modifier ? [{ label: `Range: ${band.name}`, change: range.modifier }] : [] }
      return { weapon, band, distance, prepared: prepareTask(member.character, task, context), damage: objectDamage(record, weapon.severity) }
    })
    .sort((a, b) => b.damage - a.damage || a.prepared.difficulty - b.prepared.difficulty)
}

// Everything the ring needs before a member fires on an object: { available, reason, weapon, prepared, damage, explosion }.
// PROTOTYPE RULE (as in combat, combatEnvironment.js): the weapon's attack task at OBJECT_ATTACK_DIFFICULTY plus the
// range modifier; the object never defends.
export function previewObjectShot(state, memberId, objectId) {
  const member = state.party.members[memberId]
  const record = state.environment?.destructibles?.[objectId]
  if (!member || !record) return { available: false, reason: 'Choose a target.' }
  const { explosion } = record
  if (!isStanding(record)) return { available: false, reason: 'Already destroyed.', explosion }
  if (!record.attackable) return { available: false, reason: "Can't be attacked.", explosion }
  if (!isUp(member)) return { available: false, reason: `${member.character.name} can't act.`, explosion }
  const best = shotOptions(state, member, record)[0]
  if (!best) return { available: false, reason: 'Out of range.', explosion }
  if (!hasLineOfFire(toBattleMap(state.party.map), worldToGrid(member.position), record.position)) return { ...best, available: false, reason: 'No line of fire.', explosion }
  if (!best.prepared.possible) return { ...best, available: false, reason: best.prepared.blockers.join('; '), explosion }
  return { ...best, available: true, reason: null, explosion }
}

// A hostile NPC close to the shot that has noticed something (no longer Unaware) and would fight, or null.
function fightStarter(state, cell) {
  return (
    getNpcs(state.world)
      .filter((npc) => !isDown(npc) && !npc.fled && isHostile(npc) && joinsCombat(npc) && npc.state !== STATE.UNAWARE)
      .map((npc) => ({ npc, distance: tileDistance(worldToGrid(npc.position), cell) }))
      .filter(({ distance }) => distance <= OBJECT_FIGHT_RADIUS)
      .sort((a, b) => a.distance - b.distance || a.npc.id.localeCompare(b.npc.id))[0]?.npc ?? null
  )
}

// { memberId, objectId, purchase }: the member fires on the object. One roll (partyTaskRoll.js). The beam plays first;
// damage / explosion wait for applyPendingObjectHit (after objectShotImpactMs) so the laser is seen before the boom.
export function fireOnObject(state, { memberId, objectId, purchase }) {
  if (state.mode === MODE.COMBAT) return state
  if (state.pendingObjectHit) return state
  const preview = previewObjectShot(state, memberId, objectId)
  if (!preview.available) return state
  const member = state.party.members[memberId]
  const record = state.environment.destructibles[objectId]
  const roll = rollPartyTask(state, { prepared: preview.prepared, purchase })
  if (!roll) return state
  const { result } = roll
  let next = noise(roll.state, 'attack', worldToGrid(member.position), memberId)
  next = logLines(next, [`${member.character.name} fires at the ${record.name} (${preview.weapon.name}): ${result.success ? 'hit' : 'miss'} (${result.successes} vs Difficulty ${preview.prepared.difficulty}).`])
  const objectShot = { key: next.scenario.taskCount, memberId, objectId, weaponId: preview.weapon.id, passed: result.success }
  next = { ...next, lastObjectShot: objectShot }
  if (!result.success) return next
  return {
    ...next,
    pendingObjectHit: {
      objectId,
      damage: preview.damage,
      memberId,
      weaponId: preview.weapon.id,
      impactMs: objectHitDelayMs(preview.weapon),
      key: objectShot.key,
    },
  }
}

// Apply a successful object shot after the beam has played: Structure damage, explosion, blast stagger, then fight if needed.
export function applyPendingObjectHit(state) {
  const pending = state.pendingObjectHit
  if (!pending || state.mode === MODE.COMBAT) return state
  let next = { ...state, pendingObjectHit: null }
  const beforeExplosions = next.environment?.explosions ?? []
  next = applyResult(next, damageObject(next.environment, next.party.map, pending.objectId, pending.damage, explorationActors(next)), pending.memberId)
  const record = next.environment.destructibles[pending.objectId]
  const starter = fightStarter(next, record.position)
  if (!starter) return next
  const fighting = startCombat(next, { triggerNpcId: starter.id, triggerTargetId: pending.memberId, source: 'OBJECT_ATTACK', position: gridToWorld(record.position) })
  if (!fighting.combat) return fighting
  const explosions = (fighting.environment?.explosions ?? next.environment?.explosions ?? [])
    .filter((blast) => !beforeExplosions.includes(blast))
    .map((blast) => blast.id)
  return {
    ...fighting,
    combat: {
      ...fighting.combat,
      lastAction: {
        key: fighting.combat.log.length,
        type: 'attackObject',
        actorId: pending.memberId,
        objectId: pending.objectId,
        weaponId: pending.weaponId,
        passed: true,
        explosions,
      },
    },
  }
}

// ---------- neutralizing a hazard ----------

// { hazardId, performerId, assistantId, assistIndex, purchase }: the hazard's Neutralize task from its ring, through the
// usual challenge roll (world/EnvironmentalHazard.js). The same state when it isn't allowed.
export function neutralizeHazardTask(state, { hazardId, ...request }) {
  return attemptChallenge(state, { ...request, objectId: hazardChallengeId(hazardId), actionId: 'neutralize' })
}

// ---------- hazard rounds ----------

// Exploration's 'tick': world time passes, and every HAZARD_ROUND_SECONDS a hazard round (world/environment.js
// hazardRound). Nothing happens while there is no hazard and nothing leaking; the rounds wait while an Avoid Injury
// prompt is still open, so answers never pile up behind the player.
export function tickHazards(state, seconds) {
  if (!state.environment || state.mode === MODE.COMBAT) return state
  if (!needsHazardRounds(state.environment)) return state.hazardClock ? { ...state, hazardClock: 0 } : state
  if (state.injuryPrompts?.length) return state
  const clock = (state.hazardClock ?? 0) + Math.max(0, seconds)
  if (clock < HAZARD_ROUND_SECONDS) return { ...state, hazardClock: clock }
  const next = { ...state, hazardClock: clock - HAZARD_ROUND_SECONDS }
  if (perfOff('hazards')) return next
  const started = perfStart()
  countHazards(next.environment)
  const result = applyResult(next, hazardRound(next.environment, next.party.map, explorationActors(next)), 'hazard', { syncAfflictions: true })
  perfEnd('hazard.round', started)
  return result
}
