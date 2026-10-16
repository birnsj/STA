// Full-body map sprites (characterSprites.json, rules/appearance.js). All Prototype: the books have no map figures.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import spriteData from '../src/data/adaptation/characterSprites.json' with { type: 'json' }
import characterData from '../src/data/adaptation/characters.json' with { type: 'json' }
import {
  blastFaceOrigin,
  blastKnockbackFacing,
  blastLandingCell,
  blastThrow,
  defeatAnimation,
  directionFor,
  explosionKnockback,
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
    for (const name of [...spriteData.deadlyFalls, spriteData.stunFall, ...spriteData.explosionFalls]) {
      assert.equal(getSpriteAnimation(name).sheetId, 'fall')
    }
  })

  it('getUp is on its own getup sheet', () => {
    assert.equal(getSpriteAnimation(spriteData.getUp).sheetId, 'getup')
    assert.equal(getSpriteAnimation('getUp').play, 'once')
  })
})

describe('how a Defeated character falls (Prototype presentation)', () => {
  const stun = { type: 'stun', severity: 1 }
  const deadly = { type: 'deadly', severity: 1 }
  const blast = { type: 'deadly', severity: 3, id: 'b1', source: { weaponId: 'explosion:gasCylinder1', blastRadius: 3 } }
  const blastStun = { type: 'stun', severity: 2, id: 'b2', source: { weaponId: 'explosion:gasCylinder1', blastRadius: 2 } }

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

  it('an explosion Defeat (stun or deadly) uses one of the blast falls, the same way every time for the same figure', () => {
    const deadlyFall = defeatAnimation({ defeated: true, injuries: [blast] }, 'crew-1')
    const stunFall = defeatAnimation({ defeated: true, injuries: [blastStun] }, 'crew-2')
    assert.ok(spriteData.explosionFalls.includes(deadlyFall))
    assert.ok(spriteData.explosionFalls.includes(stunFall))
    assert.equal(defeatAnimation({ defeated: true, injuries: [blast] }, 'crew-1'), deadlyFall)
    const kb = explosionKnockback({ defeated: true, injuries: [blast] }, 'crew-1')
    assert.ok(kb.tiles >= 1 && kb.tiles <= 3)
    assert.ok(kb.facing)
    assert.equal(explosionKnockback({ defeated: true, injuries: [blast] }, 'crew-1').tiles, kb.tiles)
  })

  it('a stronger blast throws farther', () => {
    const soft = { type: 'stun', severity: 1, source: { weaponId: 'explosion:a', blastRadius: 1 } }
    const hard = { type: 'deadly', severity: 4, source: { weaponId: 'explosion:a', blastRadius: 3 } }
    assert.ok(
      explosionKnockback({ defeated: true, injuries: [hard] }, 'x').tiles >
        explosionKnockback({ defeated: true, injuries: [soft] }, 'x').tiles,
    )
  })

  it('throws the figure outward from the blast, not toward it', () => {
    const east = {
      type: 'stun',
      severity: 2,
      source: { weaponId: 'explosion:g', blastRadius: 2, blastOrigin: { x: 5, y: 5 }, at: { x: 7, y: 5 } },
    }
    const kb = explosionKnockback({ defeated: true, injuries: [east] }, 'crew')
    assert.equal(kb.facing.x, 1)
    assert.equal(kb.facing.y, 0)
    const west = {
      type: 'stun',
      severity: 2,
      source: { weaponId: 'explosion:g', blastRadius: 2, blastOrigin: { x: 5, y: 5 }, at: { x: 3, y: 4 } },
    }
    const away = explosionKnockback({ defeated: true, injuries: [west] }, 'crew')
    assert.ok(away.facing.x < 0)
  })

  it('blast landing stops before a wall and is outward from the origin', () => {
    const map = {
      width: 10,
      height: 10,
      tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, (_, x) => (x === 8 ? 'plainBulkhead' : 'floor'))),
    }
    // Floor at 7, wall at 8: from (5,5) facing +x, 3 tiles → land on 7.
    assert.deepEqual(blastLandingCell(map, { x: 5, y: 5 }, { x: 1, y: 0 }, 3), { x: 7, y: 5 })
  })

  it('blast landing stops before a tile another character occupies', () => {
    const map = {
      width: 10,
      height: 10,
      tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 'floor')),
    }
    const occupied = new Set(['7,5'])
    assert.deepEqual(blastLandingCell(map, { x: 5, y: 5 }, { x: 1, y: 0 }, 3, occupied), { x: 6, y: 5 })
  })
})

