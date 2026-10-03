// Combat state and its reducer. All combat rules run here (through the rule modules), never in React handlers.
// The reducer is pure and never reads the clock or Math.random: every roll comes from the combat's own seed plus a roll
// counter, so the same characters, encounter, seed and actions always replay the same fight (and it can run headless).
// Designer spec: 3 Hits removes a combatant (Stun -> Incapacitated, Deadly -> Injured); a failed attack is a miss;
// Momentum and Threat are binary (max 1) and belong to the player side.
import encounterData from '../data/adaptation/combat/encounters.json'
import enemyData from '../data/adaptation/combat/enemies.json'
import { normalizeCharacterRecord } from '../character/runtimeCharacter.js'
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'
import { buildTask, evaluateTask, rerollDie, rollDice } from '../rules/taskResolver.js'
import { parseMap, tileKey, toPosition } from './battleMap.js'
import { applyCoverToDifficulty, canTakeCover, rollCoverDefence } from './coverSystem.js'
import { buildInitiativeOrder } from './initiativeSystem.js'
import { findPath, getMovementTiles, getReachableTiles } from './movementSystem.js'
import { getRangeBand, hasLineOfFire, tileDistance } from './rangeSystem.js'
import { getAttackTaskSpec, getCharacterWeapons, getInjuryMode, getRangeModifier, getWeapon } from './weaponSystem.js'

export const MAX_HITS = 3

export const getEncounter = (encounterId) => encounterData.encounters.find((encounter) => encounter.id === encounterId) ?? null
export const DEFAULT_ENCOUNTER_ID = encounterData.encounters[0].id

// done: the character pressed End Turn (they may also be finished by having used both actions).
const freshTurn = () => ({ minorUsed: false, majorUsed: false, aimReroll: false, done: false })

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

