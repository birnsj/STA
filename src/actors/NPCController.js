// A world NPC: each exploration frame it perceives the away team, reacts by its disposition and then acts (watches,
// investigates, patrols or keeps its post); it can be talked to while up. EnemyController extends it with the hostile
// combat AI. The perception maths, awareness memory, noises and alert groups stay in exploration/awareness.js;
// tuning in data/adaptation/exploration/awareness.json.
import { isActive } from '../combat/combatSelectors.js'
import { conversationIdFor } from '../conversation/defaultConversations.js'
import data from '../data/adaptation/exploration/awareness.json'
import {
  dispositionOf,
  EMPTY_RECORD,
  footstepNoise,
  hearSomething,
  perceive as perceiveMember,
  pickFocus,
  RANK,
  STATE,
  whileUnseen,
} from '../exploration/awareness.js'
import { distance, planRoute, RADIUS, slide } from '../exploration/navigation.js'
import { getSpriteAnimation } from '../rules/appearance.js'
import { isDefeated } from '../rules/personalCondition.js'
import { tickWaypointAnim } from '../maps/waypointAnimRuntime.js'
import { CharacterController, headingTo, wrapAngle } from './CharacterController.js'

const T = data.timing
const MOVE = data.movement
const toRadians = (degrees) => (degrees * Math.PI) / 180
const TURN_RATE = toRadians(MOVE.turnRateDegrees)
const SEARCH_SWEEP = toRadians(T.searchSweepDegrees)
const WAYPOINT_REACHED = 0.06
// An NPC that can't get any closer to where it is walking (a party member in the way) gives up after this long.
const STUCK_SECONDS = 1.5

// Designer decision (Oct 2026): a surrendered enemy stands down where it is: neutral, no patrol, never joins a fight.
const STANDS_DOWN = { disposition: 'neutral', responseType: null, patrol: null, investigation: null, alertGroupId: null, surrendered: true }

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

// What it does once it has identified someone: its own responseType, else its disposition's.
const responseTypeOf = (npc) => npc.responseType ?? dispositionOf(npc).response

export class NPCController extends CharacterController {
  // One exploration frame. ctx: { map, members (the party members still up), others (the other NPCs as they stood last
  // frame; only their bodies matter), time, seconds, emit (adds a world event) }. Returns { npc, alerts } (alerts: group
  // alerts to pass on, exploration/awareness.js alertGroup).
  exploreTick(npc, ctx) {
    const sensed = this.perceive(npc, ctx)
    const { npc: reacted, alerts } = this.react(npc, sensed, ctx)
    return { npc: this.behave(reacted, ctx), alerts }
  }

  // 1. What it sees of each party member (and, for those out of sight, what it remembers), then the footsteps it hears
  // of those it can't see: a full hearing meter is heard as a noise. Returns the NPC with its awareness, visibleIds,
  // suspicion, investigation, glance and hearing for this frame.
  perceive(npc, { map, members, time, seconds, emit }) {
    const disposition = dispositionOf(npc)
    let investigation = npc.investigation
    const awareness = {}
    const visibleIds = []

    members.forEach((member) => {
      let record = npc.awareness[member.id] ?? EMPTY_RECORD
      const seen = perceiveMember(map, npc, member)
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
    return { ...npc, awareness, visibleIds, suspicion, investigation, glance, hearing }
  }

  // 2. Its reaction to an identified character, only while actually seeing them (being told is not seeing), then its
  // overall state: the most serious thing it knows about. npc: as it was last frame; sensed: after perceive. Returns
  // the NPC with its focus, response, alarm, combat readiness and state, and the group alerts it sends.
  react(npc, sensed, { time, emit }) {
    const disposition = dispositionOf(npc)
    const responseType = responseTypeOf(npc)
    const { awareness, visibleIds, investigation, suspicion, hearing } = sensed
    const focusId = pickFocus(awareness, visibleIds)
    const focus = focusId ? awareness[focusId] : null
    const focusVisible = focusId !== null && visibleIds.includes(focusId)

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
      // Designer decision (Oct 2026): until confrontation is designed, a confronting NPC attacks on sight.
      if (responseType === 'combat' || responseType === 'confront' || (responseType === 'alarm' && time - alarmAt >= T.alarmSeconds)) {
        combatReady = { targetId: focusId, time }
        emit({ type: 'COMBAT_READY', npcId: npc.id, targetId: focusId })
      }
    }

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
    return { npc: { ...sensed, focusId, state, response, groupAlerted, alarmAt, combatReady }, alerts }
  }

  // 3. What it does: face a threat, check something out, or carry on with its patrol or post; then it walks, turns and
  // is pushed clear of anyone it stands inside. npc: after react. Returns the NPC for this frame.
  behave(npc, { map, members, others, seconds, emit }) {
    const responseType = responseTypeOf(npc)
    const { awareness, visibleIds, focusId, combatReady } = npc
    const focus = focusId ? awareness[focusId] : null
    const focusVisible = focusId !== null && visibleIds.includes(focusId)
    let { investigation, glance, suspicion, patrol } = npc
    // Waypoint idle fidgets only run while the NPC is free to wait on its patrol; higher-priority behaviour clears them.
    let waypointAnim = null

    let look = null
    let goal = null
    let speed = 0
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
          const starting = patrol.waitLeft == null
          const waitLeft = (starting ? point.wait : patrol.waitLeft) - seconds
          if (point.facing !== null) look = point.facing
          waypointAnim = waitLeft > 0 ? tickWaypointAnim(npc.waypointAnim, point, starting, seconds) : null
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
    position = keepClear(map, position, [...members, ...others.filter((other) => !isDefeated(other.condition))])
    return { ...npc, position, heading, moving, path, pathGoal, stuck, patrol, glance, suspicion, investigation, waypointAnim }
  }

  // Exploration board: optional pose while a patrol waypoint animation is active (falls back to idle fidgets / gait).
  animationState(actor) {
    const base = super.animationState(actor)
    const name = actor.waypointAnim?.name
    if (name && getSpriteAnimation(name)) {
      return { ...base, pose: { animation: name, playKey: actor.waypointAnim.playKey } }
    }
    return base
  }

  canTalk(npc) {
    return Boolean(conversationIdFor(npc)) && this.isUp(npc)
  }

  // A combatant keeps the NPC's world id.
  toCombatant(npc, cell) {
    return { id: npc.id, ...super.toCombatant(npc, cell) }
  }

  fromCombatant(npc, combatant) {
    return {
      ...super.fromCombatant(npc, combatant),
      moving: false,
      path: [],
      pathGoal: null,
      stuck: { best: Infinity, seconds: 0 },
      // What it sees is worked out again on the next exploration frame (never, if it is down).
      visibleIds: [],
      combatReady: null,
      response: null,
      alarmAt: null,
      // Designer decision (2026-10-09): an enemy that leaves a fight still up attacks on sight from then on, whatever
      // its disposition (it skips raising the alarm first).
      ...(isActive(combatant) ? { responseType: 'combat' } : {}),
      ...(combatant.surrendered && !combatant.condition.defeated ? STANDS_DOWN : {}),
    }
  }
}
