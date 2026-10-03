// Combat state and its reducer. All combat rules run here (through the rule modules), never in React handlers.
// The reducer is pure and never reads the clock or Math.random: every roll comes from the combat's own seed plus a roll
// counter, so the same characters, encounter, seed and actions always replay the same fight (and it can run headless).
// Designer spec: 3 Hits removes a combatant (Stun -> Incapacitated, Deadly -> Injured); a failed attack is a miss;
// Momentum and Threat are binary (max 1) and belong to the player side.
import actionData from '../data/adaptation/combat/actions.json'
import encounterData from '../data/adaptation/combat/encounters.json'
import enemyData from '../data/adaptation/combat/enemies.json'
import { normalizeCharacterRecord } from '../character/runtimeCharacter.js'
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'
import { buildTask, evaluateTask, rerollDie, rollDice, TASK_DICE } from '../rules/taskResolver.js'
import { tileKey, toBattleMap } from './battleMap.js'
import { applyCoverToDifficulty, canTakeCover, rollCoverDefence } from './coverSystem.js'
import { buildInitiativeOrder } from './initiativeSystem.js'
import { findPath, getMovementTiles, getReachableTiles } from './movementSystem.js'
import { getRangeBand, hasLineOfFire, tileDistance } from './rangeSystem.js'
import { getAttackTaskSpec, getCharacterWeapons, getInjuryMode, getRangeModifier, getWeapon } from './weaponSystem.js'

export const MAX_HITS = 3

export const getEncounter = (encounterId) => encounterData.encounters.find((encounter) => encounter.id === encounterId) ?? null
export const DEFAULT_ENCOUNTER_ID = encounterData.encounters[0].id
export const DEFAULT_MAP_ID = encounterData.encounters[0].defaultMapId
export const ENEMY_SPAWNS_NEEDED = encounterData.encounters[0].roster.length

// ap: action points left this turn (see actions.json: every action costs 1, any action but Move may repeat, Move is once per turn).
// done: the character pressed End Turn with AP left. attacks: attacks made this turn (for the AI).
// facing: presentation only (the book has no facing rules). One of the 8 grid directions, e.g. { x: 1, y: -1 }; it follows
// the last step of a move and turns toward the target of an attack.
const facingToward = (from, to) => {
  const x = Math.sign(to.x - from.x)
  const y = Math.sign(to.y - from.y)
  return x || y ? { x, y } : { x: 0, y: -1 }
}

export const TURN_AP = actionData.actionPoints
const AP_COST = Object.fromEntries(actionData.actions.map((entry) => [entry.id, entry.apCost]))
const freshTurn = () => ({ ap: TURN_AP, aimReroll: false, done: false, attacks: 0, moved: false })
const spendAP = (turn, actionId) => ({ ...turn, ap: Math.max(0, turn.ap - AP_COST[actionId]) })

function createCombatant(character, { side, controller, position }) {
  const weapons = getCharacterWeapons(character)
  return {
    id: character.id,
    character,
    side,
    controller,
    position,
    hits: 0,
    status: 'active',
    inCover: false,
    injury: null,
    weaponIds: weapons.map((weapon) => weapon.id),
  }
}

// The roster fills the map's enemy spawns in order; a map with fewer spawns fields fewer enemies.
function createEnemyCharacters(encounter, mapFile) {
  return encounter.roster.slice(0, mapFile.markers.enemySpawns.length).map((enemyId, index) => {
    const template = enemyData.enemies.find((enemy) => enemy.id === enemyId)
    const { character, error } = normalizeCharacterRecord(template.record, { id: enemyId })
    if (error) throw new Error(`Enemy ${enemyId}: ${error}`)
    return { character, position: mapFile.markers.enemySpawns[index] }
  })
}

// Running totals for diagnosing and (later) batch-simulating combat. Counts events, not UI.
function createStats(combatants) {
  return {
    attacks: 0,
    attacksHit: 0,
    momentum: { gained: 0, spentReroll: 0, spentHit: 0, spentCancelThreat: 0 },
    threat: { gained: 0, used: 0, cancelled: 0 },
    byCombatant: Object.fromEntries(combatants.map((combatant) => [combatant.id, { attacks: 0, attacksHit: 0, hitsLanded: 0, hitsTaken: 0 }])),
  }
}

const turnHeader = (combatant) => [
  combatant.character.name,
  `Initiative: Daring ${combatant.character.attributes.daring}, Control ${combatant.character.attributes.control}`,
]

