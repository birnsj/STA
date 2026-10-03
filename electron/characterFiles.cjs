const path = require('node:path')
const { app, ipcMain } = require('electron')
const { listCharacters, putCharacter, removeCharacter } = require('./characterStore.cjs')

// The portable .exe runs from a temporary unpack folder, so its real location comes from PORTABLE_EXECUTABLE_DIR.
const gameFolder = () => {
  if (!app.isPackaged) return app.getAppPath()
  return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'))
}

const charactersFolder = () => path.join(gameFolder(), 'characters')

// Synchronous so the page's saved-character calls keep their simple, synchronous shape (files are small).
function registerCharacterFiles() {
  ipcMain.on('characters:list', (event) => {
    event.returnValue = listCharacters(charactersFolder())
  })
  ipcMain.on('characters:put', (event, entry) => {
    event.returnValue = putCharacter(charactersFolder(), entry)
  })
  ipcMain.on('characters:remove', (event, id) => {
    removeCharacter(charactersFolder(), id)
    event.returnValue = true
  })
  ipcMain.on('characters:folder', (event) => {
    event.returnValue = charactersFolder()
  })
}

module.exports = { registerCharacterFiles }
