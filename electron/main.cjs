const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { app, BrowserWindow, net, protocol, screen } = require('electron')
const { registerCharacterFiles } = require('./characterFiles.cjs')

// The built app is served from app://bundle/ rather than opened as a file: the data refers to art by root paths
// (/art/sprites/...), which on file:// would point at the root of the drive instead of the app's dist folder.
const SCHEME = 'app'
const DIST = path.join(__dirname, '..', 'dist')
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

function serveDist() {
  protocol.handle(SCHEME, (request) => {
    const file = path.normalize(path.join(DIST, decodeURIComponent(new URL(request.url).pathname)))
    if (!file.startsWith(DIST + path.sep)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

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
  window.loadURL(`${SCHEME}://bundle/index.html`)
}

app.whenReady().then(() => {
  serveDist()
  registerCharacterFiles()
  createWindow()
})
app.on('window-all-closed', () => app.quit())
