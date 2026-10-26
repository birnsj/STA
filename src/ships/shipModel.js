import exampleClasses from '../data/ships/exampleClasses.json'
import finishingTouches from '../data/ships/finishingTouches.json'
import missionProfiles from '../data/ships/missionProfiles.json'
import refitTable from '../data/ships/refits.json'
import serviceRecords from '../data/ships/serviceRecords.json'
import spaceframeData from '../data/ships/spaceframes.json'
import timeframes from '../data/ships/timeframes.json'

export const SHIP_VERSION = 1

const eras = timeframes.eras
const spaceframes = spaceframeData.spaceframes
const specialRules = spaceframeData.specialRules
const profiles = missionProfiles.profiles
const records = serviceRecords.records
const refitSystems = refitTable.systems
const REFIT_CAP = 12

const SYSTEMS = ['comms', 'engines', 'structure', 'computers', 'sensors', 'weapons']

const SYSTEM_LABELS = {
  comms: 'Comms',
  engines: 'Engines',
  structure: 'Structure',
  computers: 'Computers',
  sensors: 'Sensors',
  weapons: 'Weapons',
}

export function createEmptyShip() {
  return shipRecord({})
}

function shipRecord({
  timeframeId = null,
  spaceframeId = null,
  missionProfileId = null,
  missionProfileTalentId = null,
  missionProfileSystemId = null,
  serviceRecordId = null,
  serviceRecordDetail = null,
  refits = [],
  shipName = null,
  registry = null,
  bridgeLayoutId = null,
  hullMarkingsId = null,
  stripingStyleId = null,
  nacelleCapsId = null,
  emblemStyleId = null,
  secondaryMarkingsId = null,
  confirmedAt = null,
}) {
  return {
    version: SHIP_VERSION,
    timeframeId,
    spaceframeId,
    missionProfileId,
    missionProfileTalentId,
    missionProfileSystemId,
    serviceRecordId,
    serviceRecordDetail,
    refits,
    shipName,
    registry,
    bridgeLayoutId,
    hullMarkingsId,
    stripingStyleId,
    nacelleCapsId,
    emblemStyleId,
    secondaryMarkingsId,
    confirmedAt,
  }
}

function keepProfile(ship) {
  return {
    missionProfileId: ship.missionProfileId ?? null,
    missionProfileTalentId: ship.missionProfileTalentId ?? null,
    missionProfileSystemId: ship.missionProfileSystemId ?? null,
  }
}

function keepService(ship) {
  return {
    serviceRecordId: ship.serviceRecordId ?? null,
    serviceRecordDetail: ship.serviceRecordDetail ?? null,
  }
}

function keepFinishing(ship) {
  return {
    shipName: ship.shipName ?? null,
    registry: ship.registry ?? null,
    bridgeLayoutId: ship.bridgeLayoutId ?? null,
    hullMarkingsId: ship.hullMarkingsId ?? null,
    stripingStyleId: ship.stripingStyleId ?? null,
    nacelleCapsId: ship.nacelleCapsId ?? null,
    emblemStyleId: ship.emblemStyleId ?? null,
    secondaryMarkingsId: ship.secondaryMarkingsId ?? null,
  }
}

function sameList(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index])
}

function systemBase(ship, system) {
  const frame = getSpaceframeById(ship.spaceframeId)
  if (!frame || !Object.hasOwn(frame.systems, system)) return null
  return frame.systems[system] + (ship.missionProfileSystemId === system ? 1 : 0)
}

function refitCountOf(refits, system) {
  return refits.filter((entry) => entry === system).length
}

// Keep earlier choices when the budget, the twice limit, or the cap of 12 shrinks.
function legalRefits(ship, refits) {
  const budget = refitBudget(ship)
  const kept = []
  for (const system of refits) {
    if (kept.length >= budget || !SYSTEMS.includes(system)) continue
    const base = systemBase(ship, system)
    const used = refitCountOf(kept, system)
    if (base == null || used >= 2 || base + used >= REFIT_CAP) continue
    kept.push(system)
  }
  return kept
}