// A party member with no weapon of their own gets the encounter's standard-issue weapon for this fight only.
function withStandardIssue(character, weaponId) {
  const weapon = weaponId && getWeapon(weaponId)
  if (!weapon || getCharacterWeapons(character).some((carried) => !carried.alwaysAvailable)) return character
  return { ...character, equipment: [...character.equipment, { itemId: weapon.itemId, name: weapon.name }] }
}

// players: RuntimeCharacters controlled by the player, in party order; each stands on the map's player start of the same
// index (members beyond the map's player starts are left out). map: a parsed map file (src/maps/mapFormat.js).
// seed: a whole number; it fixes initiative ties and every roll.
export function createCombat({ encounterId = DEFAULT_ENCOUNTER_ID, map: mapFile, players, seed, initiativeOptions }) {
  const encounter = getEncounter(encounterId)
  const combatSeed = seed >>> 0
  const playerCombatants = players.slice(0, mapFile.markers.playerStarts.length).map((character, index) =>
    createCombatant(withStandardIssue(character, encounter.standardIssueWeapon), { side: 'player', controller: 'player', position: mapFile.markers.playerStarts[index] }),
  )
  const enemyCombatants = createEnemyCharacters(encounter, mapFile).map(({ character, position }) =>
    createCombatant(character, { side: 'enemy', controller: 'ai', position }),
  )
  const map = toBattleMap(mapFile)
  const nearestOpponent = (combatant) =>
    [...playerCombatants, ...enemyCombatants]
      .filter((other) => other.side !== combatant.side)
      .sort((a, b) => tileDistance(combatant.position, a.position) - tileDistance(combatant.position, b.position))[0]
  const all = [...playerCombatants, ...enemyCombatants].map((combatant) => ({
    ...combatant,
    inCover: canTakeCover(map, combatant.position),
    facing: facingToward(combatant.position, nearestOpponent(combatant)?.position ?? combatant.position),
  }))
  const order = buildInitiativeOrder(all, seededRandomInt(combatSeed), { firstSide: 'player', ...initiativeOptions })
  const first = all.find((combatant) => combatant.id === order[0])
  return {
    encounterId,
    mapId: mapFile.id,
    seed: combatSeed,
    rolls: 0,
    map,
    combatants: Object.fromEntries(all.map((combatant) => [combatant.id, combatant])),
    order,
    round: 1,
    turnIndex: 0,
    turn: freshTurn(),
    // Saved turns of the other members of the current party group (see getTurnGroup), keyed by combatant id.
    groupTurns: {},
    // Assists set up this round: { [assisted ally id]: helper id }. Used by the ally's next attack; cleared each round.
    assists: {},
    momentum: 0,
    threat: 0,
    pending: null,
    result: null,
    outcome: null,
    aiReason: null,
    lastDecision: null,
    lastMove: null,
    lastAction: null,
    stats: createStats(all),
    log: [
      {
        id: 0,
        round: 1,
        kind: 'info',
        lines: [`Combat begins. Seed ${combatSeed}.`, `Initiative (party first, then Daring, then Control): ${order.map((id) => all.find((c) => c.id === id).character.name).join(', ')}`],
      },
      { id: 1, round: 1, kind: 'round', lines: ['ROUND 1'] },
      { id: 2, round: 1, kind: 'turn', lines: turnHeader(first) },
    ],
  }
}

// ---------- selectors ----------

export const getActiveCombatant = (state) => state.combatants[state.order[state.turnIndex]]
export const isActive = (combatant) => combatant.status === 'active'
export const getCombatantList = (state) => state.order.map((id) => state.combatants[id])
export const getOpponents = (state, combatant) => getCombatantList(state).filter((other) => other.side !== combatant.side && isActive(other))

// Designer decision (Oct 2026): party members whose initiative slots are next to each other act as one group; the player
// picks who acts, can switch at any time (even with actions left), and the group ends when every member is finished.
// Defeated combatants between them do not split a group. Enemies always act one at a time.
export function getTurnGroupRange(state) {
  const { order, combatants, turnIndex } = state
  const isParty = (index) => combatants[order[index]].side === 'player'
  if (!isParty(turnIndex)) return { start: turnIndex, end: turnIndex, ids: [order[turnIndex]] }
  const joins = (index) => isParty(index) || !isActive(combatants[order[index]])
  let start = turnIndex
  let end = turnIndex
  while (start > 0 && joins(start - 1)) start -= 1
  while (end < order.length - 1 && joins(end + 1)) end += 1
  const ids = order.slice(start, end + 1).filter((id) => combatants[id].side === 'player' && isActive(combatants[id]))
  return { start, end, ids }
}

