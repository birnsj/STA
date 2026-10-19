// What a successful Scan of a destructible reveals (designer request 2026-10-17): the hazards it may emit, how to
// counteract each (hazards.json neutralize), and which suits ignore them. Plain view keeps Structure / Resistance /
// State; hazard detail waits on a scan. Shared by exploration and combat info cards.
import { getAttributeName, getDisciplineName } from '../character/runtimeCharacter.js'
import { getItems } from '../rules/equipment.js'
import { DESTRUCTIBLE_TYPES, HAZARD_TYPES } from './environment.js'

// Hazard type ids this object may emit: when damaged (damagedHazard) and/or when destroyed (explosion.hazard).
export function emittedHazardIds(record) {
  const ids = []
  const leak = record.damagedHazard ?? DESTRUCTIBLE_TYPES[record.type]?.damagedHazard
  if (leak) ids.push(leak)
  if (record.explosion?.hazard) ids.push(record.explosion.hazard)
  return [...new Set(ids)]
}

function neutralizeText(typeId) {
  const info = HAZARD_TYPES[typeId]
  const task = info?.neutralize
  if (!task) return null
  return `${task.label} (${getAttributeName(task.attribute)} + ${getDisciplineName(task.department)})`
}

function suitNamesFor(typeId) {
  return getItems()
    .filter((item) => (item.stats?.hazardImmunity ?? []).includes(typeId))
    .map((item) => item.name)
}

// Rows and tips for the card beside a destructible's ring. scanned: whether a successful scan has been recorded.
export function destructibleScanCard(record, { scanned = false } = {}) {
  const type = DESTRUCTIBLE_TYPES[record.type]
  const rows = [
    ['Structure', `${record.structure} / ${record.maxStructure}`],
    ['Resistance', String(record.resistance)],
    ['State', record.state.charAt(0).toUpperCase() + record.state.slice(1)],
  ]
  const tips = [type.description]
  if (record.explosion) {
    tips.push(
      scanned
        ? `Explodes at 0 Structure: radius ${record.explosion.radius}, Severity ${record.explosion.severity}${record.explosion.injuryType ? ` (${record.explosion.injuryType})` : ''}.`
        : `Explodes at 0 Structure (radius ${record.explosion.radius}).`,
    )
  }

  if (!scanned) {
    tips.push('Scan for the hazards it may release and how to counteract them.')
    return { title: record.name, rows, tips }
  }

  const leakHazard = record.damagedHazard ?? DESTRUCTIBLE_TYPES[record.type]?.damagedHazard
  if (leakHazard) {
    const name = HAZARD_TYPES[leakHazard]?.name ?? leakHazard
    rows.push(['When damaged', `Leaks ${name}`])
  }
  if (record.explosion?.hazard) {
    const name = HAZARD_TYPES[record.explosion.hazard]?.name ?? record.explosion.hazard
    const radius = record.explosion.hazardRadius != null ? ` (radius ${record.explosion.hazardRadius})` : ''
    rows.push(['When destroyed', `Leaves ${name}${radius}`])
  }
  if (!leakHazard && !record.explosion?.hazard) {
    rows.push(['Hazards', 'None'])
  }

  for (const typeId of emittedHazardIds(record)) {
    const name = HAZARD_TYPES[typeId]?.name ?? typeId
    const counteract = neutralizeText(typeId)
    if (counteract) tips.push(`${name}: counteract with ${counteract}.`)
    const suits = suitNamesFor(typeId)
    if (suits.length) tips.push(`${name}: ignored by ${suits.join(', ')}.`)
  }

  return { title: record.name, rows, tips }
}

// Whether the party has a successful scan of this object recorded (exploration objectScans or combat scannedObjects).
export function isDestructibleScanned(scans, objectId) {
  const entry = scans?.[objectId]
  if (entry == null) return false
  return entry === true || Boolean(entry.success)
}
