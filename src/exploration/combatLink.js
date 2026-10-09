// Combat in the exploration world. COMBAT_READY asks for combat; startCombat turns the world's current moment into a
// Combat Type 1 fight on the same map, with the same characters standing where they are; every combat action then runs
// through combatAction (so enemies only fight the party members they know about, and noise or sight can pull more NPCs
// in); endCombat writes the outcome back into the world and hands control back to exploration.
// Pure functions over the exploration state (src/exploration/explorationState.js); no React.
import { autoCombatReducer } from '../combat/autoCombat.js'
import { tileKey, toBattleMap } from '../combat/battleMap.js'
import {
  addCombatant,
  actionTypeOf,
  applyInteraction,
  awaitingDecision,
  canInteract,
  canMove,
  combatReducer,
  createCombat,
  getActiveCombatant,
  getAssistFor,
  getCombatantList,
  getOpponents,
  getReachable,
  isActive,
  reachLines,
  secondMajorLines,
} from '../combat/combatState.js'
import { WORLD_ENCOUNTER_ID } from '../combat/encounters.js'
import { tileDistance } from '../combat/rangeSystem.js'
import awarenessData from '../data/adaptation/exploration/awareness.json'
import { isDefeated, normalizeCondition, wouldDieAtSceneEnd } from '../rules/personalCondition.js'
import { deriveSeed } from '../rules/seededRandom.js'
import { alertGroup, emitNoise, getCombatReady, getNpcs, hasIdentified, isDown, joinsCombat, perceive, STATE } from './awareness.js'
import { attemptChallenge, combatCostOf, getAvailableActions, getDefinition, INTERACT_RANGE, previewChallenge } from './challengeObjects.js'
import { getMembers, withAbleSelection } from './partyControl.js'
import { getEntityKnowledge, KNOWLEDGE, updatePartyKnowledge } from './partyKnowledge.js'
import { gridToWorld, nearestFreeCell, snapToGrid, worldToGrid } from './tacticalGrid.js'

export const MODE = { EXPLORATION: 'EXPLORATION', COMBAT: 'COMBAT' }
// How far from the trigger the diagnostics list NPCs that stayed out of the fight.
const NEARBY_DISTANCE = 14

const REASON_TEXT = {
  trigger: 'started the fight',
  alerted: 'was already alerted',
  alertGroup: 'was called by its alert group',
  heard: 'heard the fighting',
  saw: 'saw the fighting',
}

const headingToFacing = (heading) => {
  const x = Math.round(Math.cos(heading))
  const y = Math.round(Math.sin(heading))
  return x || y ? { x, y } : { x: 1, y: 0 }
}
const facingToHeading = (facing) => Math.atan2(facing.y, facing.x)
// Each character's personal condition (rules/personalCondition.js: Stress, Injuries, Defeated) is the same object in the
// world and in the fight: handed in when combat starts, handed back when it ends.
const isUp = (entity) => !isDefeated(entity.condition)
const conditionOf = (combatant) => combatant.condition
const fromCondition = (entity) => ({ condition: normalizeCondition(entity.condition) })

// ---------- who fights ----------

// What an NPC knows of each party member as it enters the fight, from its exploration awareness. Only characters it
// identified itself count as known; being told by its group, or only glimpsing someone, leaves a last known place.
function knowledgeFromWorld(npc, memberIds) {
  return Object.fromEntries(
    memberIds.map((id) => {
      const record = npc.awareness[id]
      const known = hasIdentified(npc, id)
      return [
        id,
        {
          known,
          lastKnownPosition: record?.lastKnownPosition ? worldToGrid(record.lastKnownPosition) : null,
          awareness: npc.combatReady?.targetId === id ? STATE.COMBAT_READY : (record?.state ?? STATE.UNAWARE),
          source: known ? 'exploration' : null,
        },
      ]
    }),
  )
}

// The NPC's best guess of where the party is, for its group alert: the character it is focused on, else itself.
function alertFor(npc) {
  const targetId = npc.combatReady?.targetId ?? npc.focusId
  const record = targetId ? npc.awareness[targetId] : null
  return { position: record?.lastKnownPosition ?? npc.position, targetId: record ? targetId : null }
}

const canFight = (npc) => Boolean(npc.character) && !isDown(npc)

