// NPC awareness in exploration: what each NPC perceives of each away-team member, how sure it is, and how it reacts.
// Pure state (no React), advanced by tickWorld every frame with the party's current positions.
//
// Awareness is per NPC per party member: { state, confidence, lastKnownPosition, lastSeenTime }. Seeing one character
// tells an NPC nothing about the others; out of sight it keeps only the last position it saw. Information reaches
// other NPCs only through explicit events: noises (emitNoise) and group alerts (alertGroup).
//
// Detection and reaction are separate: awareness says what the NPC knows; its disposition (or responseType) says what
// it does once it has identified someone. COMBAT_READY is a state and an event here; combatLink.js starts combat from it.
// Tuning: src/data/adaptation/exploration/awareness.json.
import { blocksLineOfFire } from '../combat/battleMap.js'
import data from '../data/adaptation/exploration/awareness.json'
import { isDefeated } from '../rules/personalCondition.js'
import { distance, planRoute, RADIUS, slide } from './navigation.js'
import { sneakDetectionMultiplier, sneakSkill } from './sneak.js'

export const STATE = { UNAWARE: 'UNAWARE', SUSPICIOUS: 'SUSPICIOUS', INVESTIGATING: 'INVESTIGATING', ALERTED: 'ALERTED', COMBAT_READY: 'COMBAT_READY' }
const RANK = { UNAWARE: 0, SUSPICIOUS: 1, INVESTIGATING: 2, ALERTED: 3, COMBAT_READY: 4 }
const STATE_NAMES = Object.fromEntries(data.states.map((state) => [state.id, state.name]))
const DISPOSITIONS = Object.fromEntries(data.dispositions.map((disposition) => [disposition.id, disposition]))
const ALERT_METHODS = Object.fromEntries(data.alertMethods.map((method) => [method.id, method]))
const T = data.timing
const V = data.vision
const MOVE = data.movement
const STEPS = data.footsteps

const toRadians = (degrees) => (degrees * Math.PI) / 180
const TURN_RATE = toRadians(MOVE.turnRateDegrees)
const SEARCH_SWEEP = toRadians(T.searchSweepDegrees)
const MAX_TICK_SECONDS = 0.05
const MAX_EVENTS = 40
const NOISE_SHOW_SECONDS = 1.5
const WAYPOINT_REACHED = 0.06
// An NPC that can't get any closer to where it is walking (a party member in the way) gives up after this long.
const STUCK_SECONDS = 1.5
// Which investigation wins when a new one comes up: checking on a character it identified beats one it only glimpsed,
// which beats a noise.
const PRIORITY = { noise: 1, alert: 1, glimpse: 2, lost: 3 }

export const stateName = (id) => STATE_NAMES[id] ?? id
export const dispositionName = (id) => DISPOSITIONS[id]?.name ?? id
export const alertMethodName = (id) => ALERT_METHODS[id]?.name ?? id

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))
const headingTo = (from, to) => Math.atan2(to.y - from.y, to.x - from.x)
const toPoint = ([x, y]) => ({ x, y })
const EMPTY_RECORD = { state: STATE.UNAWARE, confidence: 0, lastKnownPosition: null, lastSeenTime: null, reported: false, searched: false }

// Whether anything that blocks sight lies between two points. Walks the tiles the line crosses (each tile x covers
// x - 0.5 .. x + 0.5); the two end tiles don't count. A line squeezing exactly between two diagonal blocking tiles is
// blocked, so nobody sees through the corner where two walls meet.
export function hasLineOfSight(map, a, b) {
  let x = Math.round(a.x)
  let y = Math.round(a.y)
  const end = { x: Math.round(b.x), y: Math.round(b.y) }
  const dx = b.x - a.x
  const dy = b.y - a.y
  const stepX = Math.sign(dx)
  const stepY = Math.sign(dy)
  const deltaX = stepX ? Math.abs(1 / dx) : Infinity
  const deltaY = stepY ? Math.abs(1 / dy) : Infinity
  let nextX = stepX ? (stepX > 0 ? x + 0.5 - a.x : a.x - (x - 0.5)) * deltaX : Infinity
  let nextY = stepY ? (stepY > 0 ? y + 0.5 - a.y : a.y - (y - 0.5)) * deltaY : Infinity
  const blocks = (tx, ty) => blocksLineOfFire(map, { x: tx, y: ty })
  const maxSteps = Math.abs(end.x - x) + Math.abs(end.y - y) + 2
  for (let i = 0; i < maxSteps && (x !== end.x || y !== end.y); i++) {
    if (Math.abs(nextX - nextY) < 1e-9) {
      if (blocks(x + stepX, y) && blocks(x, y + stepY)) return false
      x += stepX
      y += stepY
      nextX += deltaX
      nextY += deltaY
    } else if (nextX < nextY) {
      x += stepX
      nextX += deltaX
    } else {
      y += stepY
      nextY += deltaY
    }
    if ((x !== end.x || y !== end.y) && blocks(x, y)) return false
  }
  return true
}

