// Classify sprite paths and attach character-sheet grid metadata from characterSprites.json.
import spriteData from '../data/adaptation/characterSprites.json'
import {
  getSpriteAnimation,
  getSpriteMetrics,
  spriteSheetColumns,
  spriteSheetFile,
  spriteMaskFile,
} from './appearance.js'

// One-anim split pages on disk (not catalogue sheets). Editor preview only — does not change game loading.
// Longest suffix first so -sneak-idle wins over a shorter match.
const SPLIT_PREVIEW_SUFFIXES = [
  { suffix: '-sneak-walk', anim: 'sneakWalk' },
  { suffix: '-sneak-idle', anim: 'sneakIdle' },
  { suffix: '-gethit', anim: 'getHit' },
  { suffix: '-attack', anim: 'attack' },
  { suffix: '-melee', anim: 'melee' },
  { suffix: '-cover', anim: 'cover' },
  { suffix: '-punch', anim: 'punch' },
  { suffix: '-kick', anim: 'kick' },
  { suffix: '-dodge', anim: 'dodge' },
]

const GROUP_LABELS = {
  characters: 'Characters',
  environment: 'Environment',
  effects: 'FX',
  dice: 'Dice',
}

export const SPRITE_TYPE_ORDER = ['characters', 'environment', 'effects', 'dice']

export function spriteGroupLabel(group) {
  return GROUP_LABELS[group] || titleCase(group) || 'Other'
}

