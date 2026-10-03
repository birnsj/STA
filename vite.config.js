import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { listCharacters, putCharacter, removeCharacter } from './electron/characterStore.cjs'

const CHARACTERS_FOLDER = fileURLToPath(new URL('./characters', import.meta.url))

// Dev server only: lets the page at localhost save characters as files in ./characters, like the desktop app.
// Netlify and other static builds have no server, so they keep saving in the browser.
function characterFilesEndpoint() {
  return {
    name: 'character-files-endpoint',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__characters', (req, res) => {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            let result = true
            if (req.method === 'GET') result = listCharacters(CHARACTERS_FOLDER)
            if (req.method === 'PUT') result = putCharacter(CHARACTERS_FOLDER, JSON.parse(body))
            if (req.method === 'DELETE') removeCharacter(CHARACTERS_FOLDER, JSON.parse(body).id)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (error) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: String(error.message ?? error) }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), characterFilesEndpoint()],
  // Relative asset paths so the built app also loads from disk inside the Electron .exe.
  base: './',
  server: {
    // Media, PDFs, packaged builds and saved characters aren't app code; watching them crashes the server when another program locks a file.
    watch: { ignored: ['**/music/**', '**/reference/**', '**/extracted-art/**', '**/release/**', '**/dist/**', '**/characters/**'] },
  },
})
