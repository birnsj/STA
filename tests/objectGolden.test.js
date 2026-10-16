// Behaviour fingerprints for the challenge objects (src/exploration/challengeObjects.js, src/world/): every authored
// action on the Deck 10 Brig and the Vault of the Ancients, an object task in combat, and a conversation's object state
// change must play out exactly as recorded. A refactor that changes any of them changed gameplay.
// GOLDEN_PRINT=1 npm test prints the current fingerprints instead of checking them.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import brigFile from '../maps/Deck 10 Brig.json'
import { getAssistableAllies } from '../src/combat/combatAttacks.js'
import { getActiveCombatant } from '../src/combat/combatState.js'
import { getDirectableAllies } from '../src/combat/combatTasks.js'
import { getActionType } from '../src/conversation/conversationActions.js'
import { getNpcs } from '../src/exploration/awareness.js'
import { attemptChallenge, getAvailableActions, getChallengeViews, previewChallenge, withMap } from '../src/exploration/challengeObjects.js'
import { MODE, startCombat } from '../src/exploration/combatLink.js'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { createBlankMap, parseMapFile } from '../src/maps/mapFormat.js'
import { recommendPerformers } from '../src/rules/taskRecommendation.js'
import { objectFor } from '../src/world/objects.js'
import { makeCharacter } from './support/characters.js'

const EXPECTED = {
  brigClosed: '57b6ac60607f2a3f',
  brigCleared: '316cc12a8514f925',
  brigLockout: 'ee86535123280bf0',
  vault: '49dbff9fe7ace5a2',
  combat: 'dc25d1817baf3a41',
  conversation: 'd054300d4012ed46',
}

const PRINT = Boolean(process.env.GOLDEN_PRINT)
const hash = (value) => createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16)

function check(key, value) {
  const actual = hash(value)
  if (PRINT) console.log(`GOLDEN ${key}: '${actual}'`)
  else assert.equal(actual, EXPECTED[key], `${key} fingerprint changed`)
}

const team = () => [
  makeCharacter({ id: 'alpha', name: 'Alpha', attributes: { control: 11, reason: 10 }, disciplines: { engineering: 4, security: 3 }, equipment: [{ itemId: 'engineeringToolkit' }] }),
  makeCharacter({ id: 'beta', name: 'Beta', attributes: { daring: 11, fitness: 11 }, disciplines: { security: 4 } }),
  makeCharacter({ id: 'gamma', name: 'Gamma', attributes: { insight: 11, reason: 11 }, disciplines: { science: 4, medicine: 3 } }),
]

const view = (state) => ({
  objects: state.scenario.objects,
  flags: state.scenario.flags,
  traits: state.scenario.traits,
  log: state.scenario.log,
  taskCount: state.scenario.taskCount,
  resources: state.resources,
  partyKnowledge: state.partyKnowledge,
  npcs: getNpcs(state.world),
  noises: state.world.noises,
  tiles: state.party.map.tiles.map((row) => row.join(',')),
  views: getChallengeViews(state.scenario),
  lastTask: state.lastTask && { ...state.lastTask, prepared: state.lastTask.prepared?.difficulty ?? null, assist: Boolean(state.lastTask.assist) },
  mapLog: state.missionLog ?? null,
})

const withFlags = (state, flags) => ({ ...state, scenario: { ...state.scenario, flags: { ...state.scenario.flags, ...flags } } })

// Everyone stands beside the object (inside its interact range).
function beside(state, definition) {
  const [x, y] = definition.position
  const spots = [
    { x: x + 1, y },
    { x, y: y + 1 },
    { x: x - 1, y },
  ]
  const members = Object.fromEntries(state.party.memberIds.map((id, index) => [id, { ...state.party.members[id], position: spots[index % spots.length] }]))
  return { ...state, party: { ...state.party, members } }
}

// Several rounds over every object: each offered action once a round, by a different performer, every other round
// with an assistant, every third with a bought bonus die (paid as Threat). The clock moves on between rounds so locks
// run out. Records after every attempt.
function exercise(state, rounds = 6) {
  const record = []
  let next = state
  for (let round = 0; round < rounds; round += 1) {
    next.scenario.definitions.forEach((definition, objectIndex) => {
      next = beside(next, definition)
      getAvailableActions(next, definition.id).forEach((entry, actionIndex) => {
        const ids = next.party.memberIds
        const performerId = ids[(round + objectIndex + actionIndex) % ids.length]
        const assisted = round % 2 === 1 && entry.action.assist?.length
        const request = {
          type: 'challenge',
          objectId: definition.id,
          actionId: entry.action.id,
          performerId,
          assistantId: assisted ? ids[(ids.indexOf(performerId) + 1) % ids.length] : null,
          assistIndex: assisted ? round % entry.action.assist.length : 0,
          ...(round % 3 === 2 ? { purchase: { bonusDice: 1, momentum: 0 } } : {}),
        }
        next = explorationReducer(next, request)
        record.push({ request, available: entry.available, reason: entry.reason, after: view(next) })
      })
    })
    next = { ...next, world: { ...next.world, time: next.world.time + 6 } }
  }
  return record
}

const brig = () => createExplorationState(parseMapFile({ ...brigFile, objectPlacements: {} }, 'Deck 10 Brig'), team(), 3, { enemiesActive: false })