export const getTurnGroup = (state) => getTurnGroupRange(state).ids

// Every combatant always has a facing; one without a stored facing faces the nearest active opponent.
export function getFacing(state, combatant) {
  if (combatant.facing) return combatant.facing
  const nearest = getOpponents(state, combatant).sort((a, b) => tileDistance(combatant.position, a.position) - tileDistance(combatant.position, b.position))[0]
  return facingToward(combatant.position, nearest?.position ?? combatant.position)
}

export const getTurnOf = (state, id) => (id === state.order[state.turnIndex] ? state.turn : state.groupTurns[id] ?? freshTurn())

// How far a Move could go now: the full movement allowance if the character has AP and hasn't moved this turn, else nothing.
export function getMovementLeft(state, combatant) {
  const turn = getTurnOf(state, combatant.id)
  return turn.ap >= AP_COST.move && !turn.moved ? getMovementTiles(combatant.character) : 0
}

// Out of actions: no AP left, or pressed End Turn.
export function isTurnFinished(state, id) {
  const turn = getTurnOf(state, id)
  return turn.done || turn.ap <= 0
}

// A player's rolled attack waits for the player only when it would miss and a reroll could still save it; otherwise
// it resolves on its own (prototype: no Resolve click for a roll with nothing left to decide).
export function rollAwaitsPlayer(state) {
  const { pending } = state
  if (!pending || state.combatants[pending.attackerId].side !== 'player') return false
  const canReroll = pending.aimReroll || state.momentum > 0
  return canReroll && !evaluateAttack(pending).passed
}

// Enemies cannot be passed; allies can be passed but not stopped on. Defeated combatants do not block.
export function getBlockers(state, combatant) {
  const blockedKeys = new Set()
  const occupiedKeys = new Set()
  for (const other of Object.values(state.combatants)) {
    if (other.id === combatant.id || !isActive(other)) continue
    ;(other.side === combatant.side ? occupiedKeys : blockedKeys).add(tileKey(other.position))
  }
  return { blockedKeys, occupiedKeys }
}

export function getReachable(state, combatant) {
  return getReachableTiles(state.map, combatant.position, getMovementLeft(state, combatant), getBlockers(state, combatant))
}

export function getPathTo(state, combatant, destination) {
  return findPath(state.map, combatant.position, destination, getMovementLeft(state, combatant), getBlockers(state, combatant))
}

export const canAct = (state, combatant) => !state.outcome && !state.pending && getActiveCombatant(state)?.id === combatant.id
export const canAfford = (state, combatant, actionId) => canAct(state, combatant) && state.turn.ap >= AP_COST[actionId]
export const canMove = (state, combatant) => canAfford(state, combatant, 'move') && getMovementLeft(state, combatant) > 0
// Aim doesn't stack: one reroll waits on the next attack at most.
export const canAim = (state, combatant) => canAfford(state, combatant, 'aim') && !state.turn.aimReroll
// Everything the Task panel shows before FIRE, and exactly what the attack will use. fromPosition lets the AI test other tiles.
export function previewAttack(state, attackerId, targetId, weaponId, fromPosition) {
  const attacker = state.combatants[attackerId]
  const target = state.combatants[targetId]
  const weapon = getWeapon(weaponId)
  if (!attacker || !target || !weapon) return { available: false, reason: 'Choose a target.' }
  const position = fromPosition ?? attacker.position
  const distance = tileDistance(position, target.position)
  const band = getRangeBand(distance)
  const range = getRangeModifier(weapon, band)
  const spec = getAttackTaskSpec(weapon)
  const threatModifier = attacker.side === 'player' && state.threat ? 1 : 0
  const difficulty = spec.baseDifficulty + range.modifier + threatModifier
  const task = buildTask(attacker.character, { attribute: spec.attribute, discipline: spec.discipline, difficulty, focusCandidates: weapon.focuses })
  const base = { weapon, target, distance, band, baseDifficulty: spec.baseDifficulty, rangeModifier: range.modifier, threatModifier, task, targetInCover: target.inCover }
  if (!isActive(target) || target.side === attacker.side) return { ...base, available: false, reason: 'Not a valid target.' }
  if (!range.available) return { ...base, available: false, reason: `Out of range (${band.name}).` }
  if (!hasLineOfFire(state.map, position, target.position)) return { ...base, available: false, reason: 'No line of fire.' }
  return { ...base, available: true, reason: null }
}

