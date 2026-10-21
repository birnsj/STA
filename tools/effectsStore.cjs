const fs = require('fs')
const { writeFileAtomic } = require('./atomicWrite.cjs')

// Dev map editor: writes overlay emissive / light-pool colour & brightness into tileEffects.json (/__effects).

const EMISSIVE_MIN = 0
const EMISSIVE_MAX = 2
const BRIGHT_MIN = 0
const BRIGHT_MAX = 2
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function setAnimationEmissive(file, change) {
  const { id } = change
  const value = Math.round(Number(change.emissive) * 10) / 10
  if (!id || typeof id !== 'string') throw new Error('id is required')
  if (!Number.isFinite(value) || value < EMISSIVE_MIN || value > EMISSIVE_MAX) {
    throw new Error(`emissive must be between ${EMISSIVE_MIN} and ${EMISSIVE_MAX}`)
  }

  const text = fs.readFileSync(file, 'utf8')
  const data = JSON.parse(text)
  const anim = data.animations?.[id]
  if (!anim) throw new Error(`No animation for ${id}`)

  const animKey = `"${id}": {`
  const start = text.indexOf(animKey, text.indexOf('"animations"'))
  if (start < 0) throw new Error(`Could not find animation ${id}`)
  let depth = 0
  let end = -1
  for (let i = start + animKey.length - 1; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) throw new Error(`Could not parse animation ${id}`)

  let block = text.slice(start, end + 1)
  const emissiveRe = /"emissive":\s*[0-9.]+/
  if (value === 1) {
    block = block.replace(/,?\r?\n\s*"emissive":\s*[0-9.]+/, '')
  } else if (emissiveRe.test(block)) {
    block = block.replace(emissiveRe, `"emissive": ${value}`)
  } else if (/"overlay":\s*true/.test(block)) {
    block = block.replace(/("overlay":\s*true)/, `$1,\n      "emissive": ${value}`)
  } else {
    block = block.replace('{', `{\n      "emissive": ${value},`)
  }

  const updated = `${text.slice(0, start)}${block}${text.slice(end + 1)}`
  const check = JSON.parse(updated).animations[id]
  const got = check.emissive ?? 1
  if (Math.abs(got - value) > 0.001) throw new Error(`Could not update emissive for ${id}`)
  writeFileAtomic(file, updated)
  return { id, emissive: value }
}

function setAnimationEmitColour(file, change) {
  const { id } = change
  if (!id || typeof id !== 'string') throw new Error('id is required')
  const colour = change.emitColour
  if (colour != null && colour !== '' && !HEX.test(colour)) throw new Error('emitColour must be #rgb or #rrggbb')

  const text = fs.readFileSync(file, 'utf8')
  const data = JSON.parse(text)
  const anim = data.animations?.[id]
  if (!anim) throw new Error(`No animation for ${id}`)

  const animKey = `"${id}": {`
  const start = text.indexOf(animKey, text.indexOf('"animations"'))
  if (start < 0) throw new Error(`Could not find animation ${id}`)
  let depth = 0
  let end = -1
  for (let i = start + animKey.length - 1; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) throw new Error(`Could not parse animation ${id}`)

  let block = text.slice(start, end + 1)
  const colourRe = /"emitColour":\s*"[^"]*"/
  if (colour == null || colour === '') {
    block = block.replace(/,?\r?\n\s*"emitColour":\s*"[^"]*"/, '')
  } else if (colourRe.test(block)) {
    block = block.replace(colourRe, `"emitColour": "${colour.toLowerCase()}"`)
  } else if (/"overlay":\s*true/.test(block)) {
    block = block.replace(/("overlay":\s*true)/, `$1,\n      "emitColour": "${colour.toLowerCase()}"`)
  } else {
    block = block.replace('{', `{\n      "emitColour": "${colour.toLowerCase()}",`)
  }

  const updated = `${text.slice(0, start)}${block}${text.slice(end + 1)}`
  const check = JSON.parse(updated).animations[id]
  const got = check.emitColour ?? null
  const want = colour == null || colour === '' ? null : colour.toLowerCase()
  if (got !== want) throw new Error(`Could not update emitColour for ${id}`)
  writeFileAtomic(file, updated)
  return { id, emitColour: want }
}

function resolveGlow(entry) {
  if (!entry) return null
  if (typeof entry === 'string') return { colour: entry, brightness: 1 }
  if (entry && typeof entry.colour === 'string') {
    const brightness = Number(entry.brightness)
    return { colour: entry.colour, brightness: Number.isFinite(brightness) ? brightness : 1 }
  }
  return null
}

function setTileGlow(file, change) {
  const { id } = change
  if (!id || typeof id !== 'string') throw new Error('id is required')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  let kind = change.kind
  if (!kind) {
    if (data.wallGlows?.[id] != null) kind = 'wall'
    else if (data.glows?.[id] != null) kind = 'glow'
    else if (data.activeGlows?.[id] != null) kind = 'active'
    else kind = data.animations?.[id]?.overlay ? 'wall' : 'glow'
  }
  const tableName = kind === 'wall' ? 'wallGlows' : kind === 'active' ? 'activeGlows' : 'glows'
  if (!data[tableName]) data[tableName] = {}
  const prev = resolveGlow(data[tableName][id]) || { colour: '#ffffff', brightness: 1 }
  const colour = change.colour != null ? change.colour : prev.colour
  if (!HEX.test(colour)) throw new Error('colour must be #rgb or #rrggbb')
  let brightness = change.brightness != null ? Math.round(Number(change.brightness) * 10) / 10 : prev.brightness
  if (!Number.isFinite(brightness) || brightness < BRIGHT_MIN || brightness > BRIGHT_MAX) {
    throw new Error(`brightness must be between ${BRIGHT_MIN} and ${BRIGHT_MAX}`)
  }
  data[tableName][id] = brightness === 1 ? colour : { colour, brightness }
  writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`)
  return { id, kind, colour, brightness }
}

// change: { id, emissive } | { id, emitColour } | { id, colour?, brightness?, kind? }
function applyEffectsChange(file, change) {
  if (change == null || typeof change !== 'object') throw new Error('body required')
  if ('emissive' in change) return setAnimationEmissive(file, change)
  if ('emitColour' in change) return setAnimationEmitColour(file, change)
  if ('colour' in change || 'brightness' in change) return setTileGlow(file, change)
  throw new Error('Expected emissive, emitColour, or colour / brightness')
}

module.exports = { setAnimationEmissive, setAnimationEmitColour, setTileGlow, applyEffectsChange }
