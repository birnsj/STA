import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, it } from 'node:test'

const ADAPTERS = [
  'src/maps/mapFiles.js',
  'src/conversation/conversationFiles.js',
  'src/character/authoredCharacterFiles.js',
  'src/maps/deckGeneratorFiles.js',
  'src/maps/wallVariantFiles.js',
  'src/maps/effectsFiles.js',
  'src/maps/tileFiles.js',
  'src/rules/itemFiles.js',
  'src/exploration/storyFiles.js',
]

registerHooks({
  load(url, context, nextLoad) {
    const adapter = ADAPTERS.find((file) => url.includes(file))
    if (!adapter) return nextLoad(url, context)
    const source = readFileSync(fileURLToPath(url.split('?')[0]), 'utf8')
      .replaceAll('import.meta.env.DEV', 'globalThis.__fileAdapterDev')
      .replace(/import\.meta\.glob\([^)]*\)/g, 'globalThis.__fileAdapterBundled')
    return { format: 'module', shortCircuit: true, source }
  },
})

let copy = 0
const load = async (file, { dev = true, bundled = {} } = {}) => {
  globalThis.__fileAdapterDev = dev
  globalThis.__fileAdapterBundled = bundled
  return import(`../${file}?adapter-test=${copy++}`)
}

const response = (data, { ok = true, status = 200, statusText = 'OK' } = {}) => ({
  ok,
  status,
  statusText,
  json: async () => data,
})

const calls = []
const answerWith = (makeResponse) => {
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return makeResponse(url, options)
  }
}

afterEach(() => {
  calls.length = 0
  delete globalThis.fetch
  delete globalThis.__fileAdapterBundled
  delete globalThis.__fileAdapterDev
})

