import serviceEffects from '../data/ships/serviceEffects.json'
import { shipFromRecord } from './persistence.js'
import { loadSavedShips } from './savedShips.js'

// Read location without importing character/persistence.js (that module needs import.meta.env in Vite).
const LOCATION_KEY = 'st-adventures.location'

function loadSavedShipId() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCATION_KEY))
    return typeof saved?.savedShipId === 'string' ? saved.savedShipId : null
  } catch {
    return null
  }
}
import {
  getServiceRecordById,
  getShipGameplayTraits,
  shipTraitNames,
} from './shipModel.js'

const DIFFICULTY = serviceEffects.difficulty ?? { helpful: -1, complicating: 1 }

function effectMap(kind) {
  return serviceEffects[kind] ?? {}
}

function stancesFor(effect) {
  const list = [{ stance: effect.stance, tags: effect.tags ?? [] }]
  if (effect.also) list.push({ stance: effect.also.stance, tags: effect.also.tags ?? [] })
  return list
}

function narrativeEffectEntries(ship) {
  const entries = []
  for (const id of ship.serviceNotableEventIds ?? []) {
    const effect = effectMap('events')[id]
    if (effect) entries.push(effect)
  }
  if (ship.serviceReputationId) {
    const effect = effectMap('reputations')[ship.serviceReputationId]
    if (effect) entries.push(effect)
  }
  for (const id of ship.serviceHonorIds ?? []) {
    const effect = effectMap('honors')[id]
    if (effect) entries.push(effect)
  }
  return entries
}

// Trait rules for prepareTask: narrative Traits whose tags intersect the task tags.
// Distinct trait names; stacking only if content matches both. Adaptation −1 / +1 (2026-10-26).
export function shipNarrativeTraitRules(ship, taskTags = []) {
  if (!ship || !taskTags?.length) return []
  const wanted = new Set(taskTags.map((tag) => String(tag).toLowerCase()))
  const rules = []
  const seen = new Set()
  for (const effect of narrativeEffectEntries(ship)) {
    for (const { stance, tags } of stancesFor(effect)) {
      if (!tags.some((tag) => wanted.has(String(tag).toLowerCase()))) continue
      const key = `${effect.traitName}:${stance}`
      if (seen.has(key)) continue
      seen.add(key)
      const difficulty = stance === 'complicating' ? DIFFICULTY.complicating : DIFFICULTY.helpful
      rules.push({ trait: effect.traitName, difficulty })
    }
  }
  return rules
}

// The confirmed ship pointed at by location.savedShipId (designer decision, 2026-10-26).
export function getActiveShip() {
  const id = loadSavedShipId()
  if (!id) return null
  const entry = loadSavedShips().find((ship) => ship.id === id)
  if (!entry?.record) return null
  return shipFromRecord(entry.record)
}

export function activeShipTraitNames() {
  return shipTraitNames(getActiveShip())
}

export function augmentTaskContext(context = {}) {
  const shipTraits = activeShipTraitNames()
  if (!shipTraits.length) return context
  const traits = [...(context.traits ?? [])]
  for (const name of shipTraits) {
    const lower = name.toLowerCase()
    if (traits.some((trait) => (typeof trait === 'string' ? trait : trait.name)?.toLowerCase() === lower)) continue
    traits.push(name)
  }
  return { ...context, traits }
}

export function augmentTaskSpec(spec = {}) {
  const ship = getActiveShip()
  if (!ship) return spec
  const extra = shipNarrativeTraitRules(ship, spec.tags)
  if (!extra.length) return spec
  const existing = spec.traitRules ?? []
  const merged = [...existing]
  for (const rule of extra) {
    if (merged.some((entry) => entry.trait === rule.trait && entry.difficulty === rule.difficulty)) continue
    merged.push(rule)
  }
  return { ...spec, traitRules: merged }
}

// --- RAW p. 216 special rules: stubs until ship combat / Crew Support / ship assist exist ---

export function serviceSpecialRuleStatus(ship) {
  const record = getServiceRecordById(ship?.serviceRecordId)
  if (!record) return { id: null, available: false, reason: 'No service record.' }
  if (record.id === 'prototype') {
    return {
      id: record.id,
      name: record.ruleName,
      available: 'partial',
      reason: 'Two extra refits apply at creation. Ship-assist complication range +2 waits on ship assist.',
    }
  }
  return {
    id: record.id,
    name: record.ruleName,
    available: false,
    reason: 'Stub: needs ship combat, Crew Support, ship assist, or supporting-character intro.',
    text: record.rule,
  }
}

export function crewSupportBonus(ship) {
  return getServiceRecordById(ship?.serviceRecordId)?.id === 'aging-relic' ? 1 : 0
}

export function prototypeAssistComplicationRange(ship) {
  return getServiceRecordById(ship?.serviceRecordId)?.id === 'prototype' ? 2 : 0
}

export { getShipGameplayTraits, shipTraitNames }