// Each NPC joining the fight calls its alert group once, by the normal alert rules (its method's range and sight).
// Members the call reaches join too, and call in turn. joins: [{ npcId, reason }]; inFight: ids already fighting.
// Returns the world after the calls, the NPCs that joined, and where each NPC called in should look.
function spreadAlerts(world, joins, inFight) {
  const fighting = new Set(inFight)
  const queue = [...joins]
  const joined = []
  const searchPoints = {}
  let next = world
  while (queue.length) {
    const { npcId, reason, searchPoint } = queue.shift()
    const npc = next.npcs[npcId]
    if (fighting.has(npcId) || !canFight(npc)) continue
    fighting.add(npcId)
    joined.push({ npcId, reason })
    if (searchPoint) searchPoints[npcId] = searchPoint
    if (!npc.alertGroupId) continue
    const call = alertFor(npc)
    // Joining a fight calls the group by the NPC's usual, local way (its alertMethod's range and sight). Raising the
    // alarm is an exploration response (awareness.js), not something combat starting does by itself.
    const after = alertGroup(next, npc.alertGroupId, { ...call, sourceNpcId: npcId, method: npc.alertMethod })
    next.npcIds.forEach((id) => {
      if (after.npcs[id] !== next.npcs[id] && joinsCombat(after.npcs[id])) queue.push({ npcId: id, reason: 'alertGroup', searchPoint: worldToGrid(call.position) })
    })
    next = after
  }
  return { world: next, joined, searchPoints }
}

// Tiles held by NPCs that stand outside the fight (so nobody walks through them); NPCs that are down don't block.
function bystanderKeys(world, inFight) {
  return getNpcs(world)
    .filter((npc) => !inFight.includes(npc.id) && !isDown(npc))
    .map((npc) => tileKey(worldToGrid(npc.position)))
}

// ---------- party perception ----------

// The away team's perception during the fight: the same layer as in exploration (partyKnowledge.js), from the cells the
// fighters stand on and the world positions of everyone else. Then each party combatant's view of the enemies is set from
// it: an enemy the party sees now can be targeted; one only last seen, or never seen, is not an opponent for them.
function withPartyPerception(state, { perceive = true } = {}) {
  const { combat, world } = state
  let { partyKnowledge } = state
  if (perceive) {
    const observers = getCombatantList(combat)
      .filter((c) => c.side === 'player' && isActive(c))
      .map((c) => ({ id: c.id, position: gridToWorld(c.position) }))
    const entities = getNpcs(world).map((npc) => ({ id: npc.id, position: combat.combatants[npc.id] ? gridToWorld(combat.combatants[npc.id].position) : npc.position }))
    partyKnowledge = updatePartyKnowledge(partyKnowledge, combat.map, observers, entities, world.time)
  }
  const view = Object.fromEntries(
    getCombatantList(combat)
      .filter((c) => c.side === 'enemy')
      .map((enemy) => {
        const entry = getEntityKnowledge(partyKnowledge, enemy.id)
        return [enemy.id, { known: entry.state === KNOWLEDGE.VISIBLE, state: entry.state, lastKnownPosition: entry.lastKnownPosition, source: entry.source }]
      }),
  )
  const knowledge = { ...combat.knowledge }
  getCombatantList(combat)
    .filter((c) => c.side === 'player')
    .forEach((player) => {
      knowledge[player.id] = view
    })
  return { ...state, partyKnowledge, combat: { ...combat, knowledge } }
}

// ---------- start ----------

