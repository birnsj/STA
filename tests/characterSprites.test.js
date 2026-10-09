// Full-body map sprites (characterSprites.json, rules/appearance.js). All Prototype: the books have no map figures.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import spriteData from '../src/data/adaptation/characterSprites.json' with { type: 'json' }
import characterData from '../src/data/adaptation/characters.json' with { type: 'json' }
import { directionFor, getSpriteSet, getSpriteSetById, hasCharacterSprite } from '../src/rules/appearance.js'
import { normalizeCharacterRecord } from '../src/character/runtimeCharacter.js'
import { decodePng } from '../scripts/png.mjs'

const { frame, resolution, directions, animations } = spriteData
const columns = Math.max(...Object.values(animations).map((animation) => animation.start + animation.frames))
const sheetWidth = columns * frame.width * resolution
const sheetHeight = directions.length * frame.height * resolution
const readPng = (src) => decodePng(fs.readFileSync(`public${src}`))

describe('character sprite sheets (Prototype)', () => {
  for (const set of spriteData.sets) {
    describe(set.id, () => {
      const sheet = readPng(set.sheet)

      it('has every drawn direction and animation frame on the declared grid', () => {
        assert.equal(sheet.width, sheetWidth)
        assert.equal(sheet.height, sheetHeight)
      })

      it('draws a figure in every frame', () => {
        const cellWidth = frame.width * resolution
        const cellHeight = frame.height * resolution
        for (let row = 0; row < directions.length; row++) {
          for (let column = 0; column < columns; column++) {
            let opaque = 0
            for (let y = row * cellHeight; y < (row + 1) * cellHeight; y += 2) {
              for (let x = column * cellWidth; x < (column + 1) * cellWidth; x += 2) {
                if (sheet.bytes[(y * sheet.width + x) * 4 + 3] > 0) opaque++
              }
            }
            assert.ok(opaque > 500, `${directions[row]} frame ${column} is empty`)
          }
        }
      })

      if (set.uniformMask) {
        it('has a uniform mask the size of the sheet that only covers the figure', () => {
          const mask = readPng(set.uniformMask)
          assert.equal(mask.width, sheet.width)
          assert.equal(mask.height, sheet.height)
          let masked = 0
          for (let i = 3; i < mask.bytes.length; i += 4) {
            if (mask.bytes[i] === 0) continue
            masked++
            assert.ok(sheet.bytes[i] > 0, `mask over a transparent pixel at ${(i - 3) / 4}`)
          }
          assert.ok(masked > 0)
        })
      }
    })
  }
})

describe('sprite set for a portrait (Prototype)', () => {
  it('a player portrait gets the set for its species and gender', () => {
    assert.equal(getSpriteSet('human-male-1').id, 'human-male')
    assert.equal(getSpriteSet('andorian-female-3').id, 'andorian-female')
    assert.equal(getSpriteSet('caitian-male-5').id, 'caitian-male')
  })

  it('NPC portraits outside portraits.json are mapped by id', () => {
    assert.equal(getSpriteSet('klingon-warrior-1').id, 'klingon-male')
    assert.equal(getSpriteSet('klingon-warrior-2').id, 'klingon-male')
  })

  it('an unknown or missing portrait has no set, so the map shows the portrait token', () => {
    assert.equal(getSpriteSet('no-such-portrait'), null)
    assert.equal(getSpriteSet(null), null)
    assert.equal(hasCharacterSprite(null), false)
    assert.equal(hasCharacterSprite('no-such-set'), false)
    assert.equal(hasCharacterSprite('human-female'), true)
    assert.equal(getSpriteSetById('klingon-male').uniformMask, undefined)
  })

  it('the runtime character carries its sprite set', () => {
    const klingon = normalizeCharacterRecord(characterData.characters[0])
    assert.equal(klingon.character.portrait.spriteSet, 'klingon-male')
  })
})

describe('sprite direction from facing (Prototype)', () => {
  // Facing is world {x, y}: +x runs to the screen's bottom right, +y to its bottom left.
  const cases = [
    [{ x: 1, y: 1 }, 's', 's', false],
    [{ x: 1, y: 0 }, 'se', 'se', false],
    [{ x: 1, y: -1 }, 'e', 'e', false],
    [{ x: 0, y: -1 }, 'ne', 'ne', false],
    [{ x: -1, y: -1 }, 'n', 'n', false],
    [{ x: 0, y: 1 }, 'sw', 'se', true],
    [{ x: -1, y: 1 }, 'w', 'e', true],
    [{ x: -1, y: 0 }, 'nw', 'ne', true],
  ]
  for (const [facing, id, drawn, mirror] of cases) {
    it(`facing (${facing.x}, ${facing.y}) is ${id}${mirror ? `, the ${drawn} row mirrored` : ''}`, () => {
      const direction = directionFor(facing)
      assert.equal(direction.id, id)
      assert.equal(direction.row, directions.indexOf(drawn))
      assert.equal(direction.mirror, mirror)
    })
  }

  it('no facing yet faces south, toward the viewer', () => {
    assert.equal(directionFor(null).id, 's')
    assert.equal(directionFor({ x: 0, y: 0 }).id, 's')
  })
})
