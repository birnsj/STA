// Party control for exploration: the away team as independent characters in one world. Each member has their own
// position, collision, movement order and route, and keeps the RuntimeCharacter they were built from. Pure state
// (no React): the screen dispatches selection and move orders, and a 'tick' every animation frame.
//
// Orders: null (standing still), { type: 'point', target, run } (walk, or run, to a point), or
// { type: 'follow', leaderId, slot } (keep to formation slot `slot` around that leader, wherever they go).
// A move order goes to the selected characters only: the lead character walks to the point and the other selected
// characters follow in formation. Characters outside the selection keep whatever they were doing.
import { headingTo } from '../actors/CharacterController.js'
import { controllerFor, isUp } from '../actors/controllers.js'
import data from '../data/adaptation/exploration/partyControl.json'
import { isFireteamB, placeAwayTeam, splitFireteams } from './awayTeam.js'
import { assignSlots, DEFAULT_FORMATION_ID, formationTargets, getFormation } from './formations.js'
import { distance, isClear, isClearLine, nearestWalkableTile, planRoute, RADIUS, slide, tileOf, walkingDistances, walkingDistanceTo } from './navigation.js'

const MOVE = data.movement
// How readily a character gives way when two get too close: someone standing still never does, and a lead character
// mostly holds their line while followers step aside.
const GIVE_WAY = { none: 0, point: 0.35, follow: 1 }
// A parked follower (stopped because their spot is crowded) stands still like anyone without an order. Pushed about,
// they and the follower beside them would keep shuffling, walking on the spot, after the party has stopped.
const giveWay = (member) => (member.parkedFor ? GIVE_WAY.none : GIVE_WAY[member.order?.type ?? 'none'])
const MAX_TICK_SECONDS = 0.05

// A member standing still at position, looking along heading (radians).
function newMember(character, position, heading) {
  return {
    id: character.id,
    character,
    controllerId: 'player',
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
    blocked: { seconds: 0 },
  }
}

// characters: RuntimeCharacters in party order (up to MAX_AWAY_TEAM). Authored player starts first; extras beside them.
// Fireteam A (first four) starts selected; Fireteam B follows A's lead (designer 2026-10-16).
export function createPartyState(map, characters) {
  const members = placeAwayTeam(map, characters).map(({ character, position, heading }) => newMember(character, position, heading))
  const memberIds = members.map((member) => member.id)
  const byId = Object.fromEntries(members.map((member) => [member.id, member]))
  const { teamA } = splitFireteams(memberIds)
  const leaderId = teamA[0] ?? memberIds[0] ?? null
  const selectedIds = teamA.length ? [...teamA] : [...memberIds]
  let state = {
    map,
    memberIds,
    members: byId,
    selectedIds,
    leaderId,
    formationId: DEFAULT_FORMATION_ID,
    spacing: 1,
    // Beamed out (beamOut), in the order they left.
    departedIds: [],
  }
  if (leaderId) {
    const followers = memberIds.filter((id) => id !== leaderId)
    if (followers.length) {
      state = { ...state, members: formUp(state, state.members, leaderId, followers, state.members[leaderId].heading) }
    }
  }
  return state
}

export const getMembers = (state) => state.memberIds.map((id) => state.members[id])
export const isSelected = (state, id) => state.selectedIds.includes(id)

// A Defeated character stays where they fell: they can't be selected, lead or follow. Nor can anyone beaming out, or
// still beaming in.
export const canAct = (member) => isUp(member) && !member.beaming && !member.arriving

// Stop walk orders and leftover pace (Defeated, beaming, or mid blast stagger).
function plantMember(member) {
  if (!(member.order || member.moving || member.pace || member.running)) return member
  return { ...member, order: null, path: [], pace: null, moving: false, running: false }
}

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
  blocked: { seconds: 0 },
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
  let followerIds = selectedIds.filter((id) => id !== leaderId)
  // Fireteam B tags along when A (or a mixed selection) moves; a B-only selection moves only those members.
  const onlyB = selectedIds.every((id) => isFireteamB(state.memberIds, id))
  if (!onlyB) {
    const hitch = splitFireteams(state.memberIds).teamB.filter((id) => canAct(members[id]) && !selectedIds.includes(id))
    followerIds = [...followerIds, ...hitch]
  }
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
  let members = formUp(state, state.members, leaderId, followerIds, leader.heading)
  // Defeated / beaming keep no follow orders — they stay where they fell.
  for (const id of state.memberIds) {
    if (!canAct(members[id])) {
      const planted = plantMember(members[id])
      if (planted !== members[id]) members = { ...members, [id]: planted }
    }
  }
  return { ...state, selectedIds: able, leaderId, members }
}