// The single way into combat. request: { triggerNpcId, triggerTargetId, source, position }. Does nothing when combat is
// already running (so a second COMBAT_READY can never start a second fight) or nobody in the party can fight.
export function startCombat(state, { triggerNpcId, triggerTargetId = null, source = 'COMBAT_READY', position = null }) {
  if (state.mode === MODE.COMBAT || state.combat) return state
  const { party } = state
  const trigger = state.world.npcs[triggerNpcId]
  const members = getMembers(party)
  if (!trigger || !canFight(trigger) || !members.some(isUp)) return state

  // 1. Who fights: the trigger, any NPC already alerted to the party, and whoever their alert groups reach.
  const alerted = getNpcs(state.world).filter(
    (npc) => npc.id !== triggerNpcId && canFight(npc) && joinsCombat(npc) && (npc.combatReady || party.memberIds.some((id) => npc.awareness[id]?.state === STATE.ALERTED)),
  )
  const { world, joined, searchPoints } = spreadAlerts(
    state.world,
    [{ npcId: triggerNpcId, reason: 'trigger' }, ...alerted.map((npc) => ({ npcId: npc.id, reason: 'alerted' }))],
    [],
  )
  const npcIds = joined.map((join) => join.npcId)

  // 2. Everyone onto the nearest free cell of the same map (no teleport, no start positions).
  const battleMap = { width: party.map.width, height: party.map.height, tiles: party.map.tiles }
  const fighters = [...members.map((member) => ({ id: member.id, position: member.position })), ...npcIds.map((id) => ({ id, position: world.npcs[id].position }))]
  const blockedKeys = bystanderKeys(world, npcIds)
  const snaps = snapToGrid(battleMap, fighters, new Set(blockedKeys))
  const players = members
    .filter((member) => snaps[member.id])
    .map((member) => ({ character: member.character, position: snaps[member.id].cell, facing: headingToFacing(member.heading), ...fromCondition(member) }))
  const enemies = npcIds
    .filter((id) => snaps[id])
    .map((id) => ({ id, character: world.npcs[id].character, position: snaps[id].cell, facing: headingToFacing(world.npcs[id].heading), ...fromCondition(world.npcs[id]) }))

  // 3. Combat Type 1 on that moment, carrying over what each NPC knows. Each NPC fights as itself: the combatant has the
  // world actor's id and the actor's own character and condition (no combat-only stat block).
  const combatCount = state.combatCount + 1
  const knowledge = Object.fromEntries(enemies.map((enemy) => [enemy.id, knowledgeFromWorld(world.npcs[enemy.id], party.memberIds)]))
  // The fight holds the mission's Momentum and Threat while it runs (combatAction keeps state.resources equal to it).
  const created = createCombat({
    encounterId: WORLD_ENCOUNTER_ID,
    map: party.map,
    players: [],
    seed: deriveSeed(state.seed, combatCount),
    placements: { players, enemies },
    resources: state.resources,
    sceneTraits: state.scenario?.traits ?? [],
  })
  const targetName = party.members[triggerTargetId]?.character.name ?? 'the away team'
  const lines = [
    `${trigger.character.name} engages ${targetName}.`,
    ...joined.filter((join) => join.reason !== 'trigger').map((join) => `${world.npcs[join.npcId].character.name} ${REASON_TEXT[join.reason]}.`),
  ]
  const combat = {
    ...created,
    knowledge,
    blockedKeys,
    // The party has been spotted, so Combat Type 1's opening Ambush is not offered (no ambush rules in this pass).
    ambush: { passed: true },
    log: [...created.log, { id: created.log.length, round: 1, kind: 'info', lines }],
  }
  const link = {
    id: combatCount,
    trigger: { npcId: triggerNpcId, targetId: triggerTargetId, source, position: position ?? party.members[triggerTargetId]?.position ?? trigger.position },
    npcIds,
    joins: joined.map((join) => ({ ...join, round: 1 })),
    searchPoints,
    snaps,
  }
  // The party starts the fight knowing what it knew a moment ago in exploration: no reveal on entering combat.
  return withPartyPerception({ ...state, mode: MODE.COMBAT, world, combat, link, combatCount }, { perceive: false })
}

// The COMBAT_READY hand-off: the first NPC that is ready starts the fight; any others join it as already alerted.
export function requestCombat(state) {
  if (state.mode === MODE.COMBAT) return state
  const ready = getCombatReady(state.world)[0]
  return ready ? startCombat(state, { triggerNpcId: ready.npcId, triggerTargetId: ready.targetId, source: 'COMBAT_READY' }) : state
}

// ---------- during the fight ----------

// An enemy that knows of no party member searches instead of fighting: it moves toward the nearest place it last knew
// of one (or where it was called to), then waits. Returns a combat action, or null to let the normal AI play.
function searchStep(state) {
  const { combat, link } = state
  const self = getActiveCombatant(combat)
  if (self.side !== 'enemy' || !combat.knowledge?.[self.id] || combat.pending || awaitingDecision(combat) || getOpponents(combat, self).length) return null
  const places = Object.values(combat.knowledge[self.id]).map((entry) => entry.lastKnownPosition).filter(Boolean)
  if (link.searchPoints[self.id]) places.push(link.searchPoints[self.id])
  const goal = places.sort((a, b) => tileDistance(self.position, a) - tileDistance(self.position, b))[0]
  const hold = (reason) => ({ type: 'endTurn', decision: 'Hold position', reason })
  if (!goal) return hold('No party member known, and nowhere to search.')
  if (!canMove(combat, self)) return hold('No party member in sight.')
  const tiles = [...getReachable(combat, self).values()].sort((a, b) => tileDistance(a.position, goal) - tileDistance(b.position, goal) || a.steps - b.steps)
  const best = tiles[0]
  if (!best || tileDistance(best.position, goal) >= tileDistance(self.position, goal)) return hold('Reached the last known position; no party member in sight.')
  return { type: 'move', destination: best.position, decision: 'Search', reason: `No party member known; moving toward the last known position (${goal.x},${goal.y}).` }
}

