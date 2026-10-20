// The dev server's file stores (tools/*.cjs): what each one writes, refuses and preserves. They save the authored files
// (characters/, conversations/, the authored NPC pool, tiles.json, missionLog.json), so these tests also pin the exact
// bytes written: a change to how files are written must not change what ends up in them.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, it } from 'node:test'

const require = createRequire(import.meta.url)
const { listCharacters, putCharacter, removeCharacter } = require('../tools/characterStore.cjs')
const { listConversations, putConversation, removeConversation } = require('../tools/conversationStore.cjs')
const { listAuthoredCharacters, putAuthoredCharacter, removeAuthoredCharacter } = require('../tools/authoredCharacterStore.cjs')
const { setTileFlag } = require('../tools/tileStore.cjs')
const { setStoryTemplates } = require('../tools/storyStore.cjs')

let root
const at = (...parts) => path.join(root, ...parts)
const text = (...parts) => fs.readFileSync(at(...parts), 'utf8')
const names = (folder) => fs.readdirSync(at(folder)).sort()

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-stores-'))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('character store', () => {
  const record = (name, species = 'Human') => ({ character: { identity: { name }, species: { name: species } }, final: {} })
  const entry = (id, name, species) => ({ id, name, record: record(name, species) })

  it('names a new file after the character and species, and lists it', () => {
    const id = putCharacter(at('characters'), entry('new', 'Aaron Kowalski'))
    assert.equal(id, 'Aaron Kowalski - Human')
    assert.deepEqual(names('characters'), ['Aaron Kowalski - Human.json'])
    assert.deepEqual(listCharacters(at('characters')).map((item) => [item.id, item.name]), [['Aaron Kowalski - Human', 'Aaron Kowalski']])
  })

  it('writes the record as indented JSON with no trailing newline', () => {
    putCharacter(at('characters'), entry('new', 'Aaron Kowalski'))
    assert.equal(text('characters', 'Aaron Kowalski - Human.json'), JSON.stringify(record('Aaron Kowalski'), null, 2))
  })

  it('numbers a second character with the same name and species', () => {
    putCharacter(at('characters'), entry('new', 'Aaron Kowalski'))
    assert.equal(putCharacter(at('characters'), entry('new', 'Aaron Kowalski')), 'Aaron Kowalski - Human (2)')
  })

  it('renames the file when the name changes, and keeps one file', () => {
    putCharacter(at('characters'), entry('new', 'Aaron Kowalski'))
    const id = putCharacter(at('characters'), entry('Aaron Kowalski - Human', 'Aaron Smith'))
    assert.equal(id, 'Aaron Smith - Human')
    assert.deepEqual(names('characters'), ['Aaron Smith - Human.json'])
  })

  it('removes a character, and ignores one that is already gone', () => {
    const id = putCharacter(at('characters'), entry('new', 'Aaron Kowalski'))
    removeCharacter(at('characters'), id)
    removeCharacter(at('characters'), id)
    assert.deepEqual(listCharacters(at('characters')), [])
  })

  it('refuses ids that could leave the folder', () => {
    for (const id of ['', '.', '..', '../escape', 'a/b', 'a\\b', 'con:fig']) {
      assert.throws(() => putCharacter(at('characters'), entry(id, 'X')), /Invalid character id/, JSON.stringify(id))
      assert.throws(() => removeCharacter(at('characters'), id), /Invalid character id/, JSON.stringify(id))
    }
  })

  it('skips a file that is not valid JSON instead of failing the list', () => {
    putCharacter(at('characters'), entry('new', 'Aaron Kowalski'))
    fs.writeFileSync(at('characters', 'broken.json'), '{ not json')
    assert.deepEqual(listCharacters(at('characters')).map((item) => item.id), ['Aaron Kowalski - Human'])
  })
})

describe('conversation store', () => {
  const record = { name: 'Hello', start: 'n1', nodes: [{ id: 'n1', position: [0, 0] }] }

  it('saves conversations/{id}.json as indented JSON with a trailing newline', () => {
    const list = putConversation(at('conversations'), { id: 'hello', record })
    assert.equal(text('conversations', 'hello.json'), `${JSON.stringify(record, null, 2)}\n`)
    assert.deepEqual(list.map((item) => [item.id, item.name]), [['hello', 'Hello']])
  })

  it('removes the old file when a conversation is renamed', () => {
    putConversation(at('conversations'), { id: 'hello', record })
    const list = putConversation(at('conversations'), { id: 'goodbye', previousId: 'hello', record })
    assert.deepEqual(names('conversations'), ['goodbye.json'])
    assert.deepEqual(list.map((item) => item.id), ['goodbye'])
  })

  it('treats a case-only rename as the same file', () => {
    putConversation(at('conversations'), { id: 'hello', record })
    putConversation(at('conversations'), { id: 'Hello', previousId: 'hello', record })
    assert.equal(names('conversations').length, 1)
  })

  it('removes a conversation, and refuses ids that could leave the folder', () => {
    putConversation(at('conversations'), { id: 'hello', record })
    assert.deepEqual(removeConversation(at('conversations'), 'hello'), [])
    assert.throws(() => putConversation(at('conversations'), { id: '../escape', record }), /Invalid/)
    assert.throws(() => removeConversation(at('conversations'), '..'), /Invalid/)
  })

  it('lists nothing when the folder does not exist yet', () => {
    assert.deepEqual(listConversations(at('conversations')), [])
  })
})

