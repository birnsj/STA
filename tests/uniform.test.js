// Shirt colour by department (rules/uniform.js) and the mock-art recolour (components/useUniformImage.js).
// Each test names the rule it holds to: "Book" = STA 2e Technical Manual / Core Rulebook, "Prototype" = our approved adaptation.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import portraitData from '../src/data/adaptation/portraits.json' with { type: 'json' }
import {
  getBackdropById,
  getBackdrops,
  getCharacterBackdrop,
  getDefaultBackdrop,
  getAvailablePortraits,
  getPortraitById,
  getPortraitLayers,
} from '../src/rules/appearance.js'
import { createInitialState, createRestoredState, creatorReducer } from '../src/character/characterReducer.js'
import { createEmptyCharacter } from '../src/character/characterModel.js'
import { normalizeCharacterRecord } from '../src/character/runtimeCharacter.js'
import { serializeCharacter } from '../src/export/serializeCharacter.js'
import { getDivisionColour, getDivisionForDepartment, getUniformColour } from '../src/rules/uniform.js'
import { recolourMaskedPixels, recolourShirtPixels } from '../src/components/useUniformImage.js'
import { decodePng } from '../scripts/png.mjs'

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

const pngSize = (src) => {
  const bytes = fs.readFileSync(new URL(`../public${src}`, import.meta.url))
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`
}

describe('layered portraits', () => {
  const composited = portraitData.portraits.filter((portrait) => portrait.characterImage)
  const pictures = (portrait) => [getPortraitLayers(portrait.image ?? portrait.characterImage), getPortraitLayers(portrait.fullBody)].filter(Boolean)

  it('Prototype: the Vulcan head art replaces the mock head layers; the mock full-body layers stay', () => {
    const portrait = getPortraitById('vulcan-male-1')
    assert.equal(portrait.characterImage, '/art/portraits/vulcan-male-1.png')
    assert.ok(!('uniformImage' in portrait))
    assert.ok(portraitData.portraits.every((entry) => !('backdropImage' in entry)), 'backdrops are chosen per character, not per portrait')
    assert.deepEqual(getPortraitLayers(portrait.fullBody), portrait.fullBodyLayers)
  })

  it('a transparent single picture (the Human and Vulcan art) is its own character layer, so the backdrop shows behind it', () => {
    for (const id of ['human-male-2', 'vulcan-female-3']) {
      const portrait = getPortraitById(id)
      assert.equal(portrait.characterImage, `/art/portraits/${id}.png`)
      assert.equal(getPortraitLayers(portrait.image)[0].src, `/art/portraits/${id}.png`)
    }
  })

  it('a single-image portrait keeps its one picture, with no layers', () => {
    const portrait = getPortraitById('tellarite-male-2')
    assert.equal(portrait.image, '/art/portraits/tellarite-male-2.png')
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
    }
    for (const portrait of portraitData.portraits.filter((entry) => entry.fullBodyLayers)) {
      assert.ok(portrait.fullBodyLayers.some((layer) => layer.role === 'insignia'), portrait.id)
    }
  })

})

describe('uniform mask recolour (Prototype: the Human, Vulcan and Andorian portraits)', () => {
  const read = (src) => decodePng(fs.readFileSync(new URL(`../public${src}`, import.meta.url)))
  const masked = portraitData.portraits.filter((entry) => entry.uniformMask)
  const designerArt = portraitData.portraits.filter((entry) => ['human', 'vulcan', 'andorian'].includes(entry.species))

  it('every Human, Vulcan and Andorian portrait has its own mask, and each character layer carries it with the colour the art wears', () => {
    assert.deepEqual(masked.map((entry) => entry.id), designerArt.map((entry) => entry.id))
    assert.equal(masked.length, 30)
    assert.equal(new Set(masked.map((entry) => entry.uniformMask)).size, masked.length)
    for (const entry of masked) {
      const portrait = getPortraitById(entry.id)
      assert.deepEqual(getPortraitLayers(portrait.image), [
        { role: 'character', src: portrait.characterImage, mask: portrait.uniformMask, baseColour: getUniformColour('command') },
      ])
    }
  })

  for (const entry of masked) {
    describe(entry.id, () => {
      const art = read(entry.characterImage)
      const mask = read(entry.uniformMask)
      const isMasked = (index) => mask.bytes[index * 4 + 3] > 0

      it('the mask matches the portrait size, covers only opaque pixels and nothing in the head area', () => {
        assert.equal(`${mask.width}x${mask.height}`, `${art.width}x${art.height}`)
        let covered = 0
        for (let index = 0; index < art.width * art.height; index++) {
          if (!isMasked(index)) continue
          covered++
          assert.ok(art.bytes[index * 4 + 3] > 0, `mask over a transparent pixel at ${index}`)
          assert.ok(Math.floor(index / art.width) >= 165, `mask in the head area at ${index}`)
        }
        assert.ok(covered > 15000, `uniform pixels: ${covered}`)
      })

      it('every masked pixel is a warm shirt tone in the art (never blue skin or antennae, pale hair or the black collar)', () => {
        for (let index = 0; index < art.width * art.height; index++) {
          if (!isMasked(index)) continue
          const [r, g, b] = art.bytes.subarray(index * 4, index * 4 + 3)
          const max = Math.max(r, g, b)
          assert.ok(b <= r && b <= g && (max - b) / max >= 0.3 && max >= 30, `pixel ${index} is rgb(${r}, ${g}, ${b})`)
        }
      })

      it('the mask is the shirt alone: one connected piece (a neck or ear in shirt tones would be a second)', () => {
        const width = mask.width
        const seen = new Uint8Array(width * mask.height)
        let pieces = 0
        for (let start = 0; start < seen.length; start++) {
          if (!isMasked(start) || seen[start]) continue
          pieces++
          const queue = [start]
          seen[start] = 1
          while (queue.length) {
            const index = queue.pop()
            const x = index % width
            for (const next of [x + 1 < width ? index + 1 : -1, x > 0 ? index - 1 : -1, index + width, index - width]) {
              if (next >= 0 && next < seen.length && !seen[next] && isMasked(next)) {
                seen[next] = 1
                queue.push(next)
              }
            }
          }
        }
        assert.equal(pieces, 1)
      })

      for (const division of ['sciences', 'operations']) {
        it(`recolouring to ${division} changes only uniform pixels and never alpha`, () => {
          const pixels = new Uint8Array(art.bytes)
          recolourMaskedPixels(pixels, mask.bytes, getDivisionColour(division))
          let changed = 0
          for (let index = 0; index < art.width * art.height; index++) {
            const offset = index * 4
            assert.equal(pixels[offset + 3], art.bytes[offset + 3])
            const same = [0, 1, 2].every((channel) => pixels[offset + channel] === art.bytes[offset + channel])
            if (!isMasked(index)) assert.ok(same, `pixel ${index} outside the mask changed`)
            else if (!same) changed++
          }
          assert.ok(changed > 15000, `recoloured pixels: ${changed}`)
        })
      }
    })
  }
  it('the typical shirt pixel becomes the division colour; darker folds stay darker', () => {
    const pixels = new Uint8Array([200, 160, 40, 255, 100, 80, 20, 255, 200, 160, 40, 255])
    const all = new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255])
    recolourMaskedPixels(pixels, all, '#2d6fb3')
    assert.deepEqual([...pixels.slice(0, 3)], [0x2d, 0x6f, 0xb3])
    assert.ok(pixels[6] < 0xb3 && pixels[5] < 0x6f)
  })
})

describe('Portrait backdrops (Prototype: chosen per character on Finishing Touches)', () => {
  const autofilled = creatorReducer(createInitialState(), { type: 'autofill', seed: 0.42 })
  const portraitIds = getAvailablePortraits(autofilled.character).map((portrait) => portrait.id)

  it('every backdrop file exists in the portrait 4:5 shape; Starship Bridge is the 256x320 designer art', () => {
    for (const backdrop of getBackdrops()) {
      const [width, height] = pngSize(backdrop.image).split('x').map(Number)
      assert.equal(width * 5, height * 4, backdrop.id)
    }
    assert.equal(pngSize(getBackdropById('starship-bridge').image), '256x320')
    assert.equal(getBackdropById('starship-bridge').name, 'Starship Bridge')
  })

  it('Starship Bridge is the default for new characters and for saves made before the choice existed', () => {
    assert.equal(getDefaultBackdrop().id, 'starship-bridge')
    assert.deepEqual(createEmptyCharacter().identity.backdrop, { id: 'starship-bridge', name: 'Starship Bridge' })
    assert.equal(getCharacterBackdrop({ name: 'Old Save', portrait: null }).id, 'starship-bridge')
    assert.equal(getCharacterBackdrop({ backdrop: { id: 'no-longer-listed', name: 'Gone' } }).id, 'starship-bridge')
  })

  it('changing the backdrop keeps the portrait, and changing the portrait keeps the backdrop', () => {
    assert.ok(portraitIds.length >= 2)
    let state = creatorReducer(autofilled, { type: 'selectPortrait', portraitId: portraitIds[0] })
    state = creatorReducer(state, { type: 'selectBackdrop', backdropId: 'sickbay' })
    assert.equal(state.character.identity.portrait.id, portraitIds[0])
    assert.deepEqual(state.character.identity.backdrop, { id: 'sickbay', name: 'Sickbay' })
    state = creatorReducer(state, { type: 'selectPortrait', portraitId: portraitIds[1] })
    assert.equal(state.character.identity.portrait.id, portraitIds[1])
    assert.equal(state.character.identity.backdrop.id, 'sickbay')
    assert.equal(creatorReducer(state, { type: 'selectBackdrop', backdropId: 'unknown' }).character.identity.backdrop.id, 'sickbay')
  })

  it('the chosen backdrop survives export and load; an export without one loads with the default', () => {
    const { character } = creatorReducer(autofilled, { type: 'selectBackdrop', backdropId: 'engineering' })
    const exported = JSON.parse(JSON.stringify(serializeCharacter(character)))
    assert.deepEqual(exported.character.identity.backdrop, { id: 'engineering', name: 'Engineering' })
    assert.equal(createRestoredState(exported.character).character.identity.backdrop.id, 'engineering')
    assert.equal(normalizeCharacterRecord(exported).character.portrait.backdrop, getBackdropById('engineering').image)

    const { backdrop: _omitted, ...oldIdentity } = exported.character.identity
    const oldRecord = { ...exported, character: { ...exported.character, identity: oldIdentity } }
    assert.equal(normalizeCharacterRecord(oldRecord).character.portrait.backdrop, getDefaultBackdrop().image)
  })
})