// What each enemy in the fight can see now (its view cone from its combat facing, its own vision range, line of sight).
// Once seen, a party member stays known for the rest of the fight.
function refreshSight(combat, world) {
  if (!combat.knowledge) return combat
  let knowledge = combat.knowledge
  const players = getCombatantList(combat).filter((c) => c.side === 'player' && isActive(c))
  getCombatantList(combat)
    .filter((c) => c.side === 'enemy' && isActive(c) && knowledge[c.id] && world.npcs[c.id])
    .forEach((enemy) => {
      const viewer = { position: enemy.position, heading: facingToHeading(enemy.facing), perception: world.npcs[enemy.id].perception }
      players.forEach((player) => {
        if (!perceive(combat.map, viewer, { position: player.position, moving: false })) return
        const entry = knowledge[enemy.id][player.id]
        knowledge = {
          ...knowledge,
          [enemy.id]: { ...knowledge[enemy.id], [player.id]: { ...entry, known: true, lastKnownPosition: { ...player.position }, source: entry?.known ? entry.source : 'sight' } },
        }
      })
    })
  return knowledge === combat.knowledge ? combat : { ...combat, knowledge }
}

function reveal(combat, enemyId, player, source) {
  const entry = combat.knowledge?.[enemyId]?.[player.id]
  if (!combat.knowledge?.[enemyId] || entry?.known) return combat
  return { ...combat, knowledge: { ...combat.knowledge, [enemyId]: { ...combat.knowledge[enemyId], [player.id]: { ...entry, known: true, lastKnownPosition: { ...player.position }, source } } } }
}

// NPCs outside the fight who see a party member in it.
function spottersOf(combat, world, inFight) {
  const players = getCombatantList(combat).filter((c) => c.side === 'player' && isActive(c))
  return getNpcs(world)
    .filter((npc) => !inFight.includes(npc.id) && canFight(npc) && joinsCombat(npc))
    .map((npc) => ({ npc, seen: players.filter((player) => perceive(world.map, npc, { position: gridToWorld(player.position), moving: false })) }))
    .filter((entry) => entry.seen.length)
}

// Late arrivals join from where they stand, on the nearest free cell.
function joinFight(state, joins, searchPoints, seenBy) {
  let { combat, link } = state
  joins.forEach((join) => {
    const npc = state.world.npcs[join.npcId]
    const taken = new Set([...getCombatantList(combat).filter(isActive).map((c) => tileKey(c.position)), ...bystanderKeys(state.world, [...link.npcIds, npc.id])])
    const snap = nearestFreeCell(combat.map, npc.position, taken)
    if (!snap) return
    combat = addCombatant(combat, { id: npc.id, character: npc.character, position: snap.cell, facing: headingToFacing(npc.heading), ...fromCondition(npc) })
    const knowledge = knowledgeFromWorld(npc, state.party.memberIds)
    ;(seenBy[npc.id] ?? []).forEach((player) => {
      knowledge[player.id] = { ...knowledge[player.id], known: true, lastKnownPosition: { ...player.position }, source: 'sight' }
    })
    combat = { ...combat, knowledge: { ...combat.knowledge, [npc.id]: knowledge }, log: [...combat.log, { id: combat.log.length, round: combat.round, kind: 'info', lines: [`${npc.character.name} ${REASON_TEXT[join.reason]}.`] }] }
    link = {
      ...link,
      npcIds: [...link.npcIds, npc.id],
      joins: [...link.joins, { ...join, round: combat.round }],
      searchPoints: searchPoints[npc.id] ? { ...link.searchPoints, [npc.id]: searchPoints[npc.id] } : link.searchPoints,
      snaps: { ...link.snaps, [npc.id]: { from: { ...npc.position }, cell: snap.cell, distance: snap.distance } },
    }
  })
  combat = { ...combat, blockedKeys: bystanderKeys(state.world, link.npcIds) }
  return { ...state, combat, link }
}

