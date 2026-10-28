import exampleClasses from '../data/ships/exampleClasses.json'
import finishingTouches from '../data/ships/finishingTouches.json'
import missionProfiles from '../data/ships/missionProfiles.json'
import refitTable from '../data/ships/refits.json'
import serviceEffects from '../data/ships/serviceEffects.json'
import serviceNarrative from '../data/ships/serviceNarrative.json'
import serviceRecords from '../data/ships/serviceRecords.json'
import spaceframeData from '../data/ships/spaceframes.json'
import timeframes from '../data/ships/timeframes.json'
import {
  appearanceDetailEqual,
  emptyAppearanceDetail,
  getAppearanceOption,
  getFinishingPackageOption,
  isAppearanceOptionAvailable,
  isFinishingPackageAvailable,
  normalizeAppearanceDetail,
  sanitizeAppearanceDetail,
  sanitizeFinishingPackages,
} from './appearanceRules.js'
import {
  filterExtraTalentIds,
  filterTalentChoices,
  pickExtraTalents,
  setTalentChoice,
  talentsFilled,
  toggleExtraTalent,
} from './shipTalents.js'

export {
  appearanceDetailEqual,
  appearanceLayerPaths,
  appearanceOptionAvailability,
  emptyAppearanceDetail,
  findAppearanceOptionById,
  finishingPackageAvailability,
  getAppearanceCategories,
  getAppearanceCategoryById,
  getAppearanceContextEntries,
  getAppearanceOption,
  getAppearanceSlot,
  getFinishingPackageOption,
  getFinishingPackageOptions,
  isAppearanceOptionAvailable,
  isFinishingPackageAvailable,
  normalizeAppearanceDetail,
  sanitizeAppearanceDetail,
  sanitizeFinishingPackages,
} from './appearanceRules.js'

export {
  APPEARANCE_FIELDS,
  getStarshipTalentById,
  getStarshipTalents,
  grantedTalentIds,
  playYear,
  shipCrewSupport,
  shipResistance,
  shipShields,
  shipTalentNames,
  talentCapacity,
  talentIneligibility,
  talentSlotsRemaining,
  talentSlotsUsed,
  talentsFilled,
  talentsForTab,
} from './shipTalents.js'

export const SHIP_VERSION = 1

const eras = timeframes.eras
const spaceframes = spaceframeData.spaceframes
const specialRules = spaceframeData.specialRules
const profiles = missionProfiles.profiles
const records = serviceRecords.records
const narrativeEvents = serviceNarrative.events
const narrativeReputations = serviceNarrative.reputations
const narrativeHonors = serviceNarrative.honors
const refitSystems = refitTable.systems
const REFIT_CAP = 12

const narrativeEventIds = new Set(narrativeEvents.map((entry) => entry.id))
const narrativeReputationIds = new Set(narrativeReputations.map((entry) => entry.id))
const narrativeHonorIds = new Set(narrativeHonors.map((entry) => entry.id))

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
  campaignYear = null,
  spaceframeId = null,
  missionProfileId = null,
  missionProfileTalentId = null,
  missionProfileSystemId = null,
  serviceRecordId = null,
  serviceRecordDetail = null,
  serviceNotableEventIds = [],
  serviceReputationId = null,
  serviceHonorIds = [],
  refits = [],
  extraTalentIds = [],
  talentChoices = {},
  shipName = null,
  registry = null,
  classDesignation = null,
  bridgeLayoutId = null,
  hullMarkingsId = null,
  stripingStyleId = null,
  nacelleCapsId = null,
  emblemStyleId = null,
  secondaryMarkingsId = null,
  appearanceDetail = null,
  confirmedAt = null,
}) {
  const draft = {
    version: SHIP_VERSION,
    timeframeId,
    campaignYear: timeframeId ? clampCampaignYear(timeframeId, campaignYear) : null,
    spaceframeId,
    missionProfileId,
    missionProfileTalentId,
    missionProfileSystemId,
    serviceRecordId,
    serviceRecordDetail,
    serviceNotableEventIds: filterIdList(serviceNotableEventIds, narrativeEventIds, MAX_SERVICE_NOTABLE_EVENTS),
    serviceReputationId: narrativeReputationIds.has(serviceReputationId) ? serviceReputationId : null,
    serviceHonorIds: filterIdList(serviceHonorIds, narrativeHonorIds, MAX_SERVICE_HONORS),
    refits,
    extraTalentIds,
    talentChoices,
    shipName,
    registry,
    classDesignation,
    bridgeLayoutId,
    hullMarkingsId,
    stripingStyleId,
    nacelleCapsId,
    emblemStyleId,
    secondaryMarkingsId,
    appearanceDetail: normalizeAppearanceDetail(appearanceDetail),
    confirmedAt,
  }
  const nextExtra = filterExtraTalentIds(draft, extraTalentIds)
  draft.extraTalentIds = nextExtra
  draft.talentChoices = filterTalentChoices({ ...draft, extraTalentIds: nextExtra }, talentChoices)
  return draft
}

