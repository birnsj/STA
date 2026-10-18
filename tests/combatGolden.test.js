// Behaviour fingerprints for combat (src/combat/): scripted, seeded fights in which the party tries every action the
// combat AI never takes on its own (Guard, First Aid, Scan, Persuade, Intimidate, Direct, bought actions, rerolls,
// prompt answers), plus refused actions, while the enemies play the classic AI. A refactor that changes any of them
// changed gameplay. GOLDEN_PRINT=1 npm test prints the current fingerprints instead of checking them.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import { stepAI } from '../src/combat/autoCombat.js'
import { encounterFor } from '../src/combat/CombatEncounter.js'
import { WORLD_ENCOUNTER_ID } from '../src/combat/encounters.js'
import { WorldEncounter } from '../src/exploration/WorldEncounter.js'
import {
  combatReducer,
  createCombat,
  getActiveCombatant,
  getAssistableAllies,
  getDirectableAllies,
  getFirstAidOptions,
  getGuardTargets,
  getOpponents,
  getReachable,
  getTurnGroup,
  isTurnFinished,
  previewAttack,
} from '../src/combat/combatState.js'
import { tileDistance } from '../src/combat/rangeSystem.js'
import { getCombatantWeapon } from '../src/combat/weaponSystem.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const EXPECTED = {
  closeQuarters: '095ae70bdec6a9a6',
  standOff: 'ccfbd06ce3192a3c',
  refusals: '5cbfd343071584f3',
}

const PRINT = Boolean(process.env.GOLDEN_PRINT)
const hash = (value) => createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16)

function check(key, value) {
  const actual = hash(value)
  if (PRINT) console.log(`GOLDEN ${key}: '${actual}'`)
  else assert.equal(actual, EXPECTED[key], `${key} fingerprint changed`)
}

const team = () => [
  makeCharacter({ id: 'alpha', name: 'Alpha', attributes: { presence: 11, control: 10 }, disciplines: { command: 4, security: 3 }, equipment: [{ itemId: 'phaserType1' }] }),
  makeCharacter({ id: 'beta', name: 'Beta', attributes: { daring: 11, fitness: 11 }, disciplines: { security: 4 } }),
  makeCharacter({ id: 'gamma', name: 'Gamma', attributes: { insight: 11, reason: 11 }, disciplines: { medicine: 4, science: 4 } }),
]

function arena(spawnX) {
  const map = createBlankMap({ name: 'Golden Arena', width: 16, height: 12 })
  map.markers.playerStarts = [
    { x: 4, y: 5 },
    { x: 4, y: 6 },
    { x: 3, y: 5 },
  ]
  map.markers.enemySpawns = [
    { x: spawnX, y: 5 },
    { x: spawnX, y: 7 },
    { x: spawnX + 1, y: 4 },
    { x: spawnX + 1, y: 8 },
  ]
  return map
}

const ATTRIBUTES = ['control', 'daring', 'fitness', 'insight', 'presence', 'reason']

const nearestOpponent = (state, actor) =>
  [...getOpponents(state, actor)].sort((a, b) => tileDistance(actor.position, a.position) - tileDistance(actor.position, b.position) || a.id.localeCompare(b.id))[0]

function attackAction(state, actor) {
  for (const target of [...getOpponents(state, actor)].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const weaponId of actor.weaponIds) {
      if (previewAttack(state, actor.id, target.id, weaponId).available) {
        const injuryMode = getCombatantWeapon(actor, weaponId).injuryModes[0]
        return { type: 'attack', targetId: target.id, weaponId, injuryMode, purchase: { bonusDice: state.round % 2, momentum: 0 } }
      }
    }
  }
  return null
}

function moveAction(state, actor, kind = 'move') {
  const target = nearestOpponent(state, actor)
  if (!target) return null
  const tiles = [...getReachable(state, actor, kind).values()].filter((entry) => entry.steps > 0)
  tiles.sort((a, b) => tileDistance(a.position, target.position) - tileDistance(b.position, target.position) || a.position.x - b.position.x || a.position.y - b.position.y)
  return tiles.length ? { type: kind, destination: tiles[0].position } : null
}

const opponentId = (state, actor) => nearestOpponent(state, actor)?.id ?? 'nobody'
const otherAlly = (list, actor) => list.find((other) => other.id !== actor.id)