// Noise made by a combat action (combatNoise in awareness.json). The hook for every noisy action: today, attacks.
// NPCs outside the fight who hear it react as to any noise and, if they would fight, join.
export function emitCombatNoise(state, kind, position, sourceId) {
  const noise = awarenessData.combatNoise[kind]
  if (!noise) return { state, heard: [] }
  const world = emitNoise(state.world, { position: gridToWorld(position), radius: noise.radius, intensity: noise.intensity, source: sourceId })
  const heard = world.npcIds.filter((id) => world.npcs[id] !== state.world.npcs[id] && !state.link.npcIds.includes(id))
  return { state: { ...state, world }, heard }
}

// ---------- challenge objects in combat ----------

// The fighters' current cells as world positions (and their condition) on the party members, so the challenge
// objects' own range and ability checks see where everyone stands in the fight.
function withFightersInWorld(state) {
  const members = { ...state.party.members }
  state.party.memberIds.forEach((id) => {
    const combatant = state.combat.combatants[id]
    if (combatant) members[id] = { ...members[id], position: gridToWorld(combatant.position), condition: conditionOf(combatant) }
  })
  return { ...state, party: { ...state.party, members } }
}

const reachesObject = (definition, position) => Math.hypot(position.x - definition.position[0], position.y - definition.position[1]) <= INTERACT_RANGE

// The objects the combatant whose turn it is can reach from their cell, with what each offers now and what it costs:
// [{ definition, actions: [{ action, available, reason, cost, affordable }] }]. Empty outside a party turn.
export function getCombatObjects(state) {
  if (state.mode !== MODE.COMBAT || !state.scenario) return []
  const { combat } = state
  const actor = getActiveCombatant(combat)
  if (!actor || actor.side !== 'player' || combat.pending || awaitingDecision(combat) || combat.outcome) return []
  const position = gridToWorld(actor.position)
  return state.scenario.definitions
    .filter((definition) => reachesObject(definition, position))
    .map((definition) => ({
      definition,
      actions: getAvailableActions(state, definition.id).map((entry) => ({
        ...entry,
        cost: combatCostOf(entry.action),
        affordable: canInteract(combat, actor.id, combatCostOf(entry.action)),
      })),
    }))
    .filter((entry) => entry.actions.length)
}

// Who would assist this object task in combat, prepared for challengeObjects (an Assist set up for the performer uses
// the object's authored approach at assistIndex; the commander on a Direct uses Control + Command).
export function getCombatObjectAssist(state, objectId, actionId, assistIndex = 0) {
  const action = getDefinition(state.scenario, objectId)?.actions.find((candidate) => candidate.id === actionId)
  if (!action || action.routine) return null
  const actor = getActiveCombatant(state.combat)
  const approach = action.assist?.[assistIndex] ?? null
  const assist = getAssistFor(state.combat, actor.id, { approach })
  return assist && { ...assist, approach: approach ?? { label: assist.label } }
}

// Difficulty lines combat adds to an object's task: a bought second major action's +1 on a major-cost task, and an enemy
// within Reach of the performer on any task (Book p.286). Routine actions have no task.
export function getCombatObjectLines(state, objectId, actionId) {
  const action = getDefinition(state.scenario, objectId)?.actions.find((candidate) => candidate.id === actionId)
  if (!action || action.routine) return []
  const actor = getActiveCombatant(state.combat)
  const secondMajor = actionTypeOf(combatCostOf(action)) === 'major' ? secondMajorLines(state.combat, actor.id) : []
  return [...secondMajor, ...reachLines(state.combat, actor)]
}

// The object task's math for whoever acts, exactly as interactInCombat will attempt it: the fighters' current condition
// (Fatigue gained in the fight), combat's assist and its Difficulty lines.
export function previewCombatObject(state, objectId, actionId) {
  return previewChallenge(withFightersInWorld(state), {
    objectId,
    actionId,
    performerId: getActiveCombatant(state.combat).id,
    combatAssist: getCombatObjectAssist(state, objectId, actionId),
    combatLines: getCombatObjectLines(state, objectId, actionId),
  })
}

// The same task for any party member with their current condition, without the actor's assist or bought extra action,
// so members can be compared on their own merits (the best-choice highlight).
export const compareCombatObject = (state, objectId, actionId, performerId) => previewChallenge(withFightersInWorld(state), { objectId, actionId, performerId })

