import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { listSprites, putSprite } from '../tools/spriteStore.cjs'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe('spriteStore', () => {
  it('lists pngs under the sprites root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sprites-'))
    fs.mkdirSync(path.join(root, 'characters', 'human'), { recursive: true })
    fs.writeFileSync(path.join(root, 'characters', 'human', 'a.png'), PNG)
    fs.writeFileSync(path.join(root, 'readme.txt'), 'no')
    const list = listSprites(root)
    assert.deepEqual(list, [{ path: '/art/sprites/characters/human/a.png', group: 'characters', name: 'a.png' }])
  })

  it('writes a png only under the sprites root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sprites-'))
    fs.mkdirSync(path.join(root, 'effects'), { recursive: true })
    const result = putSprite(root, {
      path: '/art/sprites/effects/boom.png',
      png: PNG.toString('base64'),
    })
    assert.equal(result.path, '/art/sprites/effects/boom.png')
    assert.ok(fs.existsSync(path.join(root, 'effects', 'boom.png')))
    assert.throws(() => putSprite(root, { path: '/art/episodes/x.png', png: PNG.toString('base64') }))
    assert.throws(() => putSprite(root, { path: '/art/sprites/../episodes/x.png', png: PNG.toString('base64') }))
  })
})