// What an NPC sees of one party member this frame: null (not seen), or how fast its confidence builds.
// Deterministic: inside the cone, in range and in line of sight means seen.
export function perceive(map, npc, member) {
  const p = npc.perception
  const d = distance(npc.position, member.position)
  if (d > p.visionRange) return null
  const halfView = toRadians(p.fieldOfView) / 2
  const angle = d < 1e-6 ? 0 : Math.abs(wrapAngle(headingTo(npc.position, member.position) - npc.heading))
  if (angle > halfView) return null
  if (!hasLineOfSight(map, npc.position, member.position)) return null
  if (d <= p.closeRange) return { immediate: true, rate: Infinity }
  let rate = 1
  if (d > p.normalRange) {
    rate *= V.longRangeMultiplier
    if (!member.moving) rate *= V.stationaryAtLongRangeMultiplier
  }
  if (angle > halfView * V.peripheralFraction) rate *= V.peripheralMultiplier
  if (member.sneaking) rate *= sneakDetectionMultiplier(member.character, member.moving)
  else if (member.moving) rate *= member.running ? V.runningMultiplier : V.movingMultiplier
  return { immediate: false, rate }
}

const clampFactor = (value) => Math.min(STEPS.maxFactor, Math.max(STEPS.minFactor, value))
const listenSkill = (character) => (character ? (character.attributes?.insight ?? 0) + (character.disciplines?.security ?? 0) : STEPS.referenceSkill)
const moveSkill = (character) => (character ? sneakSkill(character) : STEPS.referenceSkill)

// What an NPC hears of one party member's footsteps this frame: null (nothing), or how fast its hearing meter fills.
export function footstepNoise(map, npc, member) {
  if (!member.moving) return null
  const gait = member.sneaking ? STEPS.sneak : member.running ? STEPS.run : STEPS.walk
  if (!gait.radius || !gait.rate) return null
  const mover = clampFactor(1 - STEPS.moverPerPoint * (moveSkill(member.character) - STEPS.referenceSkill))
  const listener = clampFactor(1 + STEPS.listenerPerPoint * (listenSkill(npc.character) - STEPS.referenceSkill))
  const radius = Math.min(gait.radius * mover * listener, npc.perception.hearingRange)
  if (distance(npc.position, member.position) > radius) return null
  if (!hasLineOfSight(map, npc.position, member.position)) return null
  return { rate: gait.rate, radius }
}

// config: one NPC from npcs.json (position and patrol as [x, y]); character: its RuntimeCharacter, if any.
// The NPC is the world actor: who controls it, how it feels about the away team, what it knows and where it is. Who the
// person is (stats, species, faction, equipment) is only ever its character; nothing here copies or overrides it.
export function createNpc(config, character = null) {
  const position = toPoint(config.position)
  const heading = toRadians(config.facing ?? 0)
  const patrol = config.patrol?.length
    ? { points: config.patrol.map((point) => ({ position: toPoint(point.at), wait: point.wait ?? 0, facing: point.facing == null ? null : toRadians(point.facing) })), index: 0, waitLeft: null }
    : null
  return {
    id: config.id,
    name: config.name ?? character?.name ?? config.id,
    characterId: character?.id ?? null,
    character,
    // 'ai' for every NPC today; who controls an actor is never read from its character.
    controller: config.controller ?? 'ai',
    disposition: DISPOSITIONS[config.disposition] ? config.disposition : 'neutral',
    responseType: config.responseType ?? null,
    alertGroupId: config.alertGroupId ?? null,
    alertMethod: ALERT_METHODS[config.alertMethod] ? config.alertMethod : data.defaultAlertMethod,
    perception: { ...data.perceptionDefaults, ...config.perception },
    position,
    heading,
    home: { position, heading },
    patrol,
    moving: false,
    path: [],
    pathGoal: null,
    stuck: { best: Infinity, seconds: 0 },
    // Per party member: { [characterId]: record }.
    awareness: {},
    visibleIds: [],
    // Suspicion about nobody in particular (a noise, a vague group alert), 0..1.
    suspicion: 0,
    // { position, targetId (null for a noise), reason, priority, phase: 'react' | 'moving' | 'searching', timeLeft, baseHeading }
    investigation: null,
    // A non-investigating NPC turning to look at a noise: { position, timeLeft }.
    glance: null,
    // Footsteps heard (footstepNoise): level 0..1 and where the nearest heard character was.
    hearing: { level: 0, position: null },
    focusId: null,
    state: STATE.UNAWARE,
    // The reaction to an identified character: { type: 'observe' | 'confront' | 'alarm' | 'combat', targetId, since }.
    response: null,
    groupAlerted: false,
    alarmAt: null,
    // Latched once reached: { targetId, time }.
    combatReady: null,
    // After a fight: { stress, injuries, defeated, dying } (rules/personalCondition.js). null = never fought.
    condition: null,
  }
}