function createEnemyCharacters(encounter) {
  return encounter.enemies.map(({ enemyId, position }) => {
    const template = enemyData.enemies.find((enemy) => enemy.id === enemyId)
    const { character, error } = normalizeCharacterRecord(template.record, { id: enemyId })
    if (error) throw new Error(`Enemy ${enemyId}: ${error}`)
    return { character, position: toPosition(position) }
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

// players: RuntimeCharacters controlled by the player, in party order. seed: a whole number; it fixes initiative ties and every roll.
export function createCombat({ encounterId = DEFAULT_ENCOUNTER_ID, players, seed, initiativeOptions }) {
  const encounter = getEncounter(encounterId)
  const combatSeed = seed >>> 0
  const playerCombatants = players.map((character, index) =>
    createCombatant(character, { side: 'player', controller: 'player', position: toPosition(encounter.playerSpawns[index]) }),
  )
  const enemyCombatants = createEnemyCharacters(encounter).map(({ character, position }) =>
    createCombatant(character, { side: 'enemy', controller: 'ai', position }),
  )
  const all = [...playerCombatants, ...enemyCombatants]
  const order = buildInitiativeOrder(all, seededRandomInt(combatSeed), { firstSide: 'player', ...initiativeOptions })
  const first = all.find((combatant) => combatant.id === order[0])
  return {
    encounterId,
    seed: combatSeed,
    rolls: 0,
    map: parseMap(encounter.map.rows),
    combatants: Object.fromEntries(all.map((combatant) => [combatant.id, combatant])),
    order,
    round: 1,
    turnIndex: 0,
    turn: freshTurn(),
    // Saved turns of the other members of the current party group (see getTurnGroup), keyed by combatant id.
    groupTurns: {},
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

export const getTurnOf = (state, id) => (id === state.order[state.turnIndex] ? state.turn : state.groupTurns[id] ?? freshTurn())

// Out of actions: pressed End Turn, or used both the minor and the major action.
export function isTurnFinished(state, id) {
  const turn = getTurnOf(state, id)
  return turn.done || (turn.minorUsed && turn.majorUsed)
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
  return getReachableTiles(state.map, combatant.position, getMovementTiles(combatant.character), getBlockers(state, combatant))
}

export function getPathTo(state, combatant, destination) {
  return findPath(state.map, combatant.position, destination, getMovementTiles(combatant.character), getBlockers(state, combatant))
}

export const canAct = (state, combatant) => !state.outcome && !state.pending && getActiveCombatant(state)?.id === combatant.id
export const canUseMinor = (state, combatant) => canAct(state, combatant) && !state.turn.minorUsed
export const canUseMajor = (state, combatant) => canAct(state, combatant) && !state.turn.majorUsed
export const canTakeCoverNow = (state, combatant) => canUseMinor(state, combatant) && !combatant.inCover && canTakeCover(state.map, combatant.position)

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
  let next = { ...state, turnIndex, round, turn: freshTurn(), groupTurns: {}, aiReason: null, result: state.result && { ...state.result, closed: true } }
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
      if (!canUseMinor(state, actor)) return state
      const path = getPathTo(state, actor, action.destination)
      if (!path || path.length < 2) return state
      const destination = path[path.length - 1]
      const steps = path.length - 1
      const decided = recordDecision(state, actor, action, { path })
      const moved = updateCombatant(decided.state, actor.id, { position: destination, inCover: false })
      const next = { ...moved, turn: { ...state.turn, minorUsed: true }, lastMove: { key: state.log.length, combatantId: actor.id, path } }
      return addLog(markAction(next, 'move', actor.id), [
        ...decided.lines,
        `Minor Action: Move ${steps} ${steps === 1 ? 'tile' : 'tiles'}`,
        `Path: ${path.map(formatPosition).join(' > ')}${actor.inCover ? ' (leaves cover)' : ''}`,
      ])
    }
    case 'aim': {
      if (!canUseMinor(state, actor)) return state
      const decided = recordDecision(state, actor, action)
      return addLog(markAction({ ...decided.state, turn: { ...state.turn, minorUsed: true, aimReroll: true } }, 'aim', actor.id), [
        ...decided.lines,
        'Minor Action: Aim (may reroll one attack die this turn)',
      ])
    }
    case 'takeCover': {
      if (!canTakeCoverNow(state, actor)) return state
      const decided = recordDecision(state, actor, action)
      const covered = updateCombatant(decided.state, actor.id, { inCover: true })
      return addLog(markAction({ ...covered, turn: { ...state.turn, minorUsed: true } }, 'takeCover', actor.id), [...decided.lines, 'Minor Action: Take Cover'])
    }
    case 'attack': {
      if (!canUseMajor(state, actor)) return state
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
      }
      let next = {
        ...afterDraw,
        // The Threat raising this task's Difficulty is used up by it.
        threat: preview.threatModifier ? 0 : state.threat,
        turn: { ...state.turn, majorUsed: true, aimReroll: false },
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
      next = markAction(next, 'attack', actor.id, { targetId: target.id, weaponId: preview.weapon.id })
      return addLog(next, [
        ...decided.lines,
        'Major Action: Attack',
        `${actor.character.name} attacks ${target.character.name} with ${preview.weapon.name} (${getInjuryMode(action.injuryMode).name})`,
        `Range: ${preview.band.name} (${preview.distance} tiles)`,
        `${task.attribute.name} ${task.attribute.value} + ${task.discipline.name} ${task.discipline.value} = TN ${task.targetNumber}`,
        `Focus: ${task.focus ?? 'None'}`,
        cover
          ? `Target cover: ${cover.task.attribute.name} ${cover.task.attribute.value} + ${cover.task.discipline.name} ${cover.task.discipline.value} = TN ${cover.task.targetNumber}, rolls ${cover.dice.join(', ')}, ${cover.successes} ${cover.successes === 1 ? 'success' : 'successes'}`
          : 'Target cover: No',
        `Difficulty: ${task.difficulty} (${difficultyBreakdown(pending)})`,
        `Rolls: ${pending.dice.join(', ')}`,
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
      const evaluation = evaluateTask(pending.task, pending.dice)
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
