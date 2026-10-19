// An environmental hazard region (world/environment.js) as a world object: what the board and ring show, and its
// Neutralize task. Hazards stay plain data in state.environment and are never challenge objects in the scenario
// (docs/performance.md: a spreading hazard would otherwise retile and re-check every frame). The Neutralize task is a
// HazardChallenge built on demand from hazards.json, so the challenge panel, combat interaction, assists, Momentum,
// Threat and the best-choice highlight all go through the one ChallengeObject roll flow.
import challengeData from '../data/adaptation/exploration/challenges.json'
import { ChallengeObject } from './ChallengeObject.js'
import { HAZARD_TYPES, hazardSeverity, neutralizeDifficulty, parseKey } from './environment.js'
import { WorldObject } from './WorldObject.js'

const HAZARD_PREFIX = 'hazard:'
export const hazardChallengeId = (regionId) => `${HAZARD_PREFIX}${regionId}`
export const isHazardChallengeId = (objectId) => typeof objectId === 'string' && objectId.startsWith(HAZARD_PREFIX)
const regionIdOf = (objectId) => objectId.slice(HAZARD_PREFIX.length)

const tilesOf = (region) => Object.entries(region.tiles).map(([key, intensity]) => ({ ...parseKey(key), intensity }))

// The region's tile nearest its centre: where its ring opens and what distances are measured from.
function anchorOf(region) {
  const tiles = tilesOf(region)
  const cx = tiles.reduce((sum, tile) => sum + tile.x, 0) / tiles.length
  const cy = tiles.reduce((sum, tile) => sum + tile.y, 0) / tiles.length
  const nearest = tiles.reduce((best, tile) => {
    const d = Math.hypot(tile.x - cx, tile.y - cy)
    return !best || d < best.d || (d === best.d && (tile.y < best.tile.y || (tile.y === best.tile.y && tile.x < best.tile.x))) ? { tile, d } : best
  }, null)
  return [nearest.tile.x, nearest.tile.y]
}

export class EnvironmentalHazard extends WorldObject {
  constructor(region) {
    super({ id: region.id, name: HAZARD_TYPES[region.type].name, type: region.type, position: anchorOf(region), states: {}, actions: [] })
    this.region = region
  }

  get info() {
    return HAZARD_TYPES[this.region.type]
  }

  // { x, y, intensity } for every tile it covers.
  hazardTiles() {
    return tilesOf(this.region)
  }

  // The intensity on a tile (0: not there).
  effectAt(tile) {
    return this.region.tiles[`${tile.x},${tile.y}`] ?? 0
  }

  // { id, name, type, position, tiles, severity, maxIntensity, active, neutralizable } for the board and ring.
  view() {
    const tiles = this.hazardTiles()
    return {
      id: this.region.id,
      name: this.info.name,
      type: this.region.type,
      position: this.position(),
      tiles,
      severity: hazardSeverity(this.region),
      maxIntensity: Math.max(...tiles.map((tile) => tile.intensity)),
      active: this.region.active,
      neutralizable: this.region.neutralizable !== false,
    }
  }

  // The challenge definition of its Neutralize task (hazards.json neutralize, merged with region.neutralize).
  // Success puts the whole hazard out (objectEffects.js neutralizeHazard with this hazard).
  challengeDefinition() {
    const typeTask = this.info.neutralize
    const override = this.region.neutralize && typeof this.region.neutralize === 'object' ? this.region.neutralize : {}
    const label = override.label || typeTask.label
    const task = {
      attribute: override.attribute || typeTask.attribute,
      department: override.department || typeTask.department,
      difficulty: neutralizeDifficulty(this.region),
      focuses: override.focuses ?? typeTask.focuses ?? [],
      ...(override.equipment ? { equipment: override.equipment } : typeTask.equipment ? { equipment: typeTask.equipment } : {}),
    }
    const actions = this.region.neutralizable === false
      ? []
      : [
          {
            id: 'neutralize',
            label,
            description: `${label}: put the ${this.info.name.toLowerCase()} out.`,
            icon: 'interact',
            task,
            actionCost: { exploration: 'free', combat: 'major' },
            onSuccess: [
              { type: 'neutralizeHazard', mode: 'remove' },
              { type: 'message', text: `The ${this.info.name.toLowerCase()} is out.` },
            ],
            onFailure: [{ type: 'message', text: `The ${this.info.name.toLowerCase()} keeps going.` }],
          },
        ]
    return { id: hazardChallengeId(this.region.id), name: this.info.name, type: 'hazard', position: this.definition.position, state: 'active', states: { active: { label: 'Active' } }, actions }
  }
}

// The Neutralize task as a challenge object. Its runtime record is fixed (no states to change, no locks): the task's
// only lasting outcome is on the environment, so nothing is ever written to scenario.objects for it.
export class HazardChallenge extends ChallengeObject {
  constructor(hazard) {
    super(hazard.challengeDefinition())
    this.hazard = hazard
    this.fixedRuntime = { state: 'active', locks: {}, combatLocks: {}, difficultyMods: {}, originalTiles: [] }
  }

  runtime() {
    return this.fixedRuntime
  }

  currentTiles() {
    return []
  }

  // In reach of any of the hazard's tiles, so a big fire can be fought from its edge.
  inReach(point) {
    return this.hazard.hazardTiles().some((tile) => Math.hypot(point.x - tile.x, point.y - tile.y) <= challengeData.interactRange)
  }
}

const instances = new WeakMap()

// The HazardChallenge for a region, one per region record (a new record after a round gets a new instance), or null.
export function hazardChallengeFor(environment, objectId) {
  if (!isHazardChallengeId(objectId)) return null
  const region = environment?.hazards?.[regionIdOf(objectId)]
  if (!region || !Object.keys(region.tiles).length) return null
  let object = instances.get(region)
  if (!object) {
    object = new HazardChallenge(new EnvironmentalHazard(region))
    instances.set(region, object)
  }
  return object
}

// The hazard a challenge id points at, for the effects ('hazard:h1' -> 'h1'), or null.
export const hazardIdOf = (objectId) => (isHazardChallengeId(objectId) ? regionIdOf(objectId) : null)
