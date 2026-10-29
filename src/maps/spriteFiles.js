// Sprite PNGs under public/art/sprites for the map editor Sprite Sheets screen.
// Dev lists and replaces files through /__sprites; built apps can only fetch the static PNGs.
import { requestJson } from '../files/jsonHttp.js'

export const canEditSprites = import.meta.env.DEV

let cacheVersion = Date.now()

export function spriteCacheVersion() {
  return cacheVersion
}

export function bumpSpriteCache(version = Date.now()) {
  cacheVersion = version
  return cacheVersion
}

// Append ?v= so the browser and Pixi drop a replaced PNG.
export function spriteUrl(path, version = cacheVersion) {
  if (!path) return ''
  const base = String(path).split('?')[0]
  return `${base}?v=${version}`
}

const callEndpoint = (method, body) => requestJson('/__sprites', method, body)

// [{ path, group, name }]. DEV: every PNG under public/art/sprites. Built apps: character sheets from JSON only.
export async function listSpriteFiles() {
  if (!import.meta.env.DEV) {
    const { knownCharacterSpriteEntries } = await import('../rules/spriteCatalogue.js')
    return knownCharacterSpriteEntries().map(({ path, group, name }) => ({ path, group, name }))
  }
  return callEndpoint('GET')
}

export async function importSprite(path, file) {
  if (!canEditSprites) throw new Error('Sprite import is only available in the development build.')
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  const png = btoa(binary)
  const result = await callEndpoint('PUT', { path, png })
  bumpSpriteCache(result.version ?? Date.now())
  return result
}

export async function downloadSprite(path) {
  const response = await fetch(spriteUrl(path), { cache: 'no-store' })
  if (!response.ok) throw new Error(`Could not download ${path}`)
  const blob = await response.blob()
  const name = path.slice(path.lastIndexOf('/') + 1) || 'sprite.png'
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = name
  link.click()
  URL.revokeObjectURL(href)
}
