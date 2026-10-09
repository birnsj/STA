// Party control for exploration: the away team as independent characters in one world. Each member has their own
// position, collision, movement order and route, and keeps the RuntimeCharacter they were built from. Pure state
// (no React): the screen dispatches selection and move orders, and a 'tick' every animation frame.
//
// Orders: null (standing still), { type: 'point', target, run } (walk, or run, to a point), or
// { type: 'follow', leaderId, slot } (keep to formation slot `slot` around that leader, wherever they go).
// A move order goes to the selected characters only: the lead character walks to the point and the other selected
// characters follow in formation. Characters outside the selection keep whatever they were doing.
import data from '../data/adaptation/exploration/partyControl.json'
import { isDefeated } from '../rules/personalCondition.js'
import { assignSlots, DEFAULT_FORMATION_ID, formationTargets, getFormation } from './formations.js'
import { distance, isClearLine, planRoute, RADIUS, slide, tileOf, walkingDistances, walkingDistanceTo } from './navigation.js'
import { sneakCatchUpSpeed, sneakSpeed } from './sneak.js'

const MOVE = data.movement
const TURN_RATE = (MOVE.turnRateDegrees * Math.PI) / 180
const HEADING_DEADBAND = (MOVE.headingDeadbandDegrees * Math.PI) / 180
// How readily a character gives way when two get too close: someone standing still never does, and a lead character
// mostly holds their line while followers step aside.
const GIVE_WAY = { none: 0, point: 0.35, follow: 1 }
const MAX_TICK_SECONDS = 0.05
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

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))
const headingTo = (from, to) => Math.atan2(to.y - from.y, to.x - from.x)

// characters: RuntimeCharacters in party order; each starts on the map's player start with the same index.
export function createPartyState(map, characters) {
  const starts = map.markers.playerStarts
  const centre = { x: (map.width - 1) / 2, y: (map.height - 1) / 2 }
  const members = characters.slice(0, starts.length).map((character, index) => {
    const position = { ...starts[index] }
    const heading = headingTo(position, centre)
    return {
      id: character.id,
      character,
      position,
      heading,
      turning: false,
      facing: { x: Math.cos(heading), y: Math.sin(heading) },
      moving: false,
      running: false,
      sneaking: false,
      order: null,
      path: [],
      replanIn: 0,
      stall: { seconds: 0, best: Infinity },
      parkedFor: null,
      blocked: { from: position, seconds: 0 },
    }
  })
  const memberIds = members.map((member) => member.id)
  return {
    map,
    memberIds,
    members: Object.fromEntries(members.map((member) => [member.id, member])),
    selectedIds: [...memberIds],
    leaderId: memberIds[0] ?? null,
    formationId: DEFAULT_FORMATION_ID,
    spacing: 1,
  }
}

export const getMembers = (state) => state.memberIds.map((id) => state.members[id])
export const isSelected = (state, id) => state.selectedIds.includes(id)

// A Defeated character stays where they fell: they can't be selected, lead or follow.
export const canAct = (member) => Boolean(member) && !isDefeated(member.condition)

// After a fight: anyone Defeated drops out of the selection and the lead. If no one selected can act, the whole team
// that can is selected. With everyone down the lead stays put (the camera follows it) and nothing is selected.
export function withAbleSelection(state) {
  const able = state.memberIds.filter((id) => canAct(state.members[id]))
  const kept = state.selectedIds.filter((id) => able.includes(id))
  const selectedIds = kept.length ? kept : able
  const leaderId = selectedIds.includes(state.leaderId) ? state.leaderId : (selectedIds[0] ?? state.leaderId)
  return { ...state, selectedIds, leaderId }
}

// Where every following character is heading right now: { [id]: point }. Worked out per leader so the followers'
// spots never coincide, and kept clear of anyone standing still outside the group.
export function getFollowTargets(state) {
  const formation = getFormation(state.formationId)
  const members = getMembers(state)
  const targets = {}
  Object.entries(followGroups(state.members)).forEach(([leaderId, ids]) => {
    const leader = state.members[leaderId]
    const bySlot = [...ids].sort((a, b) => state.members[a].order.slot - state.members[b].order.slot)
    const avoid = members.filter((member) => !member.order && member.id !== leaderId && canAct(member)).map((member) => member.position)
    const slots = bySlot.map((id) => state.members[id].order.slot)
    const points = formationTargets(state.map, formation, slots, leader.position, leader.heading, state.spacing, { avoid, personalSpace: MOVE.personalSpace })
    bySlot.forEach((id, i) => {
      targets[id] = points[i]
    })
  })
  return targets
}

