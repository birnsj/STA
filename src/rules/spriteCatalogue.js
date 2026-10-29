// Classify sprite paths and attach character-sheet grid metadata from characterSprites.json.
import spriteData from '../data/adaptation/characterSprites.json'
import { getSpriteMetrics, spriteSheetColumns, spriteSheetFile, spriteMaskFile } from './appearance.js'

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
      const sheetPath = spriteSheetFile(set, sheetId)
      byPath.set(sheetPath, {
        kind: 'character',
        setId: set.id,
        sheetId,
        isMask: false,
        grid: pixelSize(sheetId),
        animations: Object.keys(spriteData.sheets[sheetId].animations),
      })
      const maskPath = spriteMaskFile(set, sheetId)
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