// Defeated in a fight (rules/personalCondition.js): stays where it fell and no longer perceives, moves or reacts.
export const isDown = (npc) => isDefeated(npc.condition)
export const joinsCombat = (npc) => Boolean(DISPOSITIONS[npc.disposition]?.joinsCombat)
// Identified by the NPC itself (Alerted and not merely told about by its group).
export const hasIdentified = (npc, characterId) => {
  const record = npc.awareness[characterId]
  return npc.combatReady?.targetId === characterId || Boolean(record && record.state === STATE.ALERTED && !record.reported)
}

export function createWorld(map, npcs) {
  return { map, time: 0, npcIds: npcs.map((npc) => npc.id), npcs: Object.fromEntries(npcs.map((npc) => [npc.id, npc])), events: [], noises: [] }
}

export const getNpcs = (world) => world.npcIds.map((id) => world.npcs[id])

const startInvestigation = (position, targetId, reason, phase) => ({
  position: { ...position },
  targetId,
  reason,
  priority: PRIORITY[reason],
  phase,
  timeLeft: phase === 'react' ? T.reactSeconds : 0,
  baseHeading: 0,
})
const canStart = (current, reason) => !current || PRIORITY[reason] >= current.priority

// One party member's awareness record when the NPC can't see them this frame.
function whileUnseen(record, id, npc, disposition, time, seconds, investigation) {
  const sinceSeen = time - (record.lastSeenTime ?? time)
  if (record.state === STATE.ALERTED) {
    if (!record.reported && sinceSeen <= T.alertedHoldSeconds) return { record, investigation }
    if (!disposition.investigates) return { record: { ...record, state: STATE.SUSPICIOUS, confidence: Math.min(record.confidence, T.confidenceAfterSearch), reported: false, searched: true }, investigation }
    if (!canStart(investigation, 'lost')) return { record, investigation }
    return { record: { ...record, state: STATE.INVESTIGATING, reported: false }, investigation: startInvestigation(record.lastKnownPosition, id, 'lost', 'moving') }
  }
  if (record.state === STATE.INVESTIGATING) {
    if (investigation?.targetId === id) return { record, investigation }
    return { record: { ...record, state: STATE.SUSPICIOUS, confidence: Math.min(record.confidence, T.confidenceAfterSearch), searched: true }, investigation }
  }
  // Suspicious: after a moment, go and look (once), otherwise let it fade.
  if (sinceSeen <= T.suspiciousHoldSeconds) return { record, investigation }
  if (disposition.investigates && !record.searched && canStart(investigation, 'glimpse')) {
    return { record: { ...record, state: STATE.INVESTIGATING }, investigation: startInvestigation(record.lastKnownPosition, id, 'glimpse', 'moving') }
  }
  const confidence = record.confidence - npc.perception.awarenessDecayRate * seconds
  if (confidence > 0) return { record: { ...record, confidence }, investigation }
  return { record: { ...EMPTY_RECORD, lastKnownPosition: record.lastKnownPosition, lastSeenTime: record.lastSeenTime }, investigation }
}

const pickFocus = (awareness, visibleIds) => {
  const ids = Object.keys(awareness).filter((id) => awareness[id].state !== STATE.UNAWARE)
  const score = (id) => (visibleIds.includes(id) ? 10 : 0) + RANK[awareness[id].state] + awareness[id].confidence
  return ids.sort((a, b) => score(b) - score(a))[0] ?? null
}

