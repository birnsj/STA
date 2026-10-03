const { contextBridge, ipcRenderer } = require('electron')

// The page sees only these calls (see electron/characterFiles.cjs); it has no other file access.
contextBridge.exposeInMainWorld('characterFiles', {
  list: () => ipcRenderer.sendSync('characters:list'),
  put: (entry) => ipcRenderer.sendSync('characters:put', entry),
  remove: (id) => ipcRenderer.sendSync('characters:remove', id),
  folder: () => ipcRenderer.sendSync('characters:folder'),
})
