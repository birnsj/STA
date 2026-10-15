// Behaviour fingerprints for the character controllers (src/actors/): seeded exploration, Auto Combat and the world
// fight hand-off must play out exactly as recorded. A refactor that changes any of them changed gameplay.
// GOLDEN_PRINT=1 npm test prints the current fingerprints instead of checking them.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import brigFile from '../maps/Deck 10 Brig.json'
import { runAutoCombat } from '../src/combat/autoCombat.js'
import { ENEMY_SPAWNS_NEEDED } from '../src/combat/encounters.js'
import { getNpcs } from '../src/exploration/awareness.js'
import { endCombat, MODE, startCombat } from '../src/exploration/combatLink.js'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { getMembers } from '../src/exploration/partyControl.js'
import { createBlankMap, parseMapFile } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const EXPECTED = {
  exploreRoom: 'f746cb8e2b6405d6',
  exploreBrig: '586492362cd8278e',
  autoCombat: 'af3a57e92df36fdf',
  handOff: 'c10e2716c442dae5',
}

const PRINT = Boolean(process.env.GOLDEN_PRINT)
const hash = (value) => createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16)
const round = (number) => (typeof number === 'number' ? Number(number.toFixed(6)) : number)
const point = (p) => (p ? { x: round(p.x), y: round(p.y) } : p)

function check(key, value) {
  const actual = hash(value)
  if (PRINT) console.log(`GOLDEN ${key}: '${actual}'`)
  else assert.equal(actual, EXPECTED[key], `${key} fingerprint changed`)
}

const team = () => [
  makeCharacter({ id: 'alpha', name: 'Alpha', equipment: [{ itemId: 'phaserType1' }] }),
  makeCharacter({ id: 'beta', name: 'Beta', attributes: { daring: 11, control: 10 }, disciplines: { security: 4 } }),
  makeCharacter({ id: 'gamma', name: 'Gamma', attributes: { insight: 11 }, disciplines: { medicine: 4 } }),
]

function room() {
  const map = createBlankMap({ name: 'Golden Room', width: 18, height: 14 })
  map.markers.playerStarts = [
    { x: 3, y: 6 },
    { x: 3, y: 8 },
    { x: 2, y: 7 },
  ]
  map.markers.enemySpawns = [
    { x: 13, y: 6 },
    { x: 14, y: 9 },
    { x: 12, y: 3 },
  ]
  return map
}

const memberView = (member) => ({
  id: member.id,
  position: point(member.position),
  heading: round(member.heading),
  facing: point(member.facing),
  moving: member.moving,
  running: member.running,
  sneaking: member.sneaking,
  order: member.order?.type ?? null,
  condition: member.condition ?? null,
})

const npcView = (npc) => ({
  id: npc.id,
  position: point(npc.position),
  heading: round(npc.heading),
  state: npc.state,
  moving: npc.moving,
  disposition: npc.disposition,
  responseType: npc.responseType,
  condition: npc.condition ?? null,
  awareness: Object.fromEntries(Object.entries(npc.awareness ?? {}).map(([id, entry]) => [id, { state: entry.state, confidence: round(entry.confidence) }])),
})

const combatView = (combat) =>
  combat && {
    round: combat.round,
    outcome: combat.outcome,
    rolls: combat.rolls,
    resources: combat.resources,
    log: combat.log.map((entry) => entry.lines),
    combatants: Object.values(combat.combatants).map((c) => ({ id: c.id, side: c.side, position: c.position, facing: c.facing, condition: c.condition, inCover: c.inCover })),
  }

const worldView = (state) => ({
  mode: state.mode,
  time: round(state.world.time),
  resources: state.resources,
  members: getMembers(state.party).map(memberView),
  selectedIds: state.party.selectedIds,
  leaderId: state.party.leaderId,
  npcs: getNpcs(state.world).map(npcView),
  combat: combatView(state.combat),
  combatCount: state.combatCount,
})

// Walks the party across the map at 60 frames a second; any fight that breaks out is played by Auto Combat on both
// sides and handed back to the world. Records the world every 30 frames.
function playExploration(state, target, frames = 900) {
  const record = []
  let next = explorationReducer(state, { type: 'moveTo', target, fresh: true })
  for (let frame = 0; frame < frames; frame += 1) {
    if (next.mode === MODE.COMBAT) {
      next = next.combat.outcome
        ? explorationReducer(next, { type: 'endCombat' })
        : explorationReducer(next, { type: 'combat', action: { type: 'aiStep', partyAI: 'classic', enemyAI: 'classic', partyAuto: true } })
    } else {
      next = explorationReducer(next, { type: 'tick', seconds: 1 / 60 })
    }
    if (frame % 30 === 0) record.push(worldView(next))
  }
  record.push(worldView(next))
  return record
}

describe('controller fingerprints', () => {
  it('exploration in a room with fallback NPCs, through a world fight and back', () => {
    const record = playExploration(createExplorationState(room(), team(), 11), { x: 11, y: 7 })
    assert.ok(record.some((view) => view.mode === MODE.COMBAT), 'control: a fight breaks out')
    check('exploreRoom', record)
  })

  it('exploration on the Deck 10 Brig', () => {
    const map = parseMapFile({ ...brigFile, objectPlacements: {} }, 'Deck 10 Brig')
    const start = createExplorationState(map, team(), 5)
    const leader = start.party.members[start.party.leaderId].position
    const record = playExploration(start, { x: leader.x + 6, y: leader.y }, 600)
    assert.notDeepEqual(record.at(-1).members[0].position, point(leader), 'control: the leader walks')
    assert.ok(record.at(-1).npcs.length > 0, 'control: the brig has NPCs')
    check('exploreBrig', record)
  })

  // The planner AIs take about two seconds a fight, so they get one seed each; the mixed fights tell the sides' AIs apart.
  it('Auto Combat with each kind of AI, and different AIs per side', () => {
    const map = room()
    assert.ok(map.markers.enemySpawns.length >= Math.min(ENEMY_SPAWNS_NEEDED, 3))
    const fights = [
      ...[1, 2, 3].map((seed) => ({ partyAI: 'classic', enemyAI: 'classic', seed })),
      ...[1, 2].map((seed) => ({ partyAI: 'random', enemyAI: 'random', seed })),
      { partyAI: 'planner', enemyAI: 'planner', seed: 1 },
      { partyAI: 'classic', enemyAI: 'random', seed: 4 },
      { partyAI: 'random', enemyAI: 'classic', seed: 5 },
      { partyAI: 'lookahead', enemyAI: 'classic', seed: 6 },
    ]
    const results = fights.map((fight) => {
      const { state, steps, outcome, rounds } = runAutoCombat({ map, players: team(), ...fight })
      return { ...fight, steps, outcome, rounds, combat: combatView(state) }
    })
    check('autoCombat', results)
  })

  it('a world fight started and ended at once hands everyone back', () => {
    const state = createExplorationState(room(), team(), 4)
    const [npc] = getNpcs(state.world)
    const fighting = startCombat(state, { triggerNpcId: npc.id, triggerTargetId: 'alpha' })
    const ended = endCombat(fighting)
    check('handOff', { fighting: worldView(fighting), ended: worldView(ended), party: getMembers(ended.party).map((m) => ({ ...memberView(m), path: m.path, stall: m.stall ?? null, blocked: m.blocked ?? null })) })
  })
})
