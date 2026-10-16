// Away-team size and spawn placements (designer 2026-10-15): up to MAX_AWAY_TEAM members. Authored player starts are
// preferred; extras take the nearest free tiles around those starts (round-robin) so maps with fewer markers still work.
import { headingTo } from '../actors/CharacterController.js'
import { tileKey } from '../combat/battleMap.js'
import { gridFacing } from '../maps/facing.js'
import { nearestFreeCell } from './tacticalGrid.js'

export const MAX_AWAY_TEAM = 8
// Fireteam A is the first FIRETEAM_A_SIZE in party pick order; the rest are Fireteam B (designer 2026-10-16).
export const FIRETEAM_A_SIZE = 4

// How many the setup screens may pick: 8 when the map has at least one player start, otherwise none.
export function maxAwayTeamSize(map) {
  return map?.markers?.playerStarts?.length ? MAX_AWAY_TEAM : 0
}

// Split party pick order into Fireteam A (full cards) and Fireteam B (compact; follows A).
export function splitFireteams(memberIds) {
  const ids = memberIds ?? []
  return { teamA: ids.slice(0, FIRETEAM_A_SIZE), teamB: ids.slice(FIRETEAM_A_SIZE) }
}

export function isFireteamB(memberIds, id) {
  return splitFireteams(memberIds).teamB.includes(id)
}

// [{ character, position, facing (degrees or null), heading (radians), facingVector }] for each member that fits.
export function placeAwayTeam(map, characters) {
  const starts = map?.markers?.playerStarts ?? []
  if (!starts.length) return []
  const centre = { x: (map.width - 1) / 2, y: (map.height - 1) / 2 }
  const taken = new Set()
  const team = characters.slice(0, MAX_AWAY_TEAM)
  const placements = []
  for (let index = 0; index < team.length; index += 1) {
    const preferred = starts[index % starts.length]
    const snap = nearestFreeCell(map, { x: preferred.x, y: preferred.y }, taken)
    if (!snap) continue
    taken.add(tileKey(snap.cell))
    const position = { x: snap.cell.x, y: snap.cell.y }
    const facing = preferred.facing ?? null
    const heading = facing == null ? headingTo(position, centre) : (facing * Math.PI) / 180
    placements.push({
      character: team[index],
      position,
      facing,
      heading,
      facingVector: facing == null ? null : gridFacing(facing),
    })
  }
  return placements
}
