/**
 * Appearance Detail + Appearance Packages eligibility (Screens 05–06).
 * Prototype only — not STA 2E published hull-marking bonuses (Core p. 194).
 */
import appearanceCatalog from '../data/ships/appearanceCatalog.json'
import finishingTouches from '../data/ships/finishingTouches.json'

/** Screen 05 Appearance Packages fields (shared with Screen 06 finishing lists). */
export const FINISHING_PACKAGE_FIELDS = [
  'bridgeLayoutId',
  'hullMarkingsId',
  'stripingStyleId',
  'nacelleCapsId',
  'emblemStyleId',
]

const FINISHING_PACKAGE_LISTS = {
  bridgeLayoutId: finishingTouches.bridges,
  hullMarkingsId: finishingTouches.hullMarkings,
  stripingStyleId: finishingTouches.stripingStyles,
  nacelleCapsId: finishingTouches.nacelleCaps,
  emblemStyleId: finishingTouches.emblemStyles,
}

export const APPEARANCE_CATEGORY_IDS = ['identification', 'livery', 'surfaceFinish']

const EMPTY_IDENTIFICATION = {
  registryStyleId: null,
  hullIdMarkingsId: null,
  pennantId: null,
  missionIdMarkingsId: null,
  honorInsigniaId: null,
}

const EMPTY_LIVERY = {
  stripingPatternId: null,
  nacelleMarkingsId: null,
  engineeringHullId: null,
  hullColorId: null,
}

const EMPTY_SURFACE = {
  finishId: null,
  panelContrastId: null,
  weatheringId: null,
}

export function emptyAppearanceDetail() {
  return {
    identification: { ...EMPTY_IDENTIFICATION },
    livery: { ...EMPTY_LIVERY },
    surfaceFinish: { ...EMPTY_SURFACE },
  }
}

export function getAppearanceCategories() {
  return appearanceCatalog.categories ?? []
}

export function getAppearanceCategoryById(categoryId) {
  return getAppearanceCategories().find((entry) => entry.id === categoryId) ?? null
}

export function getAppearanceSlot(categoryId, slotId) {
  const category = getAppearanceCategoryById(categoryId)
  return category?.slots?.find((slot) => slot.id === slotId) ?? null
}

export function getAppearanceOption(categoryId, slotId, optionId) {
  if (!optionId) return null
  const slot = getAppearanceSlot(categoryId, slotId)
  return slot?.options?.find((option) => option.id === optionId) ?? null
}

export function findAppearanceOptionById(optionId) {
  if (!optionId) return null
  for (const category of getAppearanceCategories()) {
    for (const slot of category.slots ?? []) {
      const option = slot.options?.find((entry) => entry.id === optionId)
      if (option) return { category, slot, option }
    }
  }
  return null
}

function listMatch(requiredIds, presentIds) {
  if (!requiredIds?.length) return null
  const present = new Set(presentIds ?? [])
  return requiredIds.some((id) => present.has(id))
}

function linksTraitPresent(ship, links) {
  if (!links?.type || !links.id) return true
  if (links.type === 'honor') return (ship.serviceHonorIds ?? []).includes(links.id)
  if (links.type === 'event') return (ship.serviceNotableEventIds ?? []).includes(links.id)
  if (links.type === 'reputation') return ship.serviceReputationId === links.id
  if (links.type === 'serviceRecord') return ship.serviceRecordId === links.id
  return false
}

function requiresSatisfied(ship, requires) {
  if (!requires) return true
  const checks = []
  const service = listMatch(requires.serviceRecordIds, ship.serviceRecordId ? [ship.serviceRecordId] : [])
  const events = listMatch(requires.eventIds, ship.serviceNotableEventIds)
  const reputation = listMatch(requires.reputationIds, ship.serviceReputationId ? [ship.serviceReputationId] : [])
  const honors = listMatch(requires.honorIds, ship.serviceHonorIds)
  for (const value of [service, events, reputation, honors]) {
    if (value !== null) checks.push(value)
  }
  if (!checks.length) return true
  return requires.mode === 'any' ? checks.some(Boolean) : checks.every(Boolean)
}

export function appearanceOptionAvailability(ship, option) {
  if (!option) {
    return { available: false, reason: 'Unknown appearance option.' }
  }
  const eraId = ship?.timeframeId ?? null
  if (Array.isArray(option.eraIds) && option.eraIds.length) {
    if (!eraId || !option.eraIds.includes(eraId)) {
      return {
        available: false,
        reason: 'Not available in the selected timeframe.',
      }
    }
  }
  if (!requiresSatisfied(ship, option.requires)) {
    return {
      available: false,
      reason: eligibilityReason(option),
    }
  }
  if (option.linksTraitSource && !linksTraitPresent(ship, option.linksTraitSource)) {
    return {
      available: false,
      reason: 'Requires the matching Service Record selection that grants this Trait.',
    }
  }
  return { available: true, reason: null }
}

export function isAppearanceOptionAvailable(ship, option) {
  return appearanceOptionAvailability(ship, option).available
}

function eligibilityReason(option) {
  const req = option.requires ?? {}
  const parts = []
  if (req.serviceRecordIds?.length) parts.push(`service record (${req.serviceRecordIds.join(', ')})`)
  if (req.eventIds?.length) parts.push(`notable event (${req.eventIds.join(', ')})`)
  if (req.reputationIds?.length) parts.push(`reputation (${req.reputationIds.join(', ')})`)
  if (req.honorIds?.length) parts.push(`honor (${req.honorIds.join(', ')})`)
  if (!parts.length) return 'Locked until Screen 04 requirements are met.'
  const joiner = req.mode === 'any' ? ' or ' : ' and '
  return `Requires ${parts.join(joiner)} on Screen 04.`
}

