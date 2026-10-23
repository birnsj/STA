import assert from 'node:assert/strict'
import { test } from 'node:test'
import { figureShapes, hitTest, pickAt, rectOnGround } from '../src/maps/boardHitTest.js'
import { makeAlphaMask, setAlphaMaskSource } from '../src/maps/propPick.js'

const figure = (id, x, y, depth) => ({ kind: 'member', id, depth, shapes: figureShapes({ x, y }) })

test('a point on a figure finds it, a point beside it finds nothing', () => {
  const targets = [figure('a', 0, 0, 2.5)]
  assert.equal(hitTest({ x: 0, y: -30 }, targets).id, 'a')
  assert.equal(hitTest({ x: 20, y: 0 }, targets).id, 'a')
  assert.equal(hitTest({ x: 60, y: 0 }, targets), null)
})

test('the figure in front (deeper) wins where two overlap', () => {
  const targets = [figure('front', 0, 10, 4.5), figure('back', 0, 0, 3.5)]
  assert.equal(hitTest({ x: 0, y: -20 }, targets).id, 'front')
})

test('of two at the same depth the later one wins', () => {
  const targets = [figure('first', 0, 0, 3), figure('second', 0, 0, 3)]
  assert.equal(hitTest({ x: 0, y: -20 }, targets).id, 'second')
})

test('a label is part of the figure', () => {
  const targets = [{ kind: 'npc', id: 'n', depth: 1, shapes: figureShapes({ x: 0, y: 0 }, { label: 'Commander Riker', labelY: -58 }) }]
  assert.equal(hitTest({ x: 30, y: -60 }, targets).id, 'n')
})

test('a dropped prop is chosen by its drawn pixel, and a shape in front of it still wins', () => {
  const solid = makeAlphaMask(2, 2, new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]))
  const prop = { id: 'box', position: { x: 0, y: 0 }, z: 0, depth: 3, worldImage: '/art/box.png', spriteSize: { width: 32, height: 32 } }
  setAlphaMaskSource(() => solid)
  try {
    const onTheProp = { x: -8, y: -20 }
    assert.equal(pickAt(onTheProp, [], [prop]).id, 'box')
    const figure = { kind: 'member', id: 'crew', depth: 4, shapes: figureShapes({ x: 0, y: 0 }) }
    assert.equal(pickAt(onTheProp, [figure], [prop]).id, 'crew', 'a figure drawn in front of the prop wins')
    const behind = { kind: 'member', id: 'back', depth: 2, shapes: figureShapes({ x: 0, y: 0 }) }
    assert.equal(pickAt(onTheProp, [behind], [prop]).id, 'box', 'the prop wins over a figure behind it')
  } finally {
    setAlphaMaskSource(() => undefined)
  }
})

test('a world object hit stops at the ground art and does not include the tag above it', () => {
  const box = { x: 0, y: -80, width: 40, height: 90 }
  const onGround = rectOnGround(box, -20)
  assert.equal(onGround.y, -20)
  assert.equal(onGround.height, 30)
  assert.equal(rectOnGround({ x: 0, y: -40, width: 10, height: 10 }, -20), null)
})
