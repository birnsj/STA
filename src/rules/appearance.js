// Prototype presentation rules (not book mechanics): gender and portraits. Neither affects any score or trait.
import genderData from '../data/adaptation/genders.json'
import portraitData from '../data/adaptation/portraits.json'
import npcPortraitData from '../data/adaptation/npcPortraits.json'
import backdropData from '../data/adaptation/portraitBackdrops.json'
import spriteData from '../data/adaptation/characterSprites.json'
import { isInside, tileAt, tileKey } from '../combat/battleMap.js'
import { project } from '../maps/iso.js'
import { getTile } from '../maps/mapFormat.js'
import { getOwnSpeciesIds, getSpeciesById, isMixedHeritage, isNewSpecies } from './species.js'
import { getDivisionColour } from './uniform.js'

export const getGenders = () => genderData.genders
export const getGenderById = (genderId) => genderData.genders.find((gender) => gender.id === genderId) ?? null

export function setGender(identity, genderId) {
  const gender = getGenderById(genderId)
  return gender ? { ...identity, gender: { id: gender.id, name: gender.name } } : identity
}

// A composited portrait with no legacy image uses its characterImage as `image`, so every screen still has one path to show.
const portraits = portraitData.portraits.map((portrait) =>
  portrait.image || !portrait.characterImage ? portrait : { ...portrait, image: portrait.characterImage },
)

export const getPortraitById = (portraitId) => portraits.find((portrait) => portrait.id === portraitId) ?? null
// Authored NPCs' portraits (npcPortraits.json), never offered in the creator.
export const getNpcPortraitById = (portraitId) => npcPortraitData.portraits.find((portrait) => portrait.id === portraitId) ?? null

// Head and shoulders: the transparent character, then the optional uniform overlay (tinted later). The backdrop behind
// them is the character's own choice (identity.backdrop), added by the compositor. A character with a uniformMask has
// its shirt recoloured in place; baseColour is the division colour the art already wears, which needs no change.
function headLayers({ characterImage, uniformImage, uniformMask, uniformDivision }) {
  if (!characterImage) return null
  const character = uniformMask
    ? { role: 'character', src: characterImage, mask: uniformMask, baseColour: getDivisionColour(uniformDivision) }
    : { role: 'character', src: characterImage }
  return [character, uniformImage && { role: 'uniform', src: uniformImage }].filter(Boolean)
}

// A portrait picture's layers ([{ role, src }], bottom to top), looked up by the path the screens already show
// (`image` or `fullBody`), so each of them gets the composited version. Null for a single-image picture. NPC portraits
// are transparent characters too, so they take a backdrop.
const layersBySrc = new Map(
  [
    ...portraits.flatMap((portrait) => [
      [portrait.image, headLayers(portrait)],
      [portrait.fullBody, portrait.fullBodyLayers],
    ]),
    ...npcPortraitData.portraits.map((portrait) => [portrait.image, [{ role: 'character', src: portrait.image }]]),
  ].filter(([src, layers]) => src && layers?.length),
)
export const getPortraitLayers = (src) => layersBySrc.get(src) ?? null

// Portrait backdrops (portraitBackdrops.json). identity.backdrop is the player's own pick { id, name }, or null to follow
// the character's department; an id no longer listed also follows the department.
export const getBackdrops = () => backdropData.backdrops
export const getBackdropById = (backdropId) => backdropData.backdrops.find((backdrop) => backdrop.id === backdropId) ?? null
export const getDepartmentBackdrop = (departmentId) => getBackdropById(backdropData.byDepartment[departmentId] ?? backdropData.noDepartment)
export const followsDepartment = (identity) => !getBackdropById(identity?.backdrop?.id)
// NPC backdrops (npcPortraits.json) are never offered in the creator; an NPC shown with one keeps it.
export const getNpcBackdropById = (backdropId) => npcPortraitData.backdrops.find((backdrop) => backdrop.id === backdropId) ?? null
export const getCharacterBackdrop = (identity, departmentId = null) =>
  getBackdropById(identity?.backdrop?.id) ?? getNpcBackdropById(identity?.backdrop?.id) ?? getDepartmentBackdrop(departmentId)

