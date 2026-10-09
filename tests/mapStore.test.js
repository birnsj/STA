// Map files and their generated thumbnails kept in step by the dev server's store (tools/mapStore.cjs).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createBlankMap, parseMapFile, serializeMap } from '../src/maps/mapFormat.js'

const { listMaps, putMap, removeMap } = createRequire(import.meta.url)('../tools/mapStore.cjs')

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
// A stand-in picture: the PNG signature plus a marker byte, so tests can tell pictures apart.
const png = (marker) => Buffer.from([...PNG_SIGNATURE, marker]).toString('base64')
const CATALOGUE = ['starshipCorridor']

let root, maps, art
const artFile = (id) => path.join(art, `${id}.png`)
const artMarker = (id) => fs.readFileSync(artFile(id))[8]
const artFiles = () => fs.readdirSync(art).sort()
const record = (name, card = null) => serializeMap({ ...createBlankMap({ name }), card })
const save = (id, card, { previousId = null, picture = null } = {}) => putMap(maps, art, { id, previousId, record: record(id, card), png: picture }, CATALOGUE)

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'map-store-'))
  maps = path.join(root, 'maps')
  art = path.join(root, 'episodes')
  fs.mkdirSync(art)
  fs.writeFileSync(artFile('starshipCorridor'), Buffer.from([...PNG_SIGNATURE, 99]))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('map store', () => {
  it('starts empty, then saves and loads a map', () => {
    assert.deepEqual(listMaps(maps), [])
    save('Deck 4', 'starshipCorridor')
    const [entry] = listMaps(maps)
    assert.equal(entry.id, 'Deck 4')
    assert.equal(parseMapFile(entry.record, entry.id).card, 'starshipCorridor')
  })

  it('writes a drawn picture as the map thumbnail and points the card at it', () => {
    const { record: saved } = save('Deck 4', null, { picture: png(1) })
    assert.match(saved.card, /^\/art\/episodes\/Deck%204\.png\?v=\d+$/)
    assert.equal(artMarker('Deck 4'), 1)
    // Saving again without a new picture keeps the thumbnail and its card.
    const { record: again } = save('Deck 4', saved.card)
    assert.equal(again.card, saved.card)
    assert.equal(artMarker('Deck 4'), 1)
  })

  it('replaces the thumbnail when another picture is drawn, leaving one file per map', () => {
    save('Deck 4', null, { picture: png(1) })
    save('Deck 4', null, { picture: png(2) })
    assert.equal(artMarker('Deck 4'), 2)
    assert.deepEqual(artFiles(), ['Deck 4.png', 'starshipCorridor.png'])
  })

  it('renames the thumbnail with its map and leaves no orphan', () => {
    const { record: saved } = save('Deck 4', null, { picture: png(1) })
    const { record: renamed, maps: list } = save('Sickbay', saved.card, { previousId: 'Deck 4' })
    assert.deepEqual(
      list.map((entry) => entry.id),
      ['Sickbay'],
    )
    assert.match(renamed.card, /^\/art\/episodes\/Sickbay\.png/)
    assert.equal(artMarker('Sickbay'), 1)
    assert.deepEqual(artFiles(), ['Sickbay.png', 'starshipCorridor.png'])
  })

  it('Save As gives the copy its own thumbnail and leaves the original alone', () => {
    const { record: saved } = save('Deck 4', null, { picture: png(1) })
    const { record: copy } = save('Deck 4 Copy', saved.card)
    assert.match(copy.card, /^\/art\/episodes\/Deck%204%20Copy\.png/)
    assert.deepEqual(artFiles(), ['Deck 4 Copy.png', 'Deck 4.png', 'starshipCorridor.png'])
  })

  it('removes the generated thumbnail when the map switches to a catalogue card', () => {
    save('Deck 4', null, { picture: png(1) })
    save('Deck 4', 'starshipCorridor')
    assert.deepEqual(artFiles(), ['starshipCorridor.png'])
  })

  it('deletes a map with its thumbnail, and copes with a missing thumbnail', () => {
    save('Deck 4', null, { picture: png(1) })
    save('Sickbay', 'starshipCorridor')
    assert.deepEqual(
      removeMap(maps, art, 'Deck 4', CATALOGUE).map((entry) => entry.id),
      ['Sickbay'],
    )
    assert.deepEqual(artFiles(), ['starshipCorridor.png'])
    assert.deepEqual(removeMap(maps, art, 'Sickbay', CATALOGUE), [])
    assert.deepEqual(removeMap(maps, art, 'Never Saved', CATALOGUE), [])
  })

  it('a card whose picture is missing saves as no card', () => {
    const { record: saved } = save('Deck 4', '/art/episodes/Gone.png?v=1')
    assert.equal(saved.card, null)
  })

  it('never writes or deletes a catalogue image', () => {
    assert.throws(() => save('starshipCorridor', null, { picture: png(1) }), /catalogue/)
    save('starshipCorridor', 'starshipCorridor')
    removeMap(maps, art, 'starshipCorridor', CATALOGUE)
    assert.equal(artMarker('starshipCorridor'), 99)
  })

  it('refuses a bad picture before writing anything', () => {
    assert.throws(() => save('Deck 4', null, { picture: Buffer.from('not a png').toString('base64') }), /PNG/)
    assert.deepEqual(listMaps(maps), [])
    assert.deepEqual(artFiles(), ['starshipCorridor.png'])
  })
})