describe('development-browser JSON file adapters', () => {
  it('keep each endpoint, method, JSON payload and cache option', async () => {
    answerWith((url) => {
      if (url === '/__maps' || url === '/__conversations') return response([])
      if (url === '/__deck-generators') {
        return response({ id: 'starshipDeck', floor: 'floor', wall: 'bulkhead', door: 'doorway', crate: 'crate', machinery: 'machinery', hazard: true })
      }
      if (url === '/__wall-variants') return response({ wallId: 'bulkhead', share: 0.4, panelVariants: ['lcarsPanel'], tileVariants: [] })
      if (url === '/__story') return response({ objectiveActive: 'Changed.' })
      return response({})
    })

    const maps = await load('src/maps/mapFiles.js')
    const conversations = await load('src/conversation/conversationFiles.js')
    const deck = await load('src/maps/deckGeneratorFiles.js')
    const walls = await load('src/maps/wallVariantFiles.js')
    const effects = await load('src/maps/effectsFiles.js')
    const tiles = await load('src/maps/tileFiles.js')
    const items = await load('src/rules/itemFiles.js')
    const story = await load('src/exploration/storyFiles.js')
    const { getItemById } = await import('../src/rules/equipment.js')
    const medkit = getItemById('medkit')
    const medkitDescription = medkit.description

    await maps.listMaps()
    await conversations.deleteConversation('hello')
    await deck.saveDeckGeneratorStyle({ id: 'starshipDeck', wall: 'bulkhead' })
    await walls.saveWallVariantSet({ wallId: 'bulkhead', share: 0.4, panelVariants: ['lcarsPanel'], tileVariants: [] })
    await effects.setOverlayEmissive('lcarsWall', 1.2)
    await tiles.setTileFlag('floor', 'fade', true)
    try {
      await items.setItemDescription('medkit', 'Edited catalogue text.')
      assert.equal(medkit.description, 'Edited catalogue text.')
    } finally {
      medkit.description = medkitDescription
    }
    await story.saveStoryTemplates({ objectiveActive: 'Changed.' })

    assert.deepEqual(
      calls.map(({ url, options }) => ({
        url,
        method: options.method,
        cache: options.cache,
        contentType: options.headers?.['Content-Type'],
        body: options.body && JSON.parse(options.body),
      })),
      [
        { url: '/__maps', method: 'GET', cache: 'no-store', contentType: undefined, body: undefined },
        { url: '/__conversations', method: 'DELETE', cache: 'no-store', contentType: 'application/json', body: { id: 'hello' } },
        {
          url: '/__deck-generators',
          method: 'PUT',
          cache: 'no-store',
          contentType: 'application/json',
          body: { id: 'starshipDeck', floor: 'floor', wall: 'bulkhead', corner: null, door: 'doorway', crate: 'crate', machinery: 'machinery', hazard: true },
        },
        {
          url: '/__wall-variants',
          method: 'PUT',
          cache: 'no-store',
          contentType: 'application/json',
          body: { wallId: 'bulkhead', share: 0.4, panelVariants: ['lcarsPanel'], tileVariants: [] },
        },
        { url: '/__effects', method: 'PUT', cache: 'no-store', contentType: 'application/json', body: { id: 'lcarsWall', emissive: 1.2 } },
        { url: '/__tiles', method: 'PUT', cache: 'no-store', contentType: 'application/json', body: { id: 'floor', fade: true } },
        { url: '/__items', method: 'PUT', cache: 'no-store', contentType: 'application/json', body: { id: 'medkit', description: 'Edited catalogue text.' } },
        { url: '/__story', method: 'PUT', cache: 'no-store', contentType: 'application/json', body: { story: { objectiveActive: 'Changed.' } } },
      ],
    )
  })

  it('prefers a JSON error even on 2xx and otherwise uses HTTP status text', async () => {
    const maps = await load('src/maps/mapFiles.js')
    answerWith(() => response({ error: 'store refused it' }))
    await assert.rejects(maps.listMaps(), new Error('store refused it'))

    const conversations = await load('src/conversation/conversationFiles.js')
    answerWith(() => response({}, { ok: false, status: 503, statusText: 'Unavailable' }))
    await assert.rejects(conversations.listConversations(), new Error('503 Unavailable'))
  })

  it('keeps static-build fallbacks and capability checks without fetching', async () => {
    answerWith(() => {
      throw new Error('fetch should not run')
    })
    const maps = await load('src/maps/mapFiles.js', {
      dev: false,
      bundled: { '/maps/alpha.json': { name: 'Alpha', episodeName: 'Pilot' } },
    })
    assert.equal(maps.canSaveMaps, false)
    assert.deepEqual(await maps.listMaps(), [{ id: 'alpha', name: 'Alpha', episodeName: 'Pilot', card: null, weather: null }])

    const conversations = await load('src/conversation/conversationFiles.js', {
      dev: false,
      bundled: { '/conversations/hello.json': { name: 'Hello', start: 'n1', nodes: [] } },
    })
    assert.equal(conversations.canSaveConversations, false)
    assert.deepEqual(await conversations.listConversations(), [{ id: 'hello', name: 'Hello' }])

    const authored = await load('src/character/authoredCharacterFiles.js', { dev: false })
    assert.equal(authored.canSaveAuthoredCharacters, false)
    assert.ok((await authored.loadAuthoredCatalogueFromDisk()).characters.length > 0)
    await assert.rejects(authored.saveAuthoredCharacterEntry({}), new Error('Saving authored characters needs the Vite DEV server.'))
    await assert.rejects(authored.deleteAuthoredCharacterEntry('x'), new Error('Deleting authored characters needs the Vite DEV server.'))

    const deck = await load('src/maps/deckGeneratorFiles.js', { dev: false })
    assert.equal(deck.canEditDeckGenerators, false)
    assert.equal((await deck.saveDeckGeneratorStyle({ id: 'starshipDeck', hazard: false })).hazard, false)

    const walls = await load('src/maps/wallVariantFiles.js', { dev: false })
    assert.equal(walls.canEditWallVariants, false)
    assert.equal((await walls.saveWallVariantSet({ wallId: 'bulkhead', panelVariants: [], tileVariants: [] })).wallId, 'bulkhead')

    const effects = await load('src/maps/effectsFiles.js', { dev: false })
    assert.equal(effects.canEditEffects, false)
    assert.equal(await effects.setOverlayEmissive('lcarsWall', 1.1), 1.1)
    assert.equal(calls.length, 0)
  })

  it('keeps tile and story capability flags informational', async () => {
    answerWith((url) => response(url === '/__story' ? { objectiveActive: 'Changed.' } : {}))
    const tiles = await load('src/maps/tileFiles.js', { dev: false })
    const items = await load('src/rules/itemFiles.js', { dev: false })
    const story = await load('src/exploration/storyFiles.js', { dev: false })
    assert.equal(tiles.canEditTiles, false)
    assert.equal(items.canEditItems, false)
    assert.equal(story.canEditStory, false)
    await tiles.setTileFlag('floor', 'fade', false)
    await story.saveStoryTemplates({ objectiveActive: 'Changed.' })
    assert.deepEqual(calls.map(({ url }) => url), ['/__tiles', '/__story'])
  })

  it('keeps authored-character HTTP errors and 204 handling distinct', async () => {
    const authored = await load('src/character/authoredCharacterFiles.js')
    answerWith(() => response({ error: 'authored refusal' }, { ok: false, status: 400, statusText: 'Bad Request' }))
    await assert.rejects(authored.loadAuthoredCatalogueFromDisk(), new Error('authored refusal'))
    assert.equal(calls[0].options.cache, undefined)

    answerWith(() => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError('not JSON')
      },
    }))
    await assert.rejects(authored.loadAuthoredCatalogueFromDisk(), new Error('Authored character GET failed (500)'))

    answerWith(() => response(null, { status: 204, statusText: 'No Content' }))
    assert.equal(await authored.loadAuthoredCatalogueFromDisk(), null)
  })
})
