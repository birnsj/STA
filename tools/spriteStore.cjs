const fs = require('node:fs')
const path = require('node:path')
const { writeFileAtomic } = require('./atomicWrite.cjs')

// Sprite PNGs under public/art/sprites for the map editor's Sprite Sheets screen. Dev server only
// (vite.config.js /__sprites). List every .png; replace one file after path checks.

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
// Character fall sheets are large; allow up to 16 MiB so real art can replace placeholders.
const MAX_PNG_BYTES = 16 * 1024 * 1024
const ROOT_URL = '/art/sprites'

function toSlashes(file) {
  return String(file).replace(/\\/g, '/')
}

function decodePng(base64) {
  const bytes = Buffer.from(String(base64 ?? ''), 'base64')
  if (bytes.length > MAX_PNG_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG picture')
  return bytes
}

// Public URL path → absolute file under spritesRoot, or throws.
function resolveSpritePath(spritesRoot, urlPath) {
  if (typeof urlPath !== 'string' || !urlPath.startsWith(`${ROOT_URL}/`)) {
    throw new Error(`Sprite path must start with ${ROOT_URL}/`)
  }
  const relative = decodeURIComponent(urlPath.slice(ROOT_URL.length + 1))
  if (!relative || relative.includes('\0') || path.isAbsolute(relative)) throw new Error('Invalid sprite path')
  const parts = relative.split(/[/\\]+/).filter(Boolean)
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) throw new Error('Invalid sprite path')
  if (!parts[parts.length - 1].toLowerCase().endsWith('.png')) throw new Error('Only PNG sprite sheets can be written')
  const absolute = path.resolve(spritesRoot, ...parts)
  const rootResolved = path.resolve(spritesRoot)
  const prefix = rootResolved.endsWith(path.sep) ? rootResolved : `${rootResolved}${path.sep}`
  if (absolute !== rootResolved && !absolute.startsWith(prefix)) throw new Error('Sprite path left the sprites folder')
  return absolute
}

function walkPngs(dir, root, out) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkPngs(full, root, out)
      continue
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.png')) continue
    const rel = toSlashes(path.relative(root, full))
    out.push(`${ROOT_URL}/${rel}`)
  }
}

// [{ path, group, name }] sorted by path. group is the first folder under sprites (characters, environment, …).
function listSprites(spritesRoot) {
  const paths = []
  walkPngs(spritesRoot, spritesRoot, paths)
  paths.sort((a, b) => a.localeCompare(b))
  return paths.map((filePath) => {
    const after = filePath.slice(ROOT_URL.length + 1)
    const slash = after.indexOf('/')
    const group = slash < 0 ? 'other' : after.slice(0, slash)
    const name = after.slice(after.lastIndexOf('/') + 1)
    return { path: filePath, group, name }
  })
}

// Replaces an existing sprite PNG (or creates the file if the directory already exists). Returns { path, version }.
function putSprite(spritesRoot, { path: urlPath, png }) {
  const absolute = resolveSpritePath(spritesRoot, urlPath)
  const bytes = decodePng(png)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileAtomic(absolute, bytes)
  return { path: urlPath, version: Date.now() }
}

module.exports = { listSprites, putSprite, ROOT_URL }