// Designer decision (Oct 2026), adapted from the book's Assist (STA 2e Quickstart p.13, p.24): for 1 AP, a combatant sets
// up an assist on an ally who still has a turn this round; the ally's next attack adds the helper's 1d20, rolled against
// the helper's own Target Number for that attack. Any ally on the map; one assist per attack.
export function canAssist(state, helper, ally) {
  if (!ally || ally.id === helper.id || ally.side !== helper.side || !isActive(ally) || state.assists[ally.id]) return false
  return getTurnGroup(state).includes(ally.id) && !isTurnFinished(state, ally.id)
}

export const getAssistableAllies = (state, helper) => getCombatantList(state).filter((ally) => canAssist(state, helper, ally))

// The attack's result counting the assist die. Book: assistants' successes count only if the leader scores at least 1.
// Momentum stays the attacker's own two dice (both succeeding); an assist die of 20 also generates Threat.
export function evaluateAttack(pending) {
  const evaluation = evaluateTask(pending.task, pending.dice)
  const { assist } = pending
  if (!assist) return { ...evaluation, assistCounted: false }
  const assistCounted = assist.success && evaluation.successes > 0
  const successes = evaluation.successes + (assistCounted ? 1 : 0)
  return { ...evaluation, successes, passed: successes >= pending.task.difficulty, threat: evaluation.threat || assist.die === 20, assistCounted }
}

// The helper's task for an assist: the same Attribute + Discipline and focuses as the attack, with the helper's own values.
function assistTaskFor(helper, weapon) {
  const spec = getAttackTaskSpec(weapon)
  return buildTask(helper.character, { attribute: spec.attribute, discipline: spec.discipline, focusCandidates: weapon.focuses })
}

const dieChance = (targetNumber) => Math.min(20, Math.max(0, targetNumber)) / 20

// Chance an available attack hits, before any cover roll by the target: the attacker's dice, plus the Aim reroll on one
// failed die and the assist die when the attacker has them. Presentation aid only; the attack itself always rolls.
export function getHitChance(state, attackerId, preview) {
  if (!preview?.available) return 0
  const { targetNumber, difficulty } = preview.task
  const p = dieChance(targetNumber)
  // successes[k] = chance of exactly k successes on the attacker's dice.
  let successes = [1]
  for (let die = 0; die < TASK_DICE; die++) successes = [...successes, 0].map((chance, k) => chance * (1 - p) + (k ? successes[k - 1] * p : 0))
  const turn = getTurnOf(state, attackerId)
  if (turn.aimReroll) successes = successes.map((chance, k) => (k < TASK_DICE ? chance * (1 - p) : chance) + (k > 0 ? successes[k - 1] * p : 0))
  const helper = state.assists[attackerId] && state.combatants[state.assists[attackerId]]
  const assist = helper && isActive(helper) ? dieChance(assistTaskFor(helper, preview.weapon).targetNumber) : 0
  return successes.reduce((total, chance, k) => total + chance * (k >= difficulty ? 1 : k > 0 && k + 1 >= difficulty ? assist : 0), 0)
}

// Whether any opponent could be attacked right now with this weapon (in range and in line of fire).
export function hasTargetInRange(state, attackerId, weaponId) {
  const attacker = state.combatants[attackerId]
  return getOpponents(state, attacker).some((opponent) => previewAttack(state, attackerId, opponent.id, weaponId).available)
}

// ---------- reducer helpers ----------

const addLog = (state, lines, kind = 'action') => ({ ...state, log: [...state.log, { id: state.log.length, round: state.round, kind, lines }] })

// The action that just happened (key = the log index of its entry), so the battlefield can show it once.
const markAction = (state, type, actorId, details = {}) => ({ ...state, lastAction: { key: state.log.length, type, actorId, ...details } })

const updateCombatant = (state, id, changes) => ({ ...state, combatants: { ...state.combatants, [id]: { ...state.combatants[id], ...changes } } })

// The next roll's generator: one derived seed per roll, so replays match no matter how the UI is paced.
function takeRandom(state) {
  return { random: seededRandomInt(deriveSeed(state.seed, state.rolls)), next: { ...state, rolls: state.rolls + 1 } }
}

function withStats(state, change) {
  const stats = structuredClone(state.stats)
  change(stats)
  return { ...state, stats }
}

const apLeftText = (turn) => `${turn.ap} AP left`