const turnToward = (heading, target, seconds) => {
  const diff = wrapAngle(target - heading)
  return wrapAngle(heading + Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * seconds))
}

// Walks an NPC toward a goal along a planned route. Returns its new position, route and whether it has arrived.
function walk(map, npc, goal, speed, seconds) {
  let path = npc.path
  const replan = !npc.pathGoal || distance(npc.pathGoal, goal) > 0.5 || !path.length
  if (replan) path = planRoute(map, npc.position, goal)
  while (path.length > 1 && distance(npc.position, path[0]) < WAYPOINT_REACHED) path = path.slice(1)
  // Progress is measured along the route: going round a wall first leads away from the goal in a straight line.
  const remaining = path.reduce((sum, point, i) => sum + distance(i ? path[i - 1] : npc.position, point), 0)
  const best = replan ? Infinity : npc.stuck.best
  const stuck = remaining < best - 0.05 ? { best: remaining, seconds: 0 } : { best, seconds: npc.stuck.seconds + seconds }
  const waypoint = path[0]
  if (!waypoint || remaining < MOVE.arriveDistance || (path.length === 1 && distance(npc.position, waypoint) < WAYPOINT_REACHED) || stuck.seconds > STUCK_SECONDS) {
    return { position: npc.position, path: [], pathGoal: null, stuck: { best: Infinity, seconds: 0 }, arrived: true, direction: null }
  }
  const d = distance(npc.position, waypoint)
  const step = Math.min(speed * seconds, d)
  const delta = { x: ((waypoint.x - npc.position.x) / d) * step, y: ((waypoint.y - npc.position.y) / d) * step }
  return { position: slide(map, npc.position, delta), path, pathGoal: { ...goal }, stuck, arrived: false, direction: Math.atan2(delta.y, delta.x) }
}

// NPCs never stand inside a party member or another NPC: anyone walking into one pushes it aside.
function keepClear(map, position, bodies) {
  let result = position
  bodies.forEach((body) => {
    const d = distance(result, body.position)
    if (d >= RADIUS * 2) return
    const dir = d > 1e-4 ? { x: (result.x - body.position.x) / d, y: (result.y - body.position.y) / d } : { x: 1, y: 0 }
    result = slide(map, result, { x: dir.x * (RADIUS * 2 - d), y: dir.y * (RADIUS * 2 - d) })
  })
  return result
}

