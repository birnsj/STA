/**
 * Resolve and apply 3D figure appearance from portrait / character data.
 * Portrait → gender, hairStyle, species, uniform (same idea as getSpriteSet, not a PNG path).
 */

import appearanceData from '../data/adaptation/spike3dAppearance.json'
import { getSpriteSet, getSpriteSetById } from '../rules/appearance.js'
import { applyRaceMesh } from './raceMeshes/index.js'
import { COMMAND_GOLD } from './HumanoidModel.js'

const GENDER_PRESETS = appearanceData.genderPresets ?? {
  male: { shoulder: 1, hip: 1, chest: 1, height: 1 },
  female: { shoulder: 0.84, hip: 1.18, chest: 1.12, height: 0.94 },
}

/** Starfleet women wear the TOS minidress; Klingon armour skips it. */
export function resolveOutfit({ gender, klingonArmour } = {}) {
  if (klingonArmour) return 'tunic'
  if (gender === 'female') return 'tosDress'
  return 'tunic'
}

/**
 * Boards often pass sprite-set id (`vulcan-male`) where a portrait id (`vulcan-male-1`) is
 * expected — accept both so race meshes resolve on the Sprite Showcase lineup.
 */
function resolveSpriteSet(portraitOrSetId) {
  if (!portraitOrSetId) return null
  return getSpriteSet(portraitOrSetId) ?? getSpriteSetById(portraitOrSetId)
}

/** @returns {{ gender, hairStyle, hairColour, species, klingonArmour, uniform, outfit }} */
export function resolveSpike3dAppearance({ portraitId, speciesId, genderId, uniform, enemy = false } = {}) {
  const spriteSet = resolveSpriteSet(portraitId)
  const species = speciesId || spriteSet?.species || 'human'
  const gender = genderId || spriteSet?.gender || 'male'
  const portraitKey = portraitId || `${species}-${gender}`
  const map = appearanceData.portraitHair?.[portraitKey] ?? appearanceData.portraitHair?.[`${species}-${gender}`] ?? null
  const hairStyle = map?.hairStyle ?? appearanceData.defaultHair?.[`${species}-${gender}`] ?? appearanceData.defaultHair?.[gender] ?? 'short'
  const hairColour = map?.hairColour ?? appearanceData.defaultHairColour?.[species] ?? '#5a3a22'
  const klingonArmour = species === 'klingon' || Boolean(enemy && species === 'klingon')
  const outfit = resolveOutfit({ species, gender, klingonArmour })
  return {
    gender,
    hairStyle,
    hairColour,
    species,
    klingonArmour,
    outfit,
    uniform: klingonArmour ? null : uniform ?? null,
  }
}

export function genderPreset(gender) {
  return GENDER_PRESETS[gender] ?? GENDER_PRESETS.male
}

/** Apply gender scale, hair, race mesh, outfit, Klingon armour / division tunic to a HumanoidModel. */
export function applyAppearance(model, appearance) {
  if (!model || !appearance) return
  const preset = genderPreset(appearance.gender)
  model.setProportions?.(preset)
  if (appearance.hairStyle) model.setHair?.(appearance.hairStyle, appearance.hairColour)

  // Race mesh (unique non-human heads on the shared rig).
  applyRaceMesh(model, appearance.species, appearance.gender)

  if (appearance.klingonArmour) {
    model.setKlingonArmour?.(true)
    model.setOutfit?.('tunic')
  } else {
    model._armourMode = false
    if (appearance.uniform != null && model.setUniformColour) model.setUniformColour(appearance.uniform)
    else if (model.setUniformColour) model.setUniformColour(COMMAND_GOLD)
    model.setOutfit?.(appearance.outfit ?? resolveOutfit(appearance))
  }
}
