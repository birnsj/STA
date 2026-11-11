// Dev map editor: tile catalogue + palette authoring through /__tiles (DEV only).
import { requestJson } from '../files/jsonHttp.js'
import {
  addTileLocal,
  getTile,
  putPaletteGroupLocal,
  removePaletteGroupLocal,
  removeTileLocal,
  renameSectionLocal,
  renameTileLocal,
  reorderPaletteGroupsLocal,
} from './mapFormat.js'
import { bumpSpriteCache } from './spriteFiles.js'
import { removeTileAnimationLocal } from './tileArt.js'

export const canEditTiles = import.meta.env.DEV

async function putTiles(body) {
  if (!canEditTiles) throw new Error('Editing tiles needs the Vite DEV server.')
  return requestJson('/__tiles', 'PUT', body)
}

function fileToBase64Png(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('Could not read PNG file'))
    reader.readAsDataURL(file)
  })
}

// flag: 'cover' | 'fade'. Also updates the loaded catalogue entry, so the editor and the game use the new value
// without a reload.
export async function setTileFlag(id, flag, value) {
  await putTiles({ id, [flag]: value })
  getTile(id)[flag] = value
}

export async function setTileLayer(id, layer) {
  await putTiles({ id, layer })
  getTile(id).layer = layer
  return layer
}

export async function deleteTile(id) {
  const result = await putTiles({ id, delete: true })
  removeTileLocal(id)
  removeTileAnimationLocal(id)
  return result
}

export async function renameTile(id, label) {
  const result = await putTiles({ op: 'renameTile', id, label })
  renameTileLocal(id, result.label)
  return result
}

export async function createTile(groupId, label) {
  const result = await putTiles({ op: 'createTile', groupId, label })
  addTileLocal(result.tile, groupId)
  return result
}

export async function importTileArt(id, file) {
  const png = await fileToBase64Png(file)
  const result = await putTiles({ op: 'importTileArt', id, png })
  result.cacheVersion = bumpSpriteCache(result.version ?? Date.now())
  result.image = getTile(id)?.image ?? result.image
  return result
}

export async function reorderPaletteGroups(groupIds) {
  const result = await putTiles({ op: 'reorderPaletteGroups', groupIds })
  reorderPaletteGroupsLocal(result.groupIds)
  return result
}

export async function putPaletteGroup({ id, label, section, tiles }) {
  const result = await putTiles({ op: 'putPaletteGroup', id, label, section, tiles })
  putPaletteGroupLocal(result)
  return result
}

export async function deletePaletteGroup(id) {
  const result = await putTiles({ op: 'deletePaletteGroup', id })
  removePaletteGroupLocal(id)
  return result
}

export async function renameSection(from, to) {
  const result = await putTiles({ op: 'renameSection', from, to })
  renameSectionLocal(result.from, result.to)
  return result
}

export async function deleteSection(section) {
  return putTiles({ op: 'deleteSection', section })
}