const taskLines = (task, prepared) => [
  `${task.attribute.name} ${task.attribute.value} + ${task.department.name} ${task.department.value} = TN ${task.targetNumber}`,
  `Focus: ${task.focus ? `${task.focus} (critical at or under ${task.criticalRange})` : 'None (critical only on a 1)'}`,
  `Difficulty: ${prepared.difficulty} (${prepared.difficultyLines.map((line) => `${line.label} ${line.change >= 0 ? '+' : ''}${line.change}`).join(', ')})`,
]

// A challenge object's action taken by the combatant whose turn it is: { objectId, actionId, purchase, assistIndex }.
// The object's own rules run unchanged (attemptChallenge: same definition, state, task and outcomes as in exploration);
// the fight then records the action type spent, the mission pools, and the result. Outcomes reach the world at once:
// the map (doors), NPC awareness (noise, alarm), Party Knowledge and scene traits.
function interactInCombat(state, action) {
  const { combat } = state
  const actor = getActiveCombatant(combat)
  const definition = getDefinition(state.scenario, action.objectId)
  const objectAction = definition?.actions.find((candidate) => candidate.id === action.actionId)
  if (!objectAction || actor.side !== 'player' || !state.party.members[actor.id]) return state
  const cost = combatCostOf(objectAction)
  if (!canInteract(combat, actor.id, cost)) return state
  const combatAssist = getCombatObjectAssist(state, action.objectId, action.actionId, action.assistIndex ?? 0)
  const synced = withFightersInWorld(state)
  const combatLines = getCombatObjectLines(state, action.objectId, action.actionId)
  const after = attemptChallenge(synced, { objectId: action.objectId, actionId: action.actionId, performerId: actor.id, purchase: action.purchase, combatAssist, combatLines })
  if (after === synced) return state

  const { lastTask } = after
  const result = lastTask.result
  const lines = result
    ? [
        ...taskLines(lastTask.prepared.task, lastTask.prepared),
        ...(lastTask.bonusDice ? [`Bought ${lastTask.bonusDice} bonus d20${lastTask.bonusDice === 1 ? '' : 's'}`] : []),
        `Rolls: ${result.dice.map((die) => `${die.value} = ${die.successes}${die.critical ? ' (critical)' : ''}${die.complication ? ' (complication)' : ''}`).join(', ')}`,
        ...(result.assist ? [`${combatAssist.via === 'direct' ? 'Commander assists (Direct)' : 'Assist'}: ${combat.combatants[combatAssist.helperId].character.name} rolls ${result.assist.value}: ${!result.assist.successes ? 'no success' : result.assist.counted ? `counts (+${result.assist.successes})` : 'does not count (no leader success)'}`] : []),
        `Successes: ${result.successes} vs Difficulty ${lastTask.prepared.difficulty}`,
        `RESULT: ${result.success ? 'SUCCESS' : 'FAILURE'}`,
        `Momentum generated: ${result.momentumGenerated}; ${lastTask.momentumSaved} saved to the group pool (now ${after.resources.momentum})`,
        ...(result.complications ? [`Complications: ${result.complications}`] : []),
        ...lastTask.messages,
      ]
    : ['Routine: no roll.', ...lastTask.messages]
  let nextCombat = applyInteraction(combat, {
    actorId: actor.id,
    cost,
    resources: after.resources,
    label: `${definition.name}: ${objectAction.label}`,
    passed: result ? result.success : null,
    task: result ? { ...lastTask.prepared.task, difficulty: lastTask.prepared.difficulty } : null,
    dice: result?.dice ?? [],
    assist: result?.assist && combatAssist ? { helperId: combatAssist.helperId, task: combatAssist.task, via: combatAssist.via, die: result.assist.value, successes: result.assist.successes, counted: result.assist.counted } : null,
    successes: result?.successes ?? 0,
    complications: result?.complications ?? 0,
    momentumGenerated: result?.momentumGenerated ?? 0,
    momentumSaved: lastTask.momentumSaved,
    assistUsed: Boolean(result?.assist && combatAssist?.via === 'assist'),
    lines,
  })
  if (nextCombat === combat) return state
  // A changed tile (a door opening) changes movement and line of fire at once; traits change every later task.
  if (after.party.map !== state.party.map) nextCombat = { ...nextCombat, map: toBattleMap(after.party.map) }
  nextCombat = { ...nextCombat, sceneTraits: after.scenario.traits }
  // The world, scenario and Party Knowledge as the object left them; party positions stay owned by the fight.
  let next = { ...after, party: { ...after.party, members: state.party.members }, combat: nextCombat, resources: nextCombat.resources }

  // Noise from the object: NPCs outside the fight who heard it and would fight join, looking where it came from.
  const oldEvents = new Set(state.world.events)
  const heard = after.world.events.filter((event) => !oldEvents.has(event) && event.type === 'NOISE_HEARD').map((event) => event.npcId)
  const joins = [...new Set(heard)].filter((id) => !next.link.npcIds.includes(id) && joinsCombat(next.world.npcs[id])).map((npcId) => ({ npcId, reason: 'heard' }))
  const objectCell = worldToGrid({ x: definition.position[0], y: definition.position[1] })
  const searchPoints = Object.fromEntries(joins.map((join) => [join.npcId, objectCell]))
  next = { ...next, combat: refreshSight(next.combat, next.world) }
  if (!joins.length || next.combat.outcome) return withPartyPerception(next)
  const spread = spreadAlerts(next.world, joins.map((join) => ({ ...join, searchPoint: objectCell })), next.link.npcIds)
  return withPartyPerception(joinFight({ ...next, world: spread.world }, spread.joined, { ...searchPoints, ...spread.searchPoints }, {}))
}

