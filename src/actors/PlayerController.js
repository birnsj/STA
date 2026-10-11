// A party member under the player's orders. In exploration the player's commands (select, move, formation, sneak) go
// through the party reducer (exploration/partyControl.js), which sets each member's order; this controller turns that
// order into movement each frame. The group behaviour stays with the party: formation targets, personal space and
// overlaps. In combat the human chooses (the combat screen dispatches) unless Auto Combat plays the party.
import { ambushStep, normalStep } from '../combat/autoCombat.js'
import { tileKey } from '../combat/battleMap.js'
import { canAmbush, canMove, canSprint, getBlockers, getCombatantList, getOpponents, getReachable, isActive } from '../combat/combatState.js'
import { getReachableTiles } from '../combat/movementSystem.js'
import { tileDistance } from '../combat/rangeSystem.js'
import data from '../data/adaptation/exploration/partyControl.json'
import { distance, isClearLine, planRoute } from '../exploration/navigation.js'
import { sneakCatchUpSpeed, sneakSpeed } from '../exploration/sneak.js'
import { worldToGrid } from '../exploration/tacticalGrid.js'
import { CharacterController, wrapAngle } from './CharacterController.js'

const MOVE = data.movement
const TURN_RATE = (MOVE.turnRateDegrees * Math.PI) / 180
const HEADING_DEADBAND = (MOVE.headingDeadbandDegrees * Math.PI) / 180
const AT_POINT = 0.04
const WAYPOINT_REACHED = 0.06
// A point order ends early when the character stops making progress near the end (someone is standing on the spot).
const STALL_SECONDS = 0.6
const STALL_NEAR = 1.2
const STALL_GIVE_UP_SECONDS = 2.5
// A follower who has moved less than BLOCKED_MOVE in BLOCKED_SECONDS stops ("parks") until their spot moves UNPARK_DISTANCE.
const BLOCKED_MOVE = 0.08
const BLOCKED_SECONDS = 0.8
const UNPARK_DISTANCE = 0.5
const STILL = { x: 0, y: 0 }

// Velocity toward the next waypoint (tiles per second), capped so the character stops on it rather than overshooting.
function seek(position, waypoint, speed, seconds) {
  const d = distance(position, waypoint)
  if (d < 1e-6) return { x: 0, y: 0 }
  const v = Math.min(speed, d / seconds)
  return { x: ((waypoint.x - position.x) / d) * v, y: ((waypoint.y - position.y) / d) * v }
}

const remainingLength = (position, path) => path.reduce((sum, point, i) => sum + distance(i ? path[i - 1] : position, point), 0)

// Right of way when two moving characters meet in a narrow gap: a character walking to a point (a lead character)
// first, then followers by slot. Lower goes first.
const rightOfWay = (member) => (member.order?.type === 'follow' ? member.order.slot : 0)

// Where this viewer last saw that enemy in a fight started in the world (combat.knowledge), as a tile, or null.
export const lastSeenPlace = (combat, viewerId, enemyId) => {
  const place = combat.knowledge?.[viewerId]?.[enemyId]?.lastKnownPosition
  return place ? worldToGrid(place) : null
}

export class PlayerController extends CharacterController {
  isPlayerControlled() {
    return true
  }

  // Auto Combat playing this member: the opening ambush while the party is unspotted, then the party AI.
  combatStep(state, self, { partyAI = 'classic', partyAmbush = true } = {}) {
    if (partyAmbush && canAmbush(state)) {
      const ambush = ambushStep(state, self, partyAI)
      if (ambush) return ambush
    }
    return normalStep(state, self, partyAI)
  }

