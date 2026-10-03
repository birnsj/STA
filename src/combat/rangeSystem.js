// Designer spec range bands (tiles): Reach 1, Close 2-4, Medium 5-8, Long 9-12, Extreme 13+.
// Implementation detail: distance counts diagonal steps as 1 (matching movement), and walls block line of fire.
import weaponData from '../data/adaptation/combat/weapons.json'
import { blocksLineOfFire, samePosition } from './battleMap.js'

export const RANGE_BANDS = weaponData.rangeBands

export const tileDistance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

export const getBandIndex = (bandId) => RANGE_BANDS.findIndex((band) => band.id === bandId)

export function getRangeBand(distance) {
  return RANGE_BANDS.find((band) => distance >= band.minTiles && (band.maxTiles === null || distance <= band.maxTiles)) ?? RANGE_BANDS[0]
}

// Samples the straight line between tile centres; any wall tile it crosses (other than the two ends) blocks the shot.
export function hasLineOfFire(map, from, to) {
  if (samePosition(from, to)) return true
  const steps = tileDistance(from, to) * 4
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const point = { x: Math.round(from.x + (to.x - from.x) * t), y: Math.round(from.y + (to.y - from.y) * t) }
    if (samePosition(point, from) || samePosition(point, to)) continue
    if (blocksLineOfFire(map, point)) return false
  }
  return true
}
