const fs = require('node:fs')
const path = require('node:path')

// Map files for the dev map editor: one maps/{id}.json per map, where the id (file name) is the map's name, and at most
// one generated episode thumbnail per map, public/art/episodes/{id}.png. Saving, renaming and deleting a map keep the
// two in step here, so no other code writes or removes thumbnails. Catalogue card art (episodeCards.json) lives in the
// same folder; its file names are passed in as `reserved` and are never written or removed.
// Used only by the dev server endpoint in vite.config.js; builds bundle the maps folder instead.

// Windows forbids these characters (and control characters) in file names; anything that could leave the folder is refused.
const FORBIDDEN = new Set('<>:"/\\|?*')
function checkId(id) {
  const valid =
    typeof id === 'string' &&
    id.trim() === id &&
    id !== '' &&
    id.length <= 60 &&
    !id.endsWith('.') &&
    [...id].every((char) => !FORBIDDEN.has(char) && char.charCodeAt(0) >= 32)
  if (!valid) throw new Error(`Invalid map name: ${id}`)
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const MAX_PNG_BYTES = 2 * 1024 * 1024

const fileFor = (folder, id) => path.join(folder, `${id}.json`)
const artFor = (artFolder, id) => path.join(artFolder, `${id}.png`)
const sameId = (a, b) => a.toLowerCase() === b.toLowerCase()
const isReserved = (id, reserved) => reserved.some((other) => sameId(other, id))
// The version makes the browser show a replaced picture instead of its cached copy.
const cardFor = (id) => `/art/episodes/${encodeURIComponent(id)}.png?v=${Date.now()}`

// The file name (without .png) of the generated thumbnail a map's card points at, or null (a catalogue card id, none,
// or a name that could leave the folder).
function drawnArtId(card) {
  const match = typeof card === 'string' && /^\/art\/episodes\/([^/?]+)\.png/.exec(card)
  if (!match) return null
  try {
    const id = decodeURIComponent(match[1])
    checkId(id)
    return id
  } catch {
    return null
  }
}

function decodePng(base64) {
  const bytes = Buffer.from(String(base64 ?? ''), 'base64')
  if (bytes.length > MAX_PNG_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG picture')
  return bytes
}

function removeArt(artFolder, id, reserved) {
  if (!isReserved(id, reserved)) fs.rmSync(artFor(artFolder, id), { force: true })
}

function readRecord(folder, id) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(folder, id), 'utf8'))
  } catch {
    return null
  }
}

// [{ id, name, record }], sorted by name.
function listMaps(folder) {
  if (!fs.existsSync(folder)) return []
  return fs
    .readdirSync(folder)
    .filter((file) => file.toLowerCase().endsWith('.json'))
    .map((file) => {
      const id = file.slice(0, -'.json'.length)
      const record = readRecord(folder, id)
      return record && { id, name: record.name || id, record }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// The thumbnail the saved map should have: { bytes } to write as {id}.png, { keep: true } when {id}.png already holds
// it, or null for none (a catalogue card, no card, or a generated card whose picture is missing).
// png: a picture Generate Card drew since the last save (base64). Otherwise a card pointing at another map's picture
// (Save As, or the file this map is being renamed from) is copied, so every map owns its own file.
function thumbnailFor(artFolder, id, card, png) {
  if (png) return { bytes: decodePng(png) }
  const source = drawnArtId(card)
  if (!source || !fs.existsSync(artFor(artFolder, source))) return null
  return sameId(source, id) ? { keep: true } : { bytes: fs.readFileSync(artFor(artFolder, source)) }
}

// Writes maps/{id}.json and its thumbnail. previousId: the file this map was opened from; when the name changed, that
// file and its thumbnail are removed after the new ones are written, so renaming leaves no copy or orphan behind.
// Everything is checked before anything is written. Returns the updated list and the record as saved (its card
// pointing at the map's own thumbnail).
function putMap(folder, artFolder, { id, previousId = null, record, png = null }, reserved = []) {
  checkId(id)
  if (previousId) checkId(previousId)
  const renamed = Boolean(previousId) && !sameId(previousId, id)
  const thumbnail = thumbnailFor(artFolder, id, record.card, png)
  if (thumbnail && isReserved(id, reserved)) throw new Error(`${id} is a catalogue card's name; give the map another name`)
  const card = !thumbnail ? (drawnArtId(record.card) ? null : (record.card ?? null)) : thumbnail.keep ? record.card : cardFor(id)
  const saved = { ...record, card }

  fs.mkdirSync(folder, { recursive: true })
  const artPath = artFor(artFolder, id)
  const hadArt = fs.existsSync(artPath)
  if (thumbnail?.bytes) {
    fs.mkdirSync(artFolder, { recursive: true })
    fs.writeFileSync(artPath, thumbnail.bytes)
  }
  try {
    fs.writeFileSync(fileFor(folder, id), `${JSON.stringify(saved, null, 2)}\n`)
  } catch (error) {
    // A picture written for a map file that doesn't exist would be an orphan.
    if (thumbnail?.bytes && !hadArt) fs.rmSync(artPath, { force: true })
    throw error
  }

  if (!thumbnail) removeArt(artFolder, id, reserved)
  if (renamed) {
    fs.rmSync(fileFor(folder, previousId), { force: true })
    removeArt(artFolder, previousId, reserved)
  }
  return { maps: listMaps(folder), record: saved }
}

// Removes maps/{id}.json and its generated thumbnail (a missing thumbnail is fine). A card pointing at a picture under
// another name (saved before thumbnails followed the map's name) is removed too, unless another map still uses it.
function removeMap(folder, artFolder, id, reserved = []) {
  checkId(id)
  const legacyArt = drawnArtId(readRecord(folder, id)?.card)
  fs.rmSync(fileFor(folder, id), { force: true })
  removeArt(artFolder, id, reserved)
  const maps = listMaps(folder)
  if (legacyArt && !sameId(legacyArt, id) && !maps.some((entry) => drawnArtId(entry.record.card) === legacyArt)) {
    removeArt(artFolder, legacyArt, reserved)
  }
  return maps
}

module.exports = { checkId, listMaps, putMap, removeMap }