// The party's turn plans, one per turn in rotation. Each entry builds its action from the state when its turn comes;
// null skips it. Refused actions are tried on purpose (the reducer must return the very same state).
const PLANS = [
  [
    (s, a) => ({ type: 'guard', targetId: otherAlly(getGuardTargets(s, a), a)?.id ?? a.id, purchase: { bonusDice: 1, momentum: 0 } }),
    () => ({ type: 'aim' }),
    (s, a) => attackAction(s, a),
  ],
  [
    (s, a) => moveAction(s, a, 'sprint'),
    (s, a) => ({ type: 'selectCombatant', combatantId: getTurnGroup(s).find((id) => id !== a.id && !isTurnFinished(s, id)) ?? a.id }),
  ],
  [
    (s, a) => ({ type: 'scan', targetId: opponentId(s, a) }),
    () => ({ type: 'buyExtraMinor' }),
    (s, a) => moveAction(s, a),
    (s, a) => moveAction(s, a),
  ],
  [
    (s, a) => {
      const option = getFirstAidOptions(s, a)[0]
      return option ? { type: 'firstAid', targetId: option.target.id, mode: option.mode } : { type: 'firstAid', targetId: a.id, mode: 'revive' }
    },
    (s, a) => ({ type: 'assist', allyId: getAssistableAllies(s, a)[0]?.id ?? 'nobody' }),
    () => ({ type: 'aim' }),
  ],
  [(s, a) => ({ type: 'assist', allyId: getAssistableAllies(s, a)[0]?.id ?? 'nobody' }), (s, a) => moveAction(s, a)],
  [(s, a) => ({ type: 'persuade', targetId: opponentId(s, a) }), (s, a) => moveAction(s, a)],
  [(s, a) => ({ type: 'direct', allyId: getDirectableAllies(s, a)[0]?.id ?? 'nobody' }), (s, a) => attackAction(s, a) ?? moveAction(s, a, 'sprint')],
  [(s, a) => ({ type: 'intimidate', targetId: opponentId(s, a), purchase: { bonusDice: 1, momentum: 1 } }), () => ({ type: 'buySecondMajor' }), (s, a) => attackAction(s, a)],
]

// Refused on every party turn: unknown ids, a reroll with nothing pending, a Threat cancel with the option off.
const PROBES = [
  () => ({ type: 'attack', targetId: 'nobody', weaponId: 'nothing', injuryMode: 'stun' }),
  (s, a) => ({ type: 'selectCombatant', combatantId: a.id }),
  () => ({ type: 'reroll', dieIndex: 0, source: 'aim' }),
  () => ({ type: 'resolveAttack' }),
  () => ({ type: 'cancelThreat' }),
  () => ({ type: 'nonsense' }),
]

const stepView = (action, before, after) => ({
  action,
  same: before === after,
  round: after.round,
  active: getActiveCombatant(after).id,
  turn: after.turn,
  resources: after.resources,
  rolls: after.rolls,
  pending: after.pending,
  result: after.result,
  lastAction: after.lastAction,
  lastMove: after.lastMove,
  outcome: after.outcome,
  log: after.log.at(-1)?.lines,
})

const finalView = (state) => ({
  round: state.round,
  outcome: state.outcome,
  resources: state.resources,
  stats: state.stats,
  scanned: state.scanned,
  combatants: Object.values(state.combatants).map((c) => ({ id: c.id, position: c.position, facing: c.facing, condition: c.condition, inCover: c.inCover, guard: c.guard, surrendered: c.surrendered ?? false, intimidated: c.intimidated ?? false, retreating: c.retreating ?? false })),
})

