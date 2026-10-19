// Authored NPC pool store (tools/authoredCharacterStore.cjs) and mutable catalogue reload.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, it } from 'node:test'
import brigFile from '../maps/Deck 10 Brig.json'
import explosionFile from '../maps/Explosion Test.json'
import bundledCharacters from '../src/data/adaptation/characters.json'
import {
  allocateAuthoredCharacterId,
  getAuthoredCatalogueVersion,
  getAuthoredRecord,
  hasAuthoredCharacter,
  listAuthoredCharacters,
  reloadAuthoredCatalogue,
} from '../src/character/authoredCharacters.js'
import { findAuthoredCharacterReferences } from '../src/character/authoredReferences.js'
import {
  buildAuthoredPoolEntry,
  canSaveAuthoredEdit,
  canSaveNewAuthoredCharacter,
  duplicateAuthoredEntry,
} from '../src/character/authoredPool.js'
import { placeNpc } from '../src/maps/mapEdits.js'
import { createBlankMap, validateMap } from '../src/maps/mapFormat.js'
import { SCHEMA_VERSION } from '../src/export/serializeCharacter.js'

const PROJECT_MAP_SOURCES = [
  { id: 'Deck 10 Brig', npcs: brigFile.npcs },
  { id: 'Explosion Test', npcs: explosionFile.npcs },
]
const refs = (id, extras = {}) => findAuthoredCharacterReferences(id, { mapSources: PROJECT_MAP_SOURCES, ...extras })

function restoreBundledCatalogue() {
  reloadAuthoredCatalogue(bundledCharacters)
}

const {
  listAuthoredCharacters: listFromDisk,
  putAuthoredCharacter,
  removeAuthoredCharacter,
  checkId,
} = createRequire(import.meta.url)('../tools/authoredCharacterStore.cjs')

const sampleEntry = (id, name) => ({
  id,
  playtestParty: false,
  character: {
    identity: { name },
    faction: 'starfleet',
    species: { id: 'human', name: 'Human' },
  },
  final: {
    attributes: { control: 9, daring: 9, fitness: 9, insight: 9, presence: 9, reason: 9 },
    disciplines: { command: 1, conn: 1, security: 1, engineering: 1, science: 1, medicine: 1 },
  },
})

let root, file
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'authored-chars-'))
  file = path.join(root, 'characters.json')
  fs.writeFileSync(
    file,
    `${JSON.stringify(
      {
        notes: ['keep me'],
        characters: [sampleEntry('alphaOne', 'Alpha One')],
      },
      null,
      2,
    )}\n`,
  )
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('authoredCharacterStore', () => {
  it('lists, puts, and removes while preserving notes', () => {
    const listed = listFromDisk(file)
    assert.deepEqual(listed.notes, ['keep me'])
    assert.equal(listed.characters.length, 1)

    putAuthoredCharacter(file, sampleEntry('betaTwo', 'Beta Two'))
    const afterPut = listFromDisk(file)
    assert.deepEqual(afterPut.notes, ['keep me'])
    assert.equal(afterPut.characters.length, 2)
    assert.ok(afterPut.characters.some((entry) => entry.id === 'betaTwo'))

    putAuthoredCharacter(file, {
      ...sampleEntry('betaTwo', 'Beta Two Renamed'),
      sourceClassification: 'test',
    })
    const afterEdit = listFromDisk(file)
    assert.equal(afterEdit.characters.length, 2)
    assert.equal(afterEdit.characters.find((entry) => entry.id === 'betaTwo').character.identity.name, 'Beta Two Renamed')
    assert.equal(afterEdit.characters.find((entry) => entry.id === 'betaTwo').sourceClassification, 'test')

    removeAuthoredCharacter(file, 'betaTwo')
    const afterRemove = listFromDisk(file)
    assert.deepEqual(afterRemove.notes, ['keep me'])
    assert.equal(afterRemove.characters.length, 1)
    assert.equal(afterRemove.characters[0].id, 'alphaOne')
  })

  it('rejects invalid ids and unknown deletes', () => {
    assert.throws(() => checkId('bad id'), /Invalid character id/)
    assert.throws(() => putAuthoredCharacter(file, sampleEntry('1bad', 'Nope')), /Invalid character id/)
    assert.throws(() => removeAuthoredCharacter(file, 'missing'), /Unknown character/)
  })
})

