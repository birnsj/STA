/**
 * Unique placeholder race meshes on the shared HumanoidModel rig.
 * Humans / mixedHeritage / newSpecies keep the default head (no kit).
 * Designer may later drop GLBs at public/art/models/characters/{species}-{gender}.glb
 * (same joint names); runtime prefers those when listed in spike3dAppearance presentModels.
 */

import appearanceData from '../../data/adaptation/spike3dAppearance.json'
import { tryAttachRaceGltf } from './loadRaceGltf.js'

const SKIN = {
  human: '#e0ab86',
  vulcan: '#d4a07a',
  romulan: '#d4a07a',
  andorian: '#6a9ec9',
  tellarite: '#c49a78',
  trill: '#e0ab86',
  caitian: '#c4782a',
  klingon: '#c48a6a',
}

/** Species that use a distinct mesh kit (not the default human head). */
export const RACE_MESH_SPECIES = ['vulcan', 'romulan', 'andorian', 'tellarite', 'trill', 'caitian', 'klingon']

export function resolveRaceMeshId(speciesId) {
  if (!speciesId || speciesId === 'mixedHeritage' || speciesId === 'newSpecies') return 'human'
  if (speciesId === 'romulan') return 'vulcan'
  return speciesId
}

export function raceModelPath(speciesId, genderId = 'male') {
  const race = resolveRaceMeshId(speciesId)
  if (race === 'human') return null
  const gender = genderId === 'female' ? 'female' : 'male'
  const fromData = appearanceData.raceMeshes?.[race]?.[gender]?.modelPath
  return fromData ?? `/art/models/characters/${race}-${gender}.glb`
}

export function skinColourFor(speciesId) {
  const race = resolveRaceMeshId(speciesId)
  return appearanceData.raceMeshes?.[race]?.skin ?? SKIN[race] ?? SKIN.human
}

/** Only probe the network for GLBs the designer has listed as present (avoids SPA 200 false-positives). */
function glbOverridePath(speciesId, genderId) {
  const path = raceModelPath(speciesId, genderId)
  if (!path) return null
  const present = appearanceData.presentRaceModels
  if (!Array.isArray(present) || !present.includes(path)) return null
  return path
}

/**
 * Apply (or clear) the race mesh for this model. Shared skeleton / animator unchanged.
 * Synchronous procedural kits by default — no per-frame HEAD/GLB churn.
 */
export function applyRaceMesh(model, speciesId = 'human', genderId = 'male') {
  if (!model) return
  const race = resolveRaceMeshId(speciesId)
  model.setSkinColour?.(skinColourFor(speciesId))

  if (race === 'human') {
    if (model._raceId === 'human' && !model._raceMeshGroup) return
    model.clearRaceMesh?.()
    return
  }

  // Already showing this kit — do not tear down / rebuild (that blinked heads on the showcase map).
  if (model._raceId === race && model._raceMeshGroup) return

  const path = glbOverridePath(speciesId, genderId)
  if (path && typeof window !== 'undefined') {
    tryAttachRaceGltf(model, path, race).then((ok) => {
      if (!ok && model._raceId !== race) buildProceduralRace(model, race)
    })
    return
  }
  buildProceduralRace(model, race)
}

