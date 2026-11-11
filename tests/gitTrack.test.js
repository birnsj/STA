// Dev Edit authoring stages catalogue/art paths for git (tools/gitTrack.cjs).
import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { repoRootFromPublic, toRepoRelative } = require('../tools/gitTrack.cjs')

describe('gitTrack', () => {
  it('resolves the repo root from public/', () => {
    const publicRoot = path.resolve('d:/STA/public')
    assert.equal(repoRootFromPublic(publicRoot), path.resolve('d:/STA'))
  })

  it('maps art paths to repo-relative forward-slash paths', () => {
    const root = path.resolve('d:/STA')
    const art = path.resolve('d:/STA/public/art/sprites/environment/templates/tpl.png')
    assert.equal(toRepoRelative(root, art), 'public/art/sprites/environment/templates/tpl.png')
  })

  it('rejects paths outside the repo', () => {
    const root = path.resolve('d:/STA')
    assert.equal(toRepoRelative(root, path.resolve('d:/other/file.png')), null)
  })
})