describe('authoredCharacters catalogue', () => {
  afterEach(restoreBundledCatalogue)

  it('reloadAuthoredCatalogue updates list and version', () => {
    const before = listAuthoredCharacters().length
    const versionBefore = getAuthoredCatalogueVersion()
    assert.ok(before > 0)
    assert.ok(getAuthoredRecord('stationEngineer'))

    reloadAuthoredCatalogue({
      notes: ['temp'],
      characters: [sampleEntry('tempOnly', 'Temp Only')],
    })
    assert.equal(listAuthoredCharacters().length, 1)
    assert.equal(listAuthoredCharacters()[0].id, 'tempOnly')
    assert.ok(getAuthoredCatalogueVersion() > versionBefore)
    assert.equal(getAuthoredRecord('stationEngineer'), null)
  })

  it('allocateAuthoredCharacterId avoids collisions', () => {
    reloadAuthoredCatalogue({
      notes: [],
      characters: [sampleEntry('weiChen', 'Wei Chen'), sampleEntry('weiChen2', 'Wei Chen 2')],
    })
    assert.equal(allocateAuthoredCharacterId('Wei Chen'), 'weiChen3')
    assert.equal(allocateAuthoredCharacterId('Brand New'), 'brandNew')
    assert.equal(allocateAuthoredCharacterId('Wei Chen', { excludeId: 'weiChen' }), 'weiChen')
  })
})

describe('authored character references', () => {
  it('finds Deck 10, encounters, and npcs.json uses of stationEngineer / klingonWarrior1', () => {
    const engineer = refs('stationEngineer')
    assert.ok(engineer.some((hit) => hit.kind === 'map' && hit.mapId === 'Deck 10 Brig'))
    assert.equal(refs('nobodyAtAll').length, 0)

    const warrior = refs('klingonWarrior1')
    assert.ok(warrior.some((hit) => hit.kind === 'map' && hit.mapId === 'Deck 10 Brig'))
    assert.ok(warrior.some((hit) => hit.kind === 'encounter'))
    assert.ok(warrior.some((hit) => hit.kind === 'npcsJson'))
  })

  it('includes the open map even when the character is only there', () => {
    let map = createBlankMap({ name: 'Scratch', width: 8, height: 8 })
    const placed = placeNpc(map, { x: 2, y: 2 }, 'uniqueScratchHero')
    assert.ok(placed)
    const hits = refs('uniqueScratchHero', { openMap: placed.map, mapSources: [] })
    assert.ok(hits.some((hit) => hit.kind === 'map' && hit.mapId === 'Scratch'))
  })

  it('validateMap warns on unknown characterId when a catalogue check is supplied', () => {
    let map = createBlankMap({ name: 'Warn', width: 8, height: 8 })
    const placed = placeNpc(map, { x: 1, y: 1 }, 'missingCharacterX')
    assert.ok(placed)
    const plain = validateMap(placed.map)
    assert.equal(plain.some((w) => w.includes('unknown character')), false)
    const withCheck = validateMap(placed.map, { hasAuthoredCharacter })
    assert.ok(withCheck.some((w) => w.includes('unknown character') && w.includes('missingCharacterX')))
  })
})

describe('authored pool save helpers', () => {
  afterEach(restoreBundledCatalogue)

  it('allows soft edit-save of a partial Klingon sheet and keeps final attrs', () => {
    const raw = bundledCharacters.characters.find((entry) => entry.id === 'klingonWarrior1')
    assert.ok(raw)
    assert.equal(canSaveNewAuthoredCharacter(raw.character), false)
    assert.equal(canSaveAuthoredEdit(raw.character, raw.final), true)
    const entry = buildAuthoredPoolEntry({
      id: 'klingonWarrior1',
      character: { ...raw.character, identity: { ...raw.character.identity, name: 'Klingon Warrior Renamed' } },
      previousEntry: raw,
    })
    assert.equal(entry.character.identity.name, 'Klingon Warrior Renamed')
    assert.equal(entry.final.attributes.daring, 10)
    assert.equal(entry.sourceClassification.statBlock, 'Klingon Warrior')
  })

  it('duplicate allocates a new id and does not keep playtestParty', () => {
    const raw = bundledCharacters.characters.find((entry) => entry.playtestParty)
    assert.ok(raw)
    const dup = duplicateAuthoredEntry(raw)
    assert.notEqual(dup.id, raw.id)
    assert.equal(dup.playtestParty, false)
    assert.match(dup.character.identity.name, /Copy$/)
  })

  it('player serialize schema version is unchanged', () => {
    assert.equal(SCHEMA_VERSION, '0.12.0')
  })
})
