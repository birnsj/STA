// Picking a dropped prop in the map editor by the pixels it draws (maps/propPick.js), checked against the real sprite art
// and the Stacking Test map. The oracle is brute force: for every pixel of every sprite, which sprites are opaque there.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import { decodePng } from '../scripts/png.mjs'
import { project } from '../src/maps/iso.js'
import { groundItemAtBoard, groundItemSprites, placeGroundItem, selectionCandidates } from '../src/maps/mapEdits.js'
import { parseMapFile } from '../src/maps/mapFormat.js'
import {
  ALPHA_PICK_THRESHOLD,
  alphaAt,
  drawOrder,
  makeAlphaMask,
  pickProp,
  setAlphaMaskSource,
  spriteGeometry,
  spriteHref,
} from '../src/maps/propPick.js'

const stacking = () => parseMapFile(JSON.parse(fs.readFileSync(new URL('../maps/Stacking Test.json', import.meta.url), 'utf8')), 'Stacking Test')

const masks = new Map()
const maskOf = (href) => {
  if (!masks.has(href)) {
    const { width, height, bytes } = decodePng(fs.readFileSync(new URL(`../public${href}`, import.meta.url)))
    masks.set(href, makeAlphaMask(width, height, bytes))
  }
  return masks.get(href)
}

const opaqueAt = (sprite, point) => {
  const { box } = spriteGeometry(sprite)
  return alphaAt(maskOf(spriteHref(sprite)), (point.x - box.x) / box.width, (point.y - box.y) / box.height) > ALPHA_PICK_THRESHOLD
}

// Pixel centres of a sprite's box (board px) that satisfy `test(point)`.
function pixelsOf(sprite, test) {
  const { box } = spriteGeometry(sprite)
  const found = []
  for (let py = 0; py < box.height; py++) {
    for (let px = 0; px < box.width; px++) {
      const point = { x: box.x + px + 0.5, y: box.y + py + 0.5 }
      if (test(point)) found.push(point)
    }
  }
  return found
}

// Where only this sprite has a drawn pixel, so the one correct answer does not depend on draw order.
const visibleOnlyPoints = (sprites, sprite) => pixelsOf(sprite, (point) => opaqueAt(sprite, point) && sprites.every((other) => other === sprite || !opaqueAt(other, point)))
const overlapPoints = (sprites, a, b) => pixelsOf(a, (point) => opaqueAt(a, point) && opaqueAt(b, point))