// 'grouped' when the whole team moves as one (everyone follows the same leader), or everyone stands within a short
// walk of the lead character; otherwise 'separated'.
export function getCohesion(state) {
  const leader = state.members[state.leaderId]
  if (!leader) return 'separated'
  const members = getMembers(state).filter(canAct)
  const groupOf = (member) => (member.order?.type === 'follow' ? member.order.leaderId : member.id)
  if (new Set(members.map(groupOf)).size === 1) return 'grouped'
  const field = walkingDistances(state.map, tileOf(leader.position), MOVE.groupedDistance)
  return members.every((member) => walkingDistanceTo(state.map, field, member.position) <= MOVE.groupedDistance) ? 'grouped' : 'separated'
}

const pointOrder = (map, member, target, run = false) => ({
  ...member,
  order: { type: 'point', target, run },
  path: planRoute(map, member.position, target),
  replanIn: MOVE.replanSeconds,
  stall: { seconds: 0, best: Infinity },
})
const followOrder = (member, leaderId, slot) => ({
  ...member,
  order: { type: 'follow', leaderId, slot },
  path: [],
  replanIn: 0,
  parkedFor: null,
  blocked: { from: member.position, seconds: 0 },
})

// Gives a leader's followers formation slots, shortest total walk first.
function formUp(state, members, leaderId, followerIds, heading) {
  if (!followerIds.length) return members
  const leader = members[leaderId]
  const slots = assignSlots(getFormation(state.formationId), followerIds.map((id) => members[id]), leader.position, heading, state.spacing)
  const next = { ...members }
  followerIds.forEach((id) => {
    next[id] = followOrder(members[id], leaderId, slots[id])
  })
  return next
}

// The characters currently following each leader: { [leaderId]: [followerIds] }.
function followGroups(members) {
  const groups = {}
  Object.values(members).forEach((member) => {
    if (member.order?.type === 'follow') (groups[member.order.leaderId] ??= []).push(member.id)
  })
  return groups
}

function moveSelection(state, target, fresh) {
  const { selectedIds, leaderId } = state
  if (!selectedIds.length || !state.members[leaderId]) return state
  let members = { ...state.members }
  // Anyone still following a selected character but not selected themselves stops at the spot they were heading for.
  const followTargets = getFollowTargets(state)
  Object.values(members).forEach((member) => {
    if (selectedIds.includes(member.id) || member.order?.type !== 'follow' || !selectedIds.includes(member.order.leaderId)) return
    members[member.id] = pointOrder(state.map, member, followTargets[member.id])
  })
  const leader = members[leaderId]
  members[leaderId] = pointOrder(state.map, leader, target, distance(leader.position, target) > MOVE.runDistance)
  const followerIds = selectedIds.filter((id) => id !== leaderId)
  // While the mouse is held the destination changes constantly; slots are only reshuffled on a new press.
  const alreadyFollowing = followerIds.every((id) => members[id].order?.type === 'follow' && members[id].order.leaderId === leaderId)
  if (fresh || !alreadyFollowing) {
    const heading = distance(leader.position, target) > 0.5 ? headingTo(leader.position, target) : leader.heading
    members = formUp(state, members, leaderId, followerIds, heading)
  }
  return { ...state, members }
}

function regroup(state) {
  const able = state.memberIds.filter((id) => canAct(state.members[id]))
  const leaderId = able.includes(state.leaderId) ? state.leaderId : able[0]
  if (!leaderId) return state
  const leader = state.members[leaderId]
  const followerIds = able.filter((id) => id !== leaderId)
  return { ...state, selectedIds: able, leaderId, members: formUp(state, state.members, leaderId, followerIds, leader.heading) }
}

function changeFormation(state, formationId) {
  const next = { ...state, formationId: getFormation(formationId).id }
  let { members } = next
  Object.entries(followGroups(members)).forEach(([leaderId, followerIds]) => {
    members = formUp(next, members, leaderId, followerIds, members[leaderId].heading)
  })
  return { ...next, members }
}

// Velocity toward the next waypoint (tiles per second), capped so the character stops on it rather than overshooting.
function seek(position, waypoint, speed, seconds) {
  const d = distance(position, waypoint)
  if (d < 1e-6) return { x: 0, y: 0 }
  const v = Math.min(speed, d / seconds)
  return { x: ((waypoint.x - position.x) / d) * v, y: ((waypoint.y - position.y) / d) * v }
}