function kept(ship, overrides) {
  const fields = {
    timeframeId: ship.timeframeId ?? null,
    spaceframeId: ship.spaceframeId ?? null,
    ...keepProfile(ship),
    ...keepService(ship),
    refits: ship.refits ?? [],
    ...keepFinishing(ship),
    confirmedAt: null,
    ...overrides,
  }
  return shipRecord({ ...fields, refits: legalRefits(fields, fields.refits ?? []) })
}

export function getTimeframes() {
  return eras
}

export function getTimeframeById(id) {
  return eras.find((era) => era.id === id) ?? null
}

// The preview row is the mockup's examples. It does not change with the era.
export function getExampleClasses() {
  return exampleClasses.classes
}

export function getSpaceframes() {
  return spaceframes
}

export function getSpaceframeById(id) {
  return spaceframes.find((frame) => frame.id === id) ?? null
}

export function getSpecialRule(id) {
  return specialRules.find((rule) => rule.id === id) ?? null
}

export function getMissionProfiles() {
  return profiles
}

export function getMissionProfileById(id) {
  return profiles.find((profile) => profile.id === id) ?? null
}

export function missionSystemLabel(systemId) {
  return SYSTEM_LABELS[systemId] ?? null
}

// A class is offered when it had entered service by the last year of the era (Core p. 193). The era stores that
// year; Screen 01 does not ask for a single campaign year.
export function isSpaceframeEligible(timeframeId, spaceframeId) {
  const era = getTimeframeById(timeframeId)
  const frame = getSpaceframeById(spaceframeId)
  if (!era || !frame || !Number.isFinite(era.throughYear)) return false
  return frame.launchYear <= era.throughYear
}

export function getEligibleSpaceframes(timeframeId) {
  return spaceframes.filter((frame) => isSpaceframeEligible(timeframeId, frame.id))
}

export function selectTimeframe(ship, timeframeId) {
  if (!getTimeframeById(timeframeId)) return ship
  if (ship.timeframeId === timeframeId) return ship
  const spaceframeId = isSpaceframeEligible(timeframeId, ship.spaceframeId) ? ship.spaceframeId : null
  return kept(ship, { timeframeId, spaceframeId })
}

export function selectSpaceframe(ship, spaceframeId) {
  if (!isSpaceframeEligible(ship.timeframeId, spaceframeId)) return ship
  if (ship.spaceframeId === spaceframeId) return ship
  return kept(ship, { spaceframeId })
}

export function clearSpaceframe(ship) {
  if (!ship.spaceframeId) return ship
  return kept(ship, { spaceframeId: null })
}

export function pickSpaceframeId(timeframeId, random = Math.random) {
  const options = getEligibleSpaceframes(timeframeId)
  if (!options.length) return null
  const index = Math.floor(random() * options.length)
  return options[Math.min(index, options.length - 1)].id
}

export function clearTimeframe(ship) {
  if (!ship.timeframeId) return ship
  return createEmptyShip()
}

export function pickTimeframeId(random = Math.random) {
  const index = Math.floor(random() * eras.length)
  return eras[Math.min(index, eras.length - 1)].id
}

// A new profile replaces the previous talent and system together, so the old +1 cannot linger.
export function selectMissionProfile(ship, missionProfileId) {
  const profile = getMissionProfileById(missionProfileId)
  if (!profile) return ship
  if (ship.missionProfileId === missionProfileId) return ship
  return kept(ship, {
    missionProfileId,
    missionProfileTalentId: null,
    missionProfileSystemId: profile.system === 'choice' ? null : profile.system,
  })
}

export function selectMissionProfileTalent(ship, talentId) {
  const profile = getMissionProfileById(ship.missionProfileId)
  if (!profile || !profile.talents.some((talent) => talent.id === talentId)) return ship
  if (ship.missionProfileTalentId === talentId) return ship
  return kept(ship, { missionProfileTalentId: talentId })
}

export function selectMissionProfileSystem(ship, systemId) {
  const profile = getMissionProfileById(ship.missionProfileId)
  if (!profile || profile.system !== 'choice' || !SYSTEMS.includes(systemId)) return ship
  if (ship.missionProfileSystemId === systemId) return ship
  return kept(ship, { missionProfileSystemId: systemId })
}

