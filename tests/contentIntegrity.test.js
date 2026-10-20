// Authored content must stay internally consistent: every file the editors save (maps/, conversations/, characters/ and
// the authored NPC pool) is read straight from disk, so this catches a dangling id the moment an edit introduces one.
// It checks references and loadability only; it takes no position on design (marker counts, wording, balance).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import authoredPool from '../src/data/adaptation/characters.json'
import { hasAuthoredCharacter } from '../src/character/authoredCharacters.js'
import { normalizeCharacterRecord } from '../src/character/runtimeCharacter.js'
import { parseConversation, validateConversation } from '../src/conversation/conversationFormat.js'
import { parseMapFile, validateMap } from '../src/maps/mapFormat.js'
import { getItemById } from '../src/rules/equipment.js'
import { getTalentById } from '../src/rules/talents.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// [{ id, file, json }] for every .json in a project folder (id = file name without .json, as the editors use it).
function readFolder(folder) {
  const dir = path.join(root, folder)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith('.json'))
    .map((file) => ({ id: file.slice(0, -'.json'.length), file: `${folder}/${file}`, json: JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) }))
}

const maps = readFolder('maps')
const conversations = readFolder('conversations')
const characters = readFolder('characters')
const conversationIds = new Set(conversations.map((entry) => entry.id))

describe('maps', () => {
  it('there are maps to check', () => assert.ok(maps.length > 0))

  for (const { id, file, json } of maps) {
    it(`${file} loads, and every NPC character, object type and hazard type it names exists`, () => {
      const map = parseMapFile(json, id)
      // validateMap words each dangling reference as "unknown ..."; its other warnings are design state, not defects.
      const dangling = validateMap(map, { hasAuthoredCharacter }).filter((warning) => /unknown/i.test(warning))
      assert.deepEqual(dangling, [])
    })

    it(`${file}: every NPC conversation it opens exists in conversations/`, () => {
      const map = parseMapFile(json, id)
      const missing = (map.npcs ?? []).filter((npc) => npc.conversationId && !conversationIds.has(npc.conversationId)).map((npc) => `${npc.id} -> ${npc.conversationId}`)
      assert.deepEqual(missing, [])
    })
  }
})

describe('conversations', () => {
  for (const { id, file, json } of conversations) {
    it(`${file} has no missing links and no unknown actions`, () => {
      const warnings = validateConversation(parseConversation(json, id)).filter((warning) => /missing node|unknown action/i.test(warning))
      assert.deepEqual(warnings, [])
    })
  }
})

describe('saved characters', () => {
  for (const { id, file, json } of characters) {
    it(`${file} reads back as a runtime character`, () => {
      const result = normalizeCharacterRecord(json, { id })
      assert.equal(result.error, undefined)
      assert.ok(result.character)
    })
  }
})

describe('authored NPC pool (characters.json)', () => {
  const entries = authoredPool.characters

  it('ids are unique', () => {
    const ids = entries.map((entry) => entry.id)
    assert.deepEqual(ids.filter((value, index) => ids.indexOf(value) !== index), [])
  })

  it('every equipment item and talent exists in the data', () => {
    const missing = []
    for (const entry of entries) {
      for (const item of entry.final?.equipment ?? []) if (!getItemById(item.itemId)) missing.push(`${entry.id}: item ${item.itemId}`)
      for (const talent of entry.final?.talents ?? []) if (!getTalentById(talent.id)) missing.push(`${entry.id}: talent ${talent.id}`)
    }
    assert.deepEqual(missing, [])
  })

  it('every entry reads back as a runtime character', () => {
    const failed = entries.map((entry) => ({ id: entry.id, error: normalizeCharacterRecord({ ...entry, schemaVersion: null }, { id: entry.id }).error })).filter((entry) => entry.error)
    assert.deepEqual(failed, [])
  })
})