// Picking the department's own backdrop goes back to following the department, so a later department change still
// moves it.
export function selectBackdrop(identity, backdropId, departmentId = null) {
  const backdrop = getBackdropById(backdropId)
  if (!backdrop) return identity
  if (backdrop.id === getDepartmentBackdrop(departmentId).id) return { ...identity, backdrop: null }
  return { ...identity, backdrop: { id: backdrop.id, name: backdrop.name } }
}

// Map figures (characterSprites.json): the full-body sprite set for a portrait, or null (the map keeps the portrait
// token). A portrait's own spriteSet wins, then its species and gender (portraits.json or npcPortraits.json); other
// portraits are named in portraitSets.
export const getSpriteMetrics = () => spriteData
export const getIdleFidgets = () => spriteData.idleFidgets
export const getSpriteSetById = (setId) => spriteData.sets.find((set) => set.id === setId) ?? null
export const hasCharacterSprite = (setId) => Boolean(getSpriteSetById(setId))
// After a blast fall, how long they stay on the ground before getUp (characterSprites.json).
export const blastDownHoldMs = () => Math.round((spriteData.blastDownHoldSeconds ?? 0.75) * 1000)
export const getUpAnimation = () => spriteData.getUp ?? 'getUp'
export function getSpriteSet(portraitId) {
  if (!portraitId) return null
  const portrait = getPortraitById(portraitId) ?? getNpcPortraitById(portraitId)
  if (!portrait) return getSpriteSetById(spriteData.portraitSets[portraitId])
  if (portrait.spriteSet) return getSpriteSetById(portrait.spriteSet)
  return spriteData.sets.find((set) => set.species === portrait.species && set.gender === portrait.gender) ?? null
}

// A set's PNG for one of characterSprites.json's sheets: the base sheet path with the sheet's suffix (and its uniform
// mask beside it, or null when the set has none).
const withSuffix = (file, suffix) => file.replace(/(-uniform)?\.png$/, `${suffix}$1.png`)
export const spriteSheetFile = (set, sheetId) => withSuffix(set.sheet, spriteData.sheets[sheetId].suffix)
export const spriteMaskFile = (set, sheetId) => (set.uniformMask ? withSuffix(set.uniformMask, spriteData.sheets[sheetId].suffix) : null)

// An animation by name with the sheet that draws it: { name, sheetId, sheet, start, frames, seconds, play }, or null.
export function getSpriteAnimation(name) {
  for (const [sheetId, sheet] of Object.entries(spriteData.sheets)) {
    if (sheet.animations[name]) return { name, sheetId, sheet, ...sheet.animations[name] }
  }
  return null
}

// Columns in one of the sheets (its animations end to end).
export const spriteSheetColumns = (sheetId) => Math.max(...Object.values(spriteData.sheets[sheetId].animations).map((animation) => animation.start + animation.frames))

function hashOf(seed) {
  let h = 0
  for (const character of String(seed)) h = (Math.imul(h, 31) + character.charCodeAt(0)) | 0
  return h >>> 0
}

// The Injury (or Minor NPC defeatedBy) that put this character down, if any.
function defeatingInjury(condition) {
  if (condition?.defeatedBy) return condition.defeatedBy
  return condition?.injuries?.at(-1) ?? null
}

// Whether this Injury came from a destructible's blast (world/environment.js injuryFromHit weapon id `explosion:…`).
export const isExplosionInjury = (injury) => Boolean(injury?.source?.weaponId?.startsWith('explosion:'))

// Which explosionFalls clip this blast uses when Defeated (presentation only). Seeded so the same figure + hit match.
export function blastReactionAnimation(injury, seed = '') {
  const falls = spriteData.explosionFalls
  return falls[hashOf(`${seed}:blastAnim:${injury?.source?.weaponId ?? ''}:${injury?.severity ?? ''}`) % falls.length]
}

// Stress-Avoid blast stagger (fall → hold → getUp): always the back fall so the getUp sheet starts on the same pose.
export function blastStaggerAnimation() {
  return spriteData.blastStaggerFall ?? 'fallBlastBack'
}

// How a Defeated character falls (presentation only): an explosion (stun or deadly) picks one of explosionFalls;
// otherwise Stun (or a Minor NPC left Unconscious) crumples, and Deadly picks one of deadlyFalls. Seeded so the same
// figure always falls the same way for the same hit.
export function defeatAnimation(condition, seed = '') {
  const injury = defeatingInjury(condition)
  if (isExplosionInjury(injury)) return blastReactionAnimation(injury, seed)
  if (condition?.unconscious || injury?.type !== 'deadly') return spriteData.stunFall
  return spriteData.deadlyFalls[hashOf(`${seed}:${condition.injuries?.length ?? 0}`) % spriteData.deadlyFalls.length]
}