function titleCase(value) {
  const text = String(value || '')
  if (!text) return ''
  return text.replace(/[-_]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
}

// First folder under /art/sprites = type; second folder = subgroup (species, biome, …).
// Hazard flipbooks live under environment/hazards on disk but browse with FX (explosions, strips).
export function spritePathParts(path) {
  const after = String(path || '')
    .split('?')[0]
    .replace(/^\/art\/sprites\//, '')
  const parts = after.split('/').filter(Boolean)
  const name = parts[parts.length - 1] || ''
  if (parts[0] === 'environment' && parts[1] === 'hazards') {
    return {
      group: 'effects',
      subgroup: parts[2] === 'character' ? 'character' : 'hazards',
      name,
    }
  }
  const group = parts.length > 1 ? parts[0] : parts[0] ? 'other' : 'other'
  const subgroup = parts.length > 2 ? parts[1] : null
  return { group, subgroup, name }
}

function pixelSize(sheetId) {
  const sheet = spriteData.sheets[sheetId]
  if (!sheet) return null
  const res = sheet.resolution ?? 1
  const columns = spriteSheetColumns(sheetId)
  const rows = spriteData.directions.length
  return {
    width: columns * sheet.frame.width * res,
    height: rows * sheet.frame.height * res,
    columns,
    rows,
    frame: sheet.frame,
    anchor: sheet.anchor,
    resolution: res,
    animations: Object.keys(sheet.animations),
  }
}

// Map every character set sheet/mask URL → catalogue entry.
function buildCharacterIndex() {
  const byPath = new Map()
  for (const set of spriteData.sets) {
    for (const sheetId of Object.keys(spriteData.sheets)) {
      const sheetPath = spriteSheetFile(set, sheetId).split('?')[0]
      byPath.set(sheetPath, {
        kind: 'character',
        setId: set.id,
        sheetId,
        isMask: false,
        grid: pixelSize(sheetId),
        animations: Object.keys(spriteData.sheets[sheetId].animations),
      })
      const maskPath = spriteMaskFile(set, sheetId)?.split('?')[0]
      if (maskPath) {
        byPath.set(maskPath, {
          kind: 'character',
          setId: set.id,
          sheetId,
          isMask: true,
          grid: pixelSize(sheetId),
          animations: Object.keys(spriteData.sheets[sheetId].animations),
        })
      }
    }
  }
  return byPath
}

const characterIndex = buildCharacterIndex()

export function characterSpriteMeta(path) {
  const clean = String(path || '').split('?')[0]
  return characterIndex.get(clean) ?? null
}

// Split pages (*-attack, *-dodge, …) are not always in characterSprites.json yet. If the PNG sits under
// characters/ and matches a known frame×resolution×5-direction layout, use that grid so the editor iso floor
// lines up the same as walk/stand (resolution 4 → 256×512 cells, not 64×32 diamonds).
export function inferCharacterSheetGrid(path, sheetW, sheetH) {
  const clean = String(path || '').split('?')[0]
  if (!clean.includes('/art/sprites/characters/') || !(sheetW > 0) || !(sheetH > 0)) return null
  const rows = spriteData.directions?.length ?? 5
  let best = null
  for (const sheet of Object.values(spriteData.sheets)) {
    const resolution = sheet.resolution ?? 1
    const cellW = sheet.frame.width * resolution
    const cellH = sheet.frame.height * resolution
    if (cellW < 1 || cellH < 1) continue
    if (sheetH !== cellH * rows) continue
    if (sheetW % cellW !== 0) continue
    const columns = sheetW / cellW
    if (columns < 1 || columns > 128) continue
    const score = resolution * 10 + sheet.frame.height
    if (!best || score > best.score) {
      best = {
        score,
        width: sheetW,
        height: sheetH,
        columns,
        rows,
        frame: { ...sheet.frame },
        anchor: { ...sheet.anchor },
        resolution,
        animations: [],
      }
    }
  }
  if (!best) return null
  const { score: _score, ...grid } = best
  return grid
}

export function enrichSpriteEntry(entry) {
  const meta = characterSpriteMeta(entry.path)
  const parts = spritePathParts(entry.path)
  return {
    ...entry,
    // Prefer path classification (hazards → FX) over the raw first-folder group from /__sprites.
    group: parts.group || entry.group,
    subgroup: parts.subgroup ?? entry.subgroup ?? null,
    name: entry.name || parts.name,
    kind: meta ? 'character' : 'raw',
    character: meta,
  }
}

// Character sheet/mask paths from characterSprites.json (production browse when /__sprites is unavailable).
export function knownCharacterSpriteEntries() {
  return [...characterIndex.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((filePath) => {
      const parts = spritePathParts(filePath)
      return enrichSpriteEntry({
        path: filePath,
        group: parts.group === 'other' ? 'characters' : parts.group,
        subgroup: parts.subgroup,
        name: parts.name,
      })
    })
}

function sortTypeKeys(keys) {
  return [...keys].sort((a, b) => {
    const ai = SPRITE_TYPE_ORDER.indexOf(a)
    const bi = SPRITE_TYPE_ORDER.indexOf(b)
    if (ai >= 0 || bi >= 0) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
    return a.localeCompare(b)
  })
}

export function groupSpriteEntries(entries) {
  const groups = new Map()
  for (const entry of entries) {
    const key = entry.group || 'other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  return sortTypeKeys(groups.keys()).map((key) => ({
    id: key,
    label: spriteGroupLabel(key),
    entries: groups.get(key),
  }))
}

// Types → optional subgroups (second folder). Flat types (effects, dice) get one subgroup with id null.
export function categorizeSpriteEntries(entries) {
  return groupSpriteEntries(entries).map((group) => {
    const buckets = new Map()
    for (const entry of group.entries) {
      const key = entry.subgroup || ''
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(entry)
    }
    const subgroupKeys = [...buckets.keys()].sort((a, b) => {
      if (!a) return 1
      if (!b) return -1
      return a.localeCompare(b)
    })
    const subgroups = subgroupKeys.map((key) => ({
      id: key || `${group.id}-root`,
      folder: key || null,
      label: key ? titleCase(key) : group.label,
      entries: buckets.get(key),
    }))
    return {
      ...group,
      count: group.entries.length,
      subgroups,
    }
  })
}

export function filterSpriteEntries(entries, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  if (!q) return entries
  return entries.filter((entry) => entry.path.toLowerCase().includes(q) || entry.name.toLowerCase().includes(q))
}

// Expected pixel size for a character sheet path, or null.
export function expectedSpriteSize(path) {
  return characterSpriteMeta(path)?.grid ?? null
}

export function sheetAnimationNames(sheetId) {
  return Object.keys(getSpriteMetrics().sheets[sheetId]?.animations ?? {})
}

function splitPreviewMatch(path) {
  const clean = String(path || '').split('?')[0]
  if (!clean.includes('/art/sprites/characters/')) return null
  if (/-uniform\.png$/i.test(clean)) return { isMask: true, anim: null }
  const base = clean.split('/').pop()?.replace(/\.png$/i, '') ?? ''
  for (const entry of SPLIT_PREVIEW_SUFFIXES) {
    if (base.endsWith(entry.suffix)) return { isMask: false, anim: entry.anim }
  }
  return null
}

// Anim names the sprite editor can play for this path (catalogue sheet or known split page).
export function listPreviewAnimations(path, character = characterSpriteMeta(path)) {
  if (character?.isMask) return []
  if (character?.sheetId) return sheetAnimationNames(character.sheetId)
  const split = splitPreviewMatch(path)
  if (!split || split.isMask || !split.anim) return []
  return [split.anim]
}

// Timing + frame size for the editor corner preview. Split pages use start 0 and column count from the
// PNG when known, so shrinking a sheet still plays every cell without registering it in characterSprites.
export function resolvePreviewAnimation(path, animName, grid = null, character = characterSpriteMeta(path)) {
  if (!animName) return null
  if (character?.isMask) return null
  if (character?.sheetId) return getSpriteAnimation(animName)

  const split = splitPreviewMatch(path)
  if (!split?.anim || split.anim !== animName) return null
  const source = getSpriteAnimation(animName)
  if (!source) return null
  const walk = spriteData.sheets.walk
  const frameSheet = grid?.frame && grid.resolution
    ? { frame: grid.frame, resolution: grid.resolution, anchor: grid.anchor ?? walk?.anchor }
    : walk
  if (!frameSheet?.frame) return null
  return {
    name: animName,
    sheetId: 'editor-split',
    sheet: frameSheet,
    start: 0,
    frames: grid?.columns > 0 ? grid.columns : source.frames,
    seconds: source.seconds,
    play: source.play,
  }
}
