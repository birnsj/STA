import missionProfiles from '../data/ships/missionProfiles.json'
import spaceframeData from '../data/ships/spaceframes.json'
import starshipTalents from '../data/ships/starshipTalents.json'
import timeframes from '../data/ships/timeframes.json'

const catalog = starshipTalents.talents
const frames = spaceframeData.spaceframes
const profiles = missionProfiles.profiles
const eras = timeframes.eras

const byId = new Map(catalog.map((entry) => [entry.id, entry]))
const byAlias = new Map()
for (const entry of catalog) {
  byAlias.set(entry.id, entry.id)
  byAlias.set(normalizeKey(entry.name), entry.id)
  for (const alias of entry.aliases ?? []) byAlias.set(normalizeKey(alias), entry.id)
}

const SYSTEMS = ['comms', 'engines', 'structure', 'computers', 'sensors', 'weapons']
const DEPARTMENTS = ['command', 'conn', 'engineering', 'security', 'science', 'medicine']

function normalizeKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function frameOf(ship) {
  return frames.find((entry) => entry.id === ship.spaceframeId) ?? null
}

function profileOf(ship) {
  return profiles.find((entry) => entry.id === ship.missionProfileId) ?? null
}

function eraOf(ship) {
  return eras.find((entry) => entry.id === ship.timeframeId) ?? null
}

function departmentOf(ship, department) {
  const profile = profileOf(ship)
  const frame = frameOf(ship)
  if (!profile || !frame || !Object.hasOwn(profile.departments, department)) return null
  return profile.departments[department] + (frame.departmentModifiers[department] ?? 0)
}

function systemOf(ship, system) {
  const frame = frameOf(ship)
  const profile = profileOf(ship)
  if (!frame || !profile || !Object.hasOwn(frame.systems, system)) return null
  const refits = (ship.refits ?? []).filter((entry) => entry === system).length
  return frame.systems[system] + (ship.missionProfileSystemId === system ? 1 : 0) + refits
}

function structureResistanceBonus(structure) {
  if (!Number.isFinite(structure)) return 0
  if (structure <= 6) return 0
  if (structure <= 8) return 1
  if (structure <= 10) return 2
  if (structure <= 12) return 3
  return 4
}

function hasKlingonOrRomulan(frame) {
  return (frame?.traits ?? []).some((trait) => trait === 'Klingon Starship' || trait === 'Romulan Starship')
}

function hasPolarizedHull(frame) {
  return (frame?.specialRuleIds ?? []).includes('polarized-hull-plating')
}

export function getStarshipTalents() {
  return catalog
}

export function getStarshipTalentById(id) {
  if (!id) return null
  if (byId.has(id)) return byId.get(id)
  const canonical = byAlias.get(normalizeKey(id))
  return canonical ? byId.get(canonical) : null
}

export function canonicalizeTalentId(id) {
  return getStarshipTalentById(id)?.id ?? null
}

export function playYear(ship) {
  if (Number.isFinite(ship?.campaignYear)) return ship.campaignYear
  return eraOf(ship)?.throughYear ?? null
}

