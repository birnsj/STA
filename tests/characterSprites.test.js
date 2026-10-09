// Full-body map sprites (characterSprites.json, rules/appearance.js). All Prototype: the books have no map figures.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import spriteData from '../src/data/adaptation/characterSprites.json' with { type: 'json' }
import characterData from '../src/data/adaptation/characters.json' with { type: 'json' }
import {
  defeatAnimation,
  directionFor,
  getSpriteAnimation,
  getSpriteSet,
  getSpriteSetById,
  hasCharacterSprite,
  spriteMaskFile,
  spriteSheetColumns,
  spriteSheetFile,
} from '../src/rules/appearance.js'
import { normalizeCharacterRecord } from '../src/character/runtimeCharacter.js'
import { decodePng } from '../scripts/png.mjs'

const { directions } = spriteData
const readPng = (src) => decodePng(fs.readFileSync(`public${src}`))

describe('character sprite sheets (Prototype)', () => {
  for (const set of spriteData.sets) {
    for (const [sheetId, metrics] of Object.entries(spriteData.sheets)) {
      describe(`${set.id} ${sheetId}`, () => {
        const sheet = readPng(spriteSheetFile(set, sheetId))
        const cellWidth = metrics.frame.width * metrics.resolution
        const cellHeight = metrics.frame.height * metrics.resolution
        const columns = spriteSheetColumns(sheetId)

        it('has every drawn direction and animation frame on the declared grid', () => {
          assert.equal(sheet.width, columns * cellWidth)
          assert.equal(sheet.height, directions.length * cellHeight)
        })

        it('draws a figure in every frame', () => {
          for (let row = 0; row < directions.length; row++) {
            for (let column = 0; column < columns; column++) {
              let opaque = 0
              for (let y = row * cellHeight; y < (row + 1) * cellHeight; y += 2) {
                for (let x = column * cellWidth; x < (column + 1) * cellWidth; x += 2) {
                  if (sheet.bytes[(y * sheet.width + x) * 4 + 3] > 0) opaque++
                }
              }
              assert.ok(opaque > 300, `${directions[row]} frame ${column} is empty`)
            }
          }
        })

        if (set.uniformMask) {
          it('has a uniform mask the size of the sheet that only covers the figure', () => {
            const mask = readPng(spriteMaskFile(set, sheetId))
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
  }
})

describe('sprite sheets and animations (Prototype)', () => {
  it('each sheet is the base sheet path with its suffix, and its mask beside it', () => {
    const set = getSpriteSetById('human-male')
    assert.equal(spriteSheetFile(set, 'base'), '/art/sprites/characters/human-male.png')
    assert.equal(spriteSheetFile(set, 'combat'), '/art/sprites/characters/human-male-combat.png')
    assert.equal(spriteMaskFile(set, 'fall'), '/art/sprites/characters/human-male-fall-uniform.png')
    assert.equal(spriteMaskFile(getSpriteSetById('klingon-male'), 'combat'), null)
  })

  it('every animation name is unique across the sheets and found with its sheet', () => {
    const names = Object.values(spriteData.sheets).flatMap((sheet) => Object.keys(sheet.animations))
    assert.equal(new Set(names).size, names.length)
    assert.equal(getSpriteAnimation('melee').sheetId, 'combat')
    assert.equal(getSpriteAnimation('fallSpin').play, 'hold')
    assert.equal(getSpriteAnimation('idle').play, 'loop')
    assert.equal(getSpriteAnimation('nope'), null)
  })

  it('the fall variants are drawn on the fall sheet', () => {
    for (const name of [...spriteData.deadlyFalls, spriteData.stunFall]) assert.equal(getSpriteAnimation(name).sheetId, 'fall')
  })
})

describe('how a Defeated character falls (Prototype presentation)', () => {
  const stun = { type: 'stun', severity: 1 }
  const deadly = { type: 'deadly', severity: 1 }

  it('a Stun Injury crumples', () => {
    assert.equal(defeatAnimation({ defeated: true, injuries: [stun] }, 'a'), 'fallCrumple')
  })

  it('an Unconscious Minor NPC crumples', () => {
    assert.equal(defeatAnimation({ defeated: true, injuries: [], unconscious: true, defeatedBy: { type: 'stun' } }, 'a'), 'fallCrumple')
  })

  it('a Deadly Injury falls back, forward or spins, the same way every time for the same figure', () => {
    const condition = { defeated: true, injuries: [deadly] }
    const fall = defeatAnimation(condition, 'klingon-1')
    assert.ok(spriteData.deadlyFalls.includes(fall))
    assert.equal(defeatAnimation(condition, 'klingon-1'), fall)
    assert.ok(spriteData.deadlyFalls.includes(defeatAnimation({ defeated: true, injuries: [], dead: true, defeatedBy: { type: 'deadly' } }, 'k')))
  })

  it('different figures use every Deadly fall', () => {
    const condition = { defeated: true, injuries: [deadly] }
    const seen = new Set(Array.from({ length: 40 }, (_, index) => defeatAnimation(condition, `npc-${index}`)))
    assert.deepEqual([...seen].sort(), [...spriteData.deadlyFalls].sort())
  })
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
