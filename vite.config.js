import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built app also loads from disk inside the Electron .exe.
  base: './',
  server: {
    // Media, PDFs and packaged builds aren't app code; watching them crashes the server when another program locks a file.
    watch: { ignored: ['**/music/**', '**/reference/**', '**/release/**', '**/dist/**'] },
  },
})