function buildProceduralRace(model, race) {
  const s = model._s
  const g = model.beginRaceMesh(race, { replaceHead: true })

  // Shared skull + eyes for every non-human kit.
  model.addCapsule(g, [0, -2.2 * s, 0.12 * s], 1.55 * s, 1.1 * s, model.skin)
  const headScale =
    race === 'tellarite' ? [3.1, 3.2, 3.3] : race === 'klingon' ? [3.0, 3.7, 3.2] : race === 'caitian' ? [2.6, 3.2, 3.1] : [2.75, 3.55, 3.0]
  model.addEllipsoid(g, [0, 0, 0], [headScale[0] * s, headScale[1] * s, headScale[2] * s], model.skin)
  model.addSphere(g, [1.05 * s, 0.35 * s, 2.45 * s], 0.38 * s, model.eyes)
  model.addSphere(g, [-1.05 * s, 0.35 * s, 2.45 * s], 0.38 * s, model.eyes)

  if (race === 'vulcan') {
    model.addEllipsoid(g, [2.7 * s, 0.35 * s, 0.15 * s], [0.5 * s, 1.7 * s, 0.75 * s], model.skin)
    model.addEllipsoid(g, [-2.7 * s, 0.35 * s, 0.15 * s], [0.5 * s, 1.7 * s, 0.75 * s], model.skin)
    model.addEllipsoid(g, [0, -0.45 * s, 2.75 * s], [0.4 * s, 0.7 * s, 0.55 * s], model.skin)
  } else if (race === 'andorian') {
    model.addEllipsoid(g, [0, -0.45 * s, 2.75 * s], [0.4 * s, 0.7 * s, 0.55 * s], model.skin)
    const ant = model.mat(0xe8eef5, { metalness: 0, roughness: 0.85 })
    model.addCapsule(g, [1.55 * s, 3.9 * s, -0.35 * s], 0.24 * s, 2.6 * s, ant)
    model.addCapsule(g, [-1.55 * s, 3.9 * s, -0.35 * s], 0.24 * s, 2.6 * s, ant)
    model.addSphere(g, [1.55 * s, 5.4 * s, -0.35 * s], 0.38 * s, ant)
    model.addSphere(g, [-1.55 * s, 5.4 * s, -0.35 * s], 0.38 * s, ant)
  } else if (race === 'tellarite') {
    model.addEllipsoid(g, [0, -1.1 * s, 2.9 * s], [1.45 * s, 1.1 * s, 1.2 * s], model.skin)
    model.addEllipsoid(g, [0, -0.2 * s, 3.4 * s], [0.7 * s, 0.55 * s, 0.7 * s], model.skin)
    model.addEllipsoid(g, [2.9 * s, 0.6 * s, 0.2 * s], [0.85 * s, 1.1 * s, 0.7 * s], model.skin)
    model.addEllipsoid(g, [-2.9 * s, 0.6 * s, 0.2 * s], [0.85 * s, 1.1 * s, 0.7 * s], model.skin)
  } else if (race === 'trill') {
    model.addEllipsoid(g, [0, -0.45 * s, 2.75 * s], [0.4 * s, 0.7 * s, 0.55 * s], model.skin)
    const spots = model.mat(0x8a6040, { metalness: 0, roughness: 0.9 })
    for (let i = 0; i < 5; i += 1) {
      const y = (1.8 - i * 0.85) * s
      model.addSphere(g, [2.55 * s, y, 0.55 * s], 0.24 * s, spots)
      model.addSphere(g, [-2.55 * s, y, 0.55 * s], 0.24 * s, spots)
    }
  } else if (race === 'caitian') {
    model.addEllipsoid(g, [0, -0.7 * s, 3.0 * s], [1.0 * s, 0.75 * s, 1.15 * s], model.skin)
    model.addEllipsoid(g, [2.0 * s, 2.8 * s, -0.2 * s], [0.55 * s, 1.5 * s, 0.9 * s], model.skin)
    model.addEllipsoid(g, [-2.0 * s, 2.8 * s, -0.2 * s], [0.55 * s, 1.5 * s, 0.9 * s], model.skin)
    const tail = model.raceAttach(model.hips, 'race_tail')
    model.addCapsule(tail, [0, 1.5 * s, -3.2 * s], 0.55 * s, 4.5 * s, model.skin, 'z')
    model.addSphere(tail, [0, 1.5 * s, -5.6 * s], 0.65 * s, model.skin)
  } else if (race === 'klingon') {
    const ridge = model.mat(0xa87058, { metalness: 0, roughness: 0.82 })
    model.addEllipsoid(g, [0, 2.4 * s, 1.9 * s], [2.0 * s, 0.6 * s, 0.85 * s], ridge)
    model.addEllipsoid(g, [0, 1.5 * s, 2.15 * s], [1.7 * s, 0.5 * s, 0.65 * s], ridge)
    model.addEllipsoid(g, [0, 0.7 * s, 2.25 * s], [1.3 * s, 0.4 * s, 0.5 * s], ridge)
    model.addEllipsoid(g, [0, -0.55 * s, 2.9 * s], [0.55 * s, 0.7 * s, 0.7 * s], model.skin)
  }
}
