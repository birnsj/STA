/**
 * Optional GLB override for race heads. File must expose a root group (or scene)
 * whose meshes replace the default human head on headRoot.
 * Missing / failed loads → caller builds the procedural kit.
 */

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const cache = new Map()
const missing = new Set()
let loader = null

function getLoader() {
  if (!loader) loader = new GLTFLoader()
  return loader
}

async function assetExists(url) {
  if (missing.has(url)) return false
  try {
    const res = await fetch(url, { method: 'HEAD' })
    if (!res.ok) {
      missing.add(url)
      return false
    }
    return true
  } catch {
    missing.add(url)
    return false
  }
}

function loadGltf(url) {
  if (cache.has(url)) return cache.get(url)
  const promise = new Promise((resolve) => {
    getLoader().load(
      url,
      (gltf) => resolve(gltf),
      undefined,
      () => {
        missing.add(url)
        resolve(null)
      },
    )
  })
  cache.set(url, promise)
  return promise
}

/**
 * @returns {Promise<boolean>} true if a race mesh was attached from the GLB
 */
export async function tryAttachRaceGltf(model, url, raceId) {
  if (!model?.headRoot || !url) return false
  if (!(await assetExists(url))) return false

  const gltf = await loadGltf(url)
  if (!gltf?.scene) {
    cache.delete(url)
    return false
  }

  const source = gltf.scene.getObjectByName('race_mesh') ?? gltf.scene
  const clone = source.clone(true)
  const remove = []
  clone.traverse((obj) => {
    if (obj.isLight || obj.isCamera) remove.push(obj)
  })
  for (const obj of remove) obj.parent?.remove(obj)

  model.clearRaceMesh?.()
  clone.name = `race_${raceId}`
  model._raceMeshGroup = clone
  model._raceId = raceId
  if (model.headDefault) model.headDefault.visible = false
  model.headRoot.add(clone)
  return true
}