// Every combat action from the Combat Type 1 screen comes through here. action: a Combat Type 1 action,
// { type: 'interact', objectId, actionId, purchase, assistIndex } (a challenge object), or { type: 'aiStep', partyAI, enemyAI }.
export function combatAction(state, action) {
  if (state.mode !== MODE.COMBAT) return state
  if (action.type === 'interact') return interactInCombat(state, action)
  const before = state.combat
  const search = action.type === 'aiStep' && !before.outcome ? searchStep(state) : null
  let combat = search ? combatReducer(before, search) : autoCombatReducer(before, action)
  if (search && combat === before) combat = combatReducer(before, { type: 'endTurn', decision: 'End turn', reason: 'Could not search; ending turn.' })
  if (combat === before) return state
  let next = { ...state, combat, resources: combat.resources }

  // An attack reveals the attacker to its target and makes a noise others may hear.
  const joins = []
  const searchPoints = {}
  const latest = combat.lastAction?.key !== before.lastAction?.key ? combat.lastAction : null
  if (latest?.type === 'attack') {
    const attacker = combat.combatants[latest.actorId]
    if (attacker.side === 'player') next = { ...next, combat: reveal(next.combat, latest.targetId, attacker, 'attacked') }
    const noisy = emitCombatNoise(next, 'attack', attacker.position, attacker.id)
    next = noisy.state
    noisy.heard.filter((id) => joinsCombat(next.world.npcs[id])).forEach((id) => {
      joins.push({ npcId: id, reason: 'heard' })
      searchPoints[id] = { ...attacker.position }
    })
  }

  // Sight: the enemies already fighting, and anyone outside the fight who now sees it.
  next = { ...next, combat: refreshSight(next.combat, next.world) }
  const seenBy = {}
  spottersOf(next.combat, next.world, next.link.npcIds).forEach(({ npc, seen }) => {
    seenBy[npc.id] = seen
    joins.push({ npcId: npc.id, reason: 'saw' })
  })
  if (!joins.length || next.combat.outcome) return withPartyPerception(next)

  const spread = spreadAlerts(next.world, joins.map((join) => ({ ...join, searchPoint: searchPoints[join.npcId] })), next.link.npcIds)
  return withPartyPerception(joinFight({ ...next, world: spread.world }, spread.joined, { ...searchPoints, ...spread.searchPoints }, seenBy))
}

// ---------- end ----------

