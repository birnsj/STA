import * as THREE from 'three'
import { cloneAttachmentSettings, DEFAULT_ATTACHMENT_SETTINGS } from './attachmentSettings.js'
import { applyUniformTexture, clearUniformTexture, parseHex } from './uniformTextures.js'

/**
 * Procedural officer matched to the placeholder map sprites (scripts/makeCharacterSprites.mjs).
 * Baker body space is X-forward / Y-right / Z-up; Three is X-right / Y-up / Z-forward.
 * On-screen height ≈ 63 design px (50 body units × paintScale 1.25).
 *
 * Mid-torso `spine` joint at the waist so lean isn’t a rigid stick.
 * Joint names are stable for race-mesh attach / future GLB bind.
 */

export const COMMAND_GOLD = 0xc9a227
const SKIN = 0xe0ab86
const HAIR = 0x5a3a22
const TROUSERS = 0x20212b
const BOOTS = 0x121217
const COLLAR = 0x16161c
const INSIGNIA = 0xf0d890
const EYES = 0x17120e

export const SPRITE_BODY_UNITS = 50
export const SPRITE_HEIGHT_PX = Math.round(SPRITE_BODY_UNITS * 1.25)

function darkenHex(hex, factor) {
  const r = ((hex >> 16) & 255) * factor
  const g = ((hex >> 8) & 255) * factor
  const b = (hex & 255) * factor
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

const RAD = 32
const CAP = 8

export class HumanoidModel {
  constructor(height = SPRITE_HEIGHT_PX / 32, { uniform = COMMAND_GOLD } = {}) {
    this.height = height
    this.root = new THREE.Group()
    this.root.name = 'humanoid_model'
    this._owned = []

    const uni = typeof uniform === 'number' ? uniform : COMMAND_GOLD
    this._s = height / SPRITE_BODY_UNITS
    const s = this._s

    // Matte cloth / skin — high roughness so the iso board’s soft light doesn’t read as plastic.
    this.robe = this.mat(uni, { metalness: 0, roughness: 0.88 })
    this.robeDk = this.mat(darkenHex(uni, 0.78), { metalness: 0, roughness: 0.9 })
    this.pants = this.mat(TROUSERS, { metalness: 0, roughness: 0.92 })
    this.hood = this.mat(HAIR, { metalness: 0, roughness: 0.9 })
    this.hoodDk = this.mat(darkenHex(HAIR, 0.72), { metalness: 0, roughness: 0.92 })
    this.collar = this.mat(COLLAR, { metalness: 0.02, roughness: 0.78 })
    this.belt = this.mat(0x141418, { metalness: 0.08, roughness: 0.55 })
    this.skin = this.mat(SKIN, { metalness: 0, roughness: 0.78 })
    this.boots = this.mat(BOOTS, { metalness: 0.12, roughness: 0.62 })
    this.gold = this.mat(INSIGNIA, { metalness: 0.28, roughness: 0.48, emissive: 0x2a2410, emissiveIntensity: 0.04 })
    this.metal = this.mat(0xb8bcc4, { metalness: 0.45, roughness: 0.42 })
    this.metalDk = this.mat(0x6a7078, { metalness: 0.55, roughness: 0.38 })
    this.emitter = this.mat(0xff6a4a, { metalness: 0.2, roughness: 0.35, emissive: 0xff4020, emissiveIntensity: 0.55 })
    this.eyes = this.mat(EYES, { metalness: 0.05, roughness: 0.55 })

    this.pitchPivot = new THREE.Group()
    this.pitchPivot.name = 'pitchPivot'
    this.root.add(this.pitchPivot)
    this.body = new THREE.Group()
    this.body.name = 'body'
    this.pitchPivot.add(this.body)

    this.hips = new THREE.Group()
    this.hips.name = 'hips'
    this.hips.position.set(0, 23 * s, 0)
    this.body.add(this.hips)

    this.pelvis = this.addEllipsoid(this.hips, [0, 1.5 * s, 0], [4.7 * s, 3.4 * s, 3.0 * s], this.pants)
    // Belt + buckle at the waist break (tunic ↔ trousers / dress).
    this.addCapsule(this.hips, [0, 4.55 * s, 0], 0.55 * s, 9.4 * s, this.belt, 'x')
    this.addEllipsoid(this.hips, [0, 4.55 * s, 3.15 * s], [1.15 * s, 0.7 * s, 0.45 * s], this.gold)

    this._pantMeshes = []
    this.legs = [this._makeLeg(1), this._makeLeg(-1)]
    this._skirtGroup = null
    this._outfit = 'tunic'
    this._buildSkirt()

    // Waist joint — lean/twist split here so the chest isn’t a rigid stick.
    this.spine = new THREE.Group()
    this.spine.name = 'spine'
    this.spine.position.set(0, 5 * s, 0)
    this.hips.add(this.spine)
    this.belly = this.addEllipsoid(this.spine, [0, 1.5 * s, 0.15 * s], [4.55 * s, 3.7 * s, 2.95 * s], this.robe)
    // Tunic hem flare just above the belt.
    this.tunicHem = this.addEllipsoid(this.spine, [0, 0.15 * s, 0.05 * s], [5.05 * s, 1.35 * s, 3.25 * s], this.robeDk)

    this.torso = new THREE.Group()
    this.torso.name = 'torso'
    this.spine.add(this.torso)

    // One continuous torso volume — chest reaches into the shoulder line so the upper
    // back doesn’t show a capsule-vs-ellipsoid seam.
    this._chestRx = 5.25 * s
    this._chestRy = 7.4 * s
    this._chestRz = 3.35 * s
    this.chest = this.addEllipsoid(this.torso, [0, 5.8 * s, 0], [this._chestRx, this._chestRy, this._chestRz], this.robe)
    this.chest.name = 'chest'
    // Soft shoulder mass (same cloth colour) overlapping the chest top — no dark pad band.
    this.addCapsule(this.torso, [0, 11.6 * s, 0], 2.85 * s, 6.8 * s, this.robe, 'x')
    this.addEllipsoid(this.torso, [4.9 * s, 11.5 * s, 0], [1.7 * s, 1.9 * s, 2.0 * s], this.robe)
    this.addEllipsoid(this.torso, [-4.9 * s, 11.5 * s, 0], [1.7 * s, 1.9 * s, 2.0 * s], this.robe)
    // Upper-back / neck bridge fills any remaining join under the collar.
    this.addEllipsoid(this.torso, [0, 12.4 * s, -0.35 * s], [3.6 * s, 2.4 * s, 2.8 * s], this.robe)

    // Collar as a thin ring on top of continuous cloth (not a trench cutting the back).
    this.addEllipsoid(this.torso, [0, 14.55 * s, 0.15 * s], [2.45 * s, 1.15 * s, 2.2 * s], this.collar)
    this.addEllipsoid(this.torso, [2.05 * s, 8.1 * s, 3.05 * s], [0.9 * s, 1.25 * s, 0.45 * s], this.gold)

    this.arms = [this._makeArm(1), this._makeArm(-1)]

    this.headRoot = new THREE.Group()
    this.headRoot.name = 'headRoot'
    this.headRoot.position.set(0.2 * s, 17.9 * s, 0)
    this.torso.add(this.headRoot)
    this._buildHead(s)
    this._hairGroup = null
    this._raceMeshGroup = null
    this._raceId = 'human'
    this._armourMode = false
    this._proportion = { shoulder: 1, hip: 1, chest: 1, height: 1 }
    this._baseArmX = [this.arms[0].shoulder.position.x, this.arms[1].shoulder.position.x]
    this._baseHipX = [this.legs[0].thigh.position.x, this.legs[1].thigh.position.x]
    this._baseChest = { rx: this._chestRx, ry: this._chestRy, rz: this._chestRz }
    this._attachment = cloneAttachmentSettings(DEFAULT_ATTACHMENT_SETTINGS)
    this.setHair('short')
    this.setUniformColour(uni)

    this.applyPose({ prop: false, aim: 0 })
    // Snapshot local TRS so ragdoll sync can be fully undone (it rewrites position + quaternion).
    this.captureBindLocals()
  }

  /** Joints whose local TRS ragdoll / applyPose own (not decorative mesh children). */
  _bindJointList() {
    const joints = [this.pitchPivot, this.body, this.hips, this.spine, this.torso, this.headRoot]
    for (const leg of this.legs ?? []) {
      joints.push(leg.thigh, leg.shin, leg.foot)
    }
    for (const arm of this.arms ?? []) {
      joints.push(arm.shoulder, arm.upper, arm.forearm, arm.hand)
    }
    return joints.filter(Boolean)
  }

  /** Store rest locals (call after proportions change). */
  captureBindLocals() {
    this._bindLocals = this._bindJointList().map((obj) => ({
      obj,
      position: obj.position.clone(),
      quaternion: obj.quaternion.clone(),
      scale: obj.scale.clone(),
    }))
  }

  /** Undo physics-driven local TRS before animator poses again. */
  restoreBindLocals() {
    if (!this._bindLocals?.length) return
    for (const { obj, position, quaternion, scale } of this._bindLocals) {
      obj.position.copy(position)
      obj.quaternion.copy(quaternion)
      obj.scale.copy(scale)
      obj.rotation.setFromQuaternion(quaternion)
    }
  }

  _buildHead(s) {
    const h = new THREE.Group()
    h.name = 'head_default'
    this.headDefault = h
    this.headRoot.add(h)
    this.addCapsule(h, [0, -2.2 * s, 0.12 * s], 1.55 * s, 1.1 * s, this.skin)
    this.addEllipsoid(h, [0, 0, 0], [2.75 * s, 3.55 * s, 3.0 * s], this.skin)
    this.addEllipsoid(h, [0, -0.45 * s, 2.75 * s], [0.4 * s, 0.7 * s, 0.55 * s], this.skin)
    this.addSphere(h, [1.05 * s, 0.35 * s, 2.45 * s], 0.38 * s, this.eyes)
    this.addSphere(h, [-1.05 * s, 0.35 * s, 2.45 * s], 0.38 * s, this.eyes)
  }

  setSkinColour(hexOrString) {
    const hex = parseHex(hexOrString, SKIN)
    this.skin.color.setHex(hex)
  }

  setUniformColour(hexOrString) {
    if (this._armourMode) return
    applyUniformTexture(this.robe, this.robeDk, hexOrString ?? COMMAND_GOLD)
  }

  setProportions({ shoulder = 1, hip = 1, chest = 1, height = 1 } = {}) {
    this._proportion = { shoulder, hip, chest, height }
    const sx = this.root.scale.x || 1
    const sz = this.root.scale.z || 1
    this.root.scale.set(sx, height, sz)
    for (let i = 0; i < 2; i += 1) {
      this.arms[i].shoulder.position.x = this._baseArmX[i] * shoulder
      this.legs[i].thigh.position.x = this._baseHipX[i] * hip
    }
    // Chest > 1 reads as bust (width + depth); chest < 1 narrows the male-default volume.
    this._chestRx = this._baseChest.rx * chest
    this._chestRy = this._baseChest.ry * (0.92 + chest * 0.08)
    this._chestRz = this._baseChest.rz * (0.85 + chest * 0.2)
    this.chest.scale.set(this._chestRx, this._chestRy, this._chestRz)
    this.captureBindLocals()
  }

  _buildSkirt() {
    const s = this._s
    const g = new THREE.Group()
    g.name = 'tos_skirt'
    // Short A-line miniskirt from the belt — more leg than cloth (TOS Federation look).
    this.addEllipsoid(g, [0, -0.85 * s, 0.1 * s], [5.2 * s, 1.55 * s, 3.85 * s], this.robe)
    this.addEllipsoid(g, [0, -2.55 * s, 0.15 * s], [6.0 * s, 1.7 * s, 4.45 * s], this.robe)
    this.addEllipsoid(g, [0, -3.85 * s, 0.12 * s], [6.45 * s, 0.95 * s, 4.7 * s], this.robeDk)
    g.visible = false
    this.hips.add(g)
    this._skirtGroup = g
  }

  /**
   * 'tunic' = trousers + short hem (default / male / non-human female).
   * 'tosDress' = Starfleet human female TOS minidress: skirt, bare thighs, boots.
   */
  setOutfit(mode = 'tunic') {
    const next = mode === 'tosDress' ? 'tosDress' : 'tunic'
    if (this._outfit === next && this._skirtGroup) {
      this._skirtGroup.visible = next === 'tosDress'
      return
    }
    this._outfit = next
    const dress = next === 'tosDress'
    if (!this._skirtGroup) this._buildSkirt()
    this._skirtGroup.visible = dress
    if (this.tunicHem) this.tunicHem.visible = !dress
    this.pelvis.material = dress ? this.robe : this.pants
    // Thigh + shin tubes become bare skin under the miniskirt; boot shafts stay black.
    for (const mesh of this._pantMeshes) {
      mesh.material = dress ? this.skin : this.pants
      mesh.visible = true
    }
  }

  setHair(styleId = 'short', colourHex = null) {
    const colourKey = colourHex == null ? '' : String(colourHex)
    if (this._hairStyle === styleId && this._hairColourKey === colourKey && this._hairGroup) return
    if (this._hairGroup) {
      this.headRoot.remove(this._hairGroup)
      this._hairGroup.traverse((obj) => obj.geometry?.dispose?.())
      this._hairGroup = null
    }
    if (colourHex) {
      const n = typeof colourHex === 'number' ? colourHex : parseInt(String(colourHex).replace('#', ''), 16)
      if (Number.isFinite(n)) {
        this.hood.color.setHex(n)
        this.hoodDk.color.setHex(darkenHex(n, 0.72))
      }
    }
    this._hairStyle = styleId
    this._hairColourKey = colourKey
    const s = this._s
    const g = new THREE.Group()
    g.name = 'hair'
    this._hairGroup = g
    this.headRoot.add(g)
    const add = (pos, radii, mat = this.hood) => this.addEllipsoid(g, pos, radii, mat)
    switch (styleId) {
      case 'crew':
        // Tight military crop — skullcap + short nape.
        add([0, 3.05 * s, -0.1 * s], [2.55 * s, 1.05 * s, 2.45 * s])
        add([0, 2.35 * s, -0.05 * s], [2.7 * s, 1.0 * s, 2.55 * s], this.hoodDk)
        add([0, 1.7 * s, -1.55 * s], [2.2 * s, 1.35 * s, 1.1 * s], this.hoodDk)
        break
      case 'bowl':
        // Vulcan bowl: smooth crown, straight fringe volume, clean cheek line.
        add([0, 3.15 * s, 0.05 * s], [3.05 * s, 1.75 * s, 3.0 * s])
        add([0, 1.85 * s, 0.35 * s], [3.0 * s, 1.55 * s, 2.85 * s])
        add([0, 1.1 * s, 1.6 * s], [2.65 * s, 1.0 * s, 1.35 * s], this.hoodDk)
        add([0, 1.35 * s, -2.0 * s], [2.7 * s, 1.5 * s, 1.2 * s], this.hoodDk)
        break
      case 'bob':
        // Soft chin-length bob with side fullness and a rounded back.
        add([0, 3.2 * s, -0.05 * s], [3.0 * s, 1.65 * s, 2.85 * s])
        add([0, 1.9 * s, 0.15 * s], [3.05 * s, 1.7 * s, 2.8 * s])
        add([2.85 * s, 0.35 * s, 0.35 * s], [1.05 * s, 2.6 * s, 2.0 * s])
        add([-2.85 * s, 0.35 * s, 0.35 * s], [1.05 * s, 2.6 * s, 2.0 * s])
        add([2.7 * s, -0.9 * s, 0.2 * s], [0.95 * s, 1.8 * s, 1.7 * s], this.hoodDk)
        add([-2.7 * s, -0.9 * s, 0.2 * s], [0.95 * s, 1.8 * s, 1.7 * s], this.hoodDk)
        add([0, -0.35 * s, -2.45 * s], [2.5 * s, 2.4 * s, 1.25 * s], this.hoodDk)
        break
      case 'long':
        // Shoulder-length fall with parted crown and side curtains.
        add([0, 3.25 * s, -0.15 * s], [3.0 * s, 1.55 * s, 2.85 * s])
        add([0, 2.0 * s, 0.1 * s], [3.05 * s, 1.6 * s, 2.75 * s])
        add([2.75 * s, -0.2 * s, 0.15 * s], [0.95 * s, 3.4 * s, 1.85 * s])
        add([-2.75 * s, -0.2 * s, 0.15 * s], [0.95 * s, 3.4 * s, 1.85 * s])
        add([2.55 * s, -2.6 * s, 0.05 * s], [0.85 * s, 2.2 * s, 1.55 * s], this.hoodDk)
        add([-2.55 * s, -2.6 * s, 0.05 * s], [0.85 * s, 2.2 * s, 1.55 * s], this.hoodDk)
        add([0, -1.8 * s, -2.55 * s], [2.35 * s, 3.2 * s, 1.2 * s], this.hoodDk)
        add([0, -3.6 * s, -2.2 * s], [1.9 * s, 1.8 * s, 1.0 * s], this.hoodDk)
        break
      case 'tos':
        // TOS officer: lifted crown, soft fringe, cheek-framing sides (Yeoman / Uhura-adjacent silhouette).
        add([0, 3.55 * s, -0.15 * s], [2.85 * s, 1.85 * s, 2.7 * s])
        add([0, 2.55 * s, 0.2 * s], [3.0 * s, 1.55 * s, 2.8 * s])
        add([0, 1.55 * s, 1.55 * s], [2.5 * s, 1.15 * s, 1.45 * s], this.hoodDk)
        add([2.9 * s, 0.7 * s, 0.45 * s], [1.0 * s, 2.5 * s, 1.9 * s])
        add([-2.9 * s, 0.7 * s, 0.45 * s], [1.0 * s, 2.5 * s, 1.9 * s])
        add([2.6 * s, -1.0 * s, 0.25 * s], [0.85 * s, 1.9 * s, 1.55 * s], this.hoodDk)
        add([-2.6 * s, -1.0 * s, 0.25 * s], [0.85 * s, 1.9 * s, 1.55 * s], this.hoodDk)
        add([0, 0.4 * s, -2.5 * s], [2.4 * s, 2.3 * s, 1.2 * s], this.hoodDk)
        break
      case 'updo':
        // High bun / beehive mass with neat side sweep.
        add([0, 4.4 * s, -0.55 * s], [2.35 * s, 2.2 * s, 2.25 * s])
        add([0, 3.3 * s, -0.2 * s], [2.85 * s, 1.5 * s, 2.65 * s])
        add([0, 2.1 * s, 0.2 * s], [2.95 * s, 1.35 * s, 2.7 * s], this.hoodDk)
        add([2.55 * s, 1.0 * s, 0.4 * s], [0.75 * s, 1.9 * s, 1.55 * s], this.hoodDk)
        add([-2.55 * s, 1.0 * s, 0.4 * s], [0.75 * s, 1.9 * s, 1.55 * s], this.hoodDk)
        add([0, 1.2 * s, -2.3 * s], [2.2 * s, 1.7 * s, 1.1 * s], this.hoodDk)
        break
      case 'warrior':
        add([0, 3.35 * s, -0.25 * s], [3.0 * s, 1.75 * s, 2.9 * s])
        add([0, 1.9 * s, 0], [2.95 * s, 1.6 * s, 2.7 * s])
        add([0, 0.4 * s, -2.95 * s], [2.55 * s, 3.8 * s, 1.55 * s], this.hoodDk)
        add([2.55 * s, -0.2 * s, -1.6 * s], [1.0 * s, 3.2 * s, 1.65 * s], this.hoodDk)
        add([-2.55 * s, -0.2 * s, -1.6 * s], [1.0 * s, 3.2 * s, 1.65 * s], this.hoodDk)
        add([0, -2.4 * s, -2.6 * s], [2.0 * s, 2.4 * s, 1.2 * s], this.hoodDk)
        break
      case 'short':
      default:
        add([0, 3.2 * s, -0.15 * s], [2.95 * s, 1.55 * s, 2.8 * s])
        add([0, 2.5 * s, 0.9 * s], [2.55 * s, 1.15 * s, 1.75 * s], this.hoodDk)
        add([0, 2.15 * s, -1.65 * s], [2.8 * s, 1.85 * s, 1.7 * s])
        add([2.65 * s, 1.55 * s, -0.2 * s], [0.75 * s, 2.05 * s, 2.1 * s], this.hoodDk)
        add([-2.65 * s, 1.55 * s, -0.2 * s], [0.75 * s, 2.05 * s, 2.1 * s], this.hoodDk)
        add([0, 1.35 * s, -2.6 * s], [2.4 * s, 1.9 * s, 1.1 * s], this.hoodDk)
        break
    }
  }

  /** @deprecated use applyRaceMesh from raceMeshes/ — kept for older call sites */
  setSpeciesCues(speciesId = 'human') {
    this.clearRaceMesh()
    if (speciesId && speciesId !== 'human' && speciesId !== 'mixedHeritage' && speciesId !== 'newSpecies') {
      // Thin fallback if applyRaceMesh isn’t used.
      const s = this._s
      const g = this.beginRaceMesh(speciesId)
      if (speciesId === 'vulcan' || speciesId === 'romulan') {
        this.addEllipsoid(g, [2.55 * s, 0.2 * s, 0.3 * s], [0.45 * s, 1.4 * s, 0.7 * s], this.skin)
        this.addEllipsoid(g, [-2.55 * s, 0.2 * s, 0.3 * s], [0.45 * s, 1.4 * s, 0.7 * s], this.skin)
      }
    }
  }

  clearRaceMesh() {
    if (this._raceMeshGroup) {
      for (const extra of this._raceMeshGroup.userData.extras ?? []) {
        extra.parent?.remove(extra)
        extra.traverse((obj) => obj.geometry?.dispose?.())
      }
      this._raceMeshGroup.parent?.remove(this._raceMeshGroup)
      this._raceMeshGroup.traverse((obj) => obj.geometry?.dispose?.())
      this._raceMeshGroup = null
    }
    if (this.headDefault) this.headDefault.visible = true
    this._raceId = 'human'
  }

  /** Start a race overlay group; hides the default human head for non-human kits. */
  beginRaceMesh(speciesId, { replaceHead = true } = {}) {
    this.clearRaceMesh()
    const g = new THREE.Group()
    g.name = `race_${speciesId}`
    this._raceMeshGroup = g
    this._raceId = speciesId
    this.headRoot.add(g)
    if (replaceHead && this.headDefault) this.headDefault.visible = false
    return g
  }

  /** Attach extra race geometry under another named joint (e.g. caitian tail on hips). */
  raceAttach(parent, groupName = 'race_extra') {
    const g = new THREE.Group()
    g.name = groupName
    parent.add(g)
    if (this._raceMeshGroup) this._raceMeshGroup.userData.extras = [...(this._raceMeshGroup.userData.extras ?? []), g]
    return g
  }

  setKlingonArmour(on = true) {
    this._armourMode = Boolean(on)
    if (!on) return
    // Dark armour instead of department tunic texture.
    const armour = 0x3a3e48
    clearUniformTexture(this.robe, this.robeDk, armour, darkenHex(armour, 0.75))
    this.collar.color.setHex(0x1a1c22)
    this.gold.color.setHex(0xb0a070)
  }

  _makeLeg(side) {
    const s = this._s
    const thighLen = 10.5 * s
    const shinLen = 10.5 * s
    const hipX = side * 2.55 * s
    const sideTag = side > 0 ? 'R' : 'L'

    const thigh = new THREE.Group()
    thigh.name = `thigh_${sideTag}`
    thigh.position.set(hipX, 0, 0)
    this.hips.add(thigh)
    const thighMesh = this.addCapsule(thigh, [0, -thighLen * 0.5, 0], 2.15 * s, thighLen * 0.88, this.pants)
    this._pantMeshes.push(thighMesh)

    const shin = new THREE.Group()
    shin.name = `shin_${sideTag}`
    shin.position.set(0, -thighLen, 0)
    thigh.add(shin)
    const shinPants = this.addCapsule(shin, [0, -shinLen * 0.5, 0], 1.85 * s, shinLen * 0.72, this.pants)
    this._pantMeshes.push(shinPants)
    // Boot shaft up the shin so the foot isn’t a floating capsule.
    this.addCapsule(shin, [0, -shinLen * 0.72, 0.05 * s], 2.05 * s, shinLen * 0.42, this.boots)

    const foot = new THREE.Group()
    foot.name = `foot_${sideTag}`
    foot.position.set(0, -shinLen, 0)
    shin.add(foot)
    this.addCapsule(foot, [0.15 * s, -0.2 * s, 1.35 * s], 1.45 * s, 2.55 * s, this.boots, 'z')
    this.addEllipsoid(foot, [0.1 * s, -0.35 * s, 0.15 * s], [1.55 * s, 0.85 * s, 1.7 * s], this.boots)

    return { thigh, shin, foot, thighLen, shinLen, side }
  }

  _makeArm(side) {
    const s = this._s
    const upperLen = 7.6 * s
    const foreLen = 7.0 * s
    const sideTag = side > 0 ? 'R' : 'L'
    const shoulder = new THREE.Group()
    shoulder.name = `shoulder_${sideTag}`
    // Spine at hips+5; shoulder bar sits just under the pads.
    shoulder.position.set(side * 5.7 * s, 12.1 * s, 0)
    this.torso.add(shoulder)

    const upper = new THREE.Group()
    upper.name = `upperArm_${sideTag}`
    shoulder.add(upper)
    this.addCapsule(upper, [0, -upperLen * 0.5, 0], 1.65 * s, upperLen * 0.88, this.robe)

    const forearm = new THREE.Group()
    forearm.name = `foreArm_${sideTag}`
    forearm.position.set(0, -upperLen, 0)
    upper.add(forearm)
    this.addCapsule(forearm, [0, -foreLen * 0.5, 0], 1.4 * s, foreLen * 0.88, this.robeDk)
    // Cuff break at the wrist.
    this.addCapsule(forearm, [0, -foreLen * 0.92, 0], 1.55 * s, 0.7 * s, this.collar)

    const hand = new THREE.Group()
    hand.name = `hand_${sideTag}`
    hand.position.set(0, -foreLen, 0)
    forearm.add(hand)
    this.addEllipsoid(hand, [0, -1.05 * s, 0], [1.05 * s, 1.35 * s, 1.25 * s], this.skin)

    let rifle = null
    let weaponAttach = null
    if (side < 0) {
      // Stable hand socket for sidearms (Type-2 phaser). Pose drives this group; mesh hangs off it.
      weaponAttach = new THREE.Group()
      weaponAttach.name = 'weaponAttach'
      weaponAttach.position.set(0.15 * s, -1.15 * s, 0.55 * s)
      hand.add(weaponAttach)

      rifle = new THREE.Group()
      rifle.name = 'phaser'
      weaponAttach.add(rifle)
      this._buildType2Phaser(rifle, s)
      rifle.visible = false
    }

    return { shoulder, upper, forearm, hand, rifle, weaponAttach, upperLen, foreLen, side }
  }

  /**
   * Compact Type-2 silhouette. Authored with muzzle along local +Z and grip along −Y so
   * applyPose can hang it (aim 0) or level it along facing (aim 1) without stacking tips.
   */
  _buildType2Phaser(root, s) {
    // Grip in the palm (−Y).
    this.addCapsule(root, [0, -0.7 * s, 0.15 * s], 0.5 * s, 1.35 * s, this.metalDk)
    // Body along +Z (muzzle forward in attach space).
    this.addEllipsoid(root, [0, -0.35 * s, 1.6 * s], [0.7 * s, 0.75 * s, 1.9 * s], this.metal)
    this.addEllipsoid(root, [0, 0.25 * s, 1.35 * s], [0.28 * s, 0.28 * s, 1.0 * s], this.metalDk)
    this.addEllipsoid(root, [0, -0.2 * s, 3.35 * s], [0.42 * s, 0.42 * s, 0.5 * s], this.emitter)
    this.addEllipsoid(root, [0.5 * s, -0.15 * s, 0.85 * s], [0.2 * s, 0.28 * s, 0.28 * s], this.gold)
  }

  mat(color, opts = {}) {
    const m = new THREE.MeshStandardMaterial({
      color,
      metalness: opts.metalness ?? 0.2,
      roughness: opts.roughness ?? 0.65,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      flatShading: false,
    })
    this._owned.push(m)
    return m
  }

  _mesh(geo, material, parent, pos) {
    this._owned.push(geo)
    const mesh = new THREE.Mesh(geo, material)
    mesh.position.set(pos[0], pos[1], pos[2])
    mesh.castShadow = false
    mesh.receiveShadow = false
    parent.add(mesh)
    return mesh
  }

  addSphere(parent, pos, radius, material) {
    return this._mesh(new THREE.SphereGeometry(radius, RAD, Math.round(RAD * 0.75)), material, parent, pos)
  }

  addEllipsoid(parent, pos, radii, material) {
    const mesh = this.addSphere(parent, pos, 1, material)
    mesh.scale.set(radii[0], radii[1], radii[2])
    return mesh
  }

  addCapsule(parent, pos, radius, length, material, axis = 'y') {
    const geo = new THREE.CapsuleGeometry(radius, Math.max(0.001, length), CAP, RAD)
    const mesh = this._mesh(geo, material, parent, pos)
    if (axis === 'z') mesh.rotation.x = Math.PI / 2
    if (axis === 'x') mesh.rotation.z = Math.PI / 2
    return mesh
  }

  applyPose(pose = {}) {
    this._lastPose = pose
    const thigh = pose.thigh ?? [0.04, -0.04]
    const knee = pose.knee ?? [0.08, 0.08]
    const arm = pose.arm ?? [0.08, 0.08]
    const elbow = pose.elbow ?? [0.2, 0.2]
    const lean = pose.lean ?? 0
    const sideLean = pose.sideLean ?? 0
    const bounce = pose.bounce ?? 0
    // Body-unit drop (cover kneel): bounce alone is only a tiny bob and cannot plant a kneel.
    const hipDrop = pose.hipDrop ?? 0
    const pitch = pose.pitch ?? 0
    const breathe = pose.breathe ?? 0
    const hipYaw = pose.hipYaw ?? 0
    const torsoYaw = pose.torsoYaw ?? 0
    const spineLean = pose.spineLean ?? lean * 0.62
    const spineYaw = pose.spineYaw ?? torsoYaw * -0.35
    const spineSide = pose.spineSide ?? sideLean * 0.55
    const chestLean = pose.chestLean ?? lean * 0.38
    const headYaw = pose.headYaw ?? 0
    const headPitch = pose.headPitch ?? 0
    const aim = pose.aim ?? 0
    const prop = pose.prop === true
    const s = this._s

    // Soft vertical settle only — no hip slide/roll (that read as leg wobble).
    this.body.position.y = bounce * 1.1 * s - hipDrop * s
    this.hips.position.x = 0
    this.hips.rotation.y = hipYaw
    this.hips.rotation.z = 0

    const tip = Math.min(Math.abs(pitch), Math.PI * 0.5)
    this.pitchPivot.rotation.set(0, 0, pitch)
    const flat = tip / (Math.PI * 0.5)
    this.pitchPivot.position.y = tip > 0.01 ? -0.08 * s * flat * flat : 0

    this.spine.rotation.x = spineLean
    this.spine.rotation.y = spineYaw
    this.spine.rotation.z = spineSide
    this.torso.rotation.x = chestLean
    this.torso.rotation.y = torsoYaw
    this.torso.rotation.z = sideLean - spineSide * 1.15
    this.chest.scale.x = this._chestRx * (1 + breathe * 0.005)
    this.chest.scale.y = this._chestRy * (1 + breathe * 0.02)
    this.chest.scale.z = this._chestRz * (1 + breathe * 0.008)
    if (this.belly) {
      this.belly.scale.set(
        4.55 * s * (1 + breathe * 0.004),
        3.7 * s * (1 + breathe * 0.015),
        2.95 * s * (1 + breathe * 0.006),
      )
    }

    this.headRoot.rotation.y = headYaw
    this.headRoot.rotation.x = headPitch

    for (let i = 0; i < 2; i += 1) {
      const leg = this.legs[i]
      leg.thigh.rotation.x = thigh[i]
      leg.thigh.rotation.z = leg.side * 0.02
      leg.thigh.rotation.y = 0
      const kneeBend = Math.max(0, knee[i])
      leg.shin.rotation.x = kneeBend
      leg.shin.rotation.z = 0
      leg.foot.rotation.x = -Math.min(0.5, kneeBend * 0.32) + Math.max(0, -thigh[i]) * 0.12
      leg.foot.rotation.z = 0
    }

    const shoulder = pose.shoulder ?? [0, 0]
    const armSide = pose.armSide ?? [0, 0]
    for (let i = 0; i < 2; i += 1) {
      const a = this.arms[i]
      const isWeapon = !!a.rifle
      const sh = shoulder[i] ?? 0
      // armSide: + = out to the sides, − = tuck inward (hands closer).
      const out = armSide[i] ?? 0
      // Keep rest abduction small so idle isn’t a T/A-pose next to the iso sprites.
      // +arm X is BACK on this rig — don’t stack it with out.
      a.shoulder.rotation.x = sh
      a.shoulder.rotation.y = isWeapon ? -aim * 0.2 : a.side * sh * -0.35
      a.shoulder.rotation.z = a.side * (0.035 + Math.abs(sh) * 0.35 + out * 0.9 + (isWeapon ? aim * 0.08 : 0))
      a.upper.rotation.x = arm[i]
      a.upper.rotation.z = a.side * (0.045 + Math.abs(arm[i]) * 0.06 + out * 0.35 + (isWeapon ? aim * 0.08 : 0))
      a.upper.rotation.y = isWeapon ? -aim * 0.35 : a.side * arm[i] * -0.22
      a.forearm.rotation.x = -Math.max(0.12, elbow[i])
      a.hand.rotation.x = isWeapon ? 0 : -Math.max(0, arm[i]) * 0.18
      if (a.weaponAttach) {
        // Mesh muzzle = local +Z. Hang down at aim 0 (Rx +90° → −Y); at aim 1 cancel the
        // gun-arm raise (−arm) so the emitter stays level along facing instead of tipping up.
        const att = this._attachment ?? DEFAULT_ATTACHMENT_SETTINGS
        const hang = Math.PI * 0.5
        const level = -arm[i]
        const tip = ((Number(att.weaponRotXDeg) || 0) * Math.PI) / 180
        const yaw = ((Number(att.weaponRotYDeg) || 0) * Math.PI) / 180
        const roll = ((Number(att.weaponRotZDeg) || 0) * Math.PI) / 180
        a.weaponAttach.rotation.x = hang * (1 - aim) + level * aim + tip
        a.weaponAttach.rotation.y = a.side * 0.1 * (1 - aim * 0.5) + yaw
        a.weaponAttach.rotation.z = a.side * 0.12 * (1 - aim * 0.35) + roll
        const pz = (Number(att.weaponPosZ) || 0) + aim * (Number(att.weaponAimPosZ) || 0)
        a.weaponAttach.position.set(
          (Number(att.weaponPosX) || 0) * s,
          (Number(att.weaponPosY) || 0) * s,
          pz * s,
        )
      }
      if (a.rifle) a.rifle.visible = prop || Boolean(this._attachment?.forceShowWeapon)
    }
  }

  /** Animation Viewer: live phaser socket offsets. */
  setAttachmentSettings(next) {
    this._attachment = cloneAttachmentSettings(next)
    // Re-apply current pose so the socket moves immediately.
    if (this._lastPose) this.applyPose(this._lastPose)
  }

  dispose() {
    this.root.traverse((obj) => {
      obj.geometry?.dispose?.()
    })
    for (const item of this._owned) item.dispose?.()
    this._owned.length = 0
  }
}