  // A member the AI plays that sees no enemy hunts: it moves toward the nearest place an enemy still up was last seen,
  // else toward the nearest enemy still up (a fight goes on until every enemy is down, so the party must find them;
  // tracking it without a sighting is a prototype heuristic, flagged). link.searched: last-seen places already searched.
  searchStep(combat, self, { link, partyAuto }) {
    if (!partyAuto || !combat.knowledge?.[self.id] || getOpponents(combat, self).length) return null
    const hunted = getCombatantList(combat).filter((c) => c.side === 'enemy' && isActive(c))
    const byDistance = (a, b) => tileDistance(self.position, a) - tileDistance(self.position, b)
    const lastSeen = hunted
      .map((enemy) => ({ enemy, place: lastSeenPlace(combat, self.id, enemy.id) }))
      .filter(({ enemy, place }) => place && link.searched?.[enemy.id] !== tileKey(place))
      .map(({ place }) => place)
      .sort(byDistance)[0]
    const goal = lastSeen ?? hunted.map((enemy) => enemy.position).sort(byDistance)[0]
    if (!goal) return null
    const toward = getReachableTiles(combat.map, goal, combat.map.width * combat.map.height, { blockedKeys: getBlockers(combat, self).blockedKeys })
    const remaining = (position) => toward.get(tileKey(position))?.steps ?? Infinity
    for (const kind of ['move', 'sprint']) {
      if (!(kind === 'sprint' ? canSprint(combat, self) : canMove(combat, self))) continue
      const best = [...getReachable(combat, self, kind).values()].filter((entry) => entry.steps > 0).sort((a, b) => remaining(a.position) - remaining(b.position) || a.steps - b.steps)[0]
      if (best && remaining(best.position) < remaining(self.position)) {
        return {
          type: kind,
          destination: best.position,
          decision: lastSeen ? 'Search' : 'Track',
          reason: lastSeen ? `No enemy in sight; heading for where one was last seen (${goal.x},${goal.y}).` : 'No enemy in sight or last seen; tracking the nearest one still up.',
        }
      }
    }
    return null
  }

  // Back in exploration the member stands still where the fight left it, with no order (no return to its earlier
  // place, no formation snap).
  fromCombatant(member, combatant) {
    const back = super.fromCombatant(member, combatant)
    return {
      ...back,
      facing: { x: Math.cos(back.heading), y: Math.sin(back.heading) },
      turning: false,
      moving: false,
      running: false,
      order: null,
      path: [],
      replanIn: 0,
      stall: { seconds: 0, best: Infinity },
      parkedFor: null,
      blocked: { from: back.position, seconds: 0 },
    }
  }

  // ---------- exploration ----------

  // One frame of a member with an order: { member (new route and order), velocity, direction, run }.
  // ctx: { party (the party-control state), seconds, followTarget (their formation spot, when following), others (the
  // whole team as it stood at the start of the frame) }.
  exploreTick(member, { party, seconds, followTarget, others }) {
    const result = this.steer(party, member, seconds, followTarget)
    return this.mustGiveWay(member, result.direction, others) ? { ...result, velocity: STILL } : result
  }

