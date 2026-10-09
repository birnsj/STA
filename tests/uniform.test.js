// Shirt colour by department (rules/uniform.js) and the mock-art recolour (components/useUniformImage.js).
// Each test names the rule it holds to: "Book" = STA 2e Technical Manual / Core Rulebook, "Prototype" = our approved adaptation.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import backdropData from '../src/data/adaptation/portraitBackdrops.json' with { type: 'json' }
import portraitData from '../src/data/adaptation/portraits.json' with { type: 'json' }
import { getPortraitById, getPortraitLayers } from '../src/rules/appearance.js'
import { getDivisionForDepartment, getUniformColour } from '../src/rules/uniform.js'
import { recolourShirtPixels } from '../src/components/useUniformImage.js'

const GOLD = '#c9a227'
const RED = '#b3262c'
const BLUE = '#2d6fb3'

describe('uniform colour by department', () => {
  it('Book: TOS tunics are gold for command, red for operations and security, blue for sciences and medical', () => {
    assert.equal(getUniformColour('command'), GOLD)
    assert.equal(getUniformColour('engineering'), RED)
    assert.equal(getUniformColour('security'), RED)
    assert.equal(getUniformColour('science'), BLUE)
    assert.equal(getUniformColour('medicine'), BLUE)
  })

  it('Book: Conn is part of the Command track, so it wears command gold', () => {
    assert.equal(getDivisionForDepartment('conn').id, 'command')
    assert.equal(getUniformColour('conn'), GOLD)
  })

  it('Prototype: a character with no department wears blue', () => {
    assert.equal(getUniformColour(undefined), BLUE)
    assert.equal(getUniformColour('notADepartment'), BLUE)
  })
})

describe('mock portrait recolour', () => {
  const pixel = (r, g, b) => [r, g, b, 255]
  const recolour = (pixels, colour) => [...recolourShirtPixels(Uint8ClampedArray.from(pixels.flat()), colour)]

  it('swaps every mock shirt colour, including the shade under the name label', () => {
    const shirt = [pixel(179, 38, 44), pixel(45, 111, 179), pixel(72, 15, 18)]
    assert.deepEqual(recolour(shirt, GOLD), [...pixel(201, 162, 39), ...pixel(201, 162, 39), ...pixel(80, 65, 16)])
  })

  it('leaves skin, hair, background and the label text alone', () => {
    const others = [pixel(16, 34, 64), pixel(90, 55, 35), pixel(160, 64, 30), pixel(246, 185, 40), pixel(20, 20, 20)]
    assert.deepEqual(recolour(others, RED), others.flat())
  })

  it('keeps alpha and leaves a shirt that already has the colour unchanged', () => {
    const gold = [[201, 162, 39, 128]]
    assert.deepEqual(recolour(gold, GOLD), gold.flat())
  })
})

describe('layered portraits', () => {
  const pngSize = (src) => {
    const bytes = fs.readFileSync(new URL(`../public${src}`, import.meta.url))
    return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`
  }
  const composited = portraitData.portraits.filter((portrait) => portrait.characterImage || portrait.backdropImage)
  const pictures = (portrait) => [getPortraitLayers(portrait.image ?? portrait.characterImage), getPortraitLayers(portrait.fullBody)].filter(Boolean)

  it('Prototype: a composited portrait stacks backdrop, character, then the uniform overlay', () => {
    const portrait = getPortraitById('human-male-1')
    assert.deepEqual(getPortraitLayers(portrait.image), [
      { role: 'backdrop', src: portrait.backdropImage },
      { role: 'character', src: portrait.characterImage },
      { role: 'uniform', src: portrait.uniformImage },
    ])
    assert.deepEqual(getPortraitLayers(portrait.fullBody), portrait.fullBodyLayers)
  })

  it('a single-image portrait keeps its one picture, with no layers', () => {
    const portrait = getPortraitById('human-male-2')
    assert.equal(portrait.image, '/art/portraits/human-male-2.png')
    assert.equal(getPortraitLayers(portrait.image), null)
    assert.equal(getPortraitLayers('/art/combat/klingon-warrior-1.png'), null)
  })

  it('every layer file exists and matches the size of the other layers of its picture', () => {
    assert.ok(composited.length > 0)
    for (const portrait of composited) {
      for (const layers of pictures(portrait)) {
        const sizes = new Set(layers.map((layer) => pngSize(layer.src)))
        assert.equal(sizes.size, 1, `${portrait.id}: layers differ in size`)
      }
    }
  })

  it('Prototype: the insignia is on full-body portraits only', () => {
    for (const portrait of composited) {
      assert.ok(!getPortraitLayers(portrait.image).some((layer) => layer.role === 'insignia'), portrait.id)
      assert.ok(portrait.fullBodyLayers.some((layer) => layer.role === 'insignia'), portrait.id)
    }
  })

  it('every placeholder backdrop exists at the portrait size, and composited portraits use listed backdrops', () => {
    const listed = new Set(backdropData.backdrops.map((backdrop) => backdrop.image))
    for (const src of listed) assert.equal(pngSize(src), '480x600', src)
    for (const portrait of composited) assert.ok(listed.has(portrait.backdropImage), portrait.id)
  })
})
