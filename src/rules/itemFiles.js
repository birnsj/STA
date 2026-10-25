// Dev map editor: saves an item's catalogue description into items.json through the dev server's
// /__items endpoint. Built copies bundle the catalogue read-only.
import { requestJson } from '../files/jsonHttp.js'
import { getItemById } from './equipment.js'

export const canEditItems = import.meta.env.DEV

// The editor types into the loaded entry so a playtest sees the text before the file write finishes.
export function setItemDescriptionLocal(id, description) {
  const item = getItemById(id)
  if (item) item.description = description
}

// Also updates the loaded catalogue entry, so the editor and the game use the new text without a reload.
export async function setItemDescription(id, description) {
  await requestJson('/__items', 'PUT', { id, description })
  setItemDescriptionLocal(id, description)
}