const remainingLength = (position, path) => path.reduce((sum, point, i) => sum + distance(i ? path[i - 1] : position, point), 0)

// One character's intended velocity this frame, plus their updated route and order.
function steer(state, member, seconds, followTarget) {
  const { map } = state
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
  const leaderOrder = state.members[member.order.leaderId]?.order
  const run = leaderOrder?.type === 'point' && leaderOrder.run && !member.sneaking
  const behind = toTarget > MOVE.catchUpDistance
  let speed
  if (member.sneaking) speed = behind ? sneakCatchUpSpeed(member.character) : sneakSpeed(member.character)
  else speed = behind ? (run ? MOVE.runCatchUpSpeed : MOVE.catchUpSpeed) : run ? MOVE.runSpeed : MOVE.walkSpeed
  if (toTarget < MOVE.arriveDistance) speed *= Math.max(0.25, toTarget / MOVE.arriveDistance)
  const velocity = seek(member.position, path[0], speed, seconds)
  return { member: { ...member, path, replanIn, parkedFor: null, blocked: blockedFor }, velocity, direction: velocity, run }
}

// Pushes apart any two characters closer than personal space, so nobody stacks on anyone else. Defeated characters
// take no part.
function separation(list) {
  const pushes = list.map(() => ({ x: 0, y: 0 }))
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      if (!canAct(a) || !canAct(b)) continue
      const d = distance(a.position, b.position)
      if (d >= MOVE.personalSpace) continue
      const wa = GIVE_WAY[a.order?.type ?? 'none']
      const wb = GIVE_WAY[b.order?.type ?? 'none']
      if (!wa && !wb) continue
      // Exactly on top of each other: split along a fixed direction so the result doesn't depend on rounding.
      const dir = d > 1e-4 ? { x: (b.position.x - a.position.x) / d, y: (b.position.y - a.position.y) / d } : { x: Math.cos(i + j), y: Math.sin(i + j) }
      const overlap = (MOVE.personalSpace - d) * MOVE.separationStrength
      const shareA = wa / (wa + wb)
      const shareB = wb / (wa + wb)
      pushes[i].x -= dir.x * overlap * shareA
      pushes[i].y -= dir.y * overlap * shareA
      pushes[j].x += dir.x * overlap * shareB
      pushes[j].y += dir.y * overlap * shareB
    }
  }
  return pushes
}

// The formation turns with the direction the character walks, but small wobbles (a slight bend in the route) are ignored
// and big turns are made gradually, so the slots around them don't jitter.
function turn(member, direction, seconds) {
  if (!direction || Math.hypot(direction.x, direction.y) < 1e-3) return member
  const diff = wrapAngle(Math.atan2(direction.y, direction.x) - member.heading)
  if (!member.turning && Math.abs(diff) < HEADING_DEADBAND) return member
  const step = Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * seconds)
  return { ...member, heading: wrapAngle(member.heading + step), turning: Math.abs(diff - step) > 0.02 }
}

// Right of way when two moving characters meet in a narrow gap: a character walking to a point (a lead character)
// first, then followers by slot. Lower goes first.
const rightOfWay = (member) => (member.order?.type === 'follow' ? member.order.slot : 0)