// Eight map-axis steps (same order as WORLD_DIRECTIONS below).
const KNOCKBACK_STEPS = [
  { x: 1, y: 1 },
  { x: 1, y: 0 },
  { x: 1, y: -1 },
  { x: 0, y: -1 },
  { x: -1, y: -1 },
  { x: -1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
]

// How far a blast throws the figure (tiles, 1–3): severity after Protection plus the blast radius.
export function explosionKnockbackTiles(injury) {
  if (!isExplosionInjury(injury)) return 0
  const severity = injury.severity ?? 1
  const radius = injury.source?.blastRadius ?? 1
  return Math.min(3, Math.max(1, Math.round((severity + radius) / 2)))
}

// Snap a free map vector to the nearest of the eight knockback steps.
function snapKnockbackStep(dx, dy, seed, injury) {
  if (!dx && !dy) {
    return KNOCKBACK_STEPS[hashOf(`${seed}:blastDir:${injury?.source?.weaponId ?? ''}`) % KNOCKBACK_STEPS.length]
  }
  const angle = Math.atan2(dy, dx)
  let best = KNOCKBACK_STEPS[0]
  let bestDiff = Infinity
  for (const step of KNOCKBACK_STEPS) {
    let diff = Math.abs(Math.atan2(step.y, step.x) - angle)
    if (diff > Math.PI) diff = Math.PI * 2 - diff
    if (diff < bestDiff) {
      bestDiff = diff
      best = step
    }
  }
  return best
}

// Outward throw direction from the blast: from blastOrigin toward where they stood (source.at), snapped to one of
// eight map steps. Standing on the blast (or missing positions) falls back to a seeded direction.
export function blastKnockbackFacing(injury, seed = '') {
  const origin = injury?.source?.blastOrigin
  const at = injury?.source?.at
  if (origin && at) return snapKnockbackStep(at.x - origin.x, at.y - origin.y, seed, injury)
  return snapKnockbackStep(0, 0, seed, injury)
}

// Look back at the explosive after getting up (opposite of the throw).
export function blastFaceOrigin(injury, seed = '') {
  const origin = injury?.source?.blastOrigin
  const at = injury?.source?.at
  if (origin && at) return snapKnockbackStep(origin.x - at.x, origin.y - at.y, seed, injury)
  const away = blastKnockbackFacing(injury, seed)
  return { x: -away.x, y: -away.y }
}

// Where a blast throws them to: step outward along facing up to `tiles`, stopping before a solid, the map edge, or a
// tile in occupiedKeys (another character). Never lands on an occupied square.
export function blastLandingCell(map, from, facing, tiles, occupiedKeys = null) {
  if (!map || !from || !facing || tiles < 1) return from ? { ...from } : from
  let cell = { x: from.x, y: from.y }
  for (let i = 0; i < tiles; i += 1) {
    const next = { x: cell.x + facing.x, y: cell.y + facing.y }
    if (!isInside(map, next) || getTile(tileAt(map, next)).solid) break
    if (occupiedKeys?.has(tileKey(next))) break
    cell = next
  }
  return cell
}

// Landing cell + throw facing for an explosion Injury, or null. Used to move the actor so they get up where they land.
// occupiedKeys: tileKey set of squares that already have someone (the thrown actor's own from tile is not blocked).
export function blastThrow(map, injury, seed = '', occupiedKeys = null) {
  if (!isExplosionInjury(injury) || !injury.source?.at) return null
  const facing = blastKnockbackFacing(injury, seed)
  const tiles = explosionKnockbackTiles(injury)
  const from = injury.source.at
  const land = blastLandingCell(map, from, facing, tiles, occupiedKeys)
  const steps = Math.max(Math.abs(land.x - from.x), Math.abs(land.y - from.y))
  return { facing, tiles: steps || tiles, from, land, look: blastFaceOrigin(injury, seed) }
}

// Presentation knockback vector for a throw of `tiles` along `facing`. landsHome: position is already the landing cell.
function knockbackVector(facing, tiles) {
  if (!tiles) return null
  const step = project(facing)
  const origin = project({ x: 0, y: 0 })
  return { x: (step.x - origin.x) * tiles, y: (step.y - origin.y) * tiles, facing, tiles, landsHome: true }
}

// From a blastReact { injury, from, land } (or injury alone): slide distance is how far they actually moved.
export function explosionKnockbackFromReact(blastReact, seed = '') {
  if (!blastReact?.injury) return null
  const { injury, from, land } = blastReact
  const facing = blastKnockbackFacing(injury, seed)
  if (from && land) {
    const tiles = Math.max(Math.abs(land.x - from.x), Math.abs(land.y - from.y))
    return knockbackVector(facing, tiles)
  }
  return explosionKnockbackFromInjury(injury, seed)
}

// Presentation knockback for a blast Injury (Defeated or Stress Avoid stagger): world-space slide and facing. Null if
// this isn't an explosion. Prefer explosionKnockbackFromReact when from/land are known.
export function explosionKnockbackFromInjury(injury, seed = '', map = null) {
  const throw_ = map ? blastThrow(map, injury, seed) : null
  const facing = throw_?.facing ?? blastKnockbackFacing(injury, seed)
  const tiles = throw_?.tiles ?? explosionKnockbackTiles(injury)
  return knockbackVector(facing, tiles)
}

// Presentation knockback when Defeated by an explosion (from the defeating Injury on condition).
export function explosionKnockback(condition, seed = '', map = null) {
  return explosionKnockbackFromInjury(defeatingInjury(condition), seed, map)
}

// The eight directions in world terms (x and y are the map's axes; screen down is +x +y), a quarter turn apart.
const WORLD_DIRECTIONS = ['se', 's', 'sw', 'w', 'nw', 'n', 'ne', 'e']

// Which sheet row draws a facing ({ x, y } along the map axes, any length), and whether it is the mirror image of it.
// Facing nowhere in particular (0, 0) faces the viewer.
export function directionFor(facing) {
  const angle = facing && (facing.x || facing.y) ? Math.atan2(facing.y, facing.x) : Math.PI / 4
  const id = WORLD_DIRECTIONS[(Math.round(angle / (Math.PI / 4)) + 8) % 8]
  const drawn = spriteData.mirrored[id] ?? id
  return { id, row: spriteData.directions.indexOf(drawn), mirror: drawn !== id }
}

// Species + Gender -> portrait set. Mixed Heritage sees both parents' portraits; New Species (no art of its own) sees
// every species' portraits for the gender; an anyPortrait gender (Other) sees the species' portraits of every gender.
// Empty until both species and gender are chosen.
export function getAvailablePortraits(character) {
  const gender = character.identity.gender
  const species = character.species ? getSpeciesById(character.species.id) : null
  if (!gender || !species) return []
  const speciesIds = isMixedHeritage(species) ? getOwnSpeciesIds(character.species) : [species.id]
  const anyGender = Boolean(getGenderById(gender.id)?.anyPortrait)
  return portraits.filter(
    (portrait) =>
      (anyGender || portrait.gender === gender.id) && (isNewSpecies(species) || speciesIds.includes(portrait.species)),
  )
}

export const isPortraitAvailable = (character, portraitId) => getAvailablePortraits(character).some((portrait) => portrait.id === portraitId)

export function selectPortrait(character, portraitId) {
  const portrait = getPortraitById(portraitId)
  if (!portrait || !isPortraitAvailable(character, portraitId)) return character.identity
  return { ...character.identity, portrait: { id: portrait.id, name: portrait.name } }
}

// A chosen portrait that no longer fits the species/gender is replaced from the new set, keeping the same
// variant number where possible (Vulcan Female 3 -> Human Female 3). With no valid set it is cleared.
// With no portrait yet, the first of the set is chosen, so the blank placeholder only shows before a set exists.
export function reconcilePortrait(character) {
  const current = character.identity.portrait
  if (current && isPortraitAvailable(character, current.id)) return character
  const available = getAvailablePortraits(character)
  if (!current && !available.length) return character
  const variant = current ? getPortraitById(current.id)?.variant : null
  const replacement = available.find((portrait) => portrait.variant === variant) ?? available[0] ?? null
  const portrait = replacement ? { id: replacement.id, name: replacement.name } : null
  return { ...character, identity: { ...character.identity, portrait } }
}
