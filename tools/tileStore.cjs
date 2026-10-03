const fs = require('node:fs')

// Edits the tile catalogue (src/data/adaptation/maps/tiles.json) for the dev map editor's palette checkboxes.
// Used only by the dev server endpoint in vite.config.js. The file is hand-formatted (one tile per line, walls spread
// over several), so only the one value is replaced in the text rather than rewriting the whole file.

function setTileCover(file, { id, cover }) {
  if (typeof cover !== 'boolean') throw new Error('cover must be true or false')
  const text = fs.readFileSync(file, 'utf8')
  const tile = JSON.parse(text).tiles.find((other) => other.id === id)
  if (!tile) throw new Error(`No tile with id ${id}`)
  if (typeof tile.cover !== 'boolean') throw new Error(`Tile ${id} has no cover value to change`)

  const idAt = text.indexOf(`"id": ${JSON.stringify(id)}`, text.indexOf('"tiles"'))
  const coverPattern = /"cover":\s*(true|false)/g
  coverPattern.lastIndex = idAt
  const match = coverPattern.exec(text)
  if (idAt < 0 || !match) throw new Error(`Could not find cover for tile ${id}`)
  const updated = `${text.slice(0, match.index)}"cover": ${cover}${text.slice(match.index + match[0].length)}`

  // The value found must belong to this tile; anything else means the file isn't laid out as expected.
  if (JSON.parse(updated).tiles.find((other) => other.id === id).cover !== cover) throw new Error(`Could not update tile ${id}`)
  fs.writeFileSync(file, updated)
  return { id, cover }
}

module.exports = { setTileCover }
