// Browser-side persistence (src/character/persistence.js): the saved-character list, the bundled characters a static
// build seeds once each, and the discarding of saves this code can't read.
//
// persistence.js seeds when it is imported and reads Vite-only import.meta.env / import.meta.glob, so each case here
// imports a fresh copy (a query string makes it a new module) through a hook that supplies those two values from the test.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, it } from 'node:test'

const PERSISTENCE = 'src/character/persistence.js'

registerHooks({
  load(url, context, nextLoad) {
    if (!url.includes(PERSISTENCE)) return nextLoad(url, context)
    const source = readFileSync(fileURLToPath(url.split('?')[0]), 'utf8')
      .replace('import.meta.env.DEV', 'false')
      .replace(/import\.meta\.glob\([^)]*\)/, 'globalThis.__bundledCharacters')
    return { format: 'module', shortCircuit: true, source }
  },
})

const stored = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: (key) => stored.delete(key),
  },
})

const record = (name) => ({ character: { identity: { name } } })
const bundled = (...names) => Object.fromEntries(names.map((name) => [`/characters/${name}.json`, record(name.toUpperCase())]))
let copy = 0
// A fresh page load: the module runs its seeding again against whatever is in storage.
const load = async (files = {}) => {
  globalThis.__bundledCharacters = files
  return import(`../${PERSISTENCE}?copy=${copy++}`)
}
const ids = (persistence) => persistence.loadSavedCharacters().map((entry) => entry.id)

beforeEach(() => stored.clear())

describe('bundled characters in a static build', () => {
  it('seed the saved list on the first load, in id order, with their names', async () => {
    const persistence = await load(bundled('b', 'a'))
    assert.deepEqual(ids(persistence), ['a', 'b'])
    assert.deepEqual(persistence.loadSavedCharacters().map((entry) => entry.name), ['A', 'B'])
  })

  it('are added once: a removal sticks, and a later bundled character is still added', async () => {
    let persistence = await load(bundled('a', 'b'))
    persistence.removeSavedCharacter('a')
    persistence = await load(bundled('a', 'b'))
    assert.deepEqual(ids(persistence), ['b'])
    persistence = await load(bundled('a', 'b', 'c'))
    assert.deepEqual(ids(persistence), ['b', 'c'])
  })

  it("don't overwrite the player's edit or duplicate a character already saved under that id", async () => {
    let persistence = await load(bundled('a'))
    persistence.putSavedCharacter({ id: 'a', savedAt: 'now', name: 'Edited', record: record('Edited') })
    persistence = await load(bundled('a'))
    assert.deepEqual(persistence.loadSavedCharacters().map((entry) => entry.name), ['Edited'])
    stored.clear()
    persistence = await load()
    persistence.putSavedCharacter({ id: 'x', savedAt: 'now', name: 'Mine', record: record('Mine') })
    persistence = await load(bundled('x'))
    assert.deepEqual(persistence.loadSavedCharacters().map((entry) => entry.name), ['Mine'])
  })
})

describe('the saved-character list', () => {
  it('replaces an entry in place, inserts a copy after its original and removes by id', async () => {
    const persistence = await load()
    for (const id of ['a', 'b', 'c']) persistence.putSavedCharacter({ id, savedAt: 't', name: id, record: record(id) })
    persistence.putSavedCharacter({ id: 'b', savedAt: 't2', name: 'B2', record: record('B2') })
    assert.deepEqual(persistence.loadSavedCharacters().map((entry) => entry.name), ['a', 'B2', 'c'])
    persistence.insertSavedCharacterAfter('a', { id: 'a2', savedAt: 't', name: 'a2', record: record('a2') })
    assert.deepEqual(ids(persistence), ['a', 'a2', 'b', 'c'])
    persistence.removeSavedCharacter('a2')
    assert.deepEqual(ids(persistence), ['a', 'b', 'c'])
  })

  it('is read back by a later load', async () => {
    let persistence = await load()
    persistence.putSavedCharacter({ id: 'a', savedAt: 't', name: 'A', record: record('A') })
    persistence = await load()
    assert.deepEqual(ids(persistence), ['a'])
    assert.equal(persistence.readSavedCharacterData(persistence.loadSavedCharacters()[0]).identity.name, 'A')
  })
})

describe('saves this code cannot read', () => {
  it('discards a saved list or autosave from another version, and malformed entries', async () => {
    stored.set('st-adventures.savedCharacters', JSON.stringify({ version: 99, characters: [{ id: 'a', record: record('A') }] }))
    stored.set('st-adventures.character', JSON.stringify({ version: 1, character: {} }))
    const persistence = await load()
    assert.deepEqual(ids(persistence), [])
    assert.equal(persistence.loadCharacter(), null)
    stored.set('st-adventures.savedCharacters', JSON.stringify({ version: 1, characters: [{ id: 'ok', record: record('Ok') }, { id: 7, record: {} }, { record: {} }, null] }))
    assert.deepEqual(ids(persistence), ['ok'])
  })

  it('treats storage that is not JSON as empty', async () => {
    stored.set('st-adventures.savedCharacters', '{not json')
    stored.set('st-adventures.location', '{not json')
    const persistence = await load()
    assert.deepEqual(ids(persistence), [])
    assert.deepEqual(persistence.loadLocation(), {})
  })

  it('brings an autosave from before a section existed up to the current shape', async () => {
    const persistence = await load()
    persistence.saveCharacter({ identity: { name: 'Old' } })
    const loaded = persistence.loadCharacter()
    assert.equal(loaded.identity.name, 'Old')
    assert.ok('environment' in loaded && 'education' in loaded && 'finishingTouches' in loaded)
  })
})
