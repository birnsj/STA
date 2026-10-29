import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import {
  listAuthoredCharacters,
  putAuthoredCharacter,
  removeAuthoredCharacter,
} from './tools/authoredCharacterStore.cjs'
import { listCharacters, putCharacter, removeCharacter } from './tools/characterStore.cjs'
import { listConversations, putConversation, removeConversation } from './tools/conversationStore.cjs'
import { listMaps, putMap, removeMap } from './tools/mapStore.cjs'
import { setStoryTemplates } from './tools/storyStore.cjs'
import { putDeckStyle } from './tools/deckGeneratorStore.cjs'
import { applyEffectsChange } from './tools/effectsStore.cjs'
import { setItemDescription } from './tools/itemStore.cjs'
import { setTileFlag } from './tools/tileStore.cjs'
import { putWallVariantSet } from './tools/wallVariantStore.cjs'
import { listSprites, putSprite } from './tools/spriteStore.cjs'

const MUSIC_FOLDER = fileURLToPath(new URL('./music', import.meta.url))
const CHARACTERS_FOLDER = fileURLToPath(new URL('./characters', import.meta.url))
const MAPS_FOLDER = fileURLToPath(new URL('./maps', import.meta.url))
const CONVERSATIONS_FOLDER = fileURLToPath(new URL('./conversations', import.meta.url))
const TILES_FILE = fileURLToPath(new URL('./src/data/adaptation/maps/tiles.json', import.meta.url))
const ITEMS_FILE = fileURLToPath(new URL('./src/data/adaptation/items.json', import.meta.url))
const EFFECTS_FILE = fileURLToPath(new URL('./src/data/adaptation/maps/tileEffects.json', import.meta.url))
const DECK_GENERATORS_FILE = fileURLToPath(new URL('./src/data/adaptation/maps/deckGenerators.json', import.meta.url))
const WALL_VARIANTS_FILE = fileURLToPath(new URL('./src/data/adaptation/maps/generatedWallVariants.json', import.meta.url))
const MISSION_LOG_FILE = fileURLToPath(new URL('./src/data/adaptation/exploration/missionLog.json', import.meta.url))
const AUTHORED_CHARACTERS_FILE = fileURLToPath(
  new URL('./src/data/adaptation/characters.json', import.meta.url),
)
const EPISODE_ART_FOLDER = fileURLToPath(new URL('./public/art/episodes', import.meta.url))
const SPRITES_FOLDER = fileURLToPath(new URL('./public/art/sprites', import.meta.url))
const EPISODE_CARDS_FILE = fileURLToPath(new URL('./src/data/adaptation/maps/episodeCards.json', import.meta.url))
const catalogueCardIds = () => JSON.parse(readFileSync(EPISODE_CARDS_FILE, 'utf8')).cards.map((card) => card.id)
// Root maps/ only: a '**/maps/**' glob would also stop watching the src/maps source code.
const toSlashes = (file) => file.replace(/\\/g, '/').toLowerCase()
const isInMapsFolder = (file) => toSlashes(file).startsWith(`${toSlashes(MAPS_FOLDER)}/`)
const isInConversationsFolder = (file) => toSlashes(file).startsWith(`${toSlashes(CONVERSATIONS_FOLDER)}/`)

// Dev server only: a JSON endpoint that reads the request body and answers with handlers[method](body).
function jsonEndpoint(name, route, handlers) {
  return {
    name,
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(route, (req, res) => {
        let body = ''
        // Decodes across chunk boundaries, so non-ASCII tile symbols in a map body never split.
        req.setEncoding('utf8')
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const handler = handlers[req.method]
            const result = handler ? handler(body ? JSON.parse(body) : null) : true
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result ?? true))
          } catch (error) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: String(error.message ?? error) }))
          }
        })
      })
    },
  }
}

// Lets the page at localhost save characters as files in ./characters, like the desktop app.
// Netlify and other static builds have no server, so they keep saving in the browser.
const characterFilesEndpoint = () =>
  jsonEndpoint('character-files-endpoint', '/__characters', {
    GET: () => listCharacters(CHARACTERS_FOLDER),
    PUT: (entry) => putCharacter(CHARACTERS_FOLDER, entry),
    DELETE: (body) => removeCharacter(CHARACTERS_FOLDER, body.id),
  })