const assistLine = (state, assist) => {
  const { task } = assist
  return `Assist: ${state.combatants[assist.helperId].character.name}, ${task.attribute.name} ${task.attribute.value} + ${task.discipline.name} ${task.discipline.value} = TN ${task.targetNumber}, rolls ${assist.die} (${assist.success ? 'success' : 'no success'})`
}

const formatPosition = (position) => `(${position.x},${position.y})`

const statusText = (combatant) =>
  combatant.status === 'active' ? `${combatant.hits} ${combatant.hits === 1 ? 'Hit' : 'Hits'}` : combatant.status === 'incapacitated' ? 'Incapacitated' : 'Injured / Defeated'

function applyHit(state, targetId, weapon, injuryModeId) {
  const target = state.combatants[targetId]
  const hits = Math.min(MAX_HITS, target.hits + 1)
  if (hits < MAX_HITS) return updateCombatant(state, targetId, { hits })
  const mode = getInjuryMode(injuryModeId)
  return updateCombatant(state, targetId, {
    hits,
    status: mode.finalHitStatus,
    inCover: false,
    injury: { weaponId: weapon.id, injuryMode: mode.id, severity: weapon.severity },
  })
}

function hitLine(before, after) {
  const removed = !isActive(after) ? ` (${statusText(after)})` : ''
  return `${after.character.name}: Hits ${before.hits} -> ${after.hits}${removed}`
}

function withOutcome(state) {
  const list = Object.values(state.combatants)
  const outcome = list.filter((c) => c.side === 'player').every((c) => !isActive(c))
    ? 'defeat'
    : list.filter((c) => c.side === 'enemy').every((c) => !isActive(c))
      ? 'victory'
      : null
  if (!outcome) return state
  return addLog({ ...state, outcome }, [`${outcome === 'victory' ? 'VICTORY' : 'DEFEAT'} in round ${state.round}.`], 'info')
}

// Hands the turn to another member of the current party group, keeping each member's used actions.
function switchToMember(state, id) {
  const groupTurns = { ...state.groupTurns, [state.order[state.turnIndex]]: state.turn }
  const next = {
    ...state,
    groupTurns,
    turn: groupTurns[id] ?? freshTurn(),
    turnIndex: state.order.indexOf(id),
    aiReason: null,
    result: state.result && { ...state.result, closed: true },
  }
  return addLog(next, turnHeader(next.combatants[id]), 'turn')
}

// Moves past the whole current group (a single combatant for enemies) to the next active combatant.
function advanceTurn(state) {
  let { round } = state
  let turnIndex = getTurnGroupRange(state).end
  for (let i = 0; i < state.order.length; i++) {
    turnIndex += 1
    if (turnIndex >= state.order.length) {
      turnIndex = 0
      round += 1
    }
    if (isActive(state.combatants[state.order[turnIndex]])) break
  }
  const assists = round !== state.round ? {} : state.assists
  let next = { ...state, turnIndex, round, turn: freshTurn(), groupTurns: {}, assists, aiReason: null, result: state.result && { ...state.result, closed: true } }
  if (round !== state.round) next = addLog(next, [`ROUND ${round}`], 'round')
  return addLog(next, turnHeader(next.combatants[next.order[turnIndex]]), 'turn')
}

// AI-chosen actions carry decision (what) and reason (why). They are logged and kept for the debug panel; player actions carry neither.
function recordDecision(state, actor, action, details = {}) {
  if (!action.reason) return { state, lines: [] }
  // For a move, the planned shot is measured from the destination.
  const from = details.path ? details.path[details.path.length - 1] : undefined
  const plan = action.targetId && action.weaponId ? previewAttack(state, actor.id, action.targetId, action.weaponId, from) : null
  const lastDecision = {
    round: state.round,
    actorId: actor.id,
    type: action.type,
    decision: action.decision ?? action.type,
    reason: action.reason,
    targetId: action.targetId ?? null,
    weaponId: action.weaponId ?? null,
    injuryMode: action.injuryMode ?? null,
    band: plan?.band?.name ?? null,
    distance: plan?.distance ?? null,
    path: null,
    actorInCover: actor.inCover,
    targetInCover: action.targetId ? state.combatants[action.targetId].inCover : null,
    ...details,
  }
  const lines = [`AI Decision: ${lastDecision.decision}`, `Reason: ${action.reason}`]
  return { state: { ...state, aiReason: action.reason, lastDecision }, lines }
}