function keepProfile(ship) {
  return {
    missionProfileId: ship.missionProfileId ?? null,
    missionProfileTalentId: ship.missionProfileTalentId ?? null,
    missionProfileSystemId: ship.missionProfileSystemId ?? null,
  }
}

// Prototype narrative caps (mockup Screen 04: up to 2). Reputation remains one or none.
export const MAX_SERVICE_NOTABLE_EVENTS = 2
export const MAX_SERVICE_HONORS = 2

function filterIdList(ids, allowed, max = Infinity) {
  if (!Array.isArray(ids)) return []
  const kept = []
  for (const id of ids) {
    if (!allowed.has(id) || kept.includes(id)) continue
    kept.push(id)
    if (kept.length >= max) break
  }
  return kept
}

function keepService(ship) {
  return {
    serviceRecordId: ship.serviceRecordId ?? null,
    serviceRecordDetail: ship.serviceRecordDetail ?? null,
    serviceNotableEventIds: filterIdList(ship.serviceNotableEventIds, narrativeEventIds, MAX_SERVICE_NOTABLE_EVENTS),
    serviceReputationId: narrativeReputationIds.has(ship.serviceReputationId) ? ship.serviceReputationId : null,
    serviceHonorIds: filterIdList(ship.serviceHonorIds, narrativeHonorIds, MAX_SERVICE_HONORS),
  }
}

function hasNarrative(ship) {
  return Boolean(
    ship.serviceNotableEventIds?.length
    || ship.serviceReputationId
    || ship.serviceHonorIds?.length,
  )
}

function keepFinishing(ship) {
  return {
    shipName: ship.shipName ?? null,
    registry: ship.registry ?? null,
    classDesignation: ship.classDesignation ?? null,
    bridgeLayoutId: ship.bridgeLayoutId ?? null,
    hullMarkingsId: ship.hullMarkingsId ?? null,
    stripingStyleId: ship.stripingStyleId ?? null,
    nacelleCapsId: ship.nacelleCapsId ?? null,
    emblemStyleId: ship.emblemStyleId ?? null,
    secondaryMarkingsId: ship.secondaryMarkingsId ?? null,
    appearanceDetail: normalizeAppearanceDetail(ship.appearanceDetail),
  }
}