export function clearMissionProfile(ship) {
  if (!ship.missionProfileId && !ship.missionProfileTalentId && !ship.missionProfileSystemId) return ship
  return kept(ship, { missionProfileId: null, missionProfileTalentId: null, missionProfileSystemId: null })
}

export function pickMissionProfile(ship, random = Math.random) {
  const profile = profiles[Math.min(Math.floor(random() * profiles.length), profiles.length - 1)]
  const talent = profile.talents[Math.min(Math.floor(random() * profile.talents.length), profile.talents.length - 1)]
  let next = selectMissionProfile(ship, profile.id)
  next = selectMissionProfileTalent(next, talent.id)
  if (profile.system === 'choice') {
    const systemId = SYSTEMS[Math.min(Math.floor(random() * SYSTEMS.length), SYSTEMS.length - 1)]
    next = selectMissionProfileSystem(next, systemId)
  }
  return next
}

// Department score is the profile baseline plus the class modifier. Nothing is written back onto either record.
export function departmentScore(ship, department) {
  const profile = getMissionProfileById(ship.missionProfileId)
  const frame = getSpaceframeById(ship.spaceframeId)
  if (!profile || !frame || !Object.hasOwn(profile.departments, department)) return null
  return profile.departments[department] + (frame.departmentModifiers[department] ?? 0)
}

// The +1 applies only to the system stored for the current profile.
export function systemScore(ship, system) {
  const frame = getSpaceframeById(ship.spaceframeId)
  const profile = getMissionProfileById(ship.missionProfileId)
  if (!frame || !profile || !Object.hasOwn(frame.systems, system)) return null
  return frame.systems[system] + (ship.missionProfileSystemId === system ? 1 : 0) + refitCountOf(ship.refits ?? [], system)
}

// The era's last year is the year of play. Prototype adds the two refits from p. 216.
export function refitBudget(ship) {
  const era = getTimeframeById(ship.timeframeId)
  const frame = getSpaceframeById(ship.spaceframeId)
  if (!era || !frame || !Number.isFinite(era.throughYear) || !Number.isFinite(frame.launchYear)) return 0
  const decades = Math.max(0, Math.floor((era.throughYear - frame.launchYear) / 10))
  return decades + (ship.serviceRecordId === 'prototype' ? 2 : 0)
}

export function refitCount(ship, system) {
  return refitCountOf(ship.refits ?? [], system)
}

export function refitRoom(ship, system) {
  const base = systemBase(ship, system)
  if (base == null) return 0
  const used = refitCount(ship, system)
  return Math.max(0, Math.min(2 - used, REFIT_CAP - base - used))
}

export function getRefitSystems() {
  return refitSystems
}

export function refitSystemForRoll(roll) {
  const band = refitSystems.find((entry) => roll >= entry.roll[0] && roll <= entry.roll[1])
  return band?.id ?? null
}

export function addRefit(ship, system) {
  if ((ship.refits?.length ?? 0) >= refitBudget(ship)) return ship
  if (refitRoom(ship, system) < 1) return ship
  return kept(ship, { refits: [...(ship.refits ?? []), system] })
}

export function removeRefit(ship, system) {
  const refits = [...(ship.refits ?? [])]
  const index = refits.lastIndexOf(system)
  if (index < 0) return ship
  refits.splice(index, 1)
  return kept(ship, { refits })
}

export function clearRefits(ship) {
  if (!ship.refits?.length) return ship
  return kept(ship, { refits: [] })
}

export function normalizeRefits(ship) {
  const refits = legalRefits(ship, Array.isArray(ship.refits) ? ship.refits : [])
  if (sameList(refits, ship.refits ?? [])) return ship
  return shipRecord({
    timeframeId: ship.timeframeId ?? null,
    spaceframeId: ship.spaceframeId ?? null,
    missionProfileId: ship.missionProfileId ?? null,
    missionProfileTalentId: ship.missionProfileTalentId ?? null,
    missionProfileSystemId: ship.missionProfileSystemId ?? null,
    serviceRecordId: ship.serviceRecordId ?? null,
    serviceRecordDetail: ship.serviceRecordDetail ?? null,
    refits,
    ...keepFinishing(ship),
    confirmedAt: ship.confirmedAt ?? null,
  })
}