// otherNpcs: the other NPCs as they stood last frame (only their bodies matter here).
function updateNpc(map, npc, members, otherNpcs, time, seconds, emit) {
  const disposition = DISPOSITIONS[npc.disposition]
  const responseType = npc.responseType ?? disposition.response
  let investigation = npc.investigation
  const awareness = {}
  const visibleIds = []

  // 1. Perception, one party member at a time.
  members.forEach((member) => {
    let record = npc.awareness[member.id] ?? EMPTY_RECORD
    const seen = perceive(map, npc, member)
    if (seen) {
      visibleIds.push(member.id)
      const confidence = seen.immediate ? 1 : Math.min(1, record.confidence + npc.perception.awarenessBuildRate * seen.rate * seconds)
      let state = record.state
      if (confidence >= 1) state = STATE.ALERTED
      else if (state === STATE.UNAWARE) state = STATE.SUSPICIOUS
      record = { state, confidence, lastKnownPosition: { ...member.position }, lastSeenTime: time, reported: false, searched: false }
      if (investigation?.targetId === member.id) investigation = state === STATE.ALERTED ? null : { ...investigation, position: { ...member.position } }
    } else if (record.state !== STATE.UNAWARE) {
      ;({ record, investigation } = whileUnseen(record, member.id, npc, disposition, time, seconds, investigation))
    }
    awareness[member.id] = record
  })

  let suspicion = investigation ? npc.suspicion : Math.max(0, npc.suspicion - npc.perception.awarenessDecayRate * seconds)

  // 1b. Footsteps of the characters it can't see fill the hearing meter; a full meter is heard as a noise.
  let { glance } = npc
  let hearing = npc.hearing ?? { level: 0, position: null }
  if (!npc.combatReady) {
    let gain = 0
    let nearest = null
    members.forEach((member) => {
      if (visibleIds.includes(member.id)) return
      const heard = footstepNoise(map, npc, member)
      if (!heard) return
      gain += heard.rate
      const d = distance(npc.position, member.position)
      if (!nearest || d < nearest.d) nearest = { d, position: member.position }
    })
    if (gain || hearing.level) {
      const level = gain ? hearing.level + gain * seconds : Math.max(0, hearing.level - npc.perception.awarenessDecayRate * seconds)
      hearing = { level, position: nearest ? { ...nearest.position } : hearing.position }
    }
    if (hearing.level >= 1) {
      ;({ suspicion, investigation, glance } = hearSomething({ ...npc, suspicion, investigation, glance }, hearing.position, 'noise', T.noiseSuspicion))
      hearing = { level: 0, position: hearing.position }
      emit({ type: 'FOOTSTEPS_HEARD', npcId: npc.id })
    }
  }

  const focusId = pickFocus(awareness, visibleIds)
  const focus = focusId ? awareness[focusId] : null
  const focusVisible = focusId !== null && visibleIds.includes(focusId)

  // 2. Reaction to an identified character, only while actually seeing them (being told is not seeing).
  let { response, groupAlerted, alarmAt, combatReady } = npc
  const alerts = []
  if (!combatReady && focusVisible && focus.state === STATE.ALERTED) {
    const position = { ...focus.lastKnownPosition }
    // Raising the alarm always goes out, even from an NPC that was itself only told about the party.
    if (responseType === 'alarm' && alarmAt === null) {
      alarmAt = time
      emit({ type: 'ALARM_RAISED', npcId: npc.id, targetId: focusId })
      if (npc.alertGroupId) alerts.push({ groupId: npc.alertGroupId, position, sourceNpcId: npc.id, targetId: focusId, method: 'alarm' })
      groupAlerted = true
    } else if (!groupAlerted && npc.alertGroupId && disposition.alertsGroup) {
      alerts.push({ groupId: npc.alertGroupId, position, sourceNpcId: npc.id, targetId: focusId, method: npc.alertMethod })
      groupAlerted = true
    }
    if (responseType !== 'none' && (response?.type !== responseType || response.targetId !== focusId)) {
      response = { type: responseType, targetId: focusId, since: time }
      if (responseType === 'confront') emit({ type: 'CONFRONTATION_READY', npcId: npc.id, targetId: focusId })
      if (responseType === 'observe') emit({ type: 'OBSERVING', npcId: npc.id, targetId: focusId })
    }
    if (responseType === 'combat' || (responseType === 'alarm' && time - alarmAt >= T.alarmSeconds)) {
      combatReady = { targetId: focusId, time }
      emit({ type: 'COMBAT_READY', npcId: npc.id, targetId: focusId })
    }
  }

  // 3. Overall state: the most serious thing the NPC knows about.
  let state = STATE.UNAWARE
  Object.values(awareness).forEach((record) => {
    if (RANK[record.state] > RANK[state]) state = record.state
  })
  if (investigation && investigation.phase !== 'react' && RANK[state] < RANK.INVESTIGATING) state = STATE.INVESTIGATING
  if (state === STATE.UNAWARE && (suspicion > 0 || investigation || hearing.level > 0)) state = STATE.SUSPICIOUS
  if (combatReady) state = STATE.COMBAT_READY
  if (RANK[state] < RANK.ALERTED) response = null
  if (state === STATE.UNAWARE) {
    groupAlerted = false
    alarmAt = null
  }
  if (state !== npc.state) emit({ type: 'AWARENESS_CHANGED', npcId: npc.id, from: npc.state, to: state, targetId: focusId })

  // 4. What the NPC does: face a threat, check something out, or carry on with its patrol / post.
  let look = null
  let goal = null
  let speed = 0
  let { patrol } = npc
  if (combatReady) {
    look = headingTo(npc.position, awareness[combatReady.targetId]?.lastKnownPosition ?? npc.position)
  } else if (focus && (focus.state === STATE.ALERTED || (focusVisible && focus.state === STATE.SUSPICIOUS))) {
    // Identified, or glimpsed and trying to make them out: stop and watch (or keep watching where they were).
    if (responseType !== 'none' || focus.state !== STATE.ALERTED) look = headingTo(npc.position, focus.lastKnownPosition)
  } else if (investigation) {
    if (investigation.phase === 'react') {
      look = headingTo(npc.position, investigation.position)
      const timeLeft = investigation.timeLeft - seconds
      investigation = timeLeft > 0 ? { ...investigation, timeLeft } : { ...investigation, phase: 'moving', timeLeft: 0 }
      if (timeLeft <= 0) emit({ type: 'INVESTIGATION_STARTED', npcId: npc.id, targetId: investigation.targetId, reason: investigation.reason })
    } else if (investigation.phase === 'moving') {
      goal = investigation.position
      speed = MOVE.investigateSpeed
    } else {
      const elapsed = T.searchSeconds - investigation.timeLeft
      look = investigation.baseHeading + SEARCH_SWEEP * Math.sin((elapsed / T.searchSeconds) * Math.PI * 3)
      const timeLeft = investigation.timeLeft - seconds
      if (timeLeft > 0) {
        investigation = { ...investigation, timeLeft }
      } else {
        emit({ type: 'INVESTIGATION_ENDED', npcId: npc.id, targetId: investigation.targetId, found: false })
        suspicion = Math.min(suspicion, T.confidenceAfterSearch)
        investigation = null
      }
    }
  } else if (glance) {
    look = headingTo(npc.position, glance.position)
    glance = glance.timeLeft - seconds > 0 ? { ...glance, timeLeft: glance.timeLeft - seconds } : null
  }
  if (!look && !goal && !investigation) {
    if (patrol) {
      const point = patrol.points[patrol.index]
      if (distance(npc.position, point.position) > MOVE.arriveDistance) {
        goal = point.position
        speed = MOVE.patrolSpeed
      } else {
        const waitLeft = (patrol.waitLeft ?? point.wait) - seconds
        if (point.facing !== null) look = point.facing
        patrol = waitLeft > 0 ? { ...patrol, waitLeft } : { ...patrol, index: (patrol.index + 1) % patrol.points.length, waitLeft: null }
      }
    } else if (distance(npc.position, npc.home.position) > MOVE.arriveDistance) {
      goal = npc.home.position
      speed = MOVE.patrolSpeed
    } else {
      look = npc.home.heading
    }
  }

  let { position, path, pathGoal, stuck } = npc
  let moving = false
  let heading = npc.heading
  if (goal) {
    const step = walk(map, npc, goal, speed, seconds)
    ;({ position, path, pathGoal, stuck } = step)
    moving = !step.arrived && distance(position, npc.position) > 1e-5
    if (step.direction !== null && look === null) look = step.direction
    if (step.arrived && investigation?.phase === 'moving' && goal === investigation.position) {
      investigation = { ...investigation, phase: 'searching', timeLeft: T.searchSeconds, baseHeading: heading }
    }
  } else if (path.length) {
    path = []
    pathGoal = null
  }
  if (look !== null) heading = turnToward(heading, look, seconds)
  position = keepClear(map, position, [...members, ...otherNpcs.filter((other) => !isDown(other))])

  return {
    npc: { ...npc, position, heading, moving, path, pathGoal, stuck, patrol, glance, hearing, awareness, visibleIds, suspicion, investigation, focusId, state, response, groupAlerted, alarmAt, combatReady },
    alerts,
  }
}