function difficultyBreakdown(pending) {
  const parts = [`base ${pending.baseDifficulty}`]
  if (pending.rangeModifier) parts.push(`${pending.band.name} range +${pending.rangeModifier}`)
  if (pending.threatModifier) parts.push('Threat +1')
  if (pending.cover) parts.push(`target cover ${pending.cover.successes} ${pending.cover.successes === 1 ? 'success' : 'successes'}`)
  return parts.join(', ')
}

// ---------- reducer ----------

export function combatReducer(state, action) {
  if (action.type === 'restart') return createCombat(action.options)
  if (!state || state.outcome) return state
  const actor = getActiveCombatant(state)

  switch (action.type) {
    case 'move': {
      if (!canMove(state, actor)) return state
      const path = getPathTo(state, actor, action.destination)
      if (!path || path.length < 2) return state
      const destination = path[path.length - 1]
      const steps = path.length - 1
      const decided = recordDecision(state, actor, action, { path })
      const inCover = canTakeCover(state.map, destination)
      const moved = updateCombatant(decided.state, actor.id, { position: destination, inCover, facing: facingToward(path[path.length - 2], destination) })
      const turn = { ...spendAP(state.turn, 'move'), moved: true }
      const next = { ...moved, turn, lastMove: { key: state.log.length, combatantId: actor.id, path } }
      return addLog(markAction(next, 'move', actor.id, { inCover }), [
        ...decided.lines,
        `Move ${steps} ${steps === 1 ? 'tile' : 'tiles'} (${apLeftText(turn)})`,
        `Path: ${path.map(formatPosition).join(' > ')}`,
        ...(inCover ? [`${actor.character.name} is in cover (next to a cover object).`] : actor.inCover ? [`${actor.character.name} leaves cover.`] : []),
      ])
    }
    case 'aim': {
      if (!canAim(state, actor)) return state
      const decided = recordDecision(state, actor, action)
      const turn = { ...spendAP(state.turn, 'aim'), aimReroll: true }
      return addLog(markAction({ ...decided.state, turn }, 'aim', actor.id), [
        ...decided.lines,
        `Aim: may reroll one die on the next attack this turn (${apLeftText(turn)})`,
      ])
    }
    case 'assist': {
      const ally = state.combatants[action.allyId]
      if (!canAfford(state, actor, 'assist') || !canAssist(state, actor, ally)) return state
      const decided = recordDecision(state, actor, action)
      const turn = spendAP(state.turn, 'assist')
      const next = { ...decided.state, turn, assists: { ...state.assists, [ally.id]: actor.id } }
      return addLog(markAction(next, 'assist', actor.id, { allyId: ally.id }), [
        ...decided.lines,
        `Assist: ${ally.character.name}'s next attack this round adds ${actor.character.name}'s 1d20 (${apLeftText(turn)})`,
      ])
    }
    case 'attack': {
      if (!canAfford(state, actor, 'attack')) return state
      const preview = previewAttack(state, actor.id, action.targetId, action.weaponId)
      if (!preview.available || !preview.weapon.injuryModes.includes(action.injuryMode)) return state
      const decided = recordDecision(state, actor, action)
      const { random, next: afterDraw } = takeRandom(decided.state)
      const target = state.combatants[action.targetId]
      const cover = target.inCover ? rollCoverDefence(target.character, random) : null
      const difficulty = cover ? applyCoverToDifficulty(preview.task.difficulty, cover.successes) : preview.task.difficulty
      // A player defender's 20 on the cover roll is a player roll, so it generates Threat too.
      const coverThreat = Boolean(cover && target.side === 'player' && cover.dice.includes(20))
      const pending = {
        attackerId: actor.id,
        targetId: target.id,
        weaponId: preview.weapon.id,
        injuryMode: action.injuryMode,
        band: preview.band,
        distance: preview.distance,
        baseDifficulty: preview.baseDifficulty,
        rangeModifier: preview.rangeModifier,
        threatModifier: preview.threatModifier,
        cover,
        task: { ...preview.task, difficulty },
        dice: rollDice(random),
        rerolls: [],
        aimReroll: state.turn.aimReroll,
        assist: null,
      }
      // The helper rolls after the attacker, against their own Target Number for the same attack.
      const helper = state.assists[actor.id] && state.combatants[state.assists[actor.id]]
      if (helper && isActive(helper)) {
        const helperTask = assistTaskFor(helper, preview.weapon)
        const [die] = rollDice(random, 1)
        pending.assist = { helperId: helper.id, task: helperTask, die, success: die <= helperTask.targetNumber }
      }
      const { [actor.id]: usedAssist, ...assists } = state.assists
      let next = {
        ...updateCombatant(afterDraw, actor.id, { facing: facingToward(actor.position, target.position) }),
        assists: usedAssist ? assists : state.assists,
        // The Threat raising this task's Difficulty is used up by it.
        threat: preview.threatModifier ? 0 : state.threat,
        turn: { ...spendAP(state.turn, 'attack'), aimReroll: false, attacks: state.turn.attacks + 1 },
        pending,
        result: null,
      }
      if (coverThreat) next = { ...next, threat: 1 }
      next = withStats(next, (stats) => {
        stats.attacks += 1
        stats.byCombatant[actor.id].attacks += 1
        if (preview.threatModifier) stats.threat.used += 1
        if (coverThreat) stats.threat.gained += 1
      })
      const { task } = pending
      next = markAction(next, 'attack', actor.id, { targetId: target.id, weaponId: preview.weapon.id, injuryMode: action.injuryMode })
      return addLog(next, [
        ...decided.lines,
        `Attack (${apLeftText(next.turn)})`,
        `${actor.character.name} attacks ${target.character.name} with ${preview.weapon.name} (${getInjuryMode(action.injuryMode).name})`,
        `Range: ${preview.band.name} (${preview.distance} tiles)`,
        `${task.attribute.name} ${task.attribute.value} + ${task.discipline.name} ${task.discipline.value} = TN ${task.targetNumber}`,
        `Focus: ${task.focus ?? 'None'}`,
        cover
          ? `Target cover: ${cover.task.attribute.name} ${cover.task.attribute.value} + ${cover.task.discipline.name} ${cover.task.discipline.value} = TN ${cover.task.targetNumber}, rolls ${cover.dice.join(', ')}, ${cover.successes} ${cover.successes === 1 ? 'success' : 'successes'}`
          : 'Target cover: No',
        `Difficulty: ${task.difficulty} (${difficultyBreakdown(pending)})`,
        `Rolls: ${pending.dice.join(', ')}`,
        ...(pending.assist ? [assistLine(next, pending.assist)] : []),
        ...(preview.threatModifier ? ['Threat used: +1 Difficulty on this attack'] : []),
        ...(coverThreat ? ['Threat gained (defender rolled a 20 on cover)'] : []),
      ])
    }
    case 'reroll': {
      const { pending } = state
      if (!pending || action.dieIndex < 0 || action.dieIndex >= pending.dice.length) return state
      const attacker = state.combatants[pending.attackerId]
      if (action.source === 'aim' && !pending.aimReroll) return state
      if (action.source === 'momentum' && !(attacker.side === 'player' && state.momentum)) return state
      const decided = recordDecision(state, attacker, action)
      const { random, next: afterDraw } = takeRandom(decided.state)
      const dice = rerollDie(pending.dice, action.dieIndex, random)
      const reroll = { index: action.dieIndex, from: pending.dice[action.dieIndex], to: dice[action.dieIndex], source: action.source }
      let next = {
        ...afterDraw,
        momentum: action.source === 'momentum' ? 0 : state.momentum,
        pending: { ...pending, dice, rerolls: [...pending.rerolls, reroll], aimReroll: action.source === 'aim' ? false : pending.aimReroll },
      }
      if (action.source === 'momentum') next = withStats(next, (stats) => (stats.momentum.spentReroll += 1))
      return addLog(markAction(next, 'reroll', attacker.id, { source: action.source }), [
        ...decided.lines,
        `${action.source === 'aim' ? 'Aim' : 'Momentum spent:'} reroll die ${reroll.index + 1}: ${reroll.from} -> ${reroll.to}`,
        `Rolls: ${dice.join(', ')}`,
      ])
    }
    case 'resolveAttack': {
      const { pending } = state
      if (!pending) return state
      const attacker = state.combatants[pending.attackerId]
      const target = state.combatants[pending.targetId]
      const weapon = getWeapon(pending.weaponId)
      const evaluation = evaluateAttack(pending)
      const playerSide = attacker.side === 'player'
      const deadlyThreat = playerSide && getInjuryMode(pending.injuryMode).generatesThreat
      const momentumGained = playerSide && evaluation.momentum
      const threatGained = playerSide && (evaluation.threat || deadlyThreat)
      let next = { ...state, pending: null, momentum: momentumGained ? 1 : state.momentum, threat: threatGained ? 1 : state.threat }
      if (evaluation.passed) next = applyHit(next, target.id, weapon, pending.injuryMode)
      const after = next.combatants[target.id]
      next = withStats(next, (stats) => {
        if (evaluation.passed) {
          stats.attacksHit += 1
          stats.byCombatant[attacker.id].attacksHit += 1
          stats.byCombatant[attacker.id].hitsLanded += after.hits - target.hits
          stats.byCombatant[target.id].hitsTaken += after.hits - target.hits
        }
        if (momentumGained) stats.momentum.gained += 1
        if (threatGained) stats.threat.gained += 1
      })
      const lines = [
        `Final rolls: ${pending.dice.join(', ')} vs TN ${pending.task.targetNumber}`,
        ...(pending.assist
          ? [`Assist die ${pending.assist.die}: ${evaluation.assistCounted ? 'counts (+1 success)' : pending.assist.success ? 'does not count (the attacker scored no success)' : 'no success'}`]
          : []),
        `Successes: ${evaluation.successes} (needed ${pending.task.difficulty})`,
        `RESULT: ${evaluation.passed ? 'SUCCESS' : 'FAILURE'}`,
        ...(evaluation.passed ? [hitLine(target, after)] : []),
        ...(momentumGained ? ['Momentum gained (both dice succeeded)'] : []),
        ...(playerSide && evaluation.threat ? ['Threat gained (rolled a 20)'] : []),
        ...(deadlyThreat ? ['Threat gained (Deadly attack)'] : []),
      ]
      next = markAction(next, 'resolve', attacker.id, { targetId: target.id, weaponId: weapon.id, passed: evaluation.passed, removed: !isActive(after) })
      next = addLog(next, lines)
      next = {
        ...next,
        result: {
          attackerId: attacker.id,
          targetId: target.id,
          weaponId: weapon.id,
          injuryMode: pending.injuryMode,
          task: pending.task,
          cover: pending.cover,
          dice: evaluation.dice,
          assist: pending.assist && { ...pending.assist, counted: evaluation.assistCounted },
          rerolls: pending.rerolls,
          successes: evaluation.successes,
          passed: evaluation.passed,
          momentumGained,
          threatGained,
          extraHit: false,
          closed: false,
        },
      }
      return withOutcome(next)
    }
    case 'spendMomentumHit': {
      const { result } = state
      const target = result && state.combatants[result.targetId]
      if (!result || result.closed || !result.passed || result.extraHit || !state.momentum || !isActive(target)) return state
      if (state.combatants[result.attackerId].side !== 'player') return state
      const decided = recordDecision(state, state.combatants[result.attackerId], action)
      let next = applyHit({ ...decided.state, momentum: 0 }, target.id, getWeapon(result.weaponId), result.injuryMode)
      next = withStats(next, (stats) => {
        stats.momentum.spentHit += 1
        stats.byCombatant[result.attackerId].hitsLanded += 1
        stats.byCombatant[target.id].hitsTaken += 1
      })
      next = markAction(next, 'momentumHit', result.attackerId, { targetId: target.id, removed: !isActive(next.combatants[target.id]) })
      next = addLog(next, [...decided.lines, 'Momentum spent: +1 Hit', hitLine(target, next.combatants[target.id])])
      return withOutcome({ ...next, result: { ...result, extraHit: true } })
    }
    case 'cancelThreat': {
      if (!state.momentum || !state.threat || state.pending) return state
      const decided = recordDecision(state, actor, action)
      const next = withStats({ ...decided.state, momentum: 0, threat: 0 }, (stats) => {
        stats.momentum.spentCancelThreat += 1
        stats.threat.cancelled += 1
      })
      return addLog(markAction(next, 'cancelThreat', actor.id), [...decided.lines, 'Momentum spent to cancel Threat.'])
    }
    case 'selectCombatant': {
      if (state.pending || action.combatantId === actor.id) return state
      if (!getTurnGroup(state).includes(action.combatantId) || isTurnFinished(state, action.combatantId)) return state
      return switchToMember(state, action.combatantId)
    }
    case 'endTurn': {
      if (state.pending) return state
      const decided = recordDecision(state, actor, action)
      const ended = addLog({ ...decided.state, turn: { ...state.turn, done: true } }, [...decided.lines, `${actor.character.name} ends their turn.`])
      // The rest of the group still to act, in initiative order; the next unfinished member takes over.
      const nextMember = getTurnGroup(ended).find((id) => !isTurnFinished(ended, id))
      return nextMember ? switchToMember(ended, nextMember) : advanceTurn(ended)
    }
    default:
      return state
  }
}