function vault() {
  const map = createBlankMap({ name: 'Vault of the Ancients', width: 20, height: 20 })
  map.markers.playerStarts = [
    { x: 9, y: 9 },
    { x: 10, y: 9 },
    { x: 9, y: 10 },
  ]
  return createExplorationState(map, team(), 7)
}

describe('challenge object fingerprints', () => {
  it('the Deck 10 Brig with no flags set', () => {
    check('brigClosed', exercise(brig()))
  })

  it('the Deck 10 Brig with the fault diagnosed and the party cleared', () => {
    const record = exercise(withFlags(brig(), { faultDiagnosed: true, sectionAccessGranted: true }))
    assert.ok(record.some((entry) => entry.after.flags.eastSectionOpen), 'control: a bulkhead opens')
    check('brigCleared', record)
  })

  it('the Deck 10 Brig powered but without clearance', () => {
    check('brigLockout', exercise(withFlags(brig(), { stationPowerRestored: true }), 4))
  })

  it('every object in the Vault of the Ancients', () => {
    const start = vault()
    assert.equal(start.scenario.definitions.length, 5, 'control: the vault objects load')
    const record = exercise(start, 8)
    assert.ok(record.some((entry) => entry.after.traits.length), 'control: a trait is created')
    assert.ok(record.some((entry) => entry.after.lastTask?.complications), 'control: a complication happens')
    check('vault', record)
  })

  it("an object's best-choice recommendation judges each member on the task their roll would use", () => {
    const state = vault()
    const ids = state.party.memberIds
    state.scenario.definitions.forEach((definition) => {
      const object = objectFor(state.scenario, definition.id)
      definition.actions.forEach((action) => {
        const expected = action.routine ? null : recommendPerformers(ids.map((id) => ({ id, prepared: previewChallenge(state, { objectId: definition.id, actionId: action.id, performerId: id }).prepared })))
        assert.deepEqual(object.recommend(state, action.id, ids), expected, `${definition.id}.${action.id}`)
      })
    })
  })

  it('a refused attempt leaves the state untouched', () => {
    const state = vault()
    assert.equal(attemptChallenge(state, { objectId: 'sensorConsole01', actionId: 'nope', performerId: 'alpha' }), state)
    assert.equal(attemptChallenge(state, { objectId: 'sensorConsole01', actionId: 'runScan', performerId: 'alpha' }), state, 'out of range')
  })

  it('object tasks in combat: an Assist, the action cost and a refusal', () => {
    let state = vault()
    const sensors = state.scenario.definitions.find((definition) => definition.id === 'sensorConsole01')
    state = beside(state, sensors)
    const [npc] = getNpcs(state.world)
    assert.ok(npc, 'control: the vault has NPCs')
    state = startCombat(state, { triggerNpcId: npc.id, triggerTargetId: 'alpha', source: 'PLAYER_ATTACK' })
    assert.equal(state.mode, MODE.COMBAT)
    const record = []
    const step = (action) => {
      state = explorationReducer(state, { type: 'combat', action })
      record.push({ action, active: getActiveCombatant(state.combat).id, combat: { resources: state.combat.resources, log: state.combat.log }, after: view(state) })
    }
    // Enemies pass; party turns follow a script. The first party turn helps an ally (Assist, else Direct) when the rules
    // allow it; the object task then comes with that help. The second task in a turn is refused for its cost.
    const plans = [
      ['help', { actionId: 'runScan', assistIndex: 0 }, { actionId: 'identifyWeakness' }],
      [{ actionId: 'runScan' }, { actionId: 'identifyWeakness' }],
      [{ actionId: 'identifyWeakness', purchase: { bonusDice: 1, momentum: 0 } }],
    ]
    let partyTurns = 0
    for (let guard = 0; guard < 40 && partyTurns < plans.length && !state.combat.outcome; guard += 1) {
      const actor = getActiveCombatant(state.combat)
      if (actor.side !== 'player') {
        step({ type: 'endTurn' })
        continue
      }
      for (const entry of plans[partyTurns]) {
        if (entry === 'help') {
          const assistable = getAssistableAllies(state.combat, actor)
          const directable = getDirectableAllies(state.combat, actor)
          if (assistable.length) step({ type: 'assist', allyId: assistable[0].id })
          else if (directable.length) step({ type: 'direct', allyId: directable[0].id })
        } else step({ type: 'interact', objectId: 'sensorConsole01', ...entry })
      }
      step({ type: 'endTurn' })
      partyTurns += 1
    }
    assert.ok(state.scenario.log.length >= 2, 'control: object tasks were attempted in combat')
    check('combat', record)
  })

  it("a conversation sets an object's state", () => {
    const apply = getActionType('setChallengeState').apply
    const ctx = { refreshMap: withMap }
    let state = brig()
    const steps = [
      { type: 'setChallengeState', objectId: 'eastBulkheadSouth', state: 'open' },
      { type: 'setChallengeState', objectId: 'eastBulkheadSouth', state: 'nope' },
      { type: 'setChallengeState', objectId: 'nobody', state: 'open' },
      { type: 'setChallengeState', objectId: 'eastBulkheadSouth', state: 'sealed' },
    ]
    const record = steps.map((action) => {
      const before = state
      state = apply(state, action, ctx)
      return { action, same: state === before, sameMap: state.party.map === before.party.map, after: view(state) }
    })
    assert.equal(record[1].same, true)
    check('conversation', record)
  })
})