// Plays a fight to the end (or maxSteps). Prompts and pending rolls are answered first; enemies step through stepAI;
// party turns follow PLANS, then end.
function scriptedFight({ map, seed, maxSteps = 900, initiativeOptions }) {
  let state = createCombat({ map, players: team(), seed, initiativeOptions })
  const record = []
  const dispatch = (action) => {
    const before = state
    state = combatReducer(state, action)
    record.push(stepView(action, before, state))
  }
  let queue = []
  let turnKey = null
  let partyTurns = 0
  let decisions = 0
  for (let step = 0; step < maxSteps && !state.outcome; step += 1) {
    if (state.pendingFatigue) {
      dispatch({ type: 'chooseFatigueAttribute', attribute: 'nonsense' })
      const combatant = state.combatants[state.pendingFatigue.combatantId]
      const attribute = ATTRIBUTES.find((id) => !combatant.condition.shutDown?.includes?.(id)) ?? 'control'
      dispatch({ type: 'chooseFatigueAttribute', attribute })
      continue
    }
    if (state.pendingCounterattack) {
      const offer = state.pendingCounterattack
      dispatch({ type: 'counterattackDecision', accept: decisions++ % 2 === 0, injuryMode: offer.injuryModes?.[0] ?? 'stun' })
      continue
    }
    if (state.pending) {
      const pending = state.pending
      if (pending.aimRerolls > 0) dispatch({ type: 'reroll', dieIndex: 0, source: 'aim' })
      if (state.pending?.assistRerolls > 0) dispatch({ type: 'reroll', dieIndex: 0, source: 'assist' })
      dispatch({ type: 'reroll', dieIndex: 0, source: 'momentum' })
      dispatch({ type: 'resolveAttack' })
      continue
    }
    const actor = getActiveCombatant(state)
    if (actor.side !== 'player') {
      const before = state
      state = stepAI(state, { enemyAI: 'classic' })
      record.push(stepView({ type: 'aiStep' }, before, state))
      continue
    }
    const key = `${state.round}:${state.turnIndex}:${actor.id}:${Boolean(state.directed)}`
    if (key !== turnKey) {
      turnKey = key
      queue = [...PROBES, ...PLANS[partyTurns % PLANS.length]]
      partyTurns += 1
    }
    const next = queue.shift()
    if (!next) {
      dispatch({ type: 'endTurn' })
      continue
    }
    const action = next(state, actor)
    if (action) dispatch(action)
  }
  return { record, final: finalView(state) }
}

const actionTypes = (record) => new Set(record.filter((entry) => !entry.same).map((entry) => entry.action.type))

describe('combat fingerprints', () => {
  it('close quarters: every party action, rerolls and prompt answers', () => {
    // The grouped fights put the whole party first, so its members act as one group (Assist, switching members).
    const grouped = { firstIds: ['alpha', 'beta', 'gamma'] }
    const fights = [
      ...[1, 2, 3].map((seed) => scriptedFight({ map: arena(7), seed })),
      ...[7, 8].map((seed) => scriptedFight({ map: arena(7), seed, initiativeOptions: grouped })),
    ]
    const taken = new Set(fights.flatMap((fight) => [...actionTypes(fight.record)]))
    if (PRINT) console.log(`TAKEN ${[...taken].join(',')}`)
    for (const type of ['guard', 'aim', 'attack', 'resolveAttack', 'scan', 'buyExtraMinor', 'move', 'assist', 'persuade', 'intimidate', 'direct', 'buySecondMajor', 'endTurn', 'selectCombatant', 'firstAid', 'sprint', 'counterattackDecision', 'chooseFatigueAttribute', 'reroll', 'aiStep']) {
      assert.ok(taken.has(type), `control: ${type} is taken`)
    }
    check('closeQuarters', fights)
  })

  it('stand-off: approach under fire, sprints and First Aid', () => {
    const fights = [4, 5].map((seed) => scriptedFight({ map: arena(11), seed }))
    check('standOff', fights)
  })

  it('the encounter starts the same fight as createCombat, and answers for every action', () => {
    const encounter = encounterFor()
    const options = { map: arena(7), players: team(), seed: 3 }
    assert.deepEqual(encounter.start(options), createCombat(options))
    assert.ok(encounterFor(WORLD_ENCOUNTER_ID) instanceof WorldEncounter, 'the world encounter registers itself')
    const state = encounter.start(options)
    const actor = getActiveCombatant(state)
    const answers = encounter.availableActions(state, actor)
    assert.ok(answers.length > 20)
    assert.equal(answers.find((answer) => answer.type === 'endTurn').reason, null)
    assert.ok(answers.find((answer) => answer.type === 'resolveAttack').reason, 'nothing to resolve')
  })

  it('a refused action returns the very same state', () => {
    const fight = scriptedFight({ map: arena(7), seed: 6, maxSteps: 300 })
    const refused = fight.record.filter((entry) => entry.same)
    assert.ok(refused.some((entry) => entry.action.type === 'nonsense'))
    assert.ok(refused.some((entry) => entry.action.type === 'cancelThreat'))
    check('refusals', fight.record.map((entry) => [entry.action.type, entry.same]))
  })
})