// Fills empty slots from the d20 table. 19–20 and a system that cannot take the refit are rolled again.
export function pickRefits(ship, random = Math.random) {
  let next = ship
  let spins = 0
  while ((next.refits?.length ?? 0) < refitBudget(next) && spins < 400) {
    spins += 1
    const system = refitSystemForRoll(1 + Math.floor(random() * 20))
    if (!system) continue
    const added = addRefit(next, system)
    if (added === next) continue
    next = added
  }
  return next
}

export function refitSummary(ship) {
  const counts = new Map()
  for (const id of ship.refits ?? []) counts.set(id, (counts.get(id) ?? 0) + 1)
  if (!counts.size) return null
  return refitSystems
    .filter((entry) => counts.has(entry.id))
    .map((entry) => (counts.get(entry.id) > 1 ? `${entry.name} ${counts.get(entry.id)}` : entry.name))
    .join(', ')
}

export function getServiceRecords() {
  return records
}

export function getServiceRecordById(id) {
  return records.find((record) => record.id === id) ?? null
}

// The step is finished when the profile, its one talent, and the system it raises are all chosen.
export function isMissionProfileComplete(ship) {
  const profile = getMissionProfileById(ship.missionProfileId)
  if (!profile || !profile.talents.some((talent) => talent.id === ship.missionProfileTalentId)) return false
  if (profile.system === 'choice') return SYSTEMS.includes(ship.missionProfileSystemId)
  return ship.missionProfileSystemId === profile.system
}

// An empty record is finished. Survivor of X is finished only after the player names it.
export function isServiceRecordFinished(ship) {
  if (!isMissionProfileComplete(ship)) return false
  const record = getServiceRecordById(ship.serviceRecordId)
  if (record?.namesake && !serviceRecordTitle(ship)) return false
  return true
}

// A different record drops the previous namesake, so the old trait cannot linger.
export function selectServiceRecord(ship, serviceRecordId) {
  const record = getServiceRecordById(serviceRecordId)
  if (!record) return ship
  if (ship.serviceRecordId === serviceRecordId) return ship
  return kept(ship, { serviceRecordId, serviceRecordDetail: null })
}

export function setServiceRecordDetail(ship, text) {
  const record = getServiceRecordById(ship.serviceRecordId)
  if (!record?.namesake) return ship
  const serviceRecordDetail = String(text ?? '').trim() || null
  if (ship.serviceRecordDetail === serviceRecordDetail) return ship
  return kept(ship, { serviceRecordDetail })
}

export function clearServiceRecord(ship) {
  if (!ship.serviceRecordId && !ship.serviceRecordDetail) return ship
  return kept(ship, { serviceRecordId: null, serviceRecordDetail: null })
}

export function pickServiceRecord(ship, random = Math.random) {
  const options = records.filter((record) => !record.namesake)
  if (!options.length) return ship
  const record = options[Math.min(Math.floor(random() * options.length), options.length - 1)]
  return selectServiceRecord(ship, record.id)
}

// The trait is the record's title. Survivor of X has none until the player names the battle or war.
export function serviceRecordTitle(ship) {
  const record = getServiceRecordById(ship.serviceRecordId)
  if (!record) return null
  if (!record.namesake) return record.name
  const name = typeof ship.serviceRecordDetail === 'string' ? ship.serviceRecordDetail.trim() : ''
  return name ? `Survivor of ${name}` : null
}

export function serviceRecordLabel(ship) {
  const record = getServiceRecordById(ship.serviceRecordId)
  if (!record) return null
  return serviceRecordTitle(ship) ?? record.name
}

export function shipTraitNames(ship) {
  const frame = getSpaceframeById(ship.spaceframeId)
  const names = []
  for (const trait of frame?.traits ?? []) {
    if (trait && !names.includes(trait)) names.push(trait)
  }
  const title = serviceRecordTitle(ship)
  if (title && !names.includes(title)) names.push(title)
  return names
}

const FINISHING_LISTS = {
  bridgeLayoutId: finishingTouches.bridges,
  hullMarkingsId: finishingTouches.hullMarkings,
  stripingStyleId: finishingTouches.stripingStyles,
  nacelleCapsId: finishingTouches.nacelleCaps,
  emblemStyleId: finishingTouches.emblemStyles,
  secondaryMarkingsId: finishingTouches.secondaryMarkings,
}

