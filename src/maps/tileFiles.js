// Dev map editor: saves a tile's cover flag into the tile catalogue (tiles.json) through the dev server's /__tiles
// endpoint. Built copies bundle the catalogue read-only.
import { getTile } from './mapFormat.js'

export const canEditTiles = import.meta.env.DEV

// Also updates the loaded catalogue entry, so the editor and combat use the new value without a reload.
export async function setTileCover(id, cover) {
  const response = await fetch('/__tiles', {
    method: 'PUT',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, cover }),
  })
  const result = await response.json()
  if (!response.ok || result?.error) throw new Error(result?.error ?? `${response.status} ${response.statusText}`)
  getTile(id).cover = cover
}