  // The member's intended velocity this frame, plus their updated route and order.
  steer(party, member, seconds, followTarget) {
    const { map } = party
    if (member.order.type === 'point') {
      let path = member.path
      while (path.length > 1 && distance(member.position, path[0]) < WAYPOINT_REACHED) path = path.slice(1)
      let replanIn = member.replanIn - seconds
      if (replanIn <= 0) {
        replanIn = MOVE.replanSeconds
        // Pushed off the route (e.g. around a corner by a crowd): find a new one.
        if (path.length && !isClearLine(map, member.position, path[0])) path = planRoute(map, member.position, member.order.target)
      }
      const remaining = remainingLength(member.position, path)
      const progressed = remaining < member.stall.best - 0.05
      const stall = progressed ? { seconds: 0, best: remaining } : { ...member.stall, seconds: member.stall.seconds + seconds }
      const done = !path.length || remaining < AT_POINT || (stall.seconds > STALL_SECONDS && remaining < STALL_NEAR) || stall.seconds > STALL_GIVE_UP_SECONDS
      if (done) return { member: { ...member, order: null, path: [], stall: { seconds: 0, best: Infinity } }, velocity: { x: 0, y: 0 }, direction: null }
      // A sneaking character never runs (sneak.json).
      const run = member.order.run && !member.sneaking
      const speed = member.sneaking ? sneakSpeed(member.character) : run ? MOVE.runSpeed : MOVE.walkSpeed
      const velocity = seek(member.position, path[0], speed, seconds)
      return { member: { ...member, path, replanIn, stall }, velocity, direction: velocity, run }
    }

    const target = followTarget
    const toTarget = distance(member.position, target)
    const still = { member, velocity: { x: 0, y: 0 }, direction: null }
    if (member.parkedFor && distance(member.parkedFor, target) < UNPARK_DISTANCE) return still
    if (toTarget < AT_POINT) return member.path.length || member.parkedFor ? { ...still, member: { ...member, path: [], parkedFor: null } } : still
    // Trying to move but getting nowhere (the spot is wedged between others or against a wall): stay put until the spot moves.
    const blocked = distance(member.position, member.blocked.from) < BLOCKED_MOVE
    const blockedFor = blocked ? { from: member.blocked.from, seconds: member.blocked.seconds + seconds } : { from: member.position, seconds: 0 }
    if (blockedFor.seconds > BLOCKED_SECONDS) return { ...still, member: { ...member, path: [], parkedFor: target, blocked: { from: member.position, seconds: 0 } } }
    let path = member.path
    let replanIn = member.replanIn - seconds
    if (isClearLine(map, member.position, target)) {
      path = [target]
    } else {
      while (path.length > 1 && distance(member.position, path[0]) < WAYPOINT_REACHED) path = path.slice(1)
      if (replanIn <= 0 || !path.length) {
        path = planRoute(map, member.position, target)
        replanIn = MOVE.replanSeconds
      }
    }
    // Followers keep the leader's pace and hurry when they fall behind; close to the slot they ease in instead of bumping into it.
    const leaderOrder = party.members[member.order.leaderId]?.order
    const run = leaderOrder?.type === 'point' && leaderOrder.run && !member.sneaking
    const behind = toTarget > MOVE.catchUpDistance
    let speed
    if (member.sneaking) speed = behind ? sneakCatchUpSpeed(member.character) : sneakSpeed(member.character)
    else speed = behind ? (run ? MOVE.runCatchUpSpeed : MOVE.catchUpSpeed) : run ? MOVE.runSpeed : MOVE.walkSpeed
    if (toTarget < MOVE.arriveDistance) speed *= Math.max(0.25, toTarget / MOVE.arriveDistance)
    const velocity = seek(member.position, path[0], speed, seconds)
    return { member: { ...member, path, replanIn, parkedFor: null, blocked: blockedFor }, velocity, direction: velocity, run }
  }

  // Whether the member should wait a moment: someone with right of way is moving right in front of them. Without this,
  // two followers reaching a one-tile gap side by side push each other into its walls and neither gets through.
  mustGiveWay(member, direction, others) {
    if (member.order?.type !== 'follow' || !direction) return false
    const speed = Math.hypot(direction.x, direction.y)
    if (speed < 1e-3) return false
    return others.some((other) => {
      if (other === member || !other.moving || rightOfWay(other) >= rightOfWay(member)) return false
      const d = distance(member.position, other.position)
      if (d >= MOVE.personalSpace || d < 1e-4) return false
      return ((other.position.x - member.position.x) * direction.x + (other.position.y - member.position.y) * direction.y) / (d * speed) > 0
    })
  }

  // The formation turns with the direction the member walks, but small wobbles (a slight bend in the route) are ignored
  // and big turns are made gradually, so the slots around them don't jitter.
  turn(member, direction, seconds) {
    if (!direction || Math.hypot(direction.x, direction.y) < 1e-3) return member
    const diff = wrapAngle(Math.atan2(direction.y, direction.x) - member.heading)
    if (!member.turning && Math.abs(diff) < HEADING_DEADBAND) return member
    const step = Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * seconds)
    return { ...member, heading: wrapAngle(member.heading + step), turning: Math.abs(diff - step) > 0.02 }
  }
}