// The dev map editor saves maps as files in ./maps (named after the map), each with at most one generated thumbnail,
// public/art/episodes/{map id}.png, written, renamed and removed along with its map. Builds bundle the maps folder.
const mapFilesEndpoint = () =>
  jsonEndpoint('map-files-endpoint', '/__maps', {
    GET: () => listMaps(MAPS_FOLDER),
    PUT: (map) => putMap(MAPS_FOLDER, EPISODE_ART_FOLDER, map, catalogueCardIds()),
    DELETE: (body) => removeMap(MAPS_FOLDER, EPISODE_ART_FOLDER, body.id, catalogueCardIds()),
  })

// The dev conversation editor saves conversations as files in ./conversations. Builds bundle the folder.
const conversationFilesEndpoint = () =>
  jsonEndpoint('conversation-files-endpoint', '/__conversations', {
    GET: () => listConversations(CONVERSATIONS_FOLDER),
    PUT: (entry) => putConversation(CONVERSATIONS_FOLDER, entry),
    DELETE: (body) => removeConversation(CONVERSATIONS_FOLDER, body.id),
  })

// A data file the map editor saves into while the page already holds the change: the file change this causes is not
// hot-reloaded, as a reload would throw away an unsaved map. Hand edits still reload.
function quietDataEndpoint(name, route, dataFile, save) {
  let savedAt = 0
  const endpoint = jsonEndpoint(name, route, {
    PUT: (body) => {
      savedAt = Date.now()
      return save(dataFile, body)
    },
  })
  return {
    ...endpoint,
    hotUpdate({ file }) {
      if (toSlashes(file) === toSlashes(dataFile) && Date.now() - savedAt < 2000) return []
    },
  }
}

// The map editor's palette Cover checkboxes save into the tile catalogue.
const tileFilesEndpoint = () => quietDataEndpoint('tile-files-endpoint', '/__tiles', TILES_FILE, setTileFlag)
// Item Description in Properties saves that one string into the item catalogue.
const itemFilesEndpoint = () => quietDataEndpoint('item-files-endpoint', '/__items', ITEMS_FILE, setItemDescription)
// Overlay emissive strength slider in Properties → Selection.
const effectsFilesEndpoint = () => quietDataEndpoint('effects-files-endpoint', '/__effects', EFFECTS_FILE, applyEffectsChange)
// Generator Editor: deck Location tile / hazard styles.
const deckGeneratorsEndpoint = () => quietDataEndpoint('deck-generators-endpoint', '/__deck-generators', DECK_GENERATORS_FILE, putDeckStyle)
// Generator Editor: Generate Map wall fittings (share / panel / tile variants).
const wallVariantsEndpoint = () => quietDataEndpoint('wall-variants-endpoint', '/__wall-variants', WALL_VARIANTS_FILE, putWallVariantSet)
// The map editor's Story Wording saves the outro's story templates into missionLog.json.
const storyEndpoint = () => quietDataEndpoint('story-endpoint', '/__story', MISSION_LOG_FILE, (file, body) => setStoryTemplates(file, body?.story))

// Character Library: CRUD on the authored NPC pool. Quiet hotUpdate so Save doesn't wipe an open map.
const authoredCharactersEndpoint = () => {
  let savedAt = 0
  const endpoint = jsonEndpoint('authored-characters-endpoint', '/__authored-characters', {
    GET: () => listAuthoredCharacters(AUTHORED_CHARACTERS_FILE),
    PUT: (entry) => {
      savedAt = Date.now()
      return putAuthoredCharacter(AUTHORED_CHARACTERS_FILE, entry)
    },
    DELETE: (body) => {
      savedAt = Date.now()
      return removeAuthoredCharacter(AUTHORED_CHARACTERS_FILE, body.id)
    },
  })
  return {
    ...endpoint,
    hotUpdate({ file }) {
      if (toSlashes(file) === toSlashes(AUTHORED_CHARACTERS_FILE) && Date.now() - savedAt < 2000) return []
    },
  }
}