function withSanitizedAppearance(ship, overrides) {
  const base = { ...ship, ...overrides }
  const { appearanceDetail } = sanitizeAppearanceDetail(base)
  const { finishing } = sanitizeFinishingPackages({ ...base, appearanceDetail })
  return kept(ship, { ...overrides, appearanceDetail, ...finishing })
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

function keepTalents(ship) {
  return {
    extraTalentIds: Array.isArray(ship.extraTalentIds) ? ship.extraTalentIds : [],
    talentChoices: ship.talentChoices && typeof ship.talentChoices === 'object' ? ship.talentChoices : {},
  }
}

function kept(ship, overrides) {
  const fields = {
    timeframeId: ship.timeframeId ?? null,
    campaignYear: ship.campaignYear ?? null,
    spaceframeId: ship.spaceframeId ?? null,
    ...keepProfile(ship),
    ...keepService(ship),
    refits: ship.refits ?? [],
    ...keepTalents(ship),
    ...keepFinishing(ship),
    confirmedAt: null,
    ...overrides,
  }
  return shipRecord({ ...fields, refits: legalRefits(fields, fields.refits ?? []) })
}

export function toggleShipTalent(ship, talentId) {
  const probed = toggleExtraTalent(ship, talentId)
  if (
    sameList(probed.extraTalentIds ?? [], ship.extraTalentIds ?? [])
    && JSON.stringify(probed.talentChoices ?? {}) === JSON.stringify(ship.talentChoices ?? {})
  ) return ship
  return kept(ship, {
    extraTalentIds: probed.extraTalentIds ?? [],
    talentChoices: probed.talentChoices ?? {},
  })
}

export function setShipTalentChoice(ship, talentId, choice) {
  const probed = setTalentChoice(ship, talentId, choice)
  if (JSON.stringify(probed.talentChoices ?? {}) === JSON.stringify(ship.talentChoices ?? {})) return ship
  return kept(ship, { talentChoices: probed.talentChoices ?? {} })
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

// Era year span for the Campaign Year control only (Core p. 193).
// Does not expand with throughYear — that field is for class eligibility / refit fallback, not the year picker.
export function timeframeYearSpan(eraOrId) {
  const era = typeof eraOrId === 'string' ? getTimeframeById(eraOrId) : eraOrId
  if (!era) return null
  if (Number.isFinite(era.campaignStart) && Number.isFinite(era.campaignEnd)) {
    return {
      start: Math.min(era.campaignStart, era.campaignEnd),
      end: Math.max(era.campaignStart, era.campaignEnd),
    }
  }
  const nums = [...(era.years ?? '').matchAll(/\d{4}/g)].map((match) => Number(match[0]))
  if (nums.length >= 2) {
    let start = nums[0]
    let end = nums[1]
    // "2260s–2270s" → inclusive decade end (2279), not the digit pair alone.
    if (/\d{4}s/.test(era.years ?? '')) end = end - (end % 10) + 9
    return { start: Math.min(start, end), end: Math.max(start, end) }
  }
  if (Number.isFinite(era.throughYear)) {
    return { start: era.throughYear, end: era.throughYear }
  }
  return null
}

/** Full campaign-year continuum across every era card (gaps allowed between eras). */
export function allCampaignYearSpan() {
  let start = null
  let end = null
  for (const era of eras) {
    const span = timeframeYearSpan(era)
    if (!span) continue
    start = start == null ? span.start : Math.min(start, span.start)
    end = end == null ? span.end : Math.max(end, span.end)
  }
  return start == null ? null : { start, end }
}

function erasContainingYear(year) {
  if (!Number.isFinite(year)) return []
  return eras.filter((era) => {
    const span = timeframeYearSpan(era)
    return span && year >= span.start && year <= span.end
  })
}

/**
 * Resolve which era card owns a campaign year.
 * Keep the preferred card while the year still falls in its range (handles TOS/TMP and TNG/DS9/VOY overlaps).
 * When the year leaves the preferred card, pick the next/previous card in list order that covers it.
 */
export function timeframeIdForYear(year, preferredId = null) {
  const matches = erasContainingYear(year)
  if (!matches.length) return null
  if (preferredId && matches.some((era) => era.id === preferredId)) return preferredId

  if (preferredId) {
    const order = eras.map((era) => era.id)
    const preferredIndex = order.indexOf(preferredId)
    if (preferredIndex >= 0) {
      const later = matches.filter((era) => order.indexOf(era.id) > preferredIndex)
      if (later.length) return later[0].id
      const earlier = matches.filter((era) => order.indexOf(era.id) < preferredIndex)
      if (earlier.length) return earlier[earlier.length - 1].id
    }
  }

  // No preference: narrowest matching range (DS9/VOY over the wider TNG decade band).
  const ranked = [...matches].sort((left, right) => {
    const leftSpan = timeframeYearSpan(left)
    const rightSpan = timeframeYearSpan(right)
    return (leftSpan.end - leftSpan.start) - (rightSpan.end - rightSpan.start)
  })
  return ranked[0].id
}

function snapYearAcrossGap(fromYear, requestedYear) {
  const global = allCampaignYearSpan()
  if (!global) return null
  let y = Math.round(requestedYear)
  y = Math.min(global.end, Math.max(global.start, y))
  if (timeframeIdForYear(y)) return y

  // Year landed in a gap between eras — jump to the next/previous era edge in the travel direction.
  const forward = requestedYear >= fromYear
  if (forward) {
    for (const era of eras) {
      const span = timeframeYearSpan(era)
      if (span && span.start > fromYear) return span.start
    }
    return global.end
  }
  for (let index = eras.length - 1; index >= 0; index -= 1) {
    const span = timeframeYearSpan(eras[index])
    if (span && span.end < fromYear) return span.end
  }
  return global.start
}

export function clampCampaignYear(timeframeId, year) {
  const era = getTimeframeById(timeframeId)
  const span = timeframeYearSpan(era)
  if (!span) return null
  const fallback = Number.isFinite(era?.throughYear)
    ? Math.min(span.end, Math.max(span.start, era.throughYear))
    : span.end
  if (!Number.isFinite(year)) return fallback
  return Math.min(span.end, Math.max(span.start, Math.round(year)))
}

export function shipPlayYear(ship) {
  if (Number.isFinite(ship?.campaignYear)) return ship.campaignYear
  return getTimeframeById(ship?.timeframeId)?.throughYear ?? null
}

// A class is offered when it had entered service by the campaign year (Core p. 193).
export function isSpaceframeEligible(timeframeId, spaceframeId, year = null) {
  const era = getTimeframeById(timeframeId)
  const frame = getSpaceframeById(spaceframeId)
  if (!era || !frame) return false
  const play = Number.isFinite(year) ? year : era.throughYear
  if (!Number.isFinite(play) || !Number.isFinite(frame.launchYear)) return false
  return frame.launchYear <= play
}

export function getEligibleSpaceframes(timeframeId, year = null) {
  return spaceframes.filter((frame) => isSpaceframeEligible(timeframeId, frame.id, year))
}

export function selectTimeframe(ship, timeframeId) {
  if (!getTimeframeById(timeframeId)) return ship
  // Keep the current year when it still falls inside the newly chosen era; otherwise default inside that era.
  const keepYear = ship.timeframeId === timeframeId || timeframeIdForYear(ship.campaignYear, timeframeId) === timeframeId
  const campaignYear = clampCampaignYear(timeframeId, keepYear ? ship.campaignYear : null)
  if (ship.timeframeId === timeframeId && ship.campaignYear === campaignYear) return ship
  const spaceframeId = isSpaceframeEligible(timeframeId, ship.spaceframeId, campaignYear) ? ship.spaceframeId : null
  return withSanitizedAppearance(ship, { timeframeId, campaignYear, spaceframeId })
}

export function setCampaignYear(ship, year) {
  if (!Number.isFinite(year) && !ship.timeframeId) return ship
  const fromYear = Number.isFinite(ship.campaignYear) ? ship.campaignYear : (allCampaignYearSpan()?.start ?? year)
  let campaignYear = snapYearAcrossGap(fromYear, Number.isFinite(year) ? year : fromYear)
  if (campaignYear == null) return ship

  // Era follows the year. Prefer the current card while the year still belongs to it.
  let timeframeId = timeframeIdForYear(campaignYear, ship.timeframeId) ?? ship.timeframeId
  if (!timeframeId) return ship

  // Moving forward must not snap back into an earlier overlapping card (e.g. Voyager 2378 → TNG 2379).
  if (
    ship.timeframeId
    && Number.isFinite(year)
    && Number.isFinite(ship.campaignYear)
    && year > ship.campaignYear
  ) {
    const order = eras.map((era) => era.id)
    const nextIndex = order.indexOf(timeframeId)
    const currentIndex = order.indexOf(ship.timeframeId)
    if (currentIndex >= 0 && nextIndex >= 0 && nextIndex < currentIndex) {
      timeframeId = ship.timeframeId
      campaignYear = clampCampaignYear(timeframeId, year)
    }
  }

  // Final clamp to the resolved era so year never leaves that era's published bounds.
  const clamped = clampCampaignYear(timeframeId, campaignYear)
  if (clamped == null) return ship
  if (ship.timeframeId === timeframeId && ship.campaignYear === clamped) return ship
  const spaceframeId = isSpaceframeEligible(timeframeId, ship.spaceframeId, clamped) ? ship.spaceframeId : null
  if (ship.timeframeId !== timeframeId) {
    return withSanitizedAppearance(ship, { timeframeId, campaignYear: clamped, spaceframeId })
  }
  return kept(ship, { campaignYear: clamped, spaceframeId })
}

export function selectSpaceframe(ship, spaceframeId) {
  if (!isSpaceframeEligible(ship.timeframeId, spaceframeId, shipPlayYear(ship))) return ship
  if (ship.spaceframeId === spaceframeId) return ship
  return kept(ship, { spaceframeId })
}

export function clearSpaceframe(ship) {
  if (!ship.spaceframeId) return ship
  return kept(ship, { spaceframeId: null })
}

export function pickSpaceframeId(timeframeId, random = Math.random, year = null) {
  const options = getEligibleSpaceframes(timeframeId, year)
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

// Campaign year is the year of play (Core p. 193). Prototype adds the two refits from p. 216.
export function refitBudget(ship) {
  const frame = getSpaceframeById(ship.spaceframeId)
  const year = shipPlayYear(ship)
  if (!frame || !Number.isFinite(year) || !Number.isFinite(frame.launchYear)) return 0
  const decades = Math.max(0, Math.floor((year - frame.launchYear) / 10))
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
  const extraTalentIds = filterExtraTalentIds(ship, ship.extraTalentIds ?? [])
  const talentChoices = filterTalentChoices({ ...ship, extraTalentIds }, ship.talentChoices ?? {})
  if (
    sameList(refits, ship.refits ?? [])
    && sameList(extraTalentIds, ship.extraTalentIds ?? [])
    && JSON.stringify(talentChoices) === JSON.stringify(ship.talentChoices ?? {})
  ) return ship
  return shipRecord({
    timeframeId: ship.timeframeId ?? null,
    campaignYear: ship.campaignYear ?? null,
    spaceframeId: ship.spaceframeId ?? null,
    missionProfileId: ship.missionProfileId ?? null,
    missionProfileTalentId: ship.missionProfileTalentId ?? null,
    missionProfileSystemId: ship.missionProfileSystemId ?? null,
    ...keepService(ship),
    refits,
    extraTalentIds,
    talentChoices,
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

export function refitSummaryItems(ship) {
  const counts = new Map()
  for (const id of ship.refits ?? []) counts.set(id, (counts.get(id) ?? 0) + 1)
  if (!counts.size) return []
  return refitSystems
    .filter((entry) => counts.has(entry.id))
    .map((entry) => (counts.get(entry.id) > 1 ? `${entry.name} ${counts.get(entry.id)}` : entry.name))
}

export function refitSummary(ship) {
  const items = refitSummaryItems(ship)
  return items.length ? items.join(', ') : null
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
  return withSanitizedAppearance(ship, { serviceRecordId, serviceRecordDetail: null })
}

export function setServiceRecordDetail(ship, text) {
  const record = getServiceRecordById(ship.serviceRecordId)
  if (!record?.namesake) return ship
  const serviceRecordDetail = String(text ?? '').trim() || null
  if (ship.serviceRecordDetail === serviceRecordDetail) return ship
  return withSanitizedAppearance(ship, { serviceRecordDetail })
}

export function clearServiceRecord(ship) {
  if (!ship.serviceRecordId && !ship.serviceRecordDetail && !hasNarrative(ship)) return ship
  return withSanitizedAppearance(ship, {
    serviceRecordId: null,
    serviceRecordDetail: null,
    serviceNotableEventIds: [],
    serviceReputationId: null,
    serviceHonorIds: [],
  })
}

export function getServiceNarrativeEvents() {
  return narrativeEvents
}

export function getServiceNarrativeEventById(id) {
  return narrativeEvents.find((entry) => entry.id === id) ?? null
}

export function getServiceReputations() {
  return narrativeReputations
}

export function getServiceReputationById(id) {
  return narrativeReputations.find((entry) => entry.id === id) ?? null
}

export function getServiceHonors() {
  return narrativeHonors
}

export function getServiceHonorById(id) {
  return narrativeHonors.find((entry) => entry.id === id) ?? null
}

export function toggleServiceNotableEvent(ship, eventId) {
  if (!narrativeEventIds.has(eventId)) return ship
  const current = filterIdList(ship.serviceNotableEventIds, narrativeEventIds, MAX_SERVICE_NOTABLE_EVENTS)
  let serviceNotableEventIds
  if (current.includes(eventId)) {
    serviceNotableEventIds = current.filter((id) => id !== eventId)
  } else if (current.length >= MAX_SERVICE_NOTABLE_EVENTS) {
    return ship
  } else {
    serviceNotableEventIds = [...current, eventId]
  }
  if (sameList(serviceNotableEventIds, current)) return ship
  return withSanitizedAppearance(ship, { serviceNotableEventIds })
}

export function selectServiceReputation(ship, reputationId) {
  if (reputationId == null) {
    if (!ship.serviceReputationId) return ship
    return withSanitizedAppearance(ship, { serviceReputationId: null })
  }
  if (!narrativeReputationIds.has(reputationId)) return ship
  if (ship.serviceReputationId === reputationId) {
    return withSanitizedAppearance(ship, { serviceReputationId: null })
  }
  return withSanitizedAppearance(ship, { serviceReputationId: reputationId })
}

export function toggleServiceHonor(ship, honorId) {
  if (!narrativeHonorIds.has(honorId)) return ship
  const current = filterIdList(ship.serviceHonorIds, narrativeHonorIds, MAX_SERVICE_HONORS)
  let serviceHonorIds
  if (current.includes(honorId)) {
    serviceHonorIds = current.filter((id) => id !== honorId)
  } else if (current.length >= MAX_SERVICE_HONORS) {
    return ship
  } else {
    serviceHonorIds = [...current, honorId]
  }
  if (sameList(serviceHonorIds, current)) return ship
  return withSanitizedAppearance(ship, { serviceHonorIds })
}

export function pickServiceRecord(ship, random = Math.random) {
  const options = records.filter((record) => !record.namesake)
  if (!options.length) return ship
  const record = options[Math.min(Math.floor(random() * options.length), options.length - 1)]
  return selectServiceRecord(ship, record.id)
}

// Prototype sample battles and wars for the Survivor Random control. The book does not list them.
export function getSurvivorNamesakes() {
  return Array.isArray(serviceRecords.survivorNamesakes) ? serviceRecords.survivorNamesakes : []
}

export function pickSurvivorNamesake(ship, random = Math.random) {
  const options = getSurvivorNamesakes()
  if (!getServiceRecordById(ship.serviceRecordId)?.namesake || !options.length) return ship
  const name = options[Math.min(Math.floor(random() * options.length), options.length - 1)]
  return setServiceRecordDetail(ship, name)
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

function pushUniqueTrait(list, entry) {
  if (!entry?.name) return
  if (list.some((existing) => existing.name.toLowerCase() === entry.name.toLowerCase())) return
  list.push(entry)
}

// Class + service-record Traits (Core), then narrative Traits from events / reputation / honors (prototype).
// First source wins on a duplicate name. Pending Survivor namesake is listed but not active for rules.
export function getShipGameplayTraits(ship) {
  if (!ship) return []
  const traits = []
  const frame = getSpaceframeById(ship.spaceframeId)
  for (const name of frame?.traits ?? []) {
    pushUniqueTrait(traits, {
      name,
      source: 'class',
      sourceId: frame.id,
      line: 'Class trait',
      description: null,
      effect: null,
      pending: false,
    })
  }

  const record = getServiceRecordById(ship.serviceRecordId)
  if (record) {
    const title = serviceRecordTitle(ship)
    pushUniqueTrait(traits, {
      name: title ?? (record.namesake ? 'Name the battle or war.' : record.name),
      source: 'serviceRecord',
      sourceId: record.id,
      line: 'Service record trait',
      description: title || !record.namesake ? record.overview : null,
      effect: title
        ? `Grants the ${title} trait and the ${record.ruleName} special rule.`
        : (record.namesake
          ? 'Pending until the battle or war is named on Service History.'
          : `Grants the ${record.name} trait and the ${record.ruleName} special rule.`),
      pending: Boolean(record.namesake && !title),
      specialRule: { id: record.id, name: record.ruleName, text: record.rule },
    })
  }

  for (const id of ship.serviceNotableEventIds ?? []) {
    const event = getServiceNarrativeEventById(id)
    const effect = serviceEffects.events?.[id]
    if (!event || !effect) continue
    pushUniqueTrait(traits, {
      name: effect.traitName,
      source: 'event',
      sourceId: id,
      line: 'Notable event',
      description: event.description ?? event.summary,
      effect: `Contextual Trait (−1 / +1 on tagged tasks). ${event.implications ?? ''}`.trim(),
      pending: false,
    })
  }

  if (ship.serviceReputationId) {
    const reputation = getServiceReputationById(ship.serviceReputationId)
    const effect = serviceEffects.reputations?.[ship.serviceReputationId]
    if (reputation && effect) {
      pushUniqueTrait(traits, {
        name: effect.traitName,
        source: 'reputation',
        sourceId: reputation.id,
        line: 'Reputation',
        description: reputation.description ?? reputation.summary,
        effect: `Contextual Trait (−1 / +1 on tagged tasks). ${reputation.implications ?? ''}`.trim(),
        pending: false,
      })
    }
  }

  for (const id of ship.serviceHonorIds ?? []) {
    const honor = getServiceHonorById(id)
    const effect = serviceEffects.honors?.[id]
    if (!honor || !effect) continue
    pushUniqueTrait(traits, {
      name: effect.traitName,
      source: 'honor',
      sourceId: id,
      line: 'Honor',
      description: honor.description ?? honor.summary,
      effect: `Contextual Trait (−1 / +1 on tagged tasks). ${honor.implications ?? ''}`.trim(),
      pending: false,
    })
  }

  return traits
}

export function shipTraitNames(ship) {
  return getShipGameplayTraits(ship).filter((entry) => !entry.pending).map((entry) => entry.name)
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

function parseNotableIdentities(frame) {
  const text = frame?.notableExamples ?? ''
  const found = []
  const seen = new Set()
  const add = (shipName, registry) => {
    const name = cleanName(shipName)
    if (!name) return
    const key = `${name}|${registry ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    found.push({ shipName: name, registry: registry || null })
  }
  for (const match of text.matchAll(/([^,()]+?)\s*\(\s*(?:NX\/)?(?:NCC|NX)-([0-9][0-9A-Z-]*)/gi)) {
    add(match[1], match[2])
  }
  for (const match of text.matchAll(/(?:^|,)\s*(?:NCC|NX)-([0-9][0-9A-Z-]*)\s+([^,(]+)/gi)) {
    add(match[2], match[1])
  }
  if (!found.length) {
    for (const part of text.split(',')) {
      const name = cleanName(part.replace(/\(.*?\)/g, ''))
      if (name) add(name, null)
    }
  }
  return found
}

function notableIdentity(frame) {
  return parseNotableIdentities(frame)[0] ?? null
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

export function setClassDesignation(ship, text) {
  const classDesignation = typeof text === 'string' ? (text.trim() || null) : null
  if ((ship.classDesignation ?? null) === classDesignation) return ship
  return kept(ship, { classDesignation })
}

export function setFinishingChoice(ship, field, id) {
  const list = FINISHING_LISTS[field]
  if (!list) return ship
  const next = id && list.some((entry) => entry.id === id) ? id : null
  if (id && next === null) return ship
  if (next && !isFinishingPackageAvailable(ship, field, next) && getFinishingPackageOption(field, next)) {
    return ship
  }
  if ((ship[field] ?? null) === next) return ship
  return kept(ship, { [field]: next })
}

export function setAppearanceDetailChoice(ship, categoryId, slotId, optionId) {
  const current = normalizeAppearanceDetail(ship.appearanceDetail)
  if (!Object.hasOwn(current, categoryId) || !Object.hasOwn(current[categoryId], slotId)) return ship
  const clearing = !optionId
  if (clearing) {
    if ((current[categoryId][slotId] ?? null) === null) return ship
    const appearanceDetail = {
      ...current,
      [categoryId]: { ...current[categoryId], [slotId]: null },
    }
    return kept(ship, { appearanceDetail })
  }
  const option = getAppearanceOption(categoryId, slotId, optionId)
  if (!option) return ship
  if (!isAppearanceOptionAvailable(ship, option)) return ship
  if (current[categoryId][slotId] === optionId) {
    const appearanceDetail = {
      ...current,
      [categoryId]: { ...current[categoryId], [slotId]: null },
    }
    return kept(ship, { appearanceDetail })
  }
  const appearanceDetail = {
    ...current,
    [categoryId]: { ...current[categoryId], [slotId]: optionId },
  }
  return kept(ship, { appearanceDetail })
}

export function clearFinishing(ship) {
  const empty = keepFinishing({})
  const sameLegacy = Object.keys(empty).every((key) => {
    if (key === 'appearanceDetail') return appearanceDetailEqual(ship.appearanceDetail, empty.appearanceDetail)
    return (ship[key] ?? null) === empty[key]
  })
  if (sameLegacy) return ship
  return kept(ship, empty)
}

export function normalizeFinishing(ship) {
  const shipName = typeof ship.shipName === 'string' ? (cleanName(ship.shipName) || null) : null
  const registry = typeof ship.registry === 'string' ? (cleanRegistry(ship.registry) || null) : null
  const classDesignation = typeof ship.classDesignation === 'string'
    ? (ship.classDesignation.trim() || null)
    : null
  const choices = {}
  for (const [field, list] of Object.entries(FINISHING_LISTS)) {
    const id = ship[field] ?? null
    const known = list.some((entry) => entry.id === id) ? id : null
    choices[field] = known && isFinishingPackageAvailable(ship, field, known)
      ? known
      : (known && getFinishingPackageOption(field, known) ? null : known)
  }
  const draft = { ...ship, ...choices, shipName, registry, classDesignation }
  const { appearanceDetail } = sanitizeAppearanceDetail(draft)
  const { finishing } = sanitizeFinishingPackages({ ...draft, appearanceDetail })
  const next = { shipName, registry, classDesignation, ...choices, ...finishing, appearanceDetail }
  const same = Object.entries(next).every(([key, value]) => {
    if (key === 'appearanceDetail') return appearanceDetailEqual(ship.appearanceDetail, value)
    return (ship[key] ?? null) === value
  })
  if (same) return ship
  return kept(ship, next)
}

export function isFinishingTouchesComplete(ship) {
  if (!ship.shipName?.trim()) return false
  if (registryRequired(ship) && !ship.registry?.trim()) return false
  return true
}

// Earned refits are assigned and talents equal Scale. The step stays closed until the service record is finished.
export function isRefitsFinished(ship) {
  if (!isServiceRecordFinished(ship)) return false
  if ((ship.refits?.length ?? 0) !== refitBudget(ship)) return false
  return talentsFilled(ship)
}

export function getNotableExample(ship, random = null) {
  const frame = getSpaceframeById(ship?.spaceframeId)
  const list = parseNotableIdentities(frame)
  if (!list.length) return null
  // Prefer examples that include a registry when the class has any.
  const withRegistry = list.filter((entry) => entry.registry)
  const pool = withRegistry.length ? withRegistry : list
  const index = typeof random === 'function'
    ? Math.min(pool.length - 1, Math.floor(Number(random()) * pool.length))
    : 0
  const identity = pool[index]
  return {
    shipName: identity.shipName,
    registry: identity.registry ?? null,
    classDesignation: frame?.name ? `${frame.name} class` : null,
  }
}

export function applyNotableExample(ship, random = null) {
  const example = getNotableExample(ship, random)
  if (!example?.shipName) return ship
  return kept(ship, {
    shipName: example.shipName,
    registry: example.registry ?? null,
    classDesignation: example.classDesignation ?? null,
  })
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
  } else if (ship.spaceframeId && isServiceRecordFinished(ship) && !talentsFilled(ship)) {
    issues.push({ stepId: 'refits', message: 'Select starship talents until they equal Scale.' })
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
    ...keepService(ship),
    refits: ship.refits ?? [],
    ...keepTalents(ship),
    ...keepFinishing(ship),
    confirmedAt,
  })
}

export function pickFinishing(ship) {
  const example = getNotableExample(ship)
  const choices = {}
  for (const [field, list] of Object.entries(FINISHING_LISTS)) choices[field] = list[0]?.id ?? null
  return kept(ship, { ...(example ?? {}), ...choices })
}

// Dev Autofill fills every screen, in order, the way character Autofill fills the whole character.
export function autofillShip(random = Math.random) {
  let ship = selectTimeframe(createEmptyShip(), pickTimeframeId(random))
  const spaceframeId = pickSpaceframeId(ship.timeframeId, random, ship.campaignYear)
  if (spaceframeId) ship = selectSpaceframe(ship, spaceframeId)
  ship = pickMissionProfile(ship, random)
  ship = pickServiceRecord(ship, random)
  ship = pickRefitsAndTalents(ship, random)
  return pickFinishing(ship)
}

export function pickRefitsAndTalents(ship, random = Math.random) {
  let withRefits = pickRefits(ship, random)
  // Finish leftover budget if the d20 loop stalled on a full system.
  let guard = 0
  while ((withRefits.refits?.length ?? 0) < refitBudget(withRefits) && guard < 40) {
    guard += 1
    const open = refitSystems.find((entry) => refitRoom(withRefits, entry.id) > 0)
    if (!open) break
    withRefits = addRefit(withRefits, open.id)
  }
  const filled = pickExtraTalents(withRefits, random)
  return kept(withRefits, {
    extraTalentIds: filled.extraTalentIds ?? [],
    talentChoices: filled.talentChoices ?? {},
  })
}
