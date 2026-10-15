// The hazard counters of the performance probe (perfProbe.js): active regions and their tiles at each hazard round.
import { activeHazards } from '../world/environment.js'
import { PERF, perfCount } from './perfProbe.js'

export function countHazards(environment) {
  if (!PERF) return
  const regions = activeHazards(environment)
  perfCount('hazard.active', regions.length)
  perfCount('hazard.tiles', regions.reduce((sum, region) => sum + Object.keys(region.tiles).length, 0))
}
