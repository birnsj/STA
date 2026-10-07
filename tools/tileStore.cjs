const fs = require('fs')

// Dev map editor: changes one tile's cover or fade flag in src/data/adaptation/maps/tiles.json.
// Used only by the dev server endpoint in vite.config.js. The file is hand-formatted (one tile per line, walls spread
// over several), so only the one value is replaced in the text rather than rewriting the whole file.
const FLAGS = ['cover', 'fade']

// change: { id, cover } or { id, fade }.
function setTileFlag(file, change) {
  const flag = FLAGS.find((name) => name in change)
  if (!flag) throw new Error(`Only ${FLAGS.join(' or ')} can be changed`)
  const value = change[flag]
  const { id } = change
  if (typeof value !== 'boolean') throw new Error(`${flag} must be true or false`)
  const text = fs.readFileSync(file, 'utf8')
  const tile = JSON.parse(text).tiles.find((other) => other.id === id)
  if (!tile) throw new Error(`No tile with id ${id}`)
  if (typeof tile[flag] !== 'boolean') throw new Error(`Tile ${id} has no ${flag} value to change`)

  const idAt = text.indexOf(`"id": ${JSON.stringify(id)}`, text.indexOf('"tiles"'))
  const pattern = new RegExp(`"${flag}":\\s*(true|false)`, 'g')
  pattern.lastIndex = idAt
  const match = pattern.exec(text)
  if (idAt < 0 || !match) throw new Error(`Could not find ${flag} for tile ${id}`)
  const updated = `${text.slice(0, match.index)}"${flag}": ${value}${text.slice(match.index + match[0].length)}`

  // The value found must belong to this tile; anything else means the file isn't laid out as expected.
  if (JSON.parse(updated).tiles.find((other) => other.id === id)[flag] !== value) throw new Error(`Could not update tile ${id}`)
  fs.writeFileSync(file, updated)
  return { id, [flag]: value }
}

module.exports = { setTileFlag }