export function spaceframeTalentIds(ship) {
  const frame = frameOf(ship)
  const ids = []
  for (const entry of frame?.talents ?? []) {
    const id = canonicalizeTalentId(entry.id ?? entry.name)
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

export function profileTalentId(ship) {
  const raw = ship.missionProfileTalentId
  if (!raw) return null
  if (raw === 'redundant-systems-communications') return 'redundant-systems'
  return canonicalizeTalentId(raw)
}

export function grantedTalentIds(ship) {
  const ids = [...spaceframeTalentIds(ship)]
  const profileId = profileTalentId(ship)
  if (profileId && !ids.includes(profileId)) ids.push(profileId)
  return ids
}

export function talentCapacity(ship) {
  return frameOf(ship)?.scale ?? 0
}

export function filterExtraTalentIds(ship, ids) {
  if (!Array.isArray(ids)) return []
  const granted = new Set(grantedTalentIds(ship))
  const kept = []
  const seen = new Set()
  for (const raw of ids) {
    const id = canonicalizeTalentId(raw)
    if (!id) continue
    const talent = getStarshipTalentById(id)
    if (!talent) continue
    if (granted.has(id) && !talent.repeatable) continue
    if (!talent.repeatable && seen.has(id)) continue
    if (talentIneligibility({ ...ship, extraTalentIds: kept }, id, { ignoreSlots: true })) continue
    kept.push(id)
    seen.add(id)
  }
  const room = Math.max(0, talentCapacity(ship) - grantedTalentIds(ship).length)
  return kept.slice(0, room)
}

export function filterTalentChoices(ship, choices) {
  if (!choices || typeof choices !== 'object') return {}
  const allowed = new Set([...grantedTalentIds(ship), ...(ship.extraTalentIds ?? [])])
  const next = {}
  for (const [id, choice] of Object.entries(choices)) {
    const talent = getStarshipTalentById(id)
    if (!talent?.choice || !allowed.has(talent.id)) continue
    if (talent.choice === 'system' && SYSTEMS.includes(choice)) next[talent.id] = choice
    if (talent.choice === 'department' && DEPARTMENTS.includes(choice)) {
      if (talent.requirements?.expansiveDepartment && (departmentOf(ship, choice) ?? 0) < 5) continue
      next[talent.id] = choice
    }
  }
  if (ship.missionProfileTalentId === 'redundant-systems-communications' && !next['redundant-systems']) {
    next['redundant-systems'] = 'comms'
  }
  return next
}

export function shipTalentIdList(ship) {
  return [...grantedTalentIds(ship), ...(ship.extraTalentIds ?? [])]
}

export function talentSlotsUsed(ship) {
  return shipTalentIdList(ship).length
}

export function talentSlotsRemaining(ship) {
  return Math.max(0, talentCapacity(ship) - talentSlotsUsed(ship))
}

export function talentsFilled(ship) {
  const capacity = talentCapacity(ship)
  if (!capacity) return false
  return talentSlotsUsed(ship) === capacity
}

export function talentIneligibility(ship, talentId, { ignoreSlots = false } = {}) {
  const talent = getStarshipTalentById(talentId)
  if (!talent) return 'Unknown talent.'
  const frame = frameOf(ship)
  if (!frame) return 'Choose a class first.'
  const year = playYear(ship)
  const req = talent.requirements ?? {}
  if (req.minYear != null && (year == null || year < req.minYear)) {
    return `Requires year ${req.minYear} or later.`
  }
  if (req.maxYear != null && (year == null || year > req.maxYear)) {
    return `Not available after year ${req.maxYear}.`
  }
  if (req.klingonOrRomulan && !hasKlingonOrRomulan(frame)) {
    return 'Requires a Klingon or Romulan starship.'
  }
  for (const [department, minimum] of Object.entries(req.departments ?? {})) {
    const score = departmentOf(ship, department)
    if (score == null || score < minimum) return `Requires ${department} ${minimum}+.`
  }
  for (const [system, minimum] of Object.entries(req.minSystem ?? {})) {
    const score = systemOf(ship, system)
    if (score == null || score < minimum) return `Requires ${system} ${minimum}+.`
  }
  if (req.expansiveDepartment) {
    const eligible = DEPARTMENTS.some((department) => (departmentOf(ship, department) ?? 0) >= 5)
    if (!eligible) return 'Requires a department rated 5.'
  }
  const granted = grantedTalentIds(ship)
  if (granted.includes(talent.id) && !talent.repeatable) return 'Already granted by class or mission profile.'
  const extras = ship.extraTalentIds ?? []
  if (!talent.repeatable && extras.includes(talent.id)) return 'Already selected.'
  if (!ignoreSlots) {
    const used = granted.length + extras.length
    const capacity = talentCapacity(ship)
    if (used >= capacity) return 'No talent slots remaining (talents = Scale).'
  }
  return null
}

export function toggleExtraTalent(ship, talentId) {
  const id = canonicalizeTalentId(talentId)
  if (!id) return ship
  const talent = getStarshipTalentById(id)
  if (!talent) return ship
  const current = [...(ship.extraTalentIds ?? [])]
  const index = current.lastIndexOf(id)
  if (index >= 0) {
    current.splice(index, 1)
    const talentChoices = { ...(ship.talentChoices ?? {}) }
    if (!talent.repeatable) delete talentChoices[id]
    return { ...ship, extraTalentIds: current, talentChoices }
  }
  if (talentIneligibility(ship, id)) return ship
  const talentChoices = { ...(ship.talentChoices ?? {}) }
  if (talent.choice && !talentChoices[id]) {
    talentChoices[id] = talent.choice === 'system' ? SYSTEMS[0] : DEPARTMENTS[0]
  }
  return { ...ship, extraTalentIds: [...current, id], talentChoices }
}

export function setTalentChoice(ship, talentId, choice) {
  const id = canonicalizeTalentId(talentId)
  const talent = getStarshipTalentById(id)
  if (!talent?.choice) return ship
  if (talent.choice === 'system' && !SYSTEMS.includes(choice)) return ship
  if (talent.choice === 'department' && !DEPARTMENTS.includes(choice)) return ship
  if (talent.requirements?.expansiveDepartment && (departmentOf(ship, choice) ?? 0) < 5) return ship
  if (!(ship.extraTalentIds ?? []).includes(id) && profileTalentId(ship) !== id) return ship
  return { ...ship, talentChoices: { ...(ship.talentChoices ?? {}), [id]: choice } }
}

export function pickExtraTalents(ship, random = Math.random) {
  let next = {
    ...ship,
    extraTalentIds: [...(ship.extraTalentIds ?? [])],
    talentChoices: { ...(ship.talentChoices ?? {}) },
  }
  let spins = 0
  while (talentSlotsRemaining(next) > 0 && spins < 200) {
    spins += 1
    const options = catalog.filter((talent) => !talentIneligibility(next, talent.id))
    if (!options.length) break
    const pick = options[Math.min(Math.floor(random() * options.length), options.length - 1)]
    const after = toggleExtraTalent(next, pick.id)
    if (after === next) break
    next = after
  }
  return next
}

export function shipTalentNames(ship) {
  const names = []
  for (const id of shipTalentIdList(ship)) {
    const talent = getStarshipTalentById(id)
    if (!talent) continue
    const choice = ship.talentChoices?.[id]
    const label = choice ? `${talent.name.replace(/ \(X\)$/, '')} (${choice})` : talent.name
    names.push(label)
  }
  return names
}

export function shipResistance(ship) {
  const frame = frameOf(ship)
  const structure = systemOf(ship, 'structure')
  if (!frame || structure == null) return null
  let value = Math.ceil(frame.scale / 2) + structureResistanceBonus(structure)
  for (const id of shipTalentIdList(ship)) {
    value += getStarshipTalentById(id)?.derived?.resistance ?? 0
  }
  return value
}

export function shipShields(ship) {
  const frame = frameOf(ship)
  const structure = systemOf(ship, 'structure')
  const security = departmentOf(ship, 'security')
  if (!frame || structure == null) return null
  if (hasPolarizedHull(frame)) return structure
  if (security == null) return null
  let value = structure + frame.scale + security
  for (const id of shipTalentIdList(ship)) {
    value += getStarshipTalentById(id)?.derived?.shields ?? 0
  }
  return value
}

export function shipCrewSupport(ship) {
  const frame = frameOf(ship)
  if (!frame) return null
  let value = frame.scale
  let halve = false
  for (const id of shipTalentIdList(ship)) {
    const derived = getStarshipTalentById(id)?.derived
    if (!derived) continue
    value += derived.crewSupport ?? 0
    if (derived.crewSupportHalve) halve = true
  }
  // Aging Relic: +1 Crew Support (Core p. 216). Helper lives in serviceEffects; avoid circular import.
  if (ship.serviceRecordId === 'aging-relic') value += 1
  if (halve) value = Math.ceil(value / 2)
  return value
}

export function talentsForTab(tab) {
  return catalog.filter((talent) => talent.tab === tab)
}

export const APPEARANCE_FIELDS = [
  ['bridgeLayoutId', 'Bridge Layout'],
  ['hullMarkingsId', 'Hull Markings'],
  ['stripingStyleId', 'Striping'],
  ['nacelleCapsId', 'Nacelle Caps'],
  ['emblemStyleId', 'Emblem'],
  ['secondaryMarkingsId', 'Secondary Markings'],
]
