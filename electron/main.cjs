const path = require('node:path')
const { app, BrowserWindow, screen } = require('electron')
const { registerCharacterFiles } = require('./characterFiles.cjs')

// Matches DESIGN_RESOLUTION in src/settings/displaySettings.js; the page scales itself to whatever size the window is.
const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1080

// The menu music should start with the app, without waiting for a click as a browser would require.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

function createWindow() {
  // Open at the design resolution, shrunk (keeping 16:9) when the screen's work area is smaller.
  const area = screen.getPrimaryDisplay().workAreaSize
  const fit = Math.min(1, area.width / DESIGN_WIDTH, area.height / DESIGN_HEIGHT)
  const window = new BrowserWindow({
    width: Math.round(DESIGN_WIDTH * fit),
    height: Math.round(DESIGN_HEIGHT * fit),
    useContentSize: true,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  })
  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  registerCharacterFiles()
  createWindow()
})
app.on('window-all-closed', () => app.quit())