// The single way out of combat: final cells become world positions, each character's and NPC's condition (Stress,
// Injuries, Defeated) stays with them, and exploration resumes from there (no return to earlier positions, no formation
// snap). Hook (Book p.292): a Dying character whose Deadly Injury had no medical attention dies at the end of the scene;
// lastCombat.wouldDie lists them, and nobody is killed yet.
export function endCombat(state) {
  if (state.mode !== MODE.COMBAT) return state
  const { combat, link, party, world } = state
  const members = { ...party.members }
  party.memberIds.forEach((id) => {
    const combatant = combat.combatants[id]
    if (!combatant) return
    const position = gridToWorld(combatant.position)
    const heading = facingToHeading(combatant.facing)
    members[id] = {
      ...members[id],
      position,
      heading,
      facing: { x: Math.cos(heading), y: Math.sin(heading) },
      turning: false,
      moving: false,
      running: false,
      order: null,
      path: [],
      replanIn: 0,
      stall: { seconds: 0, best: Infinity },
      parkedFor: null,
      blocked: { from: position, seconds: 0 },
      condition: conditionOf(combatant),
    }
  })
  const npcs = { ...world.npcs }
  link.npcIds.forEach((id) => {
    const combatant = combat.combatants[id]
    if (!combatant) return
    npcs[id] = {
      ...npcs[id],
      position: gridToWorld(combatant.position),
      heading: facingToHeading(combatant.facing),
      moving: false,
      path: [],
      pathGoal: null,
      stuck: { best: Infinity, seconds: 0 },
      // What it sees is worked out again on the next exploration frame (never, if it is down).
      visibleIds: [],
      combatReady: null,
      response: null,
      alarmAt: null,
      condition: conditionOf(combatant),
    }
  })
  const lastCombat = {
    id: link.id,
    outcome: combat.outcome ?? 'ended',
    rounds: combat.round,
    npcIds: link.npcIds,
    down: getCombatantList(combat).filter((c) => !isActive(c)).map((c) => c.id),
    dying: getCombatantList(combat).filter((c) => c.condition.dying).map((c) => c.id),
    wouldDie: getCombatantList(combat).filter((c) => wouldDieAtSceneEnd(c.condition)).map((c) => c.id),
  }
  // Combat locks count rounds of this fight; the next fight starts again at round 1.
  const scenario = state.scenario && {
    ...state.scenario,
    objects: Object.fromEntries(Object.entries(state.scenario.objects).map(([id, object]) => [id, object.combatLocks ? { ...object, combatLocks: {} } : object])),
  }
  return {
    ...state,
    mode: MODE.EXPLORATION,
    party: withAbleSelection({ ...party, members }),
    world: { ...world, npcs },
    scenario,
    combat: null,
    link: null,
    lastCombat,
    resources: combat.resources,
  }
}

// ---------- diagnostics ----------

// Developer readout of the running fight: trigger, participants and why, each party member's world position and cell,
// what each enemy knows of each party member, and NPCs near the trigger that stayed out.
export function getCombatDiagnostics(state) {
  if (state.mode !== MODE.COMBAT) return null
  const { combat, link, party, world } = state
  const name = (id) => party.members[id]?.character.name ?? world.npcs[id]?.name ?? id
  return {
    mode: state.mode,
    combatId: link.id,
    trigger: { npc: name(link.trigger.npcId), target: link.trigger.targetId ? name(link.trigger.targetId) : '-', source: link.trigger.source },
    participants: link.joins.map((join) => ({ id: join.npcId, name: name(join.npcId), reason: REASON_TEXT[join.reason], round: join.round })),
    party: party.memberIds.map((id) => ({
      id,
      name: name(id),
      world: link.snaps[id]?.from ?? null,
      cell: combat.combatants[id]?.position ?? null,
      snap: link.snaps[id]?.distance ?? null,
    })),
    knowledge: Object.entries(combat.knowledge ?? {})
      .filter(([id]) => world.npcs[id])
      .map(([npcId, entries]) => ({
      npcId,
      name: name(npcId),
      entries: party.memberIds.map((id) => ({ id, name: name(id), known: Boolean(entries[id]?.known), source: entries[id]?.source ?? null, lastKnownPosition: entries[id]?.lastKnownPosition ?? null })),
    })),
    partyView: getNpcs(world).map((npc) => {
      const entry = getEntityKnowledge(state.partyKnowledge, npc.id)
      return { id: npc.id, name: npc.name, state: entry.state, observers: entry.observerIds.map(name), lastKnownPosition: entry.lastKnownPosition }
    }),
    nearby: getNpcs(world)
      .filter((npc) => !link.npcIds.includes(npc.id) && Math.hypot(npc.position.x - link.trigger.position.x, npc.position.y - link.trigger.position.y) <= NEARBY_DISTANCE)
      .map((npc) => ({ id: npc.id, name: npc.name, state: npc.state, down: isDown(npc) })),
    snaps: Object.entries(link.snaps).map(([id, snap]) => ({ id, name: name(id), from: snap.from, cell: snap.cell, distance: snap.distance })),
  }
}
