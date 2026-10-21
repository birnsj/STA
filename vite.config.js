import { readFileSync } from 'node:fs'
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
import { applyEffectsChange } from './tools/effectsStore.cjs'
import { setTileFlag } from './tools/tileStore.cjs'

const CHARACTERS_FOLDER = fileURLToPath(new URL('./characters', import.meta.url))
const MAPS_FOLDER = fileURLToPath(new URL('./maps', import.meta.url))
const CONVERSATIONS_FOLDER = fileURLToPath(new URL('./conversations', import.meta.url))
const TILES_FILE = fileURLToPath(new URL('./src/data/adaptation/maps/tiles.json', import.meta.url))
const EFFECTS_FILE = fileURLToPath(new URL('./src/data/adaptation/maps/tileEffects.json', import.meta.url))
const MISSION_LOG_FILE = fileURLToPath(new URL('./src/data/adaptation/exploration/missionLog.json', import.meta.url))
const AUTHORED_CHARACTERS_FILE = fileURLToPath(
  new URL('./src/data/adaptation/characters.json', import.meta.url),
)
const EPISODE_ART_FOLDER = fileURLToPath(new URL('./public/art/episodes', import.meta.url))
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
// Overlay emissive strength slider in Properties → Selection.
const effectsFilesEndpoint = () => quietDataEndpoint('effects-files-endpoint', '/__effects', EFFECTS_FILE, applyEffectsChange)
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    characterFilesEndpoint(),
    mapFilesEndpoint(),
    conversationFilesEndpoint(),
    tileFilesEndpoint(),
    effectsFilesEndpoint(),
    storyEndpoint(),
    authoredCharactersEndpoint(),
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
