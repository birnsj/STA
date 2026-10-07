// Combat state and its reducer. All combat rules run here (through the rule modules), never in React handlers.
// The reducer is pure and never reads the clock or Math.random: every roll comes from the combat's own seed plus a roll
// counter, so the same characters, encounter, seed and actions always replay the same fight (and it can run headless).
// Personal condition (Book p.276-277, p.290-292; rules/personalCondition.js): a successful attack inflicts an Injury of
// the weapon's severity (less Protection); the target may Avoid it by taking that much Stress, else suffers it and is
// Defeated. There are no Hits. The player decides Avoid Injury for party members (state.incomingInjury waits for it),
// and which attribute a newly Fatigued party member shuts down (state.pendingFatigue); AI-controlled combatants decide
// through combat/injuryPolicy.js. A failed attack is a miss.
// Every roll (attacks, assists, opposed rolls, the Ambush) is the shared STA 2E task (rules/taskPreparation.js +
// rules/taskResolver.js) on the combatants' own characters, the same one challenge objects use. Combat decides what a
// result means here: a Hit, and what happens to the mission's pools (state.resources, rules/missionResources.js; the
// same object exploration holds): a party task saves its Momentum to the group pool, an NPC's Momentum becomes Threat.
// Complications stay complications (Book p.263: they are not turned into Threat unless someone buys them off).
// Actions (Book p.288): each turn one major and one minor action (actions.json). Besides attacking: Guard, First Aid,
// Direct and Assist here, and challenge objects in the world (exploration/combatLink.js, the same objects and rules as
// in exploration), all through the same shared task.
import actionData from '../data/adaptation/combat/actions.json'
import { getAuthoredCharacter } from '../character/authoredCharacters.js'
import { getAttributeName } from '../character/runtimeCharacter.js'
import { findAuthority } from '../rules/authority.js'
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'
import { addThreat, checkDicePurchase, createMissionResources, MAX_MOMENTUM, npcMomentumToThreat, payForDice, saveMomentum, spendMomentum } from '../rules/missionResources.js'
import { canCommunicate } from '../rules/communication.js'
import {
  addedSeverityCost,
  avoidInjury,
  buildInjury,
  chooseFatiguedAttribute,
  conditionSummary,
  endOfTurnCondition,
  getAvoidOption,
  getProtection,
  injuryText,
  injuryTypeName,
  MAX_ADDED_SEVERITY,
  needsFatigueAttribute,
  normalizeCondition,
  npcCategoryName,
  reviveCondition,
  takeHit,
  treatInjury,
} from '../rules/personalCondition.js'
import { prepareAssist, prepareTask } from '../rules/taskPreparation.js'
import { evaluateStaDie, rerollDie, resolveStaTask, rollDice, staSuccessOdds, staTaskChance, TASK_DICE } from '../rules/taskResolver.js'
import { chooseAvoidInjury, chooseFatigueAttribute } from './injuryPolicy.js'
import { tileKey, toBattleMap } from './battleMap.js'
import { canTakeCover } from './coverSystem.js'
import { DEFAULT_ENCOUNTER_ID, getEncounter } from './encounters.js'
import { buildInitiativeOrder } from './initiativeSystem.js'
import { findPath, getMovementTiles, getReachableTiles, getSprintTiles } from './movementSystem.js'
import { getRangeBand, hasLineOfFire, tileDistance } from './rangeSystem.js'
import { getAttackTaskSpec, getCharacterWeapons, getInjuryMode, getRangeModifier, getWeapon, withStandardIssue } from './weaponSystem.js'

// major / minor: actions of each type left this turn (Book p.288: one of each; see actions.json). Move or Sprint, once,
// never both (Book p.288). done: the character pressed End Turn with actions left. attacks: attacks made this turn (for
// the AI). extraMinor: the Extra Minor Action was bought this turn (Book p.260: once per turn). secondMajor: a bought
// second Major action is waiting; the task performed with it is +1 Difficulty (Book p.288, p.260 Swift Action).
// facing: presentation only (the book has no facing rules). One of the 8 grid directions, e.g. { x: 1, y: -1 }; it follows
// the last step of a move and turns toward the target of an attack.
const facingToward = (from, to) => {
  const x = Math.sign(to.x - from.x)
  const y = Math.sign(to.y - from.y)
  return x || y ? { x, y } : { x: 0, y: -1 }
}

export const ACTIONS_PER_TURN = actionData.actionsPerTurn
const ACTION_TYPES = Object.fromEntries(actionData.actions.map((entry) => [entry.id, entry.type]))
// 'major' | 'minor' | 'free' for an action id; a type passed in is returned as it is (challenge approaches carry a type).
export const actionTypeOf = (actionId) => ACTION_TYPES[actionId] ?? actionId
export const ACTION_TYPE_NAMES = { major: 'Major', minor: 'Minor', free: 'Free' }
// VIDEOGAME ADAPTATION, off by default: the earlier designer Momentum spends (reroll a die, cancel Threat; +1 Hit went with Hits).
export const ADAPTATION_MOMENTUM_SPENDS = actionData.adaptationMomentumSpends === true
export const COMBAT_TASKS = actionData.tasks
export const EXTRA_ACTIONS = actionData.extraActions
const freshTurn = () => ({
  major: ACTIONS_PER_TURN.major,
  minor: ACTIONS_PER_TURN.minor,
  aimReroll: false,
  done: false,
  attacks: 0,
  moved: false,
  sprinted: false,
  aimed: false,
  extraMinor: false,
  secondMajor: false,
})
const spendAction = (turn, actionId) => {
  const type = actionTypeOf(actionId)
  if (type === 'free') return turn
  return { ...turn, [type]: Math.max(0, turn[type] - 1), ...(type === 'major' ? { secondMajor: false } : {}) }
}
export const actionsLeft = (turn) => turn.major + turn.minor
// Book p.288: nobody attempts more than two major actions in a round (their own, a bought second one, a Direct).
export const MAX_MAJORS_PER_ROUND = 2
// The acting character spends an action from the current turn; a major action also counts toward the round's limit.
function spendTurnAction(state, actorId, actionId) {
  const turn = spendAction(state.turn, actionId)
  if (actionTypeOf(actionId) !== 'major') return { ...state, turn }
  return { ...state, turn, majorsThisRound: { ...state.majorsThisRound, [actorId]: (state.majorsThisRound[actorId] ?? 0) + 1 } }
}
export const majorsTaken = (state, id) => state.majorsThisRound?.[id] ?? 0

// condition / facing: carried in from the world when combat starts where everyone already stands. condition: the
// character's personal condition (rules/personalCondition.js: Stress, Injuries, Defeated); the same object shape the
// world keeps, handed back when the fight ends.
// guard: null, or { byId, round } while a Guard is up on this combatant (until the start of its next turn).
// id: the actor's id (a world NPC's id when combat starts in the world; otherwise the character's own id). The character
// keeps its own id: one character, whichever actor or combatant uses it.
function createCombatant(character, { id = character.id, side, controller, position, condition = null, facing = null }) {
  const weapons = getCharacterWeapons(character)
  return {
    id,
    character,
    side,
    controller,
    position,
    condition: normalizeCondition(condition),
    inCover: false,
    guard: null,
    facing,
    weaponIds: weapons.map((weapon) => weapon.id),
  }
}

// The roster (authored character ids, adaptation/characters.json) fills the map's enemy spawns in order; a map with fewer
// spawns fields fewer enemies.
function createEnemyCharacters(encounter, mapFile) {
  return encounter.roster.slice(0, mapFile.markers.enemySpawns.length).map((characterId, index) => ({
    character: getAuthoredCharacter(characterId),
    position: mapFile.markers.enemySpawns[index],
  }))
}

// Running totals for diagnosing and (later) batch-simulating combat. Counts events, not UI.
function createStats(combatants) {
  return {
    attacks: 0,
    attacksHit: 0,
    // Momentum: points generated by party tasks, saved to the pool, lost over the maximum, and spent (by use).
    momentum: { generated: 0, saved: 0, lost: 0, spentDice: 0, spentDirect: 0, spentReroll: 0, spentExtraActions: 0, spentSeverity: 0, spentCancelThreat: 0 },
    // Threat: points added (by source) and removed.
    threat: { fromDeadly: 0, fromNpcMomentum: 0, fromDice: 0, spentByNpcs: 0, cancelled: 0 },
    // Actions other than attacking: how often each was taken, and how many of their tasks passed.
    tasks: { guard: 0, firstAid: 0, direct: 0, interact: 0, extraMinor: 0, secondMajor: 0, passed: 0 },
    // Injuries from successful attacks: suffered (by type), avoided, and the Stress taken to avoid them.
    injuries: { suffered: 0, stun: 0, deadly: 0, avoided: 0, stressTaken: 0, threatSpent: 0, stressComplications: 0, fatigued: 0 },
    byCombatant: Object.fromEntries(combatants.map((combatant) => [combatant.id, freshCombatantStats()])),
  }
}
const freshCombatantStats = () => ({ attacks: 0, attacksHit: 0, injuriesInflicted: 0, injuriesSuffered: 0, injuriesAvoided: 0, stressTaken: 0, lastAttackRound: 0 })

const turnHeader = (combatant) => [
  combatant.character.name,
  `Initiative: Daring ${combatant.character.attributes.daring}, Control ${combatant.character.attributes.control}`,
]

