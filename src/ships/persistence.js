import {
  createEmptyShip,
  getMissionProfileById,
  getServiceHonorById,
  getServiceNarrativeEventById,
  getServiceRecordById,
  getServiceReputationById,
  getTimeframeById,
  isSpaceframeEligible,
  normalizeConfirmation,
  normalizeFinishing,
  normalizeRefits,
  SHIP_VERSION,
} from './shipModel.js'

// The ship in progress. Separate from the character save. Never written into character location data.
const SHIP_KEY = 'st-adventures.ship'

const SYSTEMS = ['comms', 'engines', 'structure', 'computers', 'sensors', 'weapons']

function read() {
  try {
    return JSON.parse(localStorage.getItem(SHIP_KEY))
  } catch {
    return null
  }
}

function missionFields(saved) {
  const profile = getMissionProfileById(saved.missionProfileId)
  if (!profile) return { missionProfileId: null, missionProfileTalentId: null, missionProfileSystemId: null }
  const talentId = saved.missionProfileTalentId ?? null
  const missionProfileTalentId = profile.talents.some((talent) => talent.id === talentId) ? talentId : null
  const requested = saved.missionProfileSystemId ?? null
  const missionProfileSystemId = profile.system === 'choice'
    ? (SYSTEMS.includes(requested) ? requested : null)
    : profile.system
  return { missionProfileId: profile.id, missionProfileTalentId, missionProfileSystemId }
}

function idList(value, lookup) {
  if (!Array.isArray(value)) return []
  const kept = []
  for (const id of value) {
    if (lookup(id) && !kept.includes(id)) kept.push(id)
  }
  return kept
}

function serviceFields(saved) {
  const serviceNotableEventIds = idList(saved.serviceNotableEventIds, getServiceNarrativeEventById)
  const serviceHonorIds = idList(saved.serviceHonorIds, getServiceHonorById)
  const reputation = getServiceReputationById(saved.serviceReputationId)
  const serviceReputationId = reputation ? reputation.id : null
  const record = getServiceRecordById(saved.serviceRecordId)
  if (!record) {
    return {
      serviceRecordId: null,
      serviceRecordDetail: null,
      serviceNotableEventIds,
      serviceReputationId,
      serviceHonorIds,
    }
  }
  const detail = typeof saved.serviceRecordDetail === 'string' ? saved.serviceRecordDetail.trim() : ''
  return {
    serviceRecordId: record.id,
    serviceRecordDetail: record.namesake && detail ? detail : null,
    serviceNotableEventIds,
    serviceReputationId,
    serviceHonorIds,
  }
}

export function persistedShip(ship) {
  return {
    version: SHIP_VERSION,
    timeframeId: ship.timeframeId ?? null,
    spaceframeId: ship.spaceframeId ?? null,
    missionProfileId: ship.missionProfileId ?? null,
    missionProfileTalentId: ship.missionProfileTalentId ?? null,
    missionProfileSystemId: ship.missionProfileSystemId ?? null,
    serviceRecordId: ship.serviceRecordId ?? null,
    serviceRecordDetail: ship.serviceRecordDetail ?? null,
    serviceNotableEventIds: Array.isArray(ship.serviceNotableEventIds) ? ship.serviceNotableEventIds : [],
    serviceReputationId: ship.serviceReputationId ?? null,
    serviceHonorIds: Array.isArray(ship.serviceHonorIds) ? ship.serviceHonorIds : [],
    refits: Array.isArray(ship.refits) ? ship.refits : [],
    shipName: ship.shipName ?? null,
    registry: ship.registry ?? null,
    bridgeLayoutId: ship.bridgeLayoutId ?? null,
    hullMarkingsId: ship.hullMarkingsId ?? null,
    stripingStyleId: ship.stripingStyleId ?? null,
    nacelleCapsId: ship.nacelleCapsId ?? null,
    emblemStyleId: ship.emblemStyleId ?? null,
    secondaryMarkingsId: ship.secondaryMarkingsId ?? null,
    confirmedAt: ship.confirmedAt ?? null,
  }
}

export function shipFromRecord(saved) {
  if (!saved || saved.version !== SHIP_VERSION) return createEmptyShip()
  const timeframeId = saved.timeframeId ?? null
  if (timeframeId !== null && !getTimeframeById(timeframeId)) return createEmptyShip()
  const requested = saved.spaceframeId ?? null
  const spaceframeId = requested && isSpaceframeEligible(timeframeId, requested) ? requested : null
  return normalizeConfirmation(normalizeFinishing(normalizeRefits({
    version: SHIP_VERSION,
    timeframeId,
    spaceframeId,
    ...missionFields(saved),
    ...serviceFields(saved),
    refits: Array.isArray(saved.refits) ? saved.refits : [],
    shipName: saved.shipName ?? null,
    registry: saved.registry ?? null,
    bridgeLayoutId: saved.bridgeLayoutId ?? null,
    hullMarkingsId: saved.hullMarkingsId ?? null,
    stripingStyleId: saved.stripingStyleId ?? null,
    nacelleCapsId: saved.nacelleCapsId ?? null,
    emblemStyleId: saved.emblemStyleId ?? null,
    secondaryMarkingsId: saved.secondaryMarkingsId ?? null,
    confirmedAt: typeof saved.confirmedAt === 'string' ? saved.confirmedAt : null,
  })))
}

export function loadShip() {
  return shipFromRecord(read())
}

export function saveShip(ship) {
  try {
    localStorage.setItem(SHIP_KEY, JSON.stringify(persistedShip(ship)))
  } catch {
    // Storage full or disabled: the screen keeps working without persistence.
  }
}