// Something heard or reported at a place, with nobody identified: an NPC already dealing with someone it identified
// ignores it; one that investigates goes to check after a moment; others just turn to look.
function hearSomething(npc, position, reason, amount) {
  if (RANK[npc.state] >= RANK.ALERTED) return npc
  const suspicion = Math.max(npc.suspicion, Math.min(1, amount))
  if (!DISPOSITIONS[npc.disposition].investigates) return { ...npc, suspicion, glance: { position: { ...position }, timeLeft: T.reactSeconds * 2 } }
  if (!canStart(npc.investigation, reason)) return { ...npc, suspicion }
  return { ...npc, suspicion, investigation: startInvestigation(position, null, reason, 'react') }
}

const withEvents = (world, list) => (list.length ? { ...world, events: [...world.events, ...list.map((event) => ({ time: world.time, ...event }))].slice(-MAX_EVENTS) } : world)

// A noise at a place: radius = how far it carries, intensity 0..1 = how alarming it is, source = who or what made it
// (kept for the log only; hearing a noise doesn't tell an NPC who made it).
export function emitNoise(world, { position, radius, intensity = 1, source = null }) {
  const events = [{ type: 'NOISE', position: { ...position }, radius, source }]
  const npcs = { ...world.npcs }
  getNpcs(world).forEach((npc) => {
    if (npc.combatReady || isDown(npc) || distance(npc.position, position) > Math.min(radius, npc.perception.hearingRange)) return
    npcs[npc.id] = hearSomething(npc, position, 'noise', T.noiseSuspicion * intensity)
    events.push({ type: 'NOISE_HEARD', npcId: npc.id })
  })
  return withEvents({ ...world, npcs, noises: [...world.noises, { position: { ...position }, radius, time: world.time }] }, events)
}