describe('authored character store', () => {
  const file = () => at('characters.json')
  const entry = (id, extra = {}) => ({ id, character: { identity: { name: id } }, final: { attributes: {} }, ...extra })
  const start = (data = { notes: ['keep me'], characters: [] }) => fs.writeFileSync(file(), `${JSON.stringify(data, null, 2)}\n`)

  it('adds and replaces entries, keeps the notes, and writes indented JSON with a trailing newline', () => {
    start()
    putAuthoredCharacter(file(), entry('alpha'))
    putAuthoredCharacter(file(), entry('beta', { playtestParty: true }))
    const data = putAuthoredCharacter(file(), entry('alpha', { sourceClassification: { book: 'Core' } }))
    assert.deepEqual(data.characters.map((item) => item.id), ['alpha', 'beta'])
    assert.deepEqual(data.characters[0].sourceClassification, { book: 'Core' })
    assert.equal(data.characters[1].playtestParty, true)
    assert.deepEqual(data.notes, ['keep me'])
    assert.equal(text('characters.json'), `${JSON.stringify(data, null, 2)}\n`)
    assert.deepEqual(listAuthoredCharacters(file()).characters.map((item) => item.id), ['alpha', 'beta'])
  })

  it('removes an entry and refuses an unknown one', () => {
    start({ notes: [], characters: [entry('alpha')] })
    assert.throws(() => removeAuthoredCharacter(file(), 'nobody'), /Unknown character/)
    assert.deepEqual(removeAuthoredCharacter(file(), 'alpha').characters, [])
  })

  it('refuses bad ids and incomplete entries without touching the file', () => {
    start()
    const before = text('characters.json')
    for (const id of ['', '1abc', 'has space', '../x', 'a'.repeat(81)]) assert.throws(() => putAuthoredCharacter(file(), entry(id)), /Invalid character id/, id)
    assert.throws(() => putAuthoredCharacter(file(), { id: 'alpha', character: {} }), /needs character and final/)
    assert.throws(() => putAuthoredCharacter(file(), null), /Missing character entry/)
    assert.equal(text('characters.json'), before)
  })
})

describe('tile store', () => {
  // Hand-formatted like tiles.json: only the one value may change.
  const original = ['{', '  "note": "keep",', '  "tiles": [', '    { "id": "floor", "cover": false, "fade": true },', '    { "id": "crate", "cover": true, "fade": false }', '  ]', '}', ''].join('\n')
  const file = () => at('tiles.json')

  it('changes one flag of one tile and leaves every other byte alone', () => {
    fs.writeFileSync(file(), original)
    assert.deepEqual(setTileFlag(file(), { id: 'crate', cover: false }), { id: 'crate', cover: false })
    assert.equal(text('tiles.json'), original.replace('"id": "crate", "cover": true', '"id": "crate", "cover": false'))
    setTileFlag(file(), { id: 'floor', fade: false })
    assert.equal(JSON.parse(text('tiles.json')).tiles[0].fade, false)
  })

  it('refuses an unknown tile, flag or value', () => {
    fs.writeFileSync(file(), original)
    assert.throws(() => setTileFlag(file(), { id: 'nope', cover: true }), /No tile with id/)
    assert.throws(() => setTileFlag(file(), { id: 'crate', colour: true }), /Only cover or fade/)
    assert.throws(() => setTileFlag(file(), { id: 'crate', cover: 'yes' }), /true or false/)
    assert.equal(text('tiles.json'), original)
  })
})

describe('story store', () => {
  const file = () => at('missionLog.json')
  const start = () => fs.writeFileSync(file(), `${JSON.stringify({ other: 1, story: { intro: 'a', outro: 'b' } }, null, 2)}\n`)

  it('replaces only the templates it is given, trimmed, and keeps the rest of the file', () => {
    start()
    assert.deepEqual(setStoryTemplates(file(), { intro: '  new intro  ' }), { intro: 'new intro', outro: 'b' })
    assert.equal(text('missionLog.json'), `${JSON.stringify({ other: 1, story: { intro: 'new intro', outro: 'b' } }, null, 2)}\n`)
  })

  it('refuses unknown keys, empty text and a missing body without writing', () => {
    start()
    const before = text('missionLog.json')
    assert.throws(() => setStoryTemplates(file(), { surprise: 'x' }), /Unknown story template/)
    assert.throws(() => setStoryTemplates(file(), { intro: '   ' }), /needs some text/)
    assert.throws(() => setStoryTemplates(file(), null), /No story templates/)
    assert.equal(text('missionLog.json'), before)
  })
})