// Whether a character should wait a moment: someone with right of way is moving right in front of them. Without this,
// two followers reaching a one-tile gap side by side push each other into its walls and neither gets through.
function mustGiveWay(member, direction, others) {
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

function tick(state, rawSeconds) {
  const seconds = Math.min(MAX_TICK_SECONDS, Math.max(0, rawSeconds))
  const current = getMembers(state)
  if (!seconds || !current.some((member) => member.order)) return state
  const followTargets = getFollowTargets(state)
  const steered = current.map((member) => {
    if (!member.order) return { member, velocity: { x: 0, y: 0 }, direction: null }
    const result = steer(state, member, seconds, followTargets[member.id])
    return mustGiveWay(member, result.direction, current) ? { ...result, velocity: { x: 0, y: 0 } } : result
  })
  const pushes = separation(current)
  let changed = false
  let members = {}
  steered.forEach(({ member, velocity, direction, run }, i) => {
    const step = { x: (velocity.x + pushes[i].x) * seconds, y: (velocity.y + pushes[i].y) * seconds }
    const moving = Math.hypot(step.x, step.y) > 1e-4
    let next = member
    if (moving) {
      const position = slide(state.map, member.position, step)
      const moved = distance(position, member.position) > 1e-5
      // A runner easing into place at the end, or held up, drops to a walk.
      const running = moved && Boolean(run) && Math.hypot(velocity.x, velocity.y) > MOVE.walkSpeed + 0.01
      next = { ...turn(member, direction, seconds), position, moving: moved, running }
      if (direction && Math.hypot(direction.x, direction.y) > 0.05) next.facing = { x: direction.x, y: direction.y }
    } else if (member.moving) {
      next = { ...member, moving: false, running: false }
    }
    if (next !== current[i]) changed = true
    members[member.id] = next
  })
  // A Defeated character has no collision: the others walk over them.
  const resolved = resolveOverlaps(state.map, members, state.memberIds.filter((id) => canAct(members[id])))
  if (resolved !== members) {
    members = resolved
    changed = true
  }
  return changed ? { ...state, members } : state
}

// Personal space is soft (characters may brush past each other), but bodies never overlap: any two closer than two
// radii are moved apart at once, by whoever gives way, without being pushed into a wall.
function resolveOverlaps(map, members, ids) {
  const minimum = RADIUS * 2
  let result = members
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = result[ids[i]]
      const b = result[ids[j]]
      const d = distance(a.position, b.position)
      if (d >= minimum) continue
      const wa = GIVE_WAY[a.order?.type ?? 'none']
      const wb = GIVE_WAY[b.order?.type ?? 'none']
      if (!wa && !wb) continue
      const dir = d > 1e-4 ? { x: (b.position.x - a.position.x) / d, y: (b.position.y - a.position.y) / d } : { x: Math.cos(i + j), y: Math.sin(i + j) }
      const gap = minimum - d
      const shareA = (gap * wa) / (wa + wb)
      const shareB = (gap * wb) / (wa + wb)
      if (result === members) result = { ...members }
      if (shareA) result[a.id] = { ...a, position: slide(map, a.position, { x: -dir.x * shareA, y: -dir.y * shareA }) }
      if (shareB) result[b.id] = { ...b, position: slide(map, b.position, { x: dir.x * shareB, y: dir.y * shareB }) }
    }
  }
  return result
}

export function partyReducer(state, action) {
  switch (action.type) {
    case 'reset':
      return createPartyState(action.map, action.characters)
    // Selects one character only: they lead, and only they receive move orders.
    case 'select':
      return canAct(state.members[action.id]) ? { ...state, selectedIds: [action.id], leaderId: action.id } : state
    // Adds a character to the selection or takes them out of it; the last selected character stays selected.
    case 'toggleSelect': {
      if (!canAct(state.members[action.id])) return state
      if (!isSelected(state, action.id)) {
        const selectedIds = state.memberIds.filter((id) => id === action.id || isSelected(state, id))
        return { ...state, selectedIds, leaderId: state.selectedIds.length ? state.leaderId : action.id }
      }
      if (state.selectedIds.length === 1) return state
      const selectedIds = state.selectedIds.filter((id) => id !== action.id)
      return { ...state, selectedIds, leaderId: state.leaderId === action.id ? selectedIds[0] : state.leaderId }
    }
    // Box selection: the characters inside the box (ids) become the selection, or join it when additive. A box with no
    // one able to act inside changes nothing. The lead stays if still selected, else the first selected in team order.
    case 'selectBox': {
      const boxed = action.ids.filter((id) => canAct(state.members[id]))
      if (!boxed.length) return state
      const selectedIds = state.memberIds.filter((id) => boxed.includes(id) || (action.additive && isSelected(state, id)))
      return { ...state, selectedIds, leaderId: selectedIds.includes(state.leaderId) ? state.leaderId : selectedIds[0] }
    }
    // Selects the whole team; everyone walks back into formation around the lead character. Nobody is moved instantly.
    case 'regroup':
      return regroup(state)
    // Sneak on or off for the selected characters: on for all of them unless every one is already sneaking.
    case 'toggleSneak': {
      if (!state.selectedIds.length) return state
      const sneaking = !state.selectedIds.every((id) => state.members[id].sneaking)
      const members = { ...state.members }
      state.selectedIds.forEach((id) => {
        members[id] = { ...members[id], sneaking }
      })
      return { ...state, members }
    }
    case 'setLeader':
      return isSelected(state, action.id) ? { ...state, leaderId: action.id } : state
    case 'setFormation':
      return changeFormation(state, action.formationId)
    case 'setSpacing':
      return { ...state, spacing: action.spacing }
    // target: a world point in tiles. fresh: a new click or press (false while the mouse is held and dragged).
    case 'moveTo':
      return moveSelection(state, action.target, action.fresh !== false)
    case 'tick':
      return tick(state, action.seconds)
    default:
      return state
  }
}
