// The combat HUD's view model (combat/combatView.js): what the screen draws for the current selections.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createCombat, getActiveCombatant, getOpponents } from '../src/combat/combatState.js'
import { buildCombatView } from '../src/combat/combatView.js'
import { tileDistance } from '../src/combat/rangeSystem.js'
import { getWeapon } from '../src/combat/weaponSystem.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

// A plain room with two party starts and two enemy spawns, far enough apart that nobody begins in anyone's reach.
function testMap() {
  const map = createBlankMap({ name: 'Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [
    { x: 2, y: 5 },
    { x: 2, y: 6 },
  ]
  map.markers.enemySpawns = [
    { x: 13, y: 5 },
    { x: 13, y: 6 },
  ]
  return map
}

function testCombat() {
  return createCombat({
    map: testMap(),
    players: [makeCharacter({ id: 'alpha', name: 'Alpha' }), makeCharacter({ id: 'beta', name: 'Beta' })],
    seed: 7,
  })
}

// The screen's own defaults on a fresh player turn: Move selected, nearest enemy targeted, nothing bought.
function view(state, overrides = {}) {
  const active = getActiveCombatant(state)
  const nearest = getOpponents(state, active).sort((a, b) => tileDistance(active.position, a.position) - tileDistance(active.position, b.position))[0]
  return buildCombatView({
    state,
    active,
    isPlayerTurn: true,
    mode: 'move',
    target: nearest,
    weapon: getWeapon(active.weaponIds[0]),
    destination: null,
    hoverTile: null,
    dicePurchase: { bonusDice: 0, momentum: 0 },
    ringId: null,
    ambushOpen: false,
    assistAllyId: null,
    ...overrides,
  })
}

describe('the combat view model', () => {
  it('offers the actions the acting character can afford', () => {
    const { availability } = view(testCombat())
    assert.equal(availability.move, true)
    assert.equal(availability.sprint, true)
    assert.equal(availability.endTurn, true)
  })

  it('with Move selected, lists the tiles that can be reached but not the one being stood on', () => {
    const state = testCombat()
    const active = getActiveCombatant(state)
    const { moveKind, reachable, overlay } = view(state)
    assert.equal(moveKind, 'move')
    assert.ok(reachable.size > 1)
    assert.ok(!overlay.reachableKeys.has(`${active.position.x},${active.position.y}`), 'standing still is not a move')
    assert.equal(overlay.path, null, 'no route until a tile is hovered or picked')
  })

  it('draws the route to a hovered tile, and nothing for an unreachable one', () => {
    const state = testCombat()
    const active = getActiveCombatant(state)
    const near = { x: active.position.x + 1, y: active.position.y }
    assert.ok(view(state, { hoverTile: near }).movePath, 'a tile one step away is on the route')
    assert.equal(view(state, { hoverTile: { x: 13, y: 1 } }).movePath, null, 'across the room is out of range')
  })

  it('nothing is selected and no route is drawn outside the player turn', () => {
    const state = testCombat()
    const { reachable, movePath, assistAllies, guardTargets, extraMinorReason } = view(state, { isPlayerTurn: false, hoverTile: { x: 3, y: 5 } })
    assert.equal(reachable, null)
    assert.equal(movePath, null)
    assert.deepEqual(assistAllies, [])
    assert.deepEqual(guardTargets, [])
    assert.equal(extraMinorReason, 'Not your turn.')
  })

  it('previews the attack only while Attack is selected, and draws the line of the shot', () => {
    const state = testCombat()
    assert.equal(view(state).preview, null, 'Move shows no shot')
    const { preview, overlay } = view(state, { mode: 'attack' })
    assert.ok(preview.task, 'the attack has a task to roll')
    assert.deepEqual(overlay.shot.from, getActiveCombatant(state).position)
    assert.equal(overlay.shot.available, preview.available)
  })

  it('explains why an out-of-reach attack cannot be fired', () => {
    const state = testCombat()
    // An Unarmed Strike cannot cross the room, so the ring button is closed with the range reason.
    const { attackBlock } = view(state, { mode: 'attack', weapon: getWeapon('unarmedStrike') })
    assert.equal(typeof attackBlock, 'string')
    assert.ok(attackBlock.length > 0)
  })

  it('never offers to pay for bonus d20s with more Momentum than the pool holds', () => {
    const state = testCombat()
    const { purchase, purchaseCheck } = view(state, { dicePurchase: { bonusDice: 2, momentum: 99 } })
    assert.equal(purchase.momentum, state.resources.momentum, 'the payment is clamped to the pool')
    assert.equal(purchaseCheck.valid, true)
    assert.equal(purchaseCheck.dice, 4, '2d20 plus the two bought')
    // Book p.260, p.263: what the pool cannot pay for is bought by adding Threat instead, one for one.
    assert.equal(purchaseCheck.threatAdded, purchaseCheck.cost - state.resources.momentum)
  })

  it('the acting character can guard themselves or an ally, and assist the ally who has not acted', () => {
    const state = testCombat()
    const active = getActiveCombatant(state)
    const { guardTargets, assistAllies, availability } = view(state)
    assert.ok(guardTargets.some((unit) => unit.id === active.id), 'Guard includes yourself')
    assert.ok(assistAllies.every((ally) => ally.id !== active.id), 'nobody assists themselves')
    assert.equal(availability.assist, assistAllies.length > 0)
  })

  it('names the party member with the authority to Direct', () => {
    const state = testCombat()
    const { authority, isCommander, directAllies } = view(state)
    assert.ok(authority, 'one side always has someone in charge')
    if (isCommander) assert.ok(directAllies.length > 0)
  })
})