// Passes word of a sighting to one alert group: { position, sourceNpcId, targetId, method }. Only members of that group
// hear it, subject to the method's range and sight rules, and they learn only what the method carries (a place to
// check, or who was seen where at that moment).
export function alertGroup(world, groupId, { position, sourceNpcId = null, targetId = null, method = data.defaultAlertMethod }) {
  const how = ALERT_METHODS[method] ?? ALERT_METHODS[data.defaultAlertMethod]
  const source = sourceNpcId ? world.npcs[sourceNpcId] : null
  const events = [{ type: 'GROUP_ALERT', groupId, npcId: sourceNpcId, targetId, method: how.id }]
  const npcs = { ...world.npcs }
  getNpcs(world).forEach((npc) => {
    if (npc.alertGroupId !== groupId || npc.id === sourceNpcId || npc.combatReady || isDown(npc)) return
    if (source && how.range !== null && distance(source.position, npc.position) > how.range) return
    if (source && how.needsSight && !hasLineOfSight(world.map, npc.position, source.position)) return
    if (how.grants === 'alerted' && targetId) {
      const record = npc.awareness[targetId] ?? EMPTY_RECORD
      if (npc.visibleIds.includes(targetId) && record.state === STATE.ALERTED) return
      npcs[npc.id] = {
        ...npc,
        awareness: { ...npc.awareness, [targetId]: { ...record, state: STATE.ALERTED, confidence: 1, lastKnownPosition: { ...position }, lastSeenTime: world.time, reported: true } },
        groupAlerted: true,
      }
    } else {
      npcs[npc.id] = { ...hearSomething(npc, position, 'alert', T.noiseSuspicion), groupAlerted: true }
    }
    events.push({ type: 'GROUP_ALERT_RECEIVED', npcId: npc.id, targetId: how.grants === 'alerted' ? targetId : null, method: how.id })
  })
  return withEvents({ ...world, npcs }, events)
}

// party: the party-control state (positions of the away team this frame).
export function tickWorld(world, party, rawSeconds) {
  const seconds = Math.min(MAX_TICK_SECONDS, Math.max(0, rawSeconds))
  if (!seconds) return world
  const time = world.time + seconds
  // A Defeated party member draws no attention: NPCs only notice those still up.
  const members = party.memberIds.map((id) => party.members[id]).filter((member) => !isDefeated(member.condition))
  const events = []
  const emit = (event) => events.push(event)
  const npcs = {}
  const alerts = []
  world.npcIds.forEach((id) => {
    if (isDown(world.npcs[id])) {
      npcs[id] = world.npcs[id]
      return
    }
    const others = world.npcIds.filter((other) => other !== id).map((other) => world.npcs[other])
    const result = updateNpc(world.map, world.npcs[id], members, others, time, seconds, emit)
    npcs[id] = result.npc
    alerts.push(...result.alerts)
  })
  let next = withEvents({ ...world, time, npcs, noises: world.noises.filter((noise) => time - noise.time < NOISE_SHOW_SECONDS) }, events)
  alerts.forEach((alert) => {
    next = alertGroup(next, alert.groupId, alert)
  })
  return next
}

// The NPCs that have reached the point where combat should begin: [{ npcId, targetId, time }].
export const getCombatReady = (world) => getNpcs(world).filter((npc) => npc.combatReady && !isDown(npc)).map((npc) => ({ npcId: npc.id, ...npc.combatReady }))

// What every NPC knows about one party member: [{ npcId, name, state, confidence, lastKnownPosition, visible }].
// An NPC that has never noticed them reports UNAWARE (what later ambush rules will read).
export function getCharacterAwareness(world, characterId) {
  return getNpcs(world).map((npc) => {
    const record = npc.awareness[characterId] ?? EMPTY_RECORD
    const state = npc.combatReady?.targetId === characterId ? STATE.COMBAT_READY : record.state
    return { npcId: npc.id, name: npc.name, state, confidence: record.confidence, lastKnownPosition: record.lastKnownPosition, visible: npc.visibleIds.includes(characterId) }
  })
}
