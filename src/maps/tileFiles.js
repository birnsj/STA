// Dev map editor: saves a tile's cover or fade flag into the tile catalogue (tiles.json) through the dev server's
// /__tiles endpoint. Built copies bundle the catalogue read-only.
import { requestJson } from '../files/jsonHttp.js'
import { getTile } from './mapFormat.js'

export const canEditTiles = import.meta.env.DEV

// flag: 'cover' | 'fade'. Also updates the loaded catalogue entry, so the editor and the game use the new value
// without a reload.
export async function setTileFlag(id, flag, value) {
  await requestJson('/__tiles', 'PUT', { id, [flag]: value })
  getTile(id)[flag] = value
}