const NAME_PREFIX = /^(?:U\.?\s*S\.?\s*S\.?|I\.?\s*K\.?\s*S\.?|I\.?\s*R\.?\s*W\.?)\s+/i
const REGISTRY_PREFIX = /^(?:NX\/)?(?:NCC|NX)[-\s]+/i
const PAREN_EXAMPLE = /([^,()]+?)\s*\(\s*(?:NX\/)?(?:NCC|NX)-([0-9][0-9A-Z-]*)/i
const LEAD_EXAMPLE = /^\s*(?:NCC|NX)-([0-9][0-9A-Z-]*)\s+([^,]+)/i

function classTraits(ship) {
  return getSpaceframeById(ship.spaceframeId)?.traits ?? []
}

function cleanName(text) {
  return String(text ?? '').trim().replace(NAME_PREFIX, '').trim()
}

function cleanRegistry(text) {
  return String(text ?? '').trim().replace(REGISTRY_PREFIX, '').trim()
}

function notableIdentity(frame) {
  const text = frame?.notableExamples ?? ''
  const paren = text.match(PAREN_EXAMPLE)
  if (paren) return { shipName: cleanName(paren[1]) || null, registry: paren[2] }
  const lead = text.match(LEAD_EXAMPLE)
  if (lead) return { shipName: cleanName(lead[2]) || null, registry: lead[1] }
  const shipName = cleanName(text.split(',')[0])
  return shipName ? { shipName, registry: null } : null
}

export function getBridgeLayouts() {
  return finishingTouches.bridges
}

export function getFinishingOptions(field) {
  return FINISHING_LISTS[field] ?? []
}

export function namePrefix(ship) {
  const traits = classTraits(ship)
  return finishingTouches.namePrefixes.find((entry) => traits.includes(entry.trait))?.prefix ?? null
}

export function registryPrefix(ship) {
  const traits = classTraits(ship)
  const rule = finishingTouches.registryPrefixes.find((entry) => traits.includes(entry.trait))
  if (!rule) return null
  return ship.serviceRecordId === 'prototype' && rule.prototypePrefix ? rule.prototypePrefix : rule.prefix
}

export function registryRequired(ship) {
  const traits = classTraits(ship)
  return finishingTouches.registryPrefixes.some((entry) => entry.required && traits.includes(entry.trait))
}

export function shipDisplayName(ship) {
  const name = ship.shipName?.trim()
  if (!name) return null
  const prefix = namePrefix(ship)
  return prefix ? `${prefix} ${name}` : name
}

export function shipDisplayRegistry(ship) {
  const number = ship.registry?.trim()
  if (!number) return null
  const prefix = registryPrefix(ship)
  return prefix ? `${prefix}-${number}` : number
}

export function setShipName(ship, text) {
  const shipName = cleanName(text) || null
  if ((ship.shipName ?? null) === shipName) return ship
  return kept(ship, { shipName })
}

export function setRegistry(ship, text) {
  const registry = cleanRegistry(text) || null
  if ((ship.registry ?? null) === registry) return ship
  return kept(ship, { registry })
}

export function setFinishingChoice(ship, field, id) {
  const list = FINISHING_LISTS[field]
  if (!list) return ship
  const next = id && list.some((entry) => entry.id === id) ? id : null
  if (id && next === null) return ship
  if ((ship[field] ?? null) === next) return ship
  return kept(ship, { [field]: next })
}

export function clearFinishing(ship) {
  const empty = keepFinishing({})
  if (Object.keys(empty).every((key) => (ship[key] ?? null) === empty[key])) return ship
  return kept(ship, empty)
}

export function normalizeFinishing(ship) {
  const shipName = typeof ship.shipName === 'string' ? (cleanName(ship.shipName) || null) : null
  const registry = typeof ship.registry === 'string' ? (cleanRegistry(ship.registry) || null) : null
  const choices = {}
  for (const [field, list] of Object.entries(FINISHING_LISTS)) {
    const id = ship[field] ?? null
    choices[field] = list.some((entry) => entry.id === id) ? id : null
  }
  const next = { shipName, registry, ...choices }
  if (Object.entries(next).every(([key, value]) => (ship[key] ?? null) === value)) return ship
  return kept(ship, next)
}

export function isFinishingTouchesComplete(ship) {
  if (!ship.shipName?.trim()) return false
  if (registryRequired(ship) && !ship.registry?.trim()) return false
  return true
}

// Earned refits are assigned, including a ship that earned none. The step stays closed until the record is finished.
export function isRefitsFinished(ship) {
  if (!isServiceRecordFinished(ship)) return false
  return (ship.refits?.length ?? 0) === refitBudget(ship)
}

export function applyNotableExample(ship) {
  const example = notableIdentity(getSpaceframeById(ship.spaceframeId))
  if (!example?.shipName) return ship
  return kept(ship, example)
}

export function isShipComplete(ship) {
  return Boolean(ship.timeframeId && ship.spaceframeId && isRefitsFinished(ship) && isFinishingTouchesComplete(ship))
}

export function shipIssues(ship) {
  const issues = []
  if (!ship.timeframeId) issues.push({ stepId: 'timeframe', message: 'Choose an era.' })
  if (!ship.spaceframeId) issues.push({ stepId: 'spaceframe', message: 'Choose a class.' })
  if (!isMissionProfileComplete(ship)) issues.push({ stepId: 'missionProfile', message: 'Choose a mission profile, its talent, and the system it raises.' })
  else if (getServiceRecordById(ship.serviceRecordId)?.namesake && !serviceRecordTitle(ship)) {
    issues.push({ stepId: 'serviceRecord', message: 'Name the battle or war.' })
  }
  if (ship.spaceframeId && isServiceRecordFinished(ship) && (ship.refits?.length ?? 0) !== refitBudget(ship)) {
    issues.push({ stepId: 'refits', message: 'Assign every earned refit.' })
  }
  if (ship.spaceframeId && !ship.shipName?.trim()) issues.push({ stepId: 'finishingTouches', message: 'Enter the ship name.' })
  else if (registryRequired(ship) && !ship.registry?.trim()) issues.push({ stepId: 'finishingTouches', message: 'Enter the registry.' })
  return issues
}

export function reviewScoreLabel(score) {
  return score == null ? 'Pending' : String(score)
}

export function confirmShip(ship, confirmedAt = new Date().toISOString()) {
  if (!isShipComplete(ship) || ship.confirmedAt) return ship
  return kept(ship, { confirmedAt })
}

export function clearConfirmation(ship) {
  if (!ship.confirmedAt) return ship
  return kept(ship, { confirmedAt: null })
}

export function normalizeConfirmation(ship) {
  const confirmedAt = typeof ship.confirmedAt === 'string' && isShipComplete(ship) ? ship.confirmedAt : null
  if ((ship.confirmedAt ?? null) === confirmedAt) return ship
  return shipRecord({
    timeframeId: ship.timeframeId ?? null,
    spaceframeId: ship.spaceframeId ?? null,
    missionProfileId: ship.missionProfileId ?? null,
    missionProfileTalentId: ship.missionProfileTalentId ?? null,
    missionProfileSystemId: ship.missionProfileSystemId ?? null,
    serviceRecordId: ship.serviceRecordId ?? null,
    serviceRecordDetail: ship.serviceRecordDetail ?? null,
    refits: ship.refits ?? [],
    ...keepFinishing(ship),
    confirmedAt,
  })
}

export function pickFinishing(ship) {
  const example = notableIdentity(getSpaceframeById(ship.spaceframeId))
  const choices = {}
  for (const [field, list] of Object.entries(FINISHING_LISTS)) choices[field] = list[0]?.id ?? null
  return kept(ship, { ...(example ?? {}), ...choices })
}

// Dev Autofill fills every screen, in order, the way character Autofill fills the whole character.
export function autofillShip(random = Math.random) {
  let ship = selectTimeframe(createEmptyShip(), pickTimeframeId(random))
  const spaceframeId = pickSpaceframeId(ship.timeframeId, random)
  if (spaceframeId) ship = selectSpaceframe(ship, spaceframeId)
  ship = pickMissionProfile(ship, random)
  ship = pickServiceRecord(ship, random)
  ship = pickRefits(ship, random)
  return pickFinishing(ship)
}
