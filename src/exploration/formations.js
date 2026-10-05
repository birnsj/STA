// Formations: reusable slot layouts (partyControl.json), turned to face the leader's heading and scaled by spacing.
// Positions are in tiles; heading is an angle in radians on the tile grid (0 = +x).
import data from '../data/adaptation/exploration/partyControl.json'
import { clearUpTo, distance, isClear, isClearLine, tileOf, walkingDistances, walkingDistanceTo } from './navigation.js'

export const FORMATIONS = data.formations
export const DEFAULT_FORMATION_ID = data.defaultFormation
export const getFormation = (id) => FORMATIONS.find((formation) => formation.id === id) ?? FORMATIONS[0]

// Followers past the formation's last slot line up behind it, one tile apart.
function slotOffset(formation, index) {
  if (index < formation.slots.length) return formation.slots[index]
  const last = formation.slots[formation.slots.length - 1]
  return { x: last.x, y: last.y + (index - formation.slots.length + 1) }
}

// The world point of slot `index` (1 = first follower) for a leader standing at `leader`.
export function slotPoint(formation, index, leader, heading, spacing = 1) {
  const offset = slotOffset(formation, index)
  const forward = { x: Math.cos(heading), y: Math.sin(heading) }
  const right = { x: -forward.y, y: forward.x }
  return {
    x: leader.x + (right.x * offset.x - forward.x * offset.y) * spacing,
    y: leader.y + (right.y * offset.x - forward.y * offset.y) * spacing,
  }
}

// A slot is usable when a character fits there, it isn't someone else's spot, and walking there from the leader takes
// no long detour (so a follower never aims for a spot on the far side of a wall, e.g. in the next room).
const DETOUR_FACTOR = 1.5
const DETOUR_ALLOWANCE = 1.5
// How far (in tiles) from a blocked slot to look for the nearest usable spot.
const SEARCH_RINGS = 2
// Spots the leader can't see straight to (round a corner, in a doorway) count as this much farther away, so a folded
// formation gathers in the leader's room rather than in the doorway behind them.
const OUT_OF_SIGHT_PENALTY = 1
// Spots ahead of the leader count as this much farther away: in a corridor a follower would have to squeeze past the
// leader to reach one, so a Line folds up behind the leader instead.
const AHEAD_PENALTY = 1.5

function usable(map, field, leader, point, taken, personalSpace) {
  if (!isClear(map, point)) return false
  if (taken.some((other) => distance(other, point) < personalSpace)) return false
  return walkingDistanceTo(map, field, point) <= distance(leader, point) * DETOUR_FACTOR + DETOUR_ALLOWANCE
}

// Where each follower of one leader should stand, in the order of `slots` (their slot numbers). Each takes their
// formation slot when it is usable; otherwise the nearest usable spot to it (walls fold a Line up in a corridor, a
// pillar nudges a flank aside); failing that, as far toward the slot as they can walk straight from the leader.
// avoid: positions of other characters who are standing still, so nobody aims for a spot already occupied.
export function formationTargets(map, formation, slots, leader, heading, spacing, { avoid = [], personalSpace }) {
  const field = walkingDistances(map, tileOf(leader))
  const taken = [leader, ...avoid]
  const forward = { x: Math.cos(heading), y: Math.sin(heading) }
  const ahead = (point) => (point.x - leader.x) * forward.x + (point.y - leader.y) * forward.y > 0.25
  return slots.map((slot) => {
    const ideal = slotPoint(formation, slot, leader, heading, spacing)
    let target = usable(map, field, leader, ideal, taken, personalSpace) ? ideal : null
    if (!target) {
      const centre = tileOf(ideal)
      let best = null
      for (let y = centre.y - SEARCH_RINGS; y <= centre.y + SEARCH_RINGS; y++) {
        for (let x = centre.x - SEARCH_RINGS; x <= centre.x + SEARCH_RINGS; x++) {
          const candidate = { x, y }
          const near = distance(candidate, ideal)
          if ((best && near >= best.d) || !usable(map, field, leader, candidate, taken, personalSpace)) continue
          const d = near + (isClearLine(map, leader, candidate) ? 0 : OUT_OF_SIGHT_PENALTY) + (ahead(candidate) ? AHEAD_PENALTY : 0)
          if (!best || d < best.d) best = { point: candidate, d }
        }
      }
      target = best?.point ?? clearUpTo(map, leader, ideal)
    }
    taken.push(target)
    return target
  })
}

function permutations(list) {
  if (list.length <= 1) return [list]
  return list.flatMap((item, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [item, ...rest]))
}

// Gives each follower a slot number (1..n) so the total walk is shortest, which keeps followers from crossing paths
// when an order or a new formation reshuffles the group. Returns { [followerId]: slotIndex }.
export function assignSlots(formation, followers, leader, heading, spacing) {
  const points = followers.map((_, i) => slotPoint(formation, i + 1, leader, heading, spacing))
  let best = null
  for (const order of permutations(followers.map((_, i) => i))) {
    const total = order.reduce((sum, slot, i) => sum + Math.hypot(points[slot].x - followers[i].position.x, points[slot].y - followers[i].position.y), 0)
    if (!best || total < best.total) best = { total, order }
  }
  return Object.fromEntries(followers.map((follower, i) => [follower.id, best.order[i] + 1]))
}