describe('blast throw direction and facing (Prototype presentation)', () => {
  const openMap = () => ({
    width: 12,
    height: 12,
    tiles: Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 'floor')),
  })
  const injuryAt = (at, origin = { x: 5, y: 5 }, radius = 2) => ({
    type: 'stun',
    severity: 2,
    source: { weaponId: 'explosion:g', blastRadius: radius, blastOrigin: origin, at },
  })

  it('throws east, west, north and south outward from the blast', () => {
    const map = openMap()
    const origin = { x: 5, y: 5 }
    const cases = [
      [{ x: 7, y: 5 }, { x: 1, y: 0 }],
      [{ x: 3, y: 5 }, { x: -1, y: 0 }],
      [{ x: 5, y: 3 }, { x: 0, y: -1 }],
      [{ x: 5, y: 7 }, { x: 0, y: 1 }],
    ]
    for (const [at, expected] of cases) {
      const throw_ = blastThrow(map, injuryAt(at, origin), 'crew')
      assert.deepEqual(throw_.facing, expected, `from ${at.x},${at.y}`)
      assert.ok(throw_.tiles >= 1)
      assert.equal(Math.sign(throw_.land.x - at.x) || 0, expected.x || 0)
      assert.equal(Math.sign(throw_.land.y - at.y) || 0, expected.y || 0)
    }
  })

  it('a diagonal stand throws on the matching diagonal', () => {
    const throw_ = blastThrow(openMap(), injuryAt({ x: 7, y: 7 }), 'crew')
    assert.deepEqual(throw_.facing, { x: 1, y: 1 })
    assert.ok(throw_.land.x > 7 && throw_.land.y > 7)
  })

  it('a wall truncates the throw without reversing it', () => {
    const map = openMap()
    map.tiles[5][8] = 'plainBulkhead'
    const at = { x: 6, y: 5 }
    const throw_ = blastThrow(map, injuryAt(at), 'crew')
    assert.deepEqual(throw_.facing, { x: 1, y: 0 })
    assert.deepEqual(throw_.land, { x: 7, y: 5 })
    assert.equal(throw_.tiles, 1)
  })

  it('an occupied tile stops the throw on a free tile; a fully blocked throw does not invent a slide', () => {
    const map = openMap()
    const at = { x: 6, y: 5 }
    const blocked = blastThrow(map, injuryAt(at), 'crew', new Set(['7,5', '8,5', '9,5']))
    assert.deepEqual(blocked.land, at)
    assert.equal(blocked.tiles, 0)
  })

  it('final facing points from the landing tile toward the explosion, not from the pre-throw tile', () => {
    const map = openMap()
    map.tiles[5][9] = 'plainBulkhead'
    // Stood at 7,5; throw +x is truncated to 8,5. Facing must use 8,5 → origin 5,5.
    const injury = injuryAt({ x: 7, y: 5 })
    const throw_ = blastThrow(map, injury, 'crew')
    assert.deepEqual(throw_.land, { x: 8, y: 5 })
    assert.deepEqual(throw_.look, blastFaceOrigin(injury, 'crew', throw_.land))
    assert.deepEqual(throw_.look, { x: -1, y: 0 })
    // Using the old tile alone would still be -x here; force a case where land ≠ at directionally vs origin:
    // stand at 6,4 (NW of origin), land truncated differently.
    const diagonal = injuryAt({ x: 7, y: 3 }, { x: 5, y: 5 })
    const away = blastKnockbackFacing(diagonal, 'a')
    assert.ok(away.x > 0 || away.y < 0)
    const landFace = blastFaceOrigin(diagonal, 'a', { x: 8, y: 2 })
    const fromFace = blastFaceOrigin(diagonal, 'a', { x: 7, y: 3 })
    // Both look back toward origin; land-based is what clearBlastReact must use.
    assert.ok(landFace.x < 0 || landFace.y > 0)
    assert.ok(fromFace.x < 0 || fromFace.y > 0)
  })

  it('several characters around one blast each get their own outward throw', () => {
    const map = openMap()
    const origin = { x: 5, y: 5 }
    const stands = [
      { x: 7, y: 5 },
      { x: 3, y: 5 },
      { x: 5, y: 7 },
    ]
    const throws = stands.map((at, index) => blastThrow(map, injuryAt(at, origin), `p${index}`))
    const keys = throws.map((t) => `${t.facing.x},${t.facing.y}`)
    assert.equal(new Set(keys).size, 3, 'three different throw directions')
    throws.forEach((t, index) => {
      assert.notDeepEqual(t.land, stands[index])
      assert.deepEqual(t.look, blastFaceOrigin(injuryAt(stands[index], origin), `p${index}`, t.land))
    })
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