// players: RuntimeCharacters controlled by the player, in party order; each stands on the map's player start of the same
// index (members beyond the map's player starts are left out). map: a parsed map file (src/maps/mapFormat.js).
// seed: a whole number; it fixes initiative ties and every roll.
// placements (optional): { players, enemies }, each [{ id?, character, position, condition?, facing? }] (id: the world
// actor's id; defaults to the character's). Used when
// combat starts in the exploration world: everyone fights from where they stand instead of the map's starts and spawns.
// resources: the mission's { momentum, threat } (rules/missionResources.js); a standalone fight starts a fresh pair.
// nominatedLeaders: { player, enemy } leader ids set by a scenario or party (rules/authority.js); null = none.
// sceneTraits: the scene's traits ([{ name, potency }]); combat in the world keeps them in step with the scenario.
export function createCombat({
  encounterId = DEFAULT_ENCOUNTER_ID,
  map: mapFile,
  players,
  seed,
  initiativeOptions,
  placements = null,
  resources = createMissionResources(),
  nominatedLeaders = null,
  sceneTraits = [],
}) {
  const encounter = getEncounter(encounterId)
  const combatSeed = seed >>> 0
  const playerPlacements =
    placements?.players ?? players.slice(0, mapFile.markers.playerStarts.length).map((character, index) => ({ character, position: mapFile.markers.playerStarts[index] }))
  const playerCombatants = playerPlacements.map((placement) =>
    createCombatant(withStandardIssue(placement.character, encounter.standardIssueWeapon), { ...placement, side: 'player', controller: 'player' }),
  )
  const enemyCombatants = (placements?.enemies ?? createEnemyCharacters(encounter, mapFile)).map((placement) =>
    createCombatant(placement.character, { ...placement, side: 'enemy', controller: 'ai' }),
  )
  const map = toBattleMap(mapFile)
  const nearestOpponent = (combatant) =>
    [...playerCombatants, ...enemyCombatants]
      .filter((other) => other.side !== combatant.side)
      .sort((a, b) => tileDistance(combatant.position, a.position) - tileDistance(combatant.position, b.position))[0]
  const all = [...playerCombatants, ...enemyCombatants].map((combatant) => ({
    ...combatant,
    inCover: !combatant.condition.defeated && canTakeCover(map, combatant.position),
    facing: combatant.facing ?? facingToward(combatant.position, nearestOpponent(combatant)?.position ?? combatant.position),
  }))
  const order = buildInitiativeOrder(all, seededRandomInt(combatSeed), { firstSide: 'player', ...initiativeOptions })
  // Someone already down (from an earlier fight) never takes the first turn.
  const turnIndex = Math.max(0, order.findIndex((id) => !all.find((combatant) => combatant.id === id).condition.defeated))
  const first = all.find((combatant) => combatant.id === order[turnIndex])
  return {
    encounterId,
    mapId: mapFile.id,
    weather: mapFile.weather,
    seed: combatSeed,
    rolls: 0,
    map,
    combatants: Object.fromEntries(all.map((combatant) => [combatant.id, combatant])),
    order,
    round: 1,
    turnIndex,
    turn: freshTurn(),
    // Saved turns of the other members of the current party group (see getTurnGroup), keyed by combatant id.
    groupTurns: {},
    // Assists set up this round: { [assisted ally id]: helper id }. Used by the ally's next attack; cleared each round.
    assists: {},
    // The mission's group Momentum and Threat for the length of the fight (handed back when it ends).
    resources,
    nominatedLeaders: { player: null, enemy: null, ...nominatedLeaders },
    sceneTraits,
    // While an ally acts on a Direct: { commanderId, allyId, commanderTurn } (the commander's turn waits meanwhile).
    directed: null,
    // Allies already directed this round (one Direct each per round).
    directedThisRound: [],
    // Major actions each combatant has taken this round ({ [id]: count }; MAX_MAJORS_PER_ROUND).
    majorsThisRound: {},
    // Combatants whose turn has started this round (a Guard on them ends when their next turn starts).
    startedThisRound: [first.id],
    // An Injury waiting for the player's Avoid Injury decision: { targetId, attackerId, injury, option } (see injuryStep).
    incomingInjury: null,
    // A party member who just became Fatigued and must choose the attribute to shut down: { combatantId }.
    pendingFatigue: null,
    // Notable NPCs that have spent Threat to Avoid Injury this scene (Book p.291: once per scene).
    avoidedThisScene: [],
    // Communication conditions for Direct (rules/communication.js): { remoteBlocked, reason }. null = nothing blocks comms.
    comms: null,
    // null until the party ambushes or is spotted first (see canAmbush); then { ambusherId, targetId, success } or { passed: true }.
    ambush: null,
    pending: null,
    result: null,
    outcome: null,
    aiReason: null,
    lastDecision: null,
    lastMove: null,
    lastAction: null,
    // Set only for combat started in the exploration world (src/exploration/combatLink.js):
    // knowledge: { [enemyId]: { [playerId]: { known, lastKnownPosition, source } } } - an enemy with an entry only treats
    // the party members it knows about as opponents. blockedKeys: tiles held by NPCs standing outside the fight.
    knowledge: null,
    blockedKeys: [],
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

// The directed ally acts (Direct) while the commander's turn waits; otherwise whoever's turn it is.
export const getActiveCombatant = (state) => state.combatants[state.directed?.allyId ?? state.order[state.turnIndex]]
// Able to act: not Defeated (Book p.291: a Defeated character is prone and takes no actions).
export const isActive = (combatant) => !combatant.condition.defeated
export const getCombatantList = (state) => state.order.map((id) => state.combatants[id])
// Whether a combatant knows another is there. Only combat started in the world tracks this (state.knowledge), and only
// for enemies: a party member an enemy hasn't detected is present but not one of its opponents.
export const knowsAbout = (state, viewer, other) => !state.knowledge?.[viewer.id] || Boolean(state.knowledge[viewer.id][other.id]?.known)
export const getOpponents = (state, combatant) =>
  getCombatantList(state).filter((other) => other.side !== combatant.side && isActive(other) && knowsAbout(state, combatant, other))

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

export function getTurnOf(state, id) {
  if (state.directed?.allyId === id) return state.turn
  if (state.directed?.commanderId === id) return state.directed.commanderTurn
  return id === state.order[state.turnIndex] ? state.turn : state.groupTurns[id] ?? freshTurn()
}

// Why a Move (kind 'move', a minor action) or Sprint (kind 'sprint', a major action) can't be taken now; null = it can.
// Book p.288: the Movement minor action can't be taken in the same turn as the Movement (Sprint) major action, nor while
// any enemy is within Reach. The book gives no disengage rule, so none is added: a character in Reach of an enemy can
// still Sprint.
export function getMovementBlock(state, combatant, kind = 'move') {
  const turn = getTurnOf(state, combatant.id)
  if (turn[actionTypeOf(kind)] <= 0) return `No ${actionTypeOf(kind)} action left.`
  if (kind === 'sprint') {
    if (turn.sprinted) return 'Already sprinted this turn.'
    if (turn.moved) return 'Moved this turn: Move and Sprint cannot both be taken in one turn.'
    return null
  }
  if (turn.moved) return 'Already moved this turn.'
  if (turn.sprinted) return 'Sprinted this turn: Move and Sprint cannot both be taken in one turn.'
  const adjacent = getOpponents(state, combatant).find((opponent) => tileDistance(combatant.position, opponent.position) <= 1)
  if (adjacent) return `${adjacent.character.name} is within Reach: no Move while an enemy is within Reach.`
  return null
}

// How far a Move or Sprint could go now: the full allowance if it can be taken (getMovementBlock), else nothing.
export function getMovementLeft(state, combatant, kind = 'move') {
  if (getMovementBlock(state, combatant, kind)) return 0
  return kind === 'sprint' ? getSprintTiles(combatant.character) : getMovementTiles(combatant.character)
}

// Out of actions: no major or minor action left, or pressed End Turn.
export function isTurnFinished(state, id) {
  const turn = getTurnOf(state, id)
  return turn.done || actionsLeft(turn) <= 0
}

// A player's rolled attack waits for the player only when it would miss and a reroll could still save it; otherwise
// it resolves on its own (prototype: no Resolve click for a roll with nothing left to decide).
export function rollAwaitsPlayer(state) {
  const { pending } = state
  if (!pending || state.combatants[pending.attackerId].side !== 'player') return false
  const evaluation = evaluateAttack(pending)
  const canReroll = (ADAPTATION_MOMENTUM_SPENDS && state.resources.momentum > 0) || evaluation.dice.some((die, index) => !die.successes && canAimReroll(pending, index))
  return canReroll && !evaluation.success
}

// Book (STA 2e Core p.288): Aim (minor action) lets the next Attack this turn reroll a single d20; with an Accurate
// weapon (p.241: the Accurate quality) up to two d20s. A focus does nothing extra for Aim: its only effect is the critical
// range every attack already uses.
export const isAccurate = (weapon) => Boolean(weapon?.qualities?.some((quality) => quality.toLowerCase() === 'accurate'))
export const aimRerollsFor = (weapon) => (isAccurate(weapon) ? 2 : 1)

export const AIM_TEXT = 'may reroll one die on the next attack this turn (two with an Accurate weapon)'

// Whether Aim can still reroll this die of the pending attack (rerolls left, and Aim hasn't rerolled this die yet).
export const canAimReroll = (pending, dieIndex) =>
  pending.aimRerolls > 0 && !pending.rerolls.some((reroll) => reroll.source === 'aim' && reroll.index === dieIndex)

// Enemies cannot be passed; allies can be passed but not stopped on. Defeated combatants do not block.
export function getBlockers(state, combatant) {
  const blockedKeys = new Set(state.blockedKeys ?? [])
  const occupiedKeys = new Set()
  for (const other of Object.values(state.combatants)) {
    if (other.id === combatant.id || !isActive(other)) continue
    ;(other.side === combatant.side ? occupiedKeys : blockedKeys).add(tileKey(other.position))
  }
  return { blockedKeys, occupiedKeys }
}

export function getReachable(state, combatant, kind = 'move') {
  return getReachableTiles(state.map, combatant.position, getMovementLeft(state, combatant, kind), getBlockers(state, combatant))
}

export function getPathTo(state, combatant, destination, kind = 'move') {
  return findPath(state.map, combatant.position, destination, getMovementLeft(state, combatant, kind), getBlockers(state, combatant))
}

export const canAct = (state, combatant) => !state.outcome && !state.pending && !awaitingDecision(state) && getActiveCombatant(state)?.id === combatant.id
// actionId: an action id (its type from actions.json) or a type ('major' | 'minor' | 'free').
export function canAfford(state, combatant, actionId) {
  const type = actionTypeOf(actionId)
  return canAct(state, combatant) && (type === 'free' || state.turn[type] > 0)
}
export const canMove = (state, combatant) => canAfford(state, combatant, 'move') && getMovementLeft(state, combatant) > 0
export const canSprint = (state, combatant) => canAfford(state, combatant, 'sprint') && getMovementLeft(state, combatant, 'sprint') > 0

// Book p.260: an Extra Minor Action for 1 Momentum, once per turn. Why it can't be bought now (null = it can).
// Prototype: party members pay from the group Momentum; enemies (Threat) don't buy it yet.
export function extraMinorBlock(state, combatant) {
  if (!canAct(state, combatant)) return 'Not this character\'s action.'
  if (combatant.side !== 'player') return 'Only the party buys extra actions for now.'
  if (state.turn.done) return 'Turn ended.'
  if (state.turn.extraMinor) return 'Already bought an extra minor action this turn.'
  if (state.resources.momentum < EXTRA_ACTIONS.extraMinorCost) return `Costs ${EXTRA_ACTIONS.extraMinorCost} Momentum; the group pool has ${state.resources.momentum}.`
  return null
}

// Book p.288: a second major action for 2 Momentum; the task attempted with it is +1 Difficulty. Not while directed
// (Direct is the ally's extra action), and never a third major action in a round.
export function secondMajorBlock(state, combatant) {
  if (!canAct(state, combatant)) return 'Not this character\'s action.'
  if (combatant.side !== 'player') return 'Only the party buys extra actions for now.'
  if (state.directed) return 'Not during a Direct.'
  if (state.turn.done) return 'Turn ended.'
  if (state.turn.major > 0) return 'Take your major action first.'
  if (majorsTaken(state, combatant.id) >= MAX_MAJORS_PER_ROUND) return `Already ${MAX_MAJORS_PER_ROUND} major actions this round.`
  if (state.resources.momentum < EXTRA_ACTIONS.secondMajorCost) return `Costs ${EXTRA_ACTIONS.secondMajorCost} Momentum; the group pool has ${state.resources.momentum}.`
  return null
}

// The Difficulty lines a bought second major action adds to this combatant's next major task ([] when none waits).
export const secondMajorLines = (state, combatantId) =>
  getTurnOf(state, combatantId).secondMajor ? [{ label: 'Second major action', change: EXTRA_ACTIONS.secondMajorDifficulty }] : []

// Aim doesn't stack, and is taken at most once per turn (Book p.260: each minor action once per turn).
export const canAim = (state, combatant) => canAfford(state, combatant, 'aim') && !state.turn.aimReroll && !state.turn.aimed
// The scene's traits, the performer's side and condition (Fatigue, Stress complications), for every combat task
// (taskPreparation.js).
const taskContext = (state, combatant, extra = {}) => ({ traits: state.sceneTraits ?? [], side: combatant.side, condition: combatant.condition, ...extra })
const traitsKey = (state, combatant) =>
  [
    ...(state.sceneTraits ?? []).map((trait) => `${trait.name}:${trait.potency ?? 1}`),
    combatant.condition.fatigued ? `fatigued:${combatant.condition.fatiguedAttribute ?? ''}` : '',
    ...(combatant.condition.complications ?? []).map((complication) => complication.name),
  ].join('|')

// The shared STA 2E task for attacking with this weapon (Attribute + Department, applicable focus, structured character
// effects, scene traits), before range, Guard and the target's opposition. Cached per character object (characters never
// change mid-fight) and per side and scene traits.
const preparedAttacks = new WeakMap()
function prepareAttack(state, combatant, weapon) {
  const { character } = combatant
  if (!preparedAttacks.has(character)) preparedAttacks.set(character, new Map())
  const cache = preparedAttacks.get(character)
  const key = `${weapon.id}#${combatant.side}#${traitsKey(state, combatant)}`
  if (!cache.has(key)) {
    const spec = getAttackTaskSpec(weapon)
    const task = { attribute: spec.attribute, department: spec.department, difficulty: spec.baseDifficulty, focuses: weapon.focuses, tags: spec.tags, traitRules: spec.traitRules }
    cache.set(key, prepareTask(character, task, taskContext(state, combatant)))
  }
  return cache.get(key)
}

// The attacker's own side of an attack with this weapon before any target (range, Guard, opposition) is known: the
// prepared task the action ring labels with Attribute + Department and Target Number.
export function getAttackTask(state, attackerId, weaponId) {
  const attacker = state.combatants[attackerId]
  const weapon = getWeapon(weaponId)
  return attacker && weapon ? prepareAttack(state, attacker, weapon) : null
}

// The defender's side of an opposed attack: the same shared task preparation as any other task, on the defender's own
// character (their Attribute + Department, structured effects, scene traits) with the focus from the authored defence
// list (opposition.focuses in weapons.json; VIDEOGAME ADAPTATION, Oct 2026).
const preparedDefences = new WeakMap()
function prepareDefence(state, combatant, weaponType, rule) {
  const { character } = combatant
  if (!preparedDefences.has(character)) preparedDefences.set(character, new Map())
  const cache = preparedDefences.get(character)
  const key = `${weaponType}#${combatant.side}#${traitsKey(state, combatant)}`
  if (!cache.has(key)) {
    const task = { attribute: rule.attribute, department: rule.department, difficulty: 0, focuses: rule.focuses ?? [], tags: rule.tags ?? [], traitRules: rule.traitRules }
    cache.set(key, prepareTask(character, task, taskContext(state, combatant)))
  }
  return cache.get(key)
}

// Whether the target resists with an opposed roll (Book p.289: a ranged attack on a target in Cover; a melee attack on a
// target aware of it), and the defender's own task: { when, difficulty ('higher' | 'successes'), task }.
function getOpposition(state, attacker, target, spec, weapon) {
  const rule = spec.opposition
  if (!rule || !isActive(target)) return null
  const applies = rule.when === 'targetInCover' ? target.inCover : rule.when === 'targetAware' && knowsAbout(state, target, attacker)
  if (!applies) return null
  return { when: rule.when, difficulty: rule.difficulty, task: prepareDefence(state, target, weapon.type, rule).task }
}

// The attack's final Difficulty once the defender's successes are known (no opposition: the preview's Difficulty).
// 'higher' - VIDEOGAME ADAPTATION (designer cover rule, kept Oct 2026): the higher of the normal Difficulty and the
// defender's successes, so taking Cover never makes a target easier to hit because its roll was poor. Book (p.256,
// p.289): the defender's successes alone. 'successes' (Book p.256): the defender's successes, adjusted by the attacker's
// other Difficulty changes (range, effects). A Guard on the target (Book p.288: +1) and a bought second major action's
// +1 apply after either.
export function attackDifficulty(preview, defenderSuccesses = 0) {
  const { opposition, task } = preview
  if (!opposition) return task.difficulty
  const guard = (preview.guardModifier ?? 0) + (preview.extraLines ?? []).reduce((total, line) => total + line.change, 0)
  const own = task.difficulty - guard
  if (opposition.difficulty === 'higher') return Math.max(own, defenderSuccesses) + guard
  return Math.max(0, defenderSuccesses + own - preview.baseDifficulty) + guard
}

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
  const prepared = prepareAttack(state, attacker, weapon)
  // Book p.288: a Guard on the target raises the Difficulty of attacks against it by 1.
  const guardModifier = target.guard ? 1 : 0
  const extraLines = secondMajorLines(state, attackerId)
  const extraModifier = extraLines.reduce((total, line) => total + line.change, 0)
  const task = { ...prepared.task, difficulty: prepared.difficulty + range.modifier + guardModifier + extraModifier }
  const opposition = getOpposition(state, attacker, target, spec, weapon)
  const base = {
    weapon,
    target,
    distance,
    band,
    baseDifficulty: spec.baseDifficulty,
    rangeModifier: range.modifier,
    guardModifier,
    extraLines,
    traitLines: prepared.difficultyLines.filter((line) => line.label.startsWith('Trait')),
    // Every change that makes up task.difficulty, for the Task panel (the prepared lines, then range, Guard, extra action).
    difficultyLines: [
      ...prepared.difficultyLines,
      ...(range.modifier ? [{ label: `Range: ${band.name}`, change: range.modifier }] : []),
      ...(guardModifier ? [{ label: 'Target guarded', change: guardModifier }] : []),
      ...extraLines,
    ],
    blockers: prepared.blockers,
    equipment: prepared.equipment,
    task,
    effects: prepared.effects,
    opposition,
    targetInCover: target.inCover,
  }
  if (!isActive(target) || target.side === attacker.side) return { ...base, available: false, reason: 'Not a valid target.' }
  if (!range.available) return { ...base, available: false, reason: `Out of range (${band.name}).` }
  if (!hasLineOfFire(state.map, position, target.position)) return { ...base, available: false, reason: 'No line of fire.' }
  return { ...base, available: true, reason: null }
}

// Assist (Book p.288, p.255): a major action. Designer decision (Oct 2026), kept: the combatant sets up the assist on
// an ally who still has a turn this round, and the ally's next task this round (an attack, Guard, First Aid or an
// object's task) adds the helper's 1d20, rolled against the helper's own Target Number. Any ally on the map; one assist
// per task. The resolver counts the assist die only if the leader scores at least 1 success.
export function canAssist(state, helper, ally) {
  if (!ally || ally.id === helper.id || ally.side !== helper.side || !isActive(ally) || state.assists[ally.id] || state.directed) return false
  return getTurnGroup(state).includes(ally.id) && !isTurnFinished(state, ally.id)
}

export const getAssistableAllies = (state, helper) => getCombatantList(state).filter((ally) => canAssist(state, helper, ally))

// The attack's STA 2E task result (taskResolver.js), counting the assist die (Book: an assistant's successes count only
// if the leader scores at least 1; an assistant's 20 is a complication too).
export function evaluateAttack(pending) {
  const { assist } = pending
  return resolveStaTask({ leader: { task: pending.task, dice: pending.dice }, assist: assist && { task: assist.task, die: assist.die }, difficulty: pending.task.difficulty })
}

// Who assists this combatant's next task, and with what: { helperId, task, focus, via ('assist' | 'direct'), label } or
// null. source says what the task is: { weapon } (an attack), { spec } (a predefined task: Guard, First Aid) or
// { approach } (an object's authored assist approach; null = that task can't be assisted).
// - A directed ally (Direct, Book p.288) is assisted by the commander with Control + Command. Book p.254 lets one
//   assistant help for free and charges for more, so while directed the commander is the only assistant (an Assist
//   set up on that ally waits for their own turn).
// - Otherwise the ally who set up an Assist, with the task's own Attribute + Department and focuses (attacks and
//   predefined tasks) or the authored approach (objects).
export function getAssistFor(state, actorId, source) {
  const { directed } = state
  if (directed?.allyId === actorId) {
    const commander = state.combatants[directed.commanderId]
    if (!commander || !isActive(commander)) return null
    const { task, focus } = prepareAssist(commander.character, COMBAT_TASKS.directAssist, commander.condition)
    return { helperId: commander.id, task, focus, via: 'direct', label: 'Direct: Control + Command' }
  }
  const helper = state.assists[actorId] && state.combatants[state.assists[actorId]]
  if (!helper || !isActive(helper)) return null
  if (source.weapon) {
    const { task, focus } = prepareAttack(state, helper, source.weapon)
    return { helperId: helper.id, task, focus, via: 'assist', label: 'Assist' }
  }
  if (source.spec) {
    const { task, focus } = prepareTask(helper.character, source.spec, taskContext(state, helper))
    return { helperId: helper.id, task, focus, via: 'assist', label: 'Assist' }
  }
  if (!source.approach) return null
  const { task, focus } = prepareAssist(helper.character, source.approach, helper.condition)
  return { helperId: helper.id, task, focus, via: 'assist', label: `Assist (${source.approach.label})` }
}

// Takes the assist off the table once it has been rolled (a Direct's assist isn't a set-up Assist).
const withoutUsedAssist = (state, actorId, assist) => {
  if (assist?.via !== 'assist') return state
  const { [actorId]: used, ...assists } = state.assists
  return used ? { ...state, assists } : state
}

const assistTaskFor = (state, actorId, weapon) => getAssistFor(state, actorId, { weapon })

// ---------- Guard, First Aid, Direct (Book p.288) ----------

const withinReach = (a, b) => tileDistance(a.position, b.position) <= 1

// Guard: yourself, or an ally within Reach.
export const getGuardTargets = (state, actor) =>
  getCombatantList(state).filter((other) => other.side === actor.side && isActive(other) && (other.id === actor.id || withinReach(actor, other)))

// Everything the Task panel shows before rolling a predefined task, and exactly what the roll uses:
// { available, reason, kind, actorId, targetId, label, prepared, task (with the final Difficulty), assist }.
function previewCombatTask(state, actor, { kind, label, target, spec, context = {}, block = null }) {
  const extraLines = actionTypeOf(kind) === 'major' ? secondMajorLines(state, actor.id) : []
  const prepared = prepareTask(actor.character, spec, taskContext(state, actor, { ...context, extraLines }))
  const task = { ...prepared.task, difficulty: prepared.difficulty }
  const assist = getAssistFor(state, actor.id, { spec })
  const reason = block ?? (!canAfford(state, actor, kind) ? `No ${ACTION_TYPE_NAMES[actionTypeOf(kind)]} action left.` : !prepared.possible ? prepared.blockers.join('; ') : null)
  return { available: !reason, reason, kind, label, actorId: actor.id, targetId: target?.id ?? null, prepared, task, assist }
}

export function previewGuard(state, actorId, targetId) {
  const actor = state.combatants[actorId]
  const target = state.combatants[targetId ?? actorId]
  const ally = target && target.id !== actor.id
  const spec = COMBAT_TASKS.guard
  const block = !target || target.side !== actor.side || !isActive(target) ? 'Guard yourself or an ally.' : ally && !withinReach(actor, target) ? `${target.character.name} is not within Reach.` : null
  return previewCombatTask(state, actor, {
    kind: 'guard',
    label: ally ? `Guard ${target.character.name}` : 'Guard',
    target,
    spec,
    // Book p.288: guarding an ally instead of yourself increases the Difficulty by 1.
    context: ally ? { difficultyMod: spec.allyDifficulty, difficultyModLabel: 'Guarding an ally' } : {},
    block,
  })
}

// First Aid on an ally within Reach (Book p.288, p.292): revive a Defeated ally (Difficulty 2), or treat one untreated
// Injury (Difficulty = its severity). [{ target, mode: 'revive' | 'treat:<injury id>', injury?, difficulty, label }]
export function getFirstAidOptions(state, actor) {
  return getCombatantList(state)
    .filter((other) => other.side === actor.side && other.id !== actor.id && withinReach(actor, other))
    .flatMap((other) => [
      ...(!isActive(other) ? [{ target: other, mode: 'revive', difficulty: COMBAT_TASKS.firstAidRevive.difficulty, label: `Revive ${other.character.name}` }] : []),
      ...other.condition.injuries
        .filter((injury) => !injury.treated)
        .map((injury) => ({
          target: other,
          mode: `treat:${injury.id}`,
          injury,
          difficulty: injury.severity,
          label: `Treat ${other.character.name}'s ${injuryTypeName(injury.type)} Injury (Severity ${injury.severity})`,
        })),
    ])
}

export function previewFirstAid(state, actorId, targetId, mode) {
  const actor = state.combatants[actorId]
  const target = state.combatants[targetId]
  const option = target && getFirstAidOptions(state, actor).find((entry) => entry.target.id === target.id && entry.mode === mode)
  const spec = option?.injury ? { ...COMBAT_TASKS.firstAidTreat, difficulty: option.injury.severity } : COMBAT_TASKS.firstAidRevive
  const block = !option ? 'No one within Reach needs this.' : null
  return previewCombatTask(state, actor, { kind: 'firstAid', label: option?.label ?? 'First Aid', target, spec, block })
}

// The character in authority on a side (rules/authority.js), from those able to act, in pick order (party members are
// stored first, in the order they were picked).
export function getAuthority(state, side) {
  const candidates = Object.values(state.combatants).filter((combatant) => combatant.side === side && isActive(combatant))
  return findAuthority(candidates, state.nominatedLeaders?.[side] ?? null)
}

// Why this ally can't be directed now (null = they can). Book p.288: an ally who can hear the commander
// (rules/communication.js: in earshot or by communicator), and Direct never gives anyone a third major action in a
// round. Prototype: once per round per ally.
export function directTargetBlock(state, actor, ally) {
  if (!ally || ally.side !== actor.side || ally.id === actor.id || !isActive(ally)) return 'Not an ally able to act.'
  if (state.directedThisRound.includes(ally.id)) return `${ally.character.name} was already directed this round.`
  if (majorsTaken(state, ally.id) >= MAX_MAJORS_PER_ROUND) return `${ally.character.name} already took ${MAX_MAJORS_PER_ROUND} major actions this round.`
  return canCommunicate(actor, ally, state.comms).reason
}

export const getDirectableAllies = (state, actor) => getCombatantList(state).filter((ally) => !directTargetBlock(state, actor, ally))

// Why this combatant can't Direct right now (null = they can).
export function directBlock(state, actor) {
  if (state.directed) return 'Already directing an ally.'
  const authority = getAuthority(state, actor.side)
  if (authority?.id !== actor.id) return `Only the character in authority may Direct${authority ? ` (${state.combatants[authority.id].character.name}: ${authority.reason})` : ''}.`
  if (!canAfford(state, actor, 'direct')) return 'No Major action left.'
  if (majorsTaken(state, actor.id) >= MAX_MAJORS_PER_ROUND) return `Already ${MAX_MAJORS_PER_ROUND} major actions this round.`
  if (state.resources.momentum < 1) return 'Direct costs 1 Momentum; the group pool is empty.'
  if (!getDirectableAllies(state, actor).length) return 'No ally who can hear you is left to direct this round.'
  return null
}

// Chance an available attack hits: the attacker's dice (2 plus bonusDice bought) with the shared STA 2E odds (critical
// successes included), the Aim rerolls (one failed die, two with an Accurate weapon), the assist die, and the
// defender's opposed roll when there is one. Presentation and AI aid only; the attack itself always rolls.
export function getHitChance(state, attackerId, preview, { bonusDice = 0 } = {}) {
  if (!preview?.available) return 0
  const turn = getTurnOf(state, attackerId)
  const rerolls = turn.aimReroll ? aimRerollsFor(preview.weapon) : 0
  const assistTask = assistTaskFor(state, attackerId, preview.weapon)?.task ?? null
  const chanceAt = (difficulty) => staTaskChance({ task: preview.task, difficulty, dice: TASK_DICE + bonusDice, rerolls, assistTask })
  if (!preview.opposition) return chanceAt(preview.task.difficulty)
  return staSuccessOdds(preview.opposition.task).reduce((total, chance, successes) => total + chance * chanceAt(attackDifficulty(preview, successes)), 0)
}

// VIDEOGAME ADAPTATION - designer decision (Oct 2026), from the book's stealth attribute (Captain's Log p.74: Control for
// "remaining stealthy") and ambush (p.205: the ambusher "may score an automatic hit"): on a party turn, until anyone
// attacks (either side), the party may try one Ambush, so it can sneak into position over several rounds. The party
// member with the best Control + Security rolls at Difficulty 1 (the shared STA 2E task: Camouflage or Ambush Tactics also
// gives critical successes at or under Security). VIDEOGAME ADAPTATION: the focus rerolls one failed die for free (no
// book rule gives a focus a reroll). Success: an automatic hit on the chosen Klingon (an Injury from the ambusher's
// weapon, see ambushStep). Failure: the Klingons act first for the rest of the fight, starting now. A free action.
export const AMBUSH_DIFFICULTY = 1
export const AMBUSH_FOCUSES = ['Camouflage', 'Ambush Tactics']

export const canAmbush = (state) => state.ambush === null && !state.outcome && !state.pending && !state.directed && getActiveCombatant(state).side === 'player'

export function getAmbusher(state) {
  const score = (combatant) => combatant.character.attributes.control + combatant.character.disciplines.security
  return getCombatantList(state)
    .filter((combatant) => combatant.side === 'player' && isActive(combatant))
    .reduce((best, combatant) => (!best || score(combatant) > score(best) ? combatant : best), null)
}

export function previewAmbush(state, targetId) {
  const ambusher = getAmbusher(state)
  const target = state.combatants[targetId]
  if (!ambusher) return { available: false, reason: 'No one can ambush.' }
  const prepared = prepareTask(ambusher.character, { attribute: 'control', department: 'security', difficulty: AMBUSH_DIFFICULTY, focuses: AMBUSH_FOCUSES, tags: ['ambush'] })
  const task = { ...prepared.task, difficulty: prepared.difficulty }
  // The focus reroll gives a failed die one more try.
  const chance = staTaskChance({ task, difficulty: task.difficulty, rerolls: task.focus ? 1 : 0 })
  const base = { ambusher, target, task, chance }
  if (!canAmbush(state)) return { ...base, available: false, reason: 'The chance to ambush has passed.' }
  if (!target || target.side === 'player' || !isActive(target)) return { ...base, available: false, reason: 'Choose a Klingon to ambush.' }
  // Designer decision (Oct 2026): only a Klingon the ambusher could shoot right now (in a weapon's range, clear line of fire).
  const inReach = ambusher.weaponIds.some((weaponId) => previewAttack(state, ambusher.id, target.id, weaponId).available)
  if (!inReach) return { ...base, available: false, reason: `${ambusher.character.name} has no shot at ${target.character.name} (out of range or no line of fire).` }
  return { ...base, available: true, reason: null }
}

// The Klingons the ambusher could ambush now.
export const getAmbushTargets = (state) => {
  const ambusher = getAmbusher(state)
  return ambusher ? getOpponents(state, ambusher).filter((enemy) => previewAmbush(state, enemy.id).available) : []
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

// A late arrival (an enemy that heard or saw the fight): joins from where it stands and takes the last initiative slot,
// so it first acts at the end of the current round. placement: as in createCombat.
export function addCombatant(state, placement, { side = 'enemy', controller = 'ai' } = {}) {
  if (state.combatants[placement.id ?? placement.character.id]) return state
  const combatant = createCombatant(placement.character, { ...placement, side, controller })
  const nearest = getCombatantList(state)
    .filter((other) => other.side !== side && isActive(other))
    .sort((a, b) => tileDistance(combatant.position, a.position) - tileDistance(combatant.position, b.position))[0]
  const joined = {
    ...combatant,
    inCover: canTakeCover(state.map, combatant.position),
    facing: combatant.facing ?? facingToward(combatant.position, nearest?.position ?? combatant.position),
  }
  const stats = structuredClone(state.stats)
  stats.byCombatant[joined.id] = freshCombatantStats()
  return addLog({ ...state, combatants: { ...state.combatants, [joined.id]: joined }, order: [...state.order, joined.id], stats }, [`${joined.character.name} joins the fight.`], 'info')
}

// The next roll's generator: one derived seed per roll, so replays match no matter how the UI is paced.
function takeRandom(state) {
  return { random: seededRandomInt(deriveSeed(state.seed, state.rolls)), next: { ...state, rolls: state.rolls + 1 } }
}

function withStats(state, change) {
  const stats = structuredClone(state.stats)
  change(stats)
  return { ...state, stats }
}

export const actionsLeftText = (turn) => `${turn.major} Major, ${turn.minor} Minor left`

const taskText = (task) => `${task.attribute.name} ${task.attribute.value} + ${task.department.name} ${task.department.value} = TN ${task.targetNumber}`

const focusText = (task) => (task.focus ? `${task.focus} (critical at or under ${task.criticalRange})` : 'None (critical only on a 1)')

// Evaluated dice as "4 = 2 (critical), 17 = 0, 20 = 0 (complication)".
const diceText = (dice) =>
  dice.map((die) => `${die.value} = ${die.successes}${die.critical ? ' (critical)' : ''}${die.complication ? ' (complication)' : ''}`).join(', ')

const purchaseLine = (purchase) => {
  const paid = [purchase.momentum && `${purchase.momentum} Momentum`, purchase.threatAdded && `${purchase.threatAdded} Threat added`, purchase.threatSpent && `${purchase.threatSpent} Threat spent`]
  return `Bought ${purchase.bonusDice} bonus d20${purchase.bonusDice === 1 ? '' : 's'} (${purchase.dice}d20) for ${purchase.cost}: ${paid.filter(Boolean).join(' + ')}`
}

const momentumLine = (generated, saving, resources) =>
  `Momentum generated: ${generated}; ${saving.saved} saved to the group pool (now ${resources.momentum}/${MAX_MOMENTUM})${saving.lost ? `; ${saving.lost} over the maximum, lost unless spent now` : ''}`

const assistLine = (state, assist) => {
  const die = evaluateStaDie(assist.task, assist.die)
  const role = assist.via === 'direct' ? 'Commander assists (Direct)' : 'Assist'
  return `${role}: ${state.combatants[assist.helperId].character.name}, ${taskText(assist.task)}, focus ${focusText(assist.task)}, rolls ${diceText([die])}`
}

// The defender's opposed roll (Book p.256: the reactive side rolls first; its successes set the Difficulty).
function rollOpposition(opposition, random) {
  const roll = resolveStaTask({ leader: { task: opposition.task, dice: rollDice(random) }, difficulty: 0 })
  return { ...opposition, dice: roll.dice, successes: roll.successes, complications: roll.complications }
}

const oppositionName = (opposition) => (opposition.when === 'targetInCover' ? 'Target in cover' : 'Target defends')

const formatPosition = (position) => `(${position.x},${position.y})`

export const statusText = (combatant) => conditionSummary(combatant.character, combatant.condition)

// ---------- Injuries (Book p.290-292; rules/personalCondition.js) ----------

// The Injury a successful hit with this weapon would inflict on this target: the weapon's severity, plus severity bought
// with Momentum (hook), less the target's Protection (minimum 1).
export function injuryFor(state, attacker, target, weapon, injuryModeId, addedSeverity = 0) {
  const protection = getProtection(target.character, { injuryType: injuryModeId, inCover: target.inCover })
  return buildInjury({ id: `${state.seed}-${state.log.length}-${target.id}`, type: injuryModeId, weapon, attacker, addedSeverity, protection })
}

// The Injury a hit would inflict with each of the weapon's settings (for the Task panel).
export function previewInjuries(state, attackerId, targetId, weaponId) {
  const attacker = state.combatants[attackerId]
  const target = state.combatants[targetId]
  const weapon = getWeapon(weaponId)
  if (!attacker || !target || !weapon) return []
  return weapon.injuryModes.map((mode) => injuryFor(state, attacker, target, weapon, mode))
}

const severityText = (injury) => {
  const parts = [`${injury.source.weaponName ?? 'weapon'} ${injury.baseSeverity}`]
  if (injury.addedSeverity) parts.push(`+${injury.addedSeverity} Momentum`)
  if (injury.protection) parts.push(`-${injury.protection} Protection`)
  return parts.length > 1 ? ` (${parts.join(' ')}, minimum 1)` : ''
}

// The avoid-or-suffer outcome for an incoming Injury: { targetId, attackerId, injury, option }. avoid: the decision
// (ignored when the rules don't allow avoiding). Returns { state, lines, avoided }.
function resolveInjury(state, incoming, avoid) {
  const { targetId, injury, option } = incoming
  const target = state.combatants[targetId]
  const name = target.character.name
  let next = { ...state, incomingInjury: null }
  if (avoid && option.possible) {
    const avoided = avoidInjury(target.character, target.condition, injury, option.kind)
    next = updateCombatant(next, targetId, { condition: avoided.condition })
    if (option.kind === 'threat') {
      next = {
        ...next,
        resources: { ...next.resources, threat: next.resources.threat - option.cost },
        avoidedThisScene: [...next.avoidedThisScene, target.character.id],
      }
    }
    next = withStats(next, (stats) => {
      stats.injuries.avoided += 1
      stats.byCombatant[targetId].injuriesAvoided += 1
      if (option.kind === 'stress') {
        stats.injuries.stressTaken += avoided.taken
        stats.byCombatant[targetId].stressTaken += avoided.taken
        if (avoided.complication) stats.injuries.stressComplications += 1
        if (avoided.becameFatigued) stats.injuries.fatigued += 1
      } else {
        stats.injuries.threatSpent += option.cost
        stats.threat.spentByNpcs += option.cost
      }
    })
    const paid =
      option.kind === 'stress'
        ? `takes ${avoided.taken} Stress${avoided.overflow ? ` (needed ${option.cost}; the track is full)` : ''} (${statusText(next.combatants[targetId])})`
        : `spends ${option.cost} Threat (pool now ${next.resources.threat})`
    const lines = [`${name} avoids the Injury: ${paid}. Not Defeated.`]
    if (avoided.complication) lines.push(`${name} suffers a complication: ${avoided.complication.name} (${avoided.overflow} Stress over the maximum, Book p.276).`)
    if (avoided.becameFatigued) {
      lines.push(`${name} is Fatigued: +1 Difficulty on all tasks, no more Stress, and one attribute shut down (Book p.277).`)
      next = startFatigueChoice(next, targetId, lines)
    }
    return { state: next, lines, avoided: true }
  }
  const condition = takeHit(target.character, target.condition, injury)
  next = updateCombatant(next, targetId, { condition, inCover: false, guard: null })
  const minor = !condition.injuries.includes(injury)
  next = withStats(next, (stats) => {
    stats.byCombatant[targetId].injuriesSuffered += 1
    if (incoming.attackerId && stats.byCombatant[incoming.attackerId]) stats.byCombatant[incoming.attackerId].injuriesInflicted += 1
    if (!minor) {
      stats.injuries.suffered += 1
      stats.injuries[injury.type] += 1
    }
  })
  const lines = minor
    ? [`${name} ${condition.dead ? 'is killed' : 'is knocked unconscious'} and Defeated (${npcCategoryName(target.character)}: no Injury; ${injuryTypeName(injury.type)} hit).`]
    : [`${name} suffers a ${injuryText(injury)} and is Defeated${condition.dying ? ' (Dying: Deadly Injury)' : ''}.`]
  return { state: next, lines, avoided: false }
}

// Book p.277: a character who becomes Fatigued selects an attribute to shut down. The player chooses for a
// player-controlled party member (state.pendingFatigue waits for the chooseFatigueAttribute action, like an incoming
// Injury); anyone else gets combat/injuryPolicy.js's choice now. lines: the log lines being built (appended to).
function startFatigueChoice(state, combatantId, lines) {
  const combatant = state.combatants[combatantId]
  if (combatant.controller === 'player') return { ...state, pendingFatigue: { combatantId } }
  const { attributeId, reason } = chooseFatigueAttribute({ combatant })
  lines.push(`AI Decision: shut down ${getAttributeName(attributeId)}`, `Reason: ${reason}`)
  return updateCombatant(state, combatantId, { condition: chooseFatiguedAttribute(combatant.condition, attributeId) })
}

// Something waits for a decision before play goes on: an Avoid Injury choice or a Fatigue attribute choice.
export const awaitingDecision = (state) => Boolean(state.incomingInjury || state.pendingFatigue)

// A hit lands: the target either decides (party members: the player, through state.incomingInjury and the
// injuryDecision action) or the decision is made now (no choice possible, or an AI-controlled character through
// combat/injuryPolicy.js). Returns { state, lines }.
function inflictInjury(state, attackerId, targetId, injury) {
  const target = state.combatants[targetId]
  const option = getAvoidOption(target.character, target.condition, injury, { threat: state.resources.threat, avoidedThisScene: state.avoidedThisScene })
  const incoming = { targetId, attackerId, injury, option }
  const lines = [`Injury: ${injuryTypeName(injury.type)}, Severity ${injury.severity}${severityText(injury)}`]
  if (!option.possible) {
    if (option.reason) lines.push(`Cannot Avoid Injury: ${option.reason}`)
    const resolved = resolveInjury(state, incoming, false)
    return { state: resolved.state, lines: [...lines, ...resolved.lines] }
  }
  if (target.controller === 'player') {
    const offer = option.overflow ? `take ${option.taken} Stress, filling the track, plus a complication` : `take ${option.cost} Stress`
    return { state: { ...state, incomingInjury: incoming }, lines: [...lines, `${target.character.name} may Avoid Injury: ${offer} (${statusText(target)}).`] }
  }
  const avoid = chooseAvoidInjury({ state, target, injury, option })
  const resolved = resolveInjury(state, incoming, avoid)
  return { state: resolved.state, lines: [...lines, ...resolved.lines] }
}

// Hook (Book p.291): Momentum spent on a successful attack adds severity, 2 per point (1 with Intense), at most +2.
// requested: points asked for. Returns { added, cost } within what the pool can pay (party only; nobody asks yet).
function affordAddedSeverity(resources, weapon, requested = 0, playerSide) {
  if (!playerSide || !requested) return { added: 0, cost: 0 }
  const each = addedSeverityCost(weapon)
  const added = Math.min(MAX_ADDED_SEVERITY, requested, Math.floor(resources.momentum / each))
  return { added, cost: added * each }
}

// Start of a combatant's own turn: a Guard on them ends (Book p.288: until the start of the guarded character's next turn).
function startTurnOf(state, id) {
  if (state.startedThisRound.includes(id)) return state
  let next = { ...state, startedThisRound: [...state.startedThisRound, id] }
  if (next.combatants[id].guard) {
    next = updateCombatant(next, id, { guard: null })
    next = addLog(next, [`Guard on ${next.combatants[id].character.name} ends (start of their turn).`], 'info')
  }
  return next
}

// End of the current turn group: each member who took a turn this round reaches the end of it, so Stun Injuries wearing
// off (Book p.292: removed at the end of the next turn after no longer being Defeated) go.
function endTurnsOf(state, ids) {
  let next = state
  ids.forEach((id) => {
    const combatant = next.combatants[id]
    if (!isActive(combatant) || !next.startedThisRound.includes(id)) return
    const { condition, removed } = endOfTurnCondition(combatant.condition)
    if (!removed.length) return
    next = updateCombatant(next, id, { condition })
    next = addLog(next, [`${combatant.character.name}: ${removed.map((injury) => `${injuryTypeName(injury.type)} Injury (Severity ${injury.severity})`).join(', ')} wears off at the end of their turn.`], 'info')
  })
  return next
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
  return startTurnOf(addLog(next, turnHeader(next.combatants[id]), 'turn'), id)
}

// Moves past the whole current group (a single combatant for enemies) to the next active combatant.
function advanceTurn(previous) {
  const range = getTurnGroupRange(previous)
  const state = endTurnsOf(previous, previous.order.slice(range.start, range.end + 1))
  let { round } = state
  let turnIndex = range.end
  for (let i = 0; i < state.order.length; i++) {
    turnIndex += 1
    if (turnIndex >= state.order.length) {
      turnIndex = 0
      round += 1
    }
    if (isActive(state.combatants[state.order[turnIndex]])) break
  }
  const newRound = round !== state.round
  let next = {
    ...state,
    turnIndex,
    round,
    turn: freshTurn(),
    groupTurns: {},
    assists: newRound ? {} : state.assists,
    directedThisRound: newRound ? [] : state.directedThisRound,
    majorsThisRound: newRound ? {} : state.majorsThisRound,
    startedThisRound: newRound ? [] : state.startedThisRound,
    aiReason: null,
    result: state.result && { ...state.result, closed: true },
  }
  if (newRound) next = addLog(next, [`ROUND ${round}`], 'round')
  const id = next.order[turnIndex]
  return startTurnOf(addLog(next, turnHeader(next.combatants[id]), 'turn'), id)
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
  const { opposition } = pending
  const successes = opposition && `${opposition.successes} ${opposition.successes === 1 ? 'success' : 'successes'}`
  const parts = opposition?.difficulty === 'successes' ? [`opposed: target's ${successes}`] : [`base ${pending.baseDifficulty}`]
  if (pending.rangeModifier) parts.push(`${pending.band.name} range +${pending.rangeModifier}`)
  ;(pending.traitLines ?? []).forEach((line) => parts.push(`${line.label} ${line.change >= 0 ? '+' : ''}${line.change}`))
  if (opposition?.difficulty === 'higher') parts.push(`target cover ${successes} (the higher counts)`)
  if (pending.guardModifier) parts.push(`target guarded +${pending.guardModifier}`)
  ;(pending.extraLines ?? []).forEach((line) => parts.push(`${line.label} +${line.change}`))
  return parts.join(', ')
}

// The one roll every predefined combat task (Guard, First Aid) makes: the shared STA 2E task with dice bought before the
// roll (Book p.259), the assist die, the performer's structured effects, and Momentum to the group pool (party) or
// Threat (NPC, Book p.264). Spends the action, takes the used assist off the table, and records the result.
// Returns { state, passed, lines } or null when the purchase isn't valid.
function rollCombatTask(state, actor, preview, requestedPurchase, taskKind) {
  const purchase = checkDicePurchase(state.resources, requestedPurchase, actor.side)
  if (!purchase.valid) return null
  const { random, next: afterDraw } = takeRandom(state)
  const { task, prepared } = preview
  const dice = rollDice(random, purchase.dice)
  const assist = preview.assist && { helperId: preview.assist.helperId, task: preview.assist.task, via: preview.assist.via, die: rollDice(random, 1)[0] }
  const evaluation = resolveStaTask({
    leader: { task, dice },
    assist: assist && { task: assist.task, die: assist.die },
    difficulty: task.difficulty,
    ignoreComplications: prepared.ignoreComplications,
    bonusMomentum: prepared.bonusMomentum,
  })
  const passed = evaluation.success
  const playerSide = actor.side === 'player'
  const paid = payForDice(state.resources, purchase)
  const saving = playerSide ? saveMomentum(paid, evaluation.momentumGenerated) : { resources: paid, saved: 0, lost: 0 }
  const npcThreat = playerSide ? 0 : evaluation.momentumGenerated
  const resources = npcMomentumToThreat(saving.resources, npcThreat)
  let next = withoutUsedAssist(spendTurnAction({ ...afterDraw, resources }, actor.id, taskKind), actor.id, preview.assist)
  next = withStats(next, (stats) => {
    stats.tasks[taskKind] += 1
    if (passed) stats.tasks.passed += 1
    if (playerSide) stats.momentum.generated += evaluation.momentumGenerated
    stats.momentum.saved += saving.saved
    stats.momentum.lost += saving.lost
    stats.momentum.spentDice += purchase.momentum
    stats.threat.fromDice += purchase.threatAdded
    stats.threat.spentByNpcs += purchase.threatSpent
    stats.threat.fromNpcMomentum += npcThreat
  })
  const resultAssist = assist && { ...assist, successes: evaluation.assist.successes, counted: evaluation.assist.counted }
  next = {
    ...next,
    result: {
      kind: 'task',
      key: state.log.length,
      taskKind,
      label: preview.label,
      attackerId: actor.id,
      targetId: preview.targetId,
      task,
      opposition: null,
      dice: evaluation.dice,
      assist: resultAssist,
      rerolls: [],
      successes: evaluation.successes,
      passed,
      momentumGenerated: evaluation.momentumGenerated,
      momentumSaved: saving.saved,
      momentumUnsaved: saving.lost,
      threatAdded: npcThreat,
      complications: evaluation.complications,
      taskResult: evaluation,
      closed: false,
    },
  }
  const lines = [
    `${preview.label} (${ACTION_TYPE_NAMES[actionTypeOf(taskKind)]} action; ${actionsLeftText(next.turn)})`,
    taskText(task),
    `Focus: ${focusText(task)}`,
    `Difficulty: ${task.difficulty} (${preview.prepared.difficultyLines.map((line) => `${line.label} ${line.change >= 0 ? '+' : ''}${line.change}`).join(', ')})`,
    ...(purchase.bonusDice ? [purchaseLine(purchase)] : []),
    `Rolls: ${diceText(evaluation.dice)}`,
    ...(resultAssist ? [assistLine(next, resultAssist), `Assist die: ${!resultAssist.successes ? 'no success' : resultAssist.counted ? `counts (+${resultAssist.successes})` : 'does not count (the leader scored no success)'}`] : []),
    `Successes: ${evaluation.successes} vs Difficulty ${task.difficulty}`,
    `RESULT: ${passed ? 'SUCCESS' : 'FAILURE'}`,
    playerSide ? momentumLine(evaluation.momentumGenerated, saving, resources) : `Momentum generated: ${evaluation.momentumGenerated}${npcThreat ? ` (NPC: added to Threat, now ${resources.threat})` : ''}`,
    ...(evaluation.complications ? [`Complications: ${evaluation.complications}`] : []),
  ]
  return { state: next, passed, lines }
}

// A Direct ends once the directed ally has taken their action (and any attack it started has resolved): the commander's
// turn carries on with what it had left.
export function settleDirected(state) {
  const { directed } = state
  if (!directed || state.pending || awaitingDecision(state)) return state
  const ally = state.combatants[directed.allyId]
  if (state.turn.major > 0 && !state.turn.done && isActive(ally) && !state.outcome) return state
  const next = {
    ...state,
    turn: directed.commanderTurn,
    directed: null,
    directedThisRound: [...state.directedThisRound, directed.allyId],
  }
  return addLog(next, [`${ally.character.name}'s directed action is done; back to ${state.combatants[directed.commanderId].character.name}.`], 'info')
}

// A challenge object's task or routine action taken in combat (exploration/combatLink.js runs the object's own rules
// through challengeObjects.js; this records what it means for the fight). interaction: { actorId, cost ('major' |
// 'minor' | 'free'), resources (the mission pools after the attempt), label, passed (null = no roll), task, dice,
// successes, complications, momentumGenerated, momentumSaved, assistUsed, lines }.
export function canInteract(state, actorId, cost) {
  const actor = state.combatants[actorId]
  return Boolean(actor) && canAfford(state, actor, cost)
}

export function applyInteraction(state, interaction) {
  const actor = state.combatants[interaction.actorId]
  if (!canInteract(state, actor.id, interaction.cost)) return state
  let next = spendTurnAction({ ...state, resources: interaction.resources }, actor.id, interaction.cost)
  if (interaction.assistUsed) next = withoutUsedAssist(next, actor.id, { via: 'assist' })
  next = withStats(next, (stats) => {
    stats.tasks.interact += 1
    if (interaction.passed) stats.tasks.passed += 1
    stats.momentum.generated += interaction.momentumGenerated ?? 0
    stats.momentum.saved += interaction.momentumSaved ?? 0
  })
  if (interaction.passed !== null) {
    next = {
      ...next,
      result: {
        kind: 'task',
        key: state.log.length,
        taskKind: 'interact',
        label: interaction.label,
        attackerId: actor.id,
        targetId: null,
        task: interaction.task,
        opposition: null,
        dice: interaction.dice,
        assist: interaction.assist ?? null,
        rerolls: [],
        successes: interaction.successes,
        passed: interaction.passed,
        momentumGenerated: interaction.momentumGenerated ?? 0,
        momentumSaved: interaction.momentumSaved ?? 0,
        momentumUnsaved: 0,
        threatAdded: 0,
        complications: interaction.complications ?? 0,
        closed: false,
      },
    }
  }
  next = markAction(next, 'interact', actor.id, { passed: interaction.passed })
  next = addLog(next, [`${interaction.label} (${ACTION_TYPE_NAMES[actionTypeOf(interaction.cost)]} action; ${actionsLeftText(next.turn)})`, ...interaction.lines])
  return withOutcome(settleDirected(next))
}

// ---------- reducer ----------

export function combatReducer(state, action) {
  if (action.type === 'restart') return createCombat(action.options)
  if (!state || state.outcome) return state
  const next = settleDirected(reduceAction(state, action))
  // Any attack, by either side, spots the party and ends the ambush chance.
  if (next !== state && next.ambush === null && action.type === 'attack') return { ...next, ambush: { passed: true } }
  return next
}

function ambushStep(state, action) {
  const preview = previewAmbush(state, action.targetId)
  if (!preview.available) return state
  const { ambusher, target, task } = preview
  const decided = recordDecision(state, ambusher, action)
  const { random, next: afterDraw } = takeRandom(decided.state)
  const resolve = (values) => resolveStaTask({ leader: { task, dice: values }, difficulty: task.difficulty })
  let dice = rollDice(random)
  const rerolls = []
  const firstRoll = resolve(dice)
  if (task.focus && !firstRoll.success) {
    const index = firstRoll.dice.findLastIndex((die) => !die.successes)
    const rerolled = rerollDie(dice, index, random)
    rerolls.push({ index, from: dice[index], to: rerolled[index], source: 'focus' })
    dice = rerolled
  }
  const evaluation = resolve(dice)
  const passed = evaluation.success
  const saving = saveMomentum(state.resources, evaluation.momentumGenerated)
  let next = {
    ...afterDraw,
    resources: saving.resources,
    ambush: { ambusherId: ambusher.id, targetId: target.id, success: passed },
  }
  const lines = [
    ...decided.lines,
    `Ambush: ${ambusher.character.name} sneaks up on ${target.character.name}`,
    `${taskText(task)}, Difficulty ${task.difficulty}`,
    `Focus: ${task.focus ? `${focusText(task)}; free reroll` : focusText(task)}`,
    ...rerolls.map((reroll) => `Focus reroll die ${reroll.index + 1}: ${reroll.from} -> ${reroll.to}`),
    `Rolls: ${diceText(evaluation.dice)} (${evaluation.successes} ${evaluation.successes === 1 ? 'success' : 'successes'})`,
  ]
  if (passed) {
    // The ambusher's first weapon with a shot, on Stun when it has a Stun setting (see actions.json ambush notes).
    const weapon = getWeapon(ambusher.weaponIds.find((weaponId) => previewAttack(state, ambusher.id, target.id, weaponId).available))
    const mode = weapon.injuryModes.includes('stun') ? 'stun' : weapon.injuryModes[0]
    const hit = inflictInjury(next, ambusher.id, target.id, injuryFor(next, ambusher, target, weapon, mode))
    next = hit.state
    lines.push('RESULT: AMBUSHED', `Automatic hit: ${weapon.name} (${getInjuryMode(mode).name})`, ...hit.lines)
  } else {
    lines.push('RESULT: SPOTTED. The Klingons act first this fight.')
  }
  if (passed) lines.push(momentumLine(evaluation.momentumGenerated, saving, next.resources))
  if (evaluation.complications) lines.push(`Complications: ${evaluation.complications}`)
  next = withStats(next, (stats) => {
    stats.momentum.generated += evaluation.momentumGenerated
    stats.momentum.saved += saving.saved
    stats.momentum.lost += saving.lost
  })
  next = markAction(next, 'ambush', ambusher.id, { targetId: target.id, passed, removed: !isActive(next.combatants[target.id]) })
  next = addLog(next, lines)
  next = {
    ...next,
    result: {
      kind: 'ambush',
      attackerId: ambusher.id,
      targetId: target.id,
      task,
      opposition: null,
      dice: evaluation.dice,
      assist: null,
      rerolls,
      successes: evaluation.successes,
      passed,
      momentumGenerated: evaluation.momentumGenerated,
      momentumSaved: saving.saved,
      momentumUnsaved: saving.lost,
      threatAdded: 0,
      complications: evaluation.complications,
      taskResult: evaluation,
      closed: false,
    },
  }
  if (passed) return withOutcome(next)
  // Spotted: the party's round ends here (anyone yet to act loses that turn) and a new round starts with initiative rebuilt
  // Klingons first (same tie-breaks as the fight's start), so the Klingons act now and stay first for the rest of the fight.
  const all = Object.values(next.combatants)
  const order = buildInitiativeOrder(all, seededRandomInt(state.seed), { firstSide: 'enemy' })
  const first = next.combatants[order.find((id) => isActive(next.combatants[id]))]
  const round = state.round + 1
  next = endTurnsOf(next, next.startedThisRound)
  next = {
    ...next,
    order,
    round,
    turnIndex: order.indexOf(first.id),
    turn: freshTurn(),
    groupTurns: {},
    assists: {},
    directedThisRound: [],
    majorsThisRound: {},
    startedThisRound: [],
    aiReason: null,
  }
  next = addLog(next, [`Initiative (Klingons first, then Daring, then Control): ${order.map((id) => next.combatants[id].character.name).join(', ')}`], 'info')
  next = addLog(next, [`ROUND ${round}`], 'round')
  return startTurnOf(addLog(next, turnHeader(first), 'turn'), first.id)
}

function reduceAction(state, action) {
  const actor = getActiveCombatant(state)
  // An incoming Injury waits for its Avoid Injury decision, and a new Fatigue for its attribute, before anything else.
  if (state.incomingInjury && action.type !== 'injuryDecision') return state
  if (state.pendingFatigue && action.type !== 'chooseFatigueAttribute') return state

  switch (action.type) {
    // Book p.277: the player selects the attribute a newly Fatigued party member shuts down (action.attribute), or
    // autocombat's policy does (action.reason).
    case 'chooseFatigueAttribute': {
      const pending = state.pendingFatigue
      const combatant = pending && state.combatants[pending.combatantId]
      if (!combatant || !needsFatigueAttribute(combatant.condition)) return state
      const condition = chooseFatiguedAttribute(combatant.condition, action.attribute)
      if (condition === combatant.condition) return state
      const next = updateCombatant({ ...state, pendingFatigue: null }, combatant.id, { condition })
      return addLog(next, [
        ...(action.reason ? [`AI Decision: shut down ${getAttributeName(action.attribute)}`, `Reason: ${action.reason}`] : []),
        `${combatant.character.name} is Fatigued: ${getAttributeName(action.attribute)} is shut down (its tasks automatically fail).`,
      ])
    }
    // Book p.292 Avoid Injury: the player's decision for a party member (action.avoid), or autocombat's (action.reason).
    case 'injuryDecision': {
      const incoming = state.incomingInjury
      if (!incoming) return state
      const target = state.combatants[incoming.targetId]
      const resolved = resolveInjury(state, incoming, Boolean(action.avoid))
      let next = markAction(resolved.state, 'injury', incoming.attackerId, { targetId: target.id, avoided: resolved.avoided, removed: !isActive(resolved.state.combatants[target.id]) })
      if (next.result?.injury && next.result.targetId === target.id) next = { ...next, result: { ...next.result, injury: { ...next.result.injury, decided: resolved.avoided ? 'avoided' : 'suffered' } } }
      next = addLog(next, [
        ...(action.reason ? [`AI Decision: ${resolved.avoided ? 'Avoid Injury' : 'Accept Injury'}`, `Reason: ${action.reason}`] : []),
        `${target.character.name} ${resolved.avoided ? 'chooses to Avoid Injury' : 'accepts the Injury'}.`,
        ...resolved.lines,
      ])
      return withOutcome(next)
    }
    // Book p.260: 1 Momentum, one more minor action this turn (once per turn).
    case 'buyExtraMinor': {
      if (extraMinorBlock(state, actor)) return state
      const resources = spendMomentum(state.resources, EXTRA_ACTIONS.extraMinorCost)
      const turn = { ...state.turn, minor: state.turn.minor + 1, extraMinor: true }
      const next = withStats({ ...state, resources, turn }, (stats) => {
        stats.tasks.extraMinor += 1
        stats.momentum.spentExtraActions = (stats.momentum.spentExtraActions ?? 0) + EXTRA_ACTIONS.extraMinorCost
      })
      return addLog(markAction(next, 'extraMinor', actor.id), [
        `Momentum spent: ${EXTRA_ACTIONS.extraMinorCost} for an extra minor action (group pool now ${resources.momentum}; ${actionsLeftText(turn)})`,
      ])
    }
    // Book p.288: 2 Momentum, a second major action this turn; its task is +1 Difficulty.
    case 'buySecondMajor': {
      if (secondMajorBlock(state, actor)) return state
      const resources = spendMomentum(state.resources, EXTRA_ACTIONS.secondMajorCost)
      const turn = { ...state.turn, major: state.turn.major + 1, secondMajor: true }
      const next = withStats({ ...state, resources, turn }, (stats) => {
        stats.tasks.secondMajor += 1
        stats.momentum.spentExtraActions = (stats.momentum.spentExtraActions ?? 0) + EXTRA_ACTIONS.secondMajorCost
      })
      return addLog(markAction(next, 'secondMajor', actor.id), [
        `Momentum spent: ${EXTRA_ACTIONS.secondMajorCost} for a second major action (group pool now ${resources.momentum}; ${actionsLeftText(turn)}). Its task is +${EXTRA_ACTIONS.secondMajorDifficulty} Difficulty.`,
      ])
    }
    case 'ambush':
      return ambushStep(state, action)
    case 'move':
    case 'sprint': {
      const kind = action.type
      if (kind === 'move' ? !canMove(state, actor) : !canSprint(state, actor)) return state
      const path = getPathTo(state, actor, action.destination, kind)
      if (!path || path.length < 2) return state
      const destination = path[path.length - 1]
      const steps = path.length - 1
      const decided = recordDecision(state, actor, action, { path })
      const inCover = canTakeCover(state.map, destination)
      const moved = updateCombatant(decided.state, actor.id, { position: destination, inCover, facing: facingToward(path[path.length - 2], destination) })
      const used = spendTurnAction(moved, actor.id, kind)
      const turn = { ...used.turn, ...(kind === 'move' ? { moved: true } : { sprinted: true }) }
      const next = { ...used, turn, lastMove: { key: state.log.length, combatantId: actor.id, path } }
      return addLog(markAction(next, kind, actor.id, { inCover }), [
        ...decided.lines,
        `${kind === 'move' ? 'Move' : 'Sprint'} ${steps} ${steps === 1 ? 'tile' : 'tiles'} (${actionsLeftText(turn)})`,
        `Path: ${path.map(formatPosition).join(' > ')}`,
        ...(inCover ? [`${actor.character.name} is in cover (next to a cover object).`] : actor.inCover ? [`${actor.character.name} leaves cover.`] : []),
      ])
    }
    case 'aim': {
      if (!canAim(state, actor)) return state
      const decided = recordDecision(state, actor, action)
      const used = spendTurnAction(decided.state, actor.id, 'aim')
      const turn = { ...used.turn, aimReroll: true, aimed: true }
      return addLog(markAction({ ...used, turn }, 'aim', actor.id), [
        ...decided.lines,
        `Aim: ${AIM_TEXT} (${actionsLeftText(turn)})`,
      ])
    }
    case 'assist': {
      const ally = state.combatants[action.allyId]
      if (!canAfford(state, actor, 'assist') || !canAssist(state, actor, ally)) return state
      const decided = recordDecision(state, actor, action)
      const used = spendTurnAction(decided.state, actor.id, 'assist')
      const { turn } = used
      const next = { ...used, assists: { ...state.assists, [ally.id]: actor.id } }
      return addLog(markAction(next, 'assist', actor.id, { allyId: ally.id }), [
        ...decided.lines,
        `Assist: ${ally.character.name}'s next task this round adds ${actor.character.name}'s 1d20 (${actionsLeftText(turn)})`,
      ])
    }
    case 'attack': {
      if (!canAfford(state, actor, 'attack')) return state
      const preview = previewAttack(state, actor.id, action.targetId, action.weaponId)
      if (!preview.available || !preview.weapon.injuryModes.includes(action.injuryMode)) return state
      // Buy d20s (Book p.259): action.purchase = { bonusDice, momentum }; the party pays from the group pool and/or adds
      // Threat, an NPC spends Threat (hook: the AI doesn't buy dice yet).
      const purchase = checkDicePurchase(state.resources, action.purchase, actor.side)
      if (!purchase.valid) return state
      const decided = recordDecision(state, actor, action)
      const { random, next: afterDraw } = takeRandom(decided.state)
      const target = state.combatants[action.targetId]
      const opposition = preview.opposition ? rollOpposition(preview.opposition, random) : null
      const difficulty = attackDifficulty(preview, opposition?.successes)
      const pending = {
        attackerId: actor.id,
        targetId: target.id,
        weaponId: preview.weapon.id,
        injuryMode: action.injuryMode,
        band: preview.band,
        distance: preview.distance,
        baseDifficulty: preview.baseDifficulty,
        rangeModifier: preview.rangeModifier,
        guardModifier: preview.guardModifier,
        extraLines: preview.extraLines,
        traitLines: preview.traitLines,
        opposition,
        task: { ...preview.task, difficulty },
        dice: rollDice(random, purchase.dice),
        purchase,
        rerolls: [],
        aimRerolls: state.turn.aimReroll ? aimRerollsFor(preview.weapon) : 0,
        assist: null,
      }
      // The helper (an Assist, or the commander on a Direct) rolls after the attacker, against their own Target Number.
      const assistFor = assistTaskFor(state, actor.id, preview.weapon)
      if (assistFor) {
        const [die] = rollDice(random, 1)
        pending.assist = { helperId: assistFor.helperId, task: assistFor.task, via: assistFor.via, die }
      }
      const used = spendTurnAction(withoutUsedAssist(updateCombatant(afterDraw, actor.id, { facing: facingToward(actor.position, target.position) }), actor.id, assistFor), actor.id, 'attack')
      let next = {
        ...used,
        resources: payForDice(state.resources, purchase),
        turn: { ...used.turn, aimReroll: false, attacks: state.turn.attacks + 1 },
        pending,
        result: null,
      }
      next = withStats(next, (stats) => {
        stats.attacks += 1
        stats.byCombatant[actor.id].attacks += 1
        stats.byCombatant[actor.id].lastAttackRound = state.round
        stats.momentum.spentDice += purchase.momentum
        stats.threat.fromDice += purchase.threatAdded
        stats.threat.spentByNpcs += purchase.threatSpent
      })
      const { task } = pending
      next = markAction(next, 'attack', actor.id, { targetId: target.id, weaponId: preview.weapon.id, injuryMode: action.injuryMode })
      return addLog(next, [
        ...decided.lines,
        `Attack (${actionsLeftText(next.turn)})`,
        `${actor.character.name} attacks ${target.character.name} with ${preview.weapon.name} (${getInjuryMode(action.injuryMode).name})`,
        `Range: ${preview.band.name} (${preview.distance} tiles)`,
        taskText(task),
        `Focus: ${focusText(task)}`,
        ...(pending.aimRerolls ? [`Aim: may reroll ${pending.aimRerolls === 1 ? 'one die' : `up to ${pending.aimRerolls} dice (Accurate)`}`] : []),
        ...(purchase.bonusDice ? [purchaseLine(purchase)] : []),
        opposition
          ? `${oppositionName(opposition)}: ${taskText(opposition.task)}, focus ${focusText(opposition.task)}, rolls ${diceText(opposition.dice)}: ${opposition.successes} ${opposition.successes === 1 ? 'success' : 'successes'}`
          : 'Opposed roll: No',
        `Difficulty: ${task.difficulty} (${difficultyBreakdown(pending)})`,
        `Rolls: ${diceText(pending.dice.map((value) => evaluateStaDie(task, value)))}`,
        ...(pending.assist ? [assistLine(next, pending.assist)] : []),
        ...(opposition?.complications ? [`Defender complications: ${opposition.complications}`] : []),
      ])
    }
    case 'reroll': {
      const { pending } = state
      if (!pending || action.dieIndex < 0 || action.dieIndex >= pending.dice.length) return state
      const attacker = state.combatants[pending.attackerId]
      if (action.source === 'aim' && !canAimReroll(pending, action.dieIndex)) return state
      // VIDEOGAME ADAPTATION (off unless actions.json turns it on): 1 Momentum from the group pool rerolls one die.
      if (action.source === 'momentum' && !ADAPTATION_MOMENTUM_SPENDS) return state
      const resources = action.source === 'momentum' ? attacker.side === 'player' && spendMomentum(state.resources, 1) : state.resources
      if (!resources) return state
      const decided = recordDecision(state, attacker, action)
      const { random, next: afterDraw } = takeRandom(decided.state)
      const dice = rerollDie(pending.dice, action.dieIndex, random)
      const reroll = { index: action.dieIndex, from: pending.dice[action.dieIndex], to: dice[action.dieIndex], source: action.source }
      let next = {
        ...afterDraw,
        resources,
        pending: { ...pending, dice, rerolls: [...pending.rerolls, reroll], aimRerolls: pending.aimRerolls - (action.source === 'aim' ? 1 : 0) },
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
      const passed = evaluation.success
      const playerSide = attacker.side === 'player'
      // Book p.289: a Deadly attack by a player character is escalation (+1 Threat). Enemy Deadly attacks cost nothing yet.
      const deadlyThreat = playerSide && getInjuryMode(pending.injuryMode).generatesThreat ? 1 : 0
      // A party task saves its Momentum to the group pool; an NPC's Momentum becomes Threat (Book p.264). Complications
      // stay complications on the result.
      const saving = playerSide ? saveMomentum(state.resources, evaluation.momentumGenerated) : { resources: state.resources, saved: 0, lost: 0 }
      const npcThreat = playerSide ? 0 : evaluation.momentumGenerated
      let resources = addThreat(npcMomentumToThreat(saving.resources, npcThreat), deadlyThreat)
      // Hook: action.addedSeverity (Momentum for +severity, Book p.291); no UI or AI asks for it yet.
      const added = passed ? affordAddedSeverity(resources, weapon, action.addedSeverity, playerSide) : { added: 0, cost: 0 }
      if (added.cost) resources = spendMomentum(resources, added.cost)
      let next = { ...state, pending: null, resources }
      let injuryLines = []
      let injury = null
      if (passed) {
        injury = injuryFor(next, attacker, target, weapon, pending.injuryMode, added.added)
        const hit = inflictInjury(next, attacker.id, target.id, injury)
        next = hit.state
        injuryLines = hit.lines
      }
      const after = next.combatants[target.id]
      next = withStats(next, (stats) => {
        if (passed) {
          stats.attacksHit += 1
          stats.byCombatant[attacker.id].attacksHit += 1
        }
        if (added.cost) stats.momentum.spentSeverity = (stats.momentum.spentSeverity ?? 0) + added.cost
        if (playerSide) stats.momentum.generated += evaluation.momentumGenerated
        stats.momentum.saved += saving.saved
        stats.momentum.lost += saving.lost
        stats.threat.fromDeadly += deadlyThreat
        stats.threat.fromNpcMomentum += npcThreat
      })
      const { assist } = evaluation
      const momentumText = playerSide
        ? momentumLine(evaluation.momentumGenerated, saving, resources)
        : `Momentum generated: ${evaluation.momentumGenerated}${npcThreat ? ` (NPC: added to Threat, now ${resources.threat})` : ''}`
      const lines = [
        `Final rolls vs TN ${pending.task.targetNumber}: ${diceText(evaluation.dice)}`,
        ...(assist
          ? [`Assist die ${assist.value}: ${assist.counted ? `counts (+${assist.successes})` : assist.successes ? 'does not count (the attacker scored no success)' : 'no success'}`]
          : []),
        `Successes: ${evaluation.successes} vs Difficulty ${pending.task.difficulty}`,
        `RESULT: ${passed ? 'SUCCESS' : 'FAILURE'}`,
        ...(added.cost ? [`Momentum spent: ${added.cost} for +${added.added} severity`] : []),
        ...(passed ? [...injuryLines, momentumText] : []),
        ...(evaluation.complications ? [`Complications: ${evaluation.complications}`] : []),
        ...(deadlyThreat ? [`Threat +1 (Deadly attack), now ${resources.threat}`] : []),
      ]
      const awaiting = Boolean(next.incomingInjury)
      next = markAction(next, 'resolve', attacker.id, { targetId: target.id, weaponId: weapon.id, passed, removed: !isActive(after), injury, awaiting })
      next = addLog(next, lines)
      next = {
        ...next,
        result: {
          attackerId: attacker.id,
          targetId: target.id,
          weaponId: weapon.id,
          injuryMode: pending.injuryMode,
          task: pending.task,
          opposition: pending.opposition,
          dice: evaluation.dice,
          assist: pending.assist && { ...pending.assist, successes: assist.successes, counted: assist.counted },
          rerolls: pending.rerolls,
          successes: evaluation.successes,
          passed,
          momentumGenerated: evaluation.momentumGenerated,
          momentumSaved: saving.saved,
          // Over the pool's maximum: lost.
          momentumUnsaved: saving.lost,
          threatAdded: npcThreat + deadlyThreat,
          complications: evaluation.complications,
          taskResult: evaluation,
          // The Injury the hit inflicts; decided: 'pending' (waiting for Avoid Injury), 'avoided' or 'suffered'.
          injury: injury && { ...injury, decided: awaiting ? 'pending' : isActive(after) ? 'avoided' : 'suffered' },
          closed: false,
        },
      }
      return withOutcome(next)
    }
    // VIDEOGAME ADAPTATION (off unless actions.json turns it on; not a book spend): 1 Momentum removes 1 Threat.
    case 'cancelThreat': {
      if (!ADAPTATION_MOMENTUM_SPENDS) return state
      const resources = state.resources.threat > 0 && spendMomentum(state.resources, 1)
      if (!resources || state.pending) return state
      const decided = recordDecision(state, actor, action)
      const next = withStats({ ...decided.state, resources: { ...resources, threat: resources.threat - 1 } }, (stats) => {
        stats.momentum.spentCancelThreat += 1
        stats.threat.cancelled += 1
      })
      return addLog(markAction(next, 'cancelThreat', actor.id), [...decided.lines, `Momentum spent to cancel 1 Threat (Momentum ${next.resources.momentum}, Threat ${next.resources.threat}).`])
    }
    // Book p.288 Guard (major): Insight + Security, Difficulty 0 (+1 for an ally within Reach). Success: attacks against the
    // guarded character are +1 Difficulty until the start of their next turn. Prototype: always rolled (Book p.254 lets a
    // Difficulty 0 task skip the roll; rolling still generates Momentum, and keeps one flow for every task).
    case 'guard': {
      const preview = previewGuard(state, actor.id, action.targetId)
      if (!preview.available) return state
      const decided = recordDecision(state, actor, action)
      const rolled = rollCombatTask(decided.state, actor, preview, action.purchase, 'guard')
      if (!rolled) return state
      const target = state.combatants[preview.targetId]
      let next = rolled.state
      if (rolled.passed) next = updateCombatant(next, target.id, { guard: { byId: actor.id, round: state.round } })
      next = markAction(next, 'guard', actor.id, { targetId: target.id, passed: rolled.passed })
      return addLog(next, [
        ...decided.lines,
        ...rolled.lines,
        rolled.passed ? `${target.character.name} is guarded: attacks against them are +1 Difficulty until the start of their next turn.` : 'The Guard fails.',
      ])
    }
    // Book p.288 First Aid (major): Daring + Medicine on an adjacent ally. Difficulty 2 revives a Defeated character (the
    // Injury stays; a Stun Injury then wears off at the end of their next turn, Book p.292); Difficulty = an Injury's
    // severity treats that Injury (no penalty from it, but it is still an Injury). Revive and treat are separate actions.
    case 'firstAid': {
      const preview = previewFirstAid(state, actor.id, action.targetId, action.mode)
      if (!preview.available) return state
      const decided = recordDecision(state, actor, action)
      const rolled = rollCombatTask(decided.state, actor, preview, action.purchase, 'firstAid')
      if (!rolled) return state
      const target = state.combatants[preview.targetId]
      const name = target.character.name
      const injuryId = action.mode.startsWith('treat:') ? action.mode.slice('treat:'.length) : null
      let next = rolled.state
      let outcome = injuryId ? `${name}'s Injury is not treated.` : `${name} stays down.`
      if (rolled.passed && !injuryId) {
        const condition = reviveCondition(target.condition)
        next = updateCombatant(next, target.id, { condition, inCover: canTakeCover(next.map, target.position) })
        const still = condition.injuries.length ? ` Still injured: ${condition.injuries.map(injuryText).join('; ')}.` : ''
        outcome = `${name} is no longer Defeated.${still}`
      }
      if (rolled.passed && injuryId) {
        const condition = treatInjury(target.condition, injuryId)
        next = updateCombatant(next, target.id, { condition })
        outcome = `${name}'s ${injuryText(condition.injuries.find((injury) => injury.id === injuryId))}: no penalty from it now; it is still an Injury.`
      }
      next = markAction(next, 'firstAid', actor.id, { targetId: target.id, mode: action.mode, passed: rolled.passed })
      return addLog(next, [...decided.lines, ...rolled.lines, outcome])
    }
    // Book p.288 Direct (major): the character in authority spends 1 Momentum; an ally who can hear immediately takes a
    // major action, which the commander assists (Control + Command). No +1 Difficulty for that ally's second major action.
    case 'direct': {
      const ally = state.combatants[action.allyId]
      if (directBlock(state, actor) || !getDirectableAllies(state, actor).some((candidate) => candidate.id === ally?.id)) return state
      const resources = spendMomentum(state.resources, 1)
      const decided = recordDecision(state, actor, action)
      const used = spendTurnAction(decided.state, actor.id, 'direct')
      const commanderTurn = used.turn
      const via = canCommunicate(actor, ally, state.comms).via
      let next = {
        ...used,
        resources,
        directed: { commanderId: actor.id, allyId: ally.id, commanderTurn },
        // The ally's directed action counts toward their two major actions this round (spendTurnAction on their action).
        turn: { ...freshTurn(), major: 1, minor: 0 },
      }
      next = withStats(next, (stats) => {
        stats.tasks.direct += 1
        stats.momentum.spentDirect += 1
      })
      const authority = getAuthority(state, actor.side)
      return addLog(markAction(next, 'direct', actor.id, { allyId: ally.id }), [
        ...decided.lines,
        `Direct: ${actor.character.name} directs ${ally.character.name} (Major action; ${actionsLeftText(commanderTurn)})`,
        `Authority: ${authority.reason}`,
        `${ally.character.name} hears the order ${via === 'communicator' ? 'over the communicator' : 'in earshot'}.`,
        `Momentum spent: 1 (group pool now ${resources.momentum})`,
        `${ally.character.name} takes one Major action now; ${actor.character.name} assists with Control + Command.`,
      ])
    }
    case 'selectCombatant': {
      if (state.pending || state.directed || action.combatantId === actor.id) return state
      if (!getTurnGroup(state).includes(action.combatantId) || isTurnFinished(state, action.combatantId)) return state
      return switchToMember(state, action.combatantId)
    }
    case 'endTurn': {
      if (state.pending) return state
      // A directed ally passing gives up the directed action (the Momentum is spent); the commander's turn resumes.
      if (state.directed) return addLog({ ...state, turn: { ...state.turn, done: true } }, [`${actor.character.name} passes on the directed action.`])
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
