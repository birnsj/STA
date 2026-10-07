// Dev map editor: saves a tile's cover or fade flag into the tile catalogue (tiles.json) through the dev server's
// /__tiles endpoint. Built copies bundle the catalogue read-only.
import { getTile } from './mapFormat.js'

export const canEditTiles = import.meta.env.DEV

// flag: 'cover' | 'fade'. Also updates the loaded catalogue entry, so the editor and the game use the new value
// without a reload.
export async function setTileFlag(id, flag, value) {
  const response = await fetch('/__tiles', {
    method: 'PUT',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, [flag]: value }),
  })
  const result = await response.json()
  if (!response.ok || result?.error) throw new Error(result?.error ?? `${response.status} ${response.statusText}`)
  getTile(id)[flag] = value
}