export function normalizeAppearanceDetail(raw) {
  const empty = emptyAppearanceDetail()
  if (!raw || typeof raw !== 'object') return empty
  const next = emptyAppearanceDetail()
  for (const categoryId of APPEARANCE_CATEGORY_IDS) {
    const source = raw[categoryId] && typeof raw[categoryId] === 'object' ? raw[categoryId] : {}
    for (const key of Object.keys(empty[categoryId])) {
      const value = source[key]
      next[categoryId][key] = typeof value === 'string' && value ? value : null
    }
  }
  return next
}

export function sanitizeAppearanceDetail(ship) {
  const current = normalizeAppearanceDetail(ship?.appearanceDetail)
  const next = emptyAppearanceDetail()
  let changed = false
  for (const category of getAppearanceCategories()) {
    for (const slot of category.slots ?? []) {
      const selectedId = current[category.id]?.[slot.id] ?? null
      if (!selectedId) {
        next[category.id][slot.id] = null
        continue
      }
      const option = slot.options?.find((entry) => entry.id === selectedId) ?? null
      if (!option || !isAppearanceOptionAvailable(ship, option)) {
        next[category.id][slot.id] = null
        changed = true
      } else {
        next[category.id][slot.id] = selectedId
      }
    }
  }
  const same = APPEARANCE_CATEGORY_IDS.every((categoryId) => (
    Object.keys(emptyAppearanceDetail()[categoryId]).every(
      (slotId) => (ship?.appearanceDetail?.[categoryId]?.[slotId] ?? null) === next[categoryId][slotId],
    )
  ))
  return { appearanceDetail: next, changed: changed || !same }
}

export function appearanceDetailEqual(left, right) {
  const a = normalizeAppearanceDetail(left)
  const b = normalizeAppearanceDetail(right)
  return APPEARANCE_CATEGORY_IDS.every((categoryId) => (
    Object.keys(a[categoryId]).every((slotId) => a[categoryId][slotId] === b[categoryId][slotId])
  ))
}

export function getFinishingPackageOptions(field) {
  return FINISHING_PACKAGE_LISTS[field] ?? []
}

export function getFinishingPackageOption(field, optionId) {
  if (!optionId) return null
  return getFinishingPackageOptions(field).find((entry) => entry.id === optionId) ?? null
}

export function finishingPackageAvailability(ship, field, optionId) {
  const option = typeof optionId === 'object' && optionId
    ? optionId
    : getFinishingPackageOption(field, optionId)
  return appearanceOptionAvailability(ship, option)
}

export function isFinishingPackageAvailable(ship, field, optionId) {
  return finishingPackageAvailability(ship, field, optionId).available
}

/** Drop earned/unavailable Appearance Package selections when Screen 04 changes. */
export function sanitizeFinishingPackages(ship) {
  const cleared = {}
  let changed = false
  for (const field of FINISHING_PACKAGE_FIELDS) {
    const id = ship?.[field] ?? null
    if (!id) {
      cleared[field] = null
      continue
    }
    const option = getFinishingPackageOption(field, id)
    if (!option || !isAppearanceOptionAvailable(ship, option)) {
      cleared[field] = null
      changed = true
    } else {
      cleared[field] = id
    }
  }
  return { finishing: cleared, changed }
}

/** Selected contextual options for export / future encounter hooks (not Trait grants). */
export function getAppearanceContextEntries(ship) {
  const detail = normalizeAppearanceDetail(ship?.appearanceDetail)
  const entries = []
  for (const category of getAppearanceCategories()) {
    for (const slot of category.slots ?? []) {
      const id = detail[category.id]?.[slot.id]
      const option = slot.options?.find((entry) => entry.id === id)
      if (!option || option.gameplay === 'cosmetic') continue
      if (!isAppearanceOptionAvailable(ship, option)) continue
      entries.push({
        categoryId: category.id,
        slotId: slot.id,
        optionId: option.id,
        name: option.name,
        gameplay: option.gameplay,
        contextTags: option.contextTags ?? [],
        linksTraitSource: option.linksTraitSource ?? null,
      })
    }
  }
  for (const field of FINISHING_PACKAGE_FIELDS) {
    const id = ship?.[field] ?? null
    const option = getFinishingPackageOption(field, id)
    if (!option || option.gameplay === 'cosmetic') continue
    if (!isAppearanceOptionAvailable(ship, option)) continue
    entries.push({
      categoryId: 'finishingPackages',
      slotId: field,
      optionId: option.id,
      name: option.name,
      gameplay: option.gameplay,
      contextTags: option.contextTags ?? [],
      linksTraitSource: option.linksTraitSource ?? null,
    })
  }
  return entries
}

export function appearanceLayerPaths(ship) {
  const detail = normalizeAppearanceDetail(ship?.appearanceDetail)
  const layers = []
  for (const category of getAppearanceCategories()) {
    for (const slot of category.slots ?? []) {
      const id = detail[category.id]?.[slot.id]
      const option = slot.options?.find((entry) => entry.id === id)
      if (!option?.visual?.file) continue
      if (!isAppearanceOptionAvailable(ship, option)) continue
      layers.push({
        layer: option.visual.layer,
        optionId: option.id,
        file: option.visual.file,
      })
    }
  }
  return layers
}
