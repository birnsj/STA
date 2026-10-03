const fs = require('node:fs')
const path = require('node:path')
const { checkId } = require('./mapStore.cjs')

// Generate Card's pictures: public/art/episodes/{map id}.png, overwritten each time the map's card is generated.
// Used only by the dev server endpoint in vite.config.js.

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const MAX_BYTES = 2 * 1024 * 1024

// reserved: catalogue card ids (episodeCards.json), whose placeholder art lives in the same folder and must not be replaced.
function putEpisodeArt(folder, { id, png }, reserved = []) {
  checkId(id)
  if (reserved.some((other) => other.toLowerCase() === id.toLowerCase())) throw new Error(`${id} is a catalogue card's art; rename the map first`)
  const bytes = Buffer.from(String(png ?? ''), 'base64')
  if (bytes.length > MAX_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG picture')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${id}.png`), bytes)
  return { id }
}

function removeEpisodeArt(folder, { id }, reserved = []) {
  checkId(id)
  if (reserved.some((other) => other.toLowerCase() === id.toLowerCase())) throw new Error(`${id} is a catalogue card's art`)
  fs.rmSync(path.join(folder, `${id}.png`), { force: true })
  return { id }
}

module.exports = { putEpisodeArt, removeEpisodeArt }
