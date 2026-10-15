// Destructible objects and hazards outside combat (world/environment.js). Designer decisions (2026-10-12): a party member
// can fire on a destructible object from its ring; a hazard round passes every HAZARD_ROUND_SECONDS of world time; each
// party member a blast or hazard hits gets an Avoid Injury prompt, queued one after another (state.injuryPrompts);
// NPCs decide at once (combat/injuryPolicy.js). An explosion is loud (awareness.json combatNoise.explosion), and a
// hostile NPC close by that knows something is wrong starts a fight afterwards.
import { isDown, isUp } from '../actors/controllers.js'
import { getAttributeName } from '../character/runtimeCharacter.js'
import { toBattleMap } from '../combat/battleMap.js'
import { armedForWorldCombat } from '../combat/encounters.js'
import { chooseAvoidInjury, chooseFatigueAttribute } from '../combat/injuryPolicy.js'
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
import { emitNoise, getNpcs, isHostile, joinsCombat, STATE } from './awareness.js'
import { attemptChallenge } from './challengeObjects.js'
import { MODE, startCombat } from './combatLink.js'
import { addLogEntry } from './missionLog.js'
import { getMembers } from './partyControl.js'
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
  return { state: withCondition(state, id, hit), lines }
}

// The blast and hazard hits of an environment result: party members are asked (queued prompts), NPCs decide now.
// Returns { state, lines }.
function applyHits(state, hits) {
  let next = state
  const lines = []
  hits.forEach((hit, index) => {
    const actor = actorOf(next, hit.targetId)
    if (!actor || isDown(actor)) return
    const injury = injuryFromHit(actor.character, hit, `${state.seed}-env${next.environment.sequence}-${next.environment.round}-${index}-${actor.id}`)
    lines.push(`${nameOf(actor)} is ${hitText(hit)} (${injuryTypeName(injury.type)}, Severity ${injury.severity}).`)
    const option = avoidOption(next, actor, injury)
    if (next.party.members[actor.id] && option.possible) {
      next = { ...next, injuryPrompts: [...(next.injuryPrompts ?? []), { targetId: actor.id, injury, text: hitText(hit) }] }
      return
    }
    const settled = settleInjury(next, actor.id, injury, chooseAvoidInjury({ option }))
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

const logLines = (state, lines) => lines.reduce((next, text) => addLogEntry(next, { kind: 'environment', text }), state)

// The noise of a shot or blast at a tile (awareness.json combatNoise).
function noise(state, kind, cell, sourceId) {
  const info = awarenessData.combatNoise[kind]
  return info ? { ...state, world: emitNoise(state.world, { position: gridToWorld(cell), radius: info.radius, intensity: info.intensity, source: sourceId }) } : state
}

// An environment result applied to the exploration: the new environment (world map and hazard objects follow), the hits,
// the explosions' noise and the log. Returns the state.
function applyResult(state, result, sourceId) {
  let next = withEnvironment(state, result.environment)
  const applied = applyHits(next, result.hits)
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

// { memberId, objectId, purchase }: the member fires on the object. One roll (partyTaskRoll.js); a success does the
// weapon's severity less Resistance to its Structure. The shot is heard like gunfire; any explosion is louder. Then a
// hostile NPC nearby that noticed starts a fight.
export function fireOnObject(state, { memberId, objectId, purchase }) {
  if (state.mode === MODE.COMBAT) return state
  const preview = previewObjectShot(state, memberId, objectId)
  if (!preview.available) return state
  const member = state.party.members[memberId]
  const record = state.environment.destructibles[objectId]
  const roll = rollPartyTask(state, { prepared: preview.prepared, purchase })
  if (!roll) return state
  const { result } = roll
  let next = noise(roll.state, 'attack', worldToGrid(member.position), memberId)
  next = logLines(next, [`${member.character.name} fires at the ${record.name} (${preview.weapon.name}): ${result.success ? 'hit' : 'miss'} (${result.successes} vs Difficulty ${preview.prepared.difficulty}).`])
  if (result.success) next = applyResult(next, damageObject(next.environment, next.party.map, objectId, preview.damage, explorationActors(next)), memberId)
  next = { ...next, lastObjectShot: { key: next.scenario.taskCount, memberId, objectId, weaponId: preview.weapon.id, passed: result.success } }
  const starter = fightStarter(next, record.position)
  return starter ? startCombat(next, { triggerNpcId: starter.id, triggerTargetId: memberId, source: 'OBJECT_ATTACK', position: gridToWorld(record.position) }) : next
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
  const result = applyResult(next, hazardRound(next.environment, next.party.map, explorationActors(next)), 'hazard')
  perfEnd('hazard.round', started)
  return result
}
