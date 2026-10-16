// Prototype hazard afflictions (designer 2026-10-15): after a damaging lingering hazard, the effect can stick for a
// few hazard rounds after leaving the tile. Suits with hazardImmunity ignore matching types. Fitness shortens duration
// only (afflictionRoundsFor). Explosions do not create afflictions.
import { hazardImmunities } from '../rules/equipment.js'
import { afflictionRoundsFor, normalizeCondition } from '../rules/personalCondition.js'
import { hazardAt, HAZARD_TYPES } from './environment.js'

const hazardName = (type, fallback) => HAZARD_TYPES[type]?.name ?? fallback ?? type

// subjects: [{ id, position, character, condition }]. hits: from hazardRound (and any non-hazard hits to pass through).
// Returns { hits, afflictionsById: Map<id, affliction[]> } — write afflictions onto each character's condition, then
// apply the filtered/extended hits as Injuries.
export function syncHazardAfflictions(subjects, hits, environment) {
  const nonHazard = hits.filter((hit) => hit.kind !== 'hazard')
  const tileHitByTarget = new Map()
  hits.forEach((hit) => {
    if (hit.kind === 'hazard') tileHitByTarget.set(hit.targetId, hit)
  })

  const outHits = [...nonHazard]
  const afflictionsById = new Map()

  subjects.forEach((subject) => {
    const { id, position, character } = subject
    if (!character) {
      const hit = tileHitByTarget.get(id)
      if (hit) outHits.push(hit)
      return
    }

    const immunities = hazardImmunities(character)
    const hazard = environment ? hazardAt(environment, position) : null
    const standingType = hazard && hazard.severity > 0 ? hazard.type : null
    const standingImmune = Boolean(standingType && immunities.has(standingType))
    // hazardRound may migrate the footprint after scoring the hit; still apply that Injury and refresh the affliction.
    const tileHit = tileHitByTarget.get(id)
    const hitType = tileHit
      ? (tileHit.hazardType ?? environment?.hazards?.[tileHit.sourceId]?.type ?? standingType)
      : null

    let afflictions = (normalizeCondition(subject.condition).afflictions ?? []).filter((entry) => !immunities.has(entry.hazardType))

    if (tileHit && hitType && !immunities.has(hitType)) {
      outHits.push({ ...tileHit, hazardType: hitType })
    }

    const refreshType = standingType && !standingImmune ? standingType : hitType && !immunities.has(hitType) ? hitType : null
    if (refreshType) {
      const rounds = afflictionRoundsFor(character)
      const severity = standingType === refreshType ? hazard.severity : (tileHit?.severity ?? HAZARD_TYPES[refreshType]?.severity ?? 1)
      const injuryType = standingType === refreshType ? hazard.injuryType : (tileHit?.injuryType ?? HAZARD_TYPES[refreshType]?.injuryType ?? 'deadly')
      const sourceName = standingType === refreshType ? hazard.name : (tileHit?.sourceName ?? hazardName(refreshType))
      afflictions = afflictions.filter((entry) => entry.hazardType !== refreshType)
      if (rounds > 0) {
        afflictions.push({
          id: `afflict:${refreshType}`,
          hazardType: refreshType,
          severity,
          injuryType,
          roundsLeft: rounds,
          sourceName,
        })
      }
    }

    const nextAfflictions = []
    afflictions.forEach((entry) => {
      if (entry.hazardType === refreshType) {
        nextAfflictions.push(entry)
        return
      }
      outHits.push({
        targetId: id,
        severity: entry.severity,
        injuryType: entry.injuryType,
        sourceId: entry.id,
        sourceName: entry.sourceName ?? hazardName(entry.hazardType),
        kind: 'hazard',
        hazardType: entry.hazardType,
      })
      if (entry.roundsLeft > 1) nextAfflictions.push({ ...entry, roundsLeft: entry.roundsLeft - 1 })
    })
    afflictionsById.set(id, nextAfflictions)
  })

  return { hits: outHits, afflictionsById }
}