describe('picking a ground item by its drawn pixels (Stacking Test)', () => {
  const map = stacking()
  const sprites = groundItemSprites(map)
  const sprite = (id) => sprites.find((entry) => entry.id === id)
  const pick = (point, options = {}) => pickProp(sprites, point, { maskOf, ...options })?.id

  it('draws the blue box where the geometry says (hand-worked: south corner (3.25, 2.75), raised 16 by the crate)', () => {
    const { box } = spriteGeometry(sprite('stackBoxBlue-2'))
    const corner = project({ x: 3.25, y: 2.75 })
    assert.deepEqual(box, { x: corner.x - 16, y: corner.y - 48 - 16, width: 32, height: 48 })
  })

  it('a click on the visible blue box selects blue, not a neighbour, at every pixel only blue shows', () => {
    const points = visibleOnlyPoints(sprites, sprite('stackBoxBlue-2'))
    assert.ok(points.length > 20, 'the blue box has its own visible pixels')
    for (const point of points) assert.equal(pick(point), 'stackBoxBlue-2', `at ${point.x},${point.y}`)
  })

  it('a click on the yellow box selects yellow at every pixel only yellow shows', () => {
    const points = visibleOnlyPoints(sprites, sprite('stackBoxGold-4'))
    assert.ok(points.length > 20)
    for (const point of points) assert.equal(pick(point), 'stackBoxGold-4', `at ${point.x},${point.y}`)
  })

  it('picks every box of the four-box cluster where only it shows', () => {
    for (const id of ['stackBoxRed-1', 'stackBoxBlue-2', 'stackBoxGreen-3', 'stackBoxGold-4']) {
      for (const point of visibleOnlyPoints(sprites, sprite(id))) assert.equal(pick(point), id)
    }
  })

  it('transparent padding passes the click through to the visible object underneath', () => {
    // Inside the front (gold) box's rectangle but on a transparent pixel, over the red box's artwork.
    const gold = sprite('stackBoxGold-4')
    const red = sprite('stackBoxRed-1')
    const through = pixelsOf(gold, (point) => !opaqueAt(gold, point) && opaqueAt(red, point) && sprites.every((other) => other === red || !opaqueAt(other, point)))
    assert.ok(through.length > 20, 'the gold box rectangle overlaps red artwork through padding')
    for (const point of through) assert.equal(pick(point), 'stackBoxRed-1')
  })

  it('a click that is padding everywhere picks nothing, even inside a sprite rectangle', () => {
    const blue = sprite('stackBoxBlue-2')
    const empty = pixelsOf(blue, (point) => sprites.every((other) => !opaqueAt(other, point)))
    assert.ok(empty.length > 100)
    for (const point of empty) assert.equal(pick(point), undefined)
  })

  it('where artwork overlaps, the frontmost drawn sprite wins', () => {
    const order = drawOrder(sprites)
    const rank = (id) => order.indexOf(sprite(id))
    for (const [front, back] of [['stackBoxGold-4', 'stackBoxRed-1'], ['stackBoxGold-4', 'stackBoxBlue-2'], ['stackBoxGold-4', 'stackBoxGreen-3']]) {
      assert.ok(rank(front) > rank(back), `${front} is drawn after ${back}`)
      const both = overlapPoints(sprites, sprite(front), sprite(back))
      assert.ok(both.length > 0, `${front} and ${back} share opaque pixels`)
      for (const point of both) assert.equal(pick(point), front)
    }
  })

  it('every opaque pixel picks the last sprite drawn there (any elevation, any overlap)', () => {
    const order = drawOrder(sprites)
    let checked = 0
    for (const subject of sprites.filter((entry) => ['stackBoxRed-43', 'stackBoxRed-44', 'stackBoxRed-45', 'stackBoxGold-49', 'stackBoxGold-50', 'stackBoxGold-51', 'stackBoxGreen-52', 'stackSlabWhite-53', 'stackSlabBlack-54', 'stackBoxRed-1', 'stackBoxBlue-17', 'stackBoxGreen-18'].includes(entry.id))) {
      for (const point of pixelsOf(subject, (at) => opaqueAt(subject, at))) {
        const expected = [...order].reverse().find((other) => opaqueAt(other, point))
        assert.equal(pick(point), expected.id, `at ${point.x},${point.y}`)
        checked++
      }
    }
    assert.ok(checked > 1000)
  })

  it('selects each level of a three-high floor stack (different elevations)', () => {
    const tower = ['stackBoxRed-43', 'stackBoxRed-44', 'stackBoxRed-45']
    assert.deepEqual(tower.map((id) => sprite(id).z), [0, 8, 16])
    for (const id of tower) {
      const points = visibleOnlyPoints(sprites, sprite(id))
      assert.ok(points.length > 10, `${id} shows`)
      for (const point of points) assert.equal(pick(point), id)
    }
  })

  it('selects a box on a crate and a box on the floor under the same camera', () => {
    assert.equal(sprite('stackBoxBlue-2').z, 16)
    assert.equal(sprite('stackBoxBlue-46').z, 0)
    for (const id of ['stackBoxBlue-2', 'stackBoxBlue-46']) {
      for (const point of visibleOnlyPoints(sprites, sprite(id))) assert.equal(pick(point), id)
    }
  })

  it('draws every picture at its stacking cell', () => {
    const frames = new Set(sprites.map((entry) => `${entry.spriteSize.width}x${entry.spriteSize.height}`))
    assert.deepEqual([...frames].sort(), ['16x24', '32x48'])
  })

  it('is unchanged by camera pan and zoom (the pointer is converted through the viewBox first)', () => {
    // The board maps its viewBox onto the screen; the editor reads the pointer back through the inverse.
    for (const id of ['stackBoxBlue-2', 'stackBoxGold-4']) {
      for (const view of [{ x: 0, y: 0, width: 900, height: 700 }, { x: -230, y: 15, width: 450, height: 350 }, { x: 400, y: -120, width: 1800, height: 1400 }]) {
        const screen = { width: 900, height: 700 }
        for (const point of visibleOnlyPoints(sprites, sprite(id))) {
          const px = ((point.x - view.x) / view.width) * screen.width
          const py = ((point.y - view.y) / view.height) * screen.height
          const back = { x: view.x + (px / screen.width) * view.width, y: view.y + (py / screen.height) * view.height }
          assert.ok(Math.abs(back.x - point.x) < 1e-6 && Math.abs(back.y - point.y) < 1e-6)
          assert.equal(pick(point), id)
        }
      }
    }
  })

  it('groundItemAtBoard returns the placement, and can skip one to reach what is under it', () => {
    const top = sprite('stackBoxRed-45')
    const [point] = visibleOnlyPoints(sprites, top)
    assert.equal(groundItemAtBoard(map, point, { maskOf })?.id, 'stackBoxRed-45')
    // With the top box out of the way, that pixel is the middle box's (or padding): never the box that was skipped.
    assert.notEqual(groundItemAtBoard(map, point, { maskOf, excludeId: 'stackBoxRed-45' })?.id, 'stackBoxRed-45')
  })
})

