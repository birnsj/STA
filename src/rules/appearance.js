// Prototype presentation rules (not book mechanics): gender and portraits. Neither affects any score or trait.
import genderData from '../data/adaptation/genders.json'
import portraitData from '../data/adaptation/portraits.json'
import backdropData from '../data/adaptation/portraitBackdrops.json'
import spriteData from '../data/adaptation/characterSprites.json'
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
// (`image` or `fullBody`), so each of them gets the composited version. Null for a single-image picture.
const layersBySrc = new Map(
  portraits.flatMap((portrait) => [
    [portrait.image, headLayers(portrait)],
    [portrait.fullBody, portrait.fullBodyLayers],
  ]).filter(([src, layers]) => src && layers?.length),
)
export const getPortraitLayers = (src) => layersBySrc.get(src) ?? null

// Portrait backdrops (portraitBackdrops.json). identity.backdrop is the player's own pick { id, name }, or null to follow
// the character's department; an id no longer listed also follows the department.
export const getBackdrops = () => backdropData.backdrops
export const getBackdropById = (backdropId) => backdropData.backdrops.find((backdrop) => backdrop.id === backdropId) ?? null
export const getDepartmentBackdrop = (departmentId) => getBackdropById(backdropData.byDepartment[departmentId] ?? backdropData.noDepartment)
export const followsDepartment = (identity) => !getBackdropById(identity?.backdrop?.id)
export const getCharacterBackdrop = (identity, departmentId = null) => getBackdropById(identity?.backdrop?.id) ?? getDepartmentBackdrop(departmentId)

// Picking the department's own backdrop goes back to following the department, so a later department change still
// moves it.
export function selectBackdrop(identity, backdropId, departmentId = null) {
  const backdrop = getBackdropById(backdropId)
  if (!backdrop) return identity
  if (backdrop.id === getDepartmentBackdrop(departmentId).id) return { ...identity, backdrop: null }
  return { ...identity, backdrop: { id: backdrop.id, name: backdrop.name } }
}

// Map figures (characterSprites.json): the full-body sprite set for a portrait, or null (the map keeps the portrait
// token). A portrait's own spriteSet wins, then its species and gender; portraits outside portraits.json are named in
// portraitSets.
export const getSpriteMetrics = () => spriteData
export const getSpriteSetById = (setId) => spriteData.sets.find((set) => set.id === setId) ?? null
export const hasCharacterSprite = (setId) => Boolean(getSpriteSetById(setId))
export function getSpriteSet(portraitId) {
  if (!portraitId) return null
  const portrait = getPortraitById(portraitId)
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

// How a Defeated character falls (presentation only): Stun (or a Minor NPC left Unconscious) crumples; Deadly picks
// one of deadlyFalls by seed, so a figure always falls the same way for the same hit. The Injury that defeated it is
// defeatedBy (Minor NPCs) or the latest Injury.
export function defeatAnimation(condition, seed = '') {
  const injury = condition?.defeatedBy ?? condition?.injuries?.at(-1)
  if (condition?.unconscious || injury?.type !== 'deadly') return spriteData.stunFall
  return spriteData.deadlyFalls[hashOf(`${seed}:${condition.injuries?.length ?? 0}`) % spriteData.deadlyFalls.length]
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