function changeFormation(state, formationId) {
  const next = { ...state, formationId: getFormation(formationId).id }
  let { members } = next
  Object.entries(followGroups(members)).forEach(([leaderId, followerIds]) => {
    members = formUp(next, members, leaderId, followerIds, members[leaderId].heading)
  })
  return { ...next, members }
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
      const wa = giveWay(a)
      const wb = giveWay(b)
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

// A member's velocity averaged over about movingSmoothingSeconds (tiles per second), or null once it has died away.
// Back-and-forth shuffling averages out, so only real travel counts as moving.
function smoothPace(pace, velocity, seconds) {
  const k = Math.min(1, seconds / MOVE.movingSmoothingSeconds)
  const previous = pace ?? { x: 0, y: 0 }
  const next = { x: previous.x + (velocity.x - previous.x) * k, y: previous.y + (velocity.y - previous.y) * k }
  return Math.hypot(next.x, next.y) < 1e-3 ? null : next
}
const isMovingPace = (pace) => Boolean(pace) && Math.hypot(pace.x, pace.y) > MOVE.movingSpeed

// Each member's own controller (actors/PlayerController.js) steers them; the party then keeps everyone apart.
function tick(state, rawSeconds) {
  const seconds = Math.min(MAX_TICK_SECONDS, Math.max(0, rawSeconds))
  const current = getMembers(state)
  if (!seconds || !current.some((member) => member.order || member.moving || member.pace)) return state
  const followTargets = getFollowTargets(state)
  const steered = current.map((member) => {
    // Defeated / beaming / arriving: never steer — a leftover order must not slide a body across the floor.
    if (!member.order || !canAct(member) || member.blastReact) {
      return { member, velocity: { x: 0, y: 0 }, direction: null }
    }
    return controllerFor(member).exploreTick(member, { party: state, seconds, followTarget: followTargets[member.id], others: current })
  })
  const pushes = separation(current)
  let changed = false
  let members = {}
  steered.forEach(({ member, velocity, direction, run }, i) => {
    // Blast fall / getUp, or Defeated / beaming: stay planted — no walk, separation shove, or leftover pace slide.
    if (member.blastReact || !canAct(member)) {
      const planted = plantMember(member)
      if (planted !== member) changed = true
      members[member.id] = planted
      return
    }
    // PROTOTYPE (placeholder, flagged): a slowing hazard (the coolant leak; world/environment.js slowKeys) halves walking speed.
    const pace = state.map.slowKeys?.[`${Math.round(member.position.x)},${Math.round(member.position.y)}`] ? 0.5 : 1
    const step = { x: (velocity.x * pace + pushes[i].x) * seconds, y: (velocity.y * pace + pushes[i].y) * seconds }
    const stepping = Math.hypot(step.x, step.y) > 1e-4
    let next = member
    if (stepping) {
      const position = slide(state.map, member.position, step)
      const pace = smoothPace(member.pace, { x: (position.x - member.position.x) / seconds, y: (position.y - member.position.y) / seconds }, seconds)
      const moving = isMovingPace(pace)
      // A runner easing into place at the end, or held up, drops to a walk.
      const running = moving && Boolean(run) && Math.hypot(velocity.x, velocity.y) > MOVE.walkSpeed + 0.01
      next = { ...controllerFor(member).turn(member, direction, seconds), position, pace, moving, running }
      if (direction && Math.hypot(direction.x, direction.y) > 0.05) next.facing = { x: direction.x, y: direction.y }
    } else if (member.moving || member.pace) {
      // Not stepping at all: standing still at once, so the walk animation stops when they do.
      next = { ...member, pace: null, moving: false, running: false }
    }
    if (next !== current[i]) changed = true
    members[member.id] = next
  })
  // A Defeated character has no collision: the others walk over them.
  // Blast stagger stays planted: still collidable so others walk around, but resolveOverlaps must not shove them.
  const resolved = resolveOverlaps(state.map, members, state.memberIds.filter((id) => canAct(members[id])))
  if (resolved !== members) {
    const planted = { ...resolved }
    let shoved = false
    for (const id of state.memberIds) {
      if (members[id]?.blastReact && planted[id]?.position !== members[id].position) {
        planted[id] = members[id]
        shoved = true
      }
    }
    members = shoved ? planted : resolved
    changed = true
  }
  return changed ? { ...state, members: { ...state.members, ...members } } : state
}

// Those characters stop where they are, as does anyone following them; the leaving ones drop out of the selection.
function haltLeaving(state, leaving, changes) {
  const members = { ...state.members }
  Object.values(members).forEach((member) => {
    const gone = leaving.includes(member.id)
    if (gone || (member.order?.type === 'follow' && leaving.includes(member.order.leaderId))) {
      members[member.id] = { ...member, order: null, path: [], moving: false, running: false, pace: null, ...(gone ? changes : {}) }
    }
  })
  const selectedIds = state.selectedIds.filter((id) => !leaving.includes(id))
  const leaderId = selectedIds.includes(state.leaderId) ? state.leaderId : (selectedIds[0] ?? state.leaderId)
  return { ...state, members, selectedIds, leaderId }
}

// The transporter has locked on: they stand still and can't be selected or given orders until beamOut.
export function startBeamOut(state, ids) {
  const leaving = ids.filter((id) => state.memberIds.includes(id) && !state.members[id].beaming)
  return leaving.length ? withAbleSelection(haltLeaving(state, leaving, { beaming: true })) : state
}

// The beam-out was interrupted (a fight broke out): they stay on the mission.
export function cancelBeamOut(state, ids) {
  const members = { ...state.members }
  ids.filter((id) => members[id]?.beaming).forEach((id) => {
    members[id] = { ...members[id], beaming: false }
  })
  return { ...state, members }
}

// Characters beamed out leave the away team (memberIds and the selection) but stay in members, so whatever was logged
// or rolled by them can still be named. With everyone gone the lead stays put (the camera keeps looking there).
export function beamOut(state, ids) {
  const leaving = ids.filter((id) => state.memberIds.includes(id))
  if (!leaving.length) return state
  const halted = haltLeaving(state, leaving, { beaming: false })
  const memberIds = state.memberIds.filter((id) => !leaving.includes(id))
  const leaderId = memberIds.includes(halted.leaderId) ? halted.leaderId : (memberIds[0] ?? halted.leaderId)
  return withAbleSelection({ ...halted, memberIds, leaderId, departedIds: [...(state.departedIds ?? []), ...leaving] })
}

// Distances from the lead character tried in turn for someone beaming in, and how many spots around each ring.
const ARRIVAL_RINGS = [1.2, 1.8, 2.5, 3.2]
const ARRIVAL_SPOTS = 12

// A clear spot beside the lead (behind them first) in plain sight of them and away from everyone in taken; failing
// that, the walkable tile nearest the lead.
function arrivalPoint(map, leader, taken) {
  for (const ring of ARRIVAL_RINGS) {
    for (let i = 0; i < ARRIVAL_SPOTS; i++) {
      const angle = leader.heading + Math.PI + (i * 2 * Math.PI) / ARRIVAL_SPOTS
      const point = { x: leader.position.x + Math.cos(angle) * ring, y: leader.position.y + Math.sin(angle) * ring }
      if (isClear(map, point) && isClearLine(map, leader.position, point) && taken.every((other) => distance(other, point) >= RADIUS * 3)) return point
    }
  }
  return nearestWalkableTile(map, leader.position)
}

// The transporter (designer request, 2026-10-13): characters beam in beside the lead and stand still in the beam,
// unselectable, until finishBeamIn. characters: RuntimeCharacters not on the away team. Someone who beamed out earlier
// comes back as they left (their condition included). avoid: other points to keep clear of (the NPCs).
export function startBeamIn(state, characters, avoid = []) {
  const leader = state.members[state.leaderId]
  const arriving = characters.filter((character) => character && !state.memberIds.includes(character.id))
  if (!leader || !arriving.length) return state
  const taken = [...avoid, ...getMembers(state).map((member) => member.position)]
  const members = { ...state.members }
  arriving.forEach((character) => {
    const position = arrivalPoint(state.map, leader, taken)
    taken.push(position)
    const previous = members[character.id]
    members[character.id] = { ...previous, ...newMember(previous?.character ?? character, position, leader.heading), arriving: true }
  })
  const ids = arriving.map((character) => character.id)
  return { ...state, members, memberIds: [...state.memberIds, ...ids], departedIds: (state.departedIds ?? []).filter((id) => !ids.includes(id)) }
}

// The beam-in has played: they can be selected and given orders.
export function finishBeamIn(state, ids) {
  const members = { ...state.members }
  ids.filter((id) => members[id]?.arriving).forEach((id) => {
    members[id] = { ...members[id], arriving: false }
  })
  return { ...state, members }
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
    // Sneak on or off for one character (their radial menu), selected or not.
    case 'toggleSneakFor': {
      const member = state.members[action.id]
      if (!member) return state
      return { ...state, members: { ...state.members, [action.id]: { ...member, sneaking: !member.sneaking } } }
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
    case 'startBeamOut':
      return startBeamOut(state, action.ids)
    case 'cancelBeamOut':
      return cancelBeamOut(state, action.ids)
    case 'beamOut':
      return beamOut(state, action.ids)
    case 'startBeamIn':
      return startBeamIn(state, action.characters, action.avoid)
    case 'finishBeamIn':
      return finishBeamIn(state, action.ids)
    default:
      return state
  }
}
