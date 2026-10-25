const fs = require('fs')
const { writeFileAtomic } = require('./atomicWrite.cjs')

// Dev map editor: changes one item's description in src/data/adaptation/items.json.
// Used only by the dev server endpoint in vite.config.js. The file is pretty-printed and carries sourcebook
// reference and notes beside the player text, so only that one JSON string is replaced — the file is not reserialised.

function readJsonString(text, start) {
  if (text[start] !== '"') throw new Error('Expected a JSON string')
  let i = start + 1
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2
      continue
    }
    if (text[i] === '"') {
      const end = i + 1
      return { end, value: JSON.parse(text.slice(start, end)) }
    }
    i += 1
  }
  throw new Error('Unterminated JSON string')
}

function objectBounds(text, idAt) {
  const open = text.lastIndexOf('{', idAt)
  if (open < 0) throw new Error('Could not find item object')
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    const c = text[i]
    if (c === '"') {
      i = readJsonString(text, i).end - 1
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return { open, close: i + 1 }
    }
  }
  throw new Error('Could not find item object')
}

// The description key on the item itself, not a copy of the word inside another string.
function descriptionSpan(text, open, close) {
  let depth = 0
  let i = open
  while (i < close) {
    const c = text[i]
    if (c === '"') {
      const key = readJsonString(text, i)
      if (depth === 1 && key.value === 'description') {
        let j = key.end
        while (text[j] === ' ' || text[j] === '\n' || text[j] === '\r' || text[j] === '\t') j += 1
        if (text[j] !== ':') throw new Error('description is not a field')
        j += 1
        while (text[j] === ' ' || text[j] === '\n' || text[j] === '\r' || text[j] === '\t') j += 1
        const value = readJsonString(text, j)
        return { start: j, end: value.end, value: value.value }
      }
      i = key.end
      continue
    }
    if (c === '{' || c === '[') depth += 1
    else if (c === '}' || c === ']') depth -= 1
    i += 1
  }
  return null
}

function withoutDescription(item) {
  const { description, ...rest } = item
  return rest
}

// change: { id, description }. description may be an empty string.
function setItemDescription(file, change) {
  if (!change || typeof change.id !== 'string' || !change.id) throw new Error('Missing item id')
  if (!('description' in change)) throw new Error('description must be a string')
  const { id, description } = change
  if (typeof description !== 'string') throw new Error('description must be a string')

  const text = fs.readFileSync(file, 'utf8')
  const data = JSON.parse(text)
  const item = data.items?.find((other) => other.id === id)
  if (!item) throw new Error(`No item with id ${id}`)
  if (typeof item.description !== 'string') throw new Error(`Item ${id} has no description to change`)

  const itemsAt = text.indexOf('"items"')
  // Pretty-printed entries have a space after the colon; the compact calibration lines do not.
  const idPattern = new RegExp(`"id"\\s*:\\s*${JSON.stringify(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')
  idPattern.lastIndex = itemsAt < 0 ? 0 : itemsAt
  const idMatch = idPattern.exec(text)
  const idAt = idMatch ? idMatch.index : -1
  if (idAt < 0) throw new Error(`Could not find item ${id}`)
  const { open, close } = objectBounds(text, idAt)
  const span = descriptionSpan(text, open, close)
  if (!span || span.value !== item.description) throw new Error(`Could not find description for item ${id}`)

  const replacement = JSON.stringify(description)
  if (text.slice(span.start, span.end) === replacement) return { id, description }
  const updated = `${text.slice(0, span.start)}${replacement}${text.slice(span.end)}`

  const written = JSON.parse(updated)
  const next = written.items.find((other) => other.id === id)
  if (!next || next.description !== description) throw new Error(`Could not update item ${id}`)
  if (JSON.stringify(withoutDescription(next)) !== JSON.stringify(withoutDescription(item))) {
    throw new Error(`Could not update item ${id} without changing its other fields`)
  }
  const othersHeld = data.items.every((other) => {
    if (other.id === id) return true
    const found = written.items.find((candidate) => candidate.id === other.id)
    return JSON.stringify(found) === JSON.stringify(other)
  })
  if (!othersHeld) throw new Error(`Could not update item ${id} without changing other items`)

  writeFileAtomic(file, updated)
  return { id, description }
}

module.exports = { setItemDescription }