describe('the alpha test itself', () => {
  const object = (extra = {}) => ({ id: 'a', position: { x: 4, y: 4 }, z: 0, depth: 1, worldImage: '/art/a.png', spriteSize: { width: 40, height: 20 }, ...extra })
  // 4x2 picture, not square: only the right half is opaque; one soft pixel in the top-left.
  const lopsided = makeAlphaMask(4, 2, new Uint8Array([0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255]))
  const box = spriteGeometry(object()).box
  const at = (u, v) => ({ x: box.x + u * box.width, y: box.y + v * box.height })

  it('maps the point into a non-square picture and tests that pixel', () => {
    assert.equal(pickProp([object()], at(0.75, 0.25), { maskOf: () => lopsided })?.id, 'a')
    assert.equal(pickProp([object()], at(0.25, 0.25), { maskOf: () => lopsided }), null)
    assert.equal(pickProp([object()], at(0.25, 0.75), { maskOf: () => lopsided }), null)
  })

  it('counts only alpha above the threshold, which can be changed', () => {
    const soft = at(0.1, 0.1)
    assert.equal(pickProp([object()], soft, { maskOf: () => lopsided }), null, 'alpha 10 is under the default threshold')
    assert.equal(pickProp([object()], soft, { maskOf: () => lopsided, threshold: 5 })?.id, 'a')
  })

  it('ignores points outside the sprite rectangle', () => {
    assert.equal(pickProp([object()], { x: box.x - 1, y: box.y + 5 }, { maskOf: () => lopsided }), null)
    assert.equal(pickProp([object()], { x: box.x + box.width, y: box.y + 5 }, { maskOf: () => lopsided }), null)
  })

  it('lifts the rectangle by the world height, so a raised sprite answers where it is drawn', () => {
    const raised = object({ z: 16 })
    const lifted = spriteGeometry(raised).box
    assert.equal(lifted.y, box.y - 16)
    assert.equal(pickProp([raised], { x: lifted.x + lifted.width * 0.75, y: lifted.y + lifted.height * 0.25 }, { maskOf: () => lopsided })?.id, 'a')
    assert.equal(pickProp([raised], { x: box.x + box.width * 0.75, y: box.y + box.height * 0.9 }, { maskOf: () => lopsided }), null)
  })

  it('draws by depth, then by list order, and tests from the front', () => {
    const back = object({ id: 'back', depth: 1 })
    const front = object({ id: 'front', depth: 2 })
    const point = at(0.75, 0.25)
    assert.equal(pickProp([front, back], point, { maskOf: () => lopsided })?.id, 'front')
    assert.equal(pickProp([back, front], point, { maskOf: () => lopsided })?.id, 'front')
    const tiedA = object({ id: 'tiedA', depth: 2 })
    const tiedB = object({ id: 'tiedB', depth: 2 })
    assert.equal(pickProp([tiedA, tiedB], point, { maskOf: () => lopsided })?.id, 'tiedB', 'ties go to the one added later, as on the board')
  })

  it('a picture that has not loaded, or failed, does not take the click or hide the sprite behind it', () => {
    const point = at(0.75, 0.25)
    const front = object({ id: 'front', depth: 2 })
    const back = object({ id: 'back', depth: 1, worldImage: '/art/b.png' })
    const masks = { '/art/b.png': lopsided }
    assert.equal(pickProp([front], point, { maskOf: () => undefined }), null)
    assert.equal(pickProp([front], point, { maskOf: () => null }), null)
    assert.equal(pickProp([back, front], point, { maskOf: (href) => masks[href] })?.id, 'back')
  })

  it('reads the installed mask source when none is passed', () => {
    setAlphaMaskSource(() => lopsided)
    try {
      assert.equal(pickProp([object()], at(0.25, 0.25)), null)
      assert.equal(pickProp([object()], at(0.75, 0.25))?.id, 'a')
    } finally {
      setAlphaMaskSource(() => undefined)
    }
  })
})

describe('selectionCandidates uses the drawn pixels, not the floor cell', () => {
  const map = stacking()
  const sprites = groundItemSprites(map)
  const kind = (candidates) => candidates.find((candidate) => candidate.kind === 'groundItem')?.groundItem.id

  it('offers the item under an opaque pixel whatever floor tile the click was on', () => {
    const blue = sprites.find((entry) => entry.id === 'stackBoxBlue-2')
    const [point] = pixelsOf(blue, (at) => opaqueAt(blue, at) && sprites.every((other) => other === blue || !opaqueAt(other, at)))
    assert.equal(kind(selectionCandidates(map, [], { x: 1, y: 1 }, { cellPx: 2, boardPoint: point, maskOf })), 'stackBoxBlue-2')
  })

  it('a click on transparent padding is not an item, even when the floor cell holds one', () => {
    // The tower stands on (4, 9) exactly, so the grid match for that cell finds it; the pixel under the click is padding.
    const tower = sprites.find((entry) => entry.id === 'stackBoxRed-43')
    const padding = pixelsOf(tower, (at) => sprites.every((other) => !opaqueAt(other, at)))[0]
    assert.ok(padding)
    assert.equal(kind(selectionCandidates(map, [], { x: 4, y: 9 }, { cellPx: 2, boardPoint: padding, maskOf })), undefined)
    // With no pointer position the floor cell still answers, as before.
    assert.equal(kind(selectionCandidates(map, [], { x: 4, y: 9 }, { cellPx: 2 })), 'stackBoxRed-43')
  })

  it('does not change where an item is placed', () => {
    const placed = placeGroundItem(map, { x: 6, y: 12 }, 'stackBoxRed', 2)
    assert.ok(placed)
    assert.equal(placed.map.groundItemPlacements.length, map.groundItemPlacements.length + 1)
  })
})
