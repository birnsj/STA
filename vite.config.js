import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { listCharacters, putCharacter, removeCharacter } from './tools/characterStore.cjs'
import { listMaps, putMap, removeMap } from './tools/mapStore.cjs'
import { setTileFlag } from './tools/tileStore.cjs'
import { putEpisodeArt, removeEpisodeArt } from './tools/episodeArtStore.cjs'

const CHARACTERS_FOLDER = fileURLToPath(new URL('./characters', import.meta.url))
const MAPS_FOLDER = fileURLToPath(new URL('./maps', import.meta.url))
const TILES_FILE = fileURLToPath(new URL('./src/data/adaptation/maps/tiles.json', import.meta.url))
const EPISODE_ART_FOLDER = fileURLToPath(new URL('./public/art/episodes', import.meta.url))
const EPISODE_CARDS_FILE = fileURLToPath(new URL('./src/data/adaptation/maps/episodeCards.json', import.meta.url))
const catalogueCardIds = () => JSON.parse(readFileSync(EPISODE_CARDS_FILE, 'utf8')).cards.map((card) => card.id)
// Root maps/ only: a '**/maps/**' glob would also stop watching the src/maps source code.
const toSlashes = (file) => file.replace(/\\/g, '/').toLowerCase()
const isInMapsFolder = (file) => toSlashes(file).startsWith(`${toSlashes(MAPS_FOLDER)}/`)

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

// The dev map editor saves maps as files in ./maps (named after the map); builds bundle that folder.
const mapFilesEndpoint = () =>
  jsonEndpoint('map-files-endpoint', '/__maps', {
    GET: () => listMaps(MAPS_FOLDER),
    PUT: (map) => putMap(MAPS_FOLDER, map),
    DELETE: (body) => removeMap(MAPS_FOLDER, body.id),
  })

// The map editor's Generate Card saves the picture it drew as public/art/episodes/{map id}.png.
const episodeArtEndpoint = () =>
  jsonEndpoint('episode-art-endpoint', '/__episodeArt', {
    PUT: (art) => putEpisodeArt(EPISODE_ART_FOLDER, art, catalogueCardIds()),
    DELETE: (art) => removeEpisodeArt(EPISODE_ART_FOLDER, art, catalogueCardIds()),
  })

// The map editor's palette Cover checkboxes save into the tile catalogue. The page already updated its copy, so the
// file change this causes is not hot-reloaded: a reload would throw away an unsaved map. Hand edits still reload.
function tileFilesEndpoint() {
  let savedAt = 0
  const endpoint = jsonEndpoint('tile-files-endpoint', '/__tiles', {
    PUT: (change) => {
      savedAt = Date.now()
      return setTileFlag(TILES_FILE, change)
    },
  })
  return {
    ...endpoint,
    hotUpdate({ file }) {
      if (toSlashes(file) === toSlashes(TILES_FILE) && Date.now() - savedAt < 2000) return []
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), characterFilesEndpoint(), mapFilesEndpoint(), tileFilesEndpoint(), episodeArtEndpoint()],
  // Relative asset paths so the built app also loads from disk inside the Electron .exe.
  base: './',
  server: {
    // Media, PDFs, packaged builds and saved characters/maps aren't app code; watching them crashes the server when another program locks a file.
    watch: {
      ignored: ['**/music/**', '**/reference/**', '**/extracted-art/**', '**/release/**', '**/dist/**', '**/characters/**', isInMapsFolder],
    },
  },
})