// The soundtrack the map editor can choose from: the MP3s in music/ (file names without ".mp3"). Dev server only; a
// missing folder is an empty list.
const musicListEndpoint = () =>
  jsonEndpoint('music-list-endpoint', '/__music', {
    GET: () =>
      existsSync(MUSIC_FOLDER)
        ? readdirSync(MUSIC_FOLDER)
            .filter((name) => /^[\w.-]+\.mp3$/i.test(name))
            .map((name) => name.slice(0, -'.mp3'.length))
            .sort()
        : [],
  })

// Sprite Sheets editor: list / replace PNGs under public/art/sprites. Quiet hotUpdate so Import does not reload the app.
const spriteFilesEndpoint = () => {
  let savedAt = 0
  const endpoint = jsonEndpoint('sprite-files-endpoint', '/__sprites', {
    GET: () => listSprites(SPRITES_FOLDER),
    PUT: (body) => {
      savedAt = Date.now()
      return putSprite(SPRITES_FOLDER, body)
    },
  })
  return {
    ...endpoint,
    hotUpdate({ file }) {
      if (toSlashes(file).startsWith(`${toSlashes(SPRITES_FOLDER)}/`) && Date.now() - savedAt < 2000) return []
    },
  }
}

// Soundtrack files stay in music/ (gitignored). Dev and preview stream them at /music/; a build copies the mp3s
// into dist/music so the Electron app can fetch the same path. A missing folder leaves the game silent.
function musicFiles() {
  const fileFor = (url) => {
    const name = decodeURIComponent((url ?? '').split('?')[0].slice('/music/'.length))
    if (!url?.startsWith('/music/') || !/^[\w.-]+\.mp3$/i.test(name)) return null
    const file = path.join(MUSIC_FOLDER, name)
    return existsSync(file) ? file : null
  }

  const serve = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const file = fileFor(req.url)
    if (!file) return next()
    const { size } = statSync(file)
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
    let start = 0
    let end = size - 1
    if (req.headers.range) {
      if (!range) {
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${size}`)
        res.end()
        return
      }
      start = range[1] ? Number(range[1]) : 0
      end = range[2] ? Number(range[2]) : size - 1
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || end >= size) {
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${size}`)
        res.end()
        return
      }
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
    }
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Length', end - start + 1)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const stream = createReadStream(file, { start, end })
    stream.on('error', () => res.destroy())
    res.on('close', () => stream.destroy())
    stream.pipe(res)
  }

  return {
    name: 'music-files',
    configureServer(server) {
      server.middlewares.use(serve)
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve)
    },
    closeBundle() {
      if (!existsSync(MUSIC_FOLDER)) return
      const dest = fileURLToPath(new URL('./dist/music', import.meta.url))
      mkdirSync(dest, { recursive: true })
      for (const name of readdirSync(MUSIC_FOLDER)) {
        if (!name.toLowerCase().endsWith('.mp3')) continue
        cpSync(path.join(MUSIC_FOLDER, name), path.join(dest, name))
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    musicFiles(),
    musicListEndpoint(),
    characterFilesEndpoint(),
    mapFilesEndpoint(),
    conversationFilesEndpoint(),
    tileFilesEndpoint(),
    itemFilesEndpoint(),
    effectsFilesEndpoint(),
    deckGeneratorsEndpoint(),
    wallVariantsEndpoint(),
    storyEndpoint(),
    authoredCharactersEndpoint(),
    spriteFilesEndpoint(),
  ],
  // Relative asset paths so the built app also loads from disk inside the Electron .exe.
  base: './',
  server: {
    // Media, PDFs, packaged builds and saved characters/maps aren't app code; watching them crashes the server when another program locks a file.
    watch: {
      ignored: ['**/music/**', '**/reference/**', '**/extracted-art/**', '**/release/**', '**/dist/**', '**/characters/**', isInMapsFolder, isInConversationsFolder],
    },
  },
  // React in its own file: it changes far less often than the app, so a browser keeps it cached between builds.
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }] },
      },
    },
  },
})
