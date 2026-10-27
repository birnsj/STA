// Stable PNG paths for Starship Creator art. Temp placards and final art share these paths.

const ROOT = '/art/ships'

function join(...parts) {
  return `${ROOT}/${parts.filter((part) => part != null && part !== '').join('/')}`
}

export function shipSummaryArt() {
  return join('summary.png')
}

export function shipEmptyArt() {
  return join('ui', 'empty-selection.png')
}

export function shipUnavailableArt() {
  return join('ui', 'unavailable.png')
}

export function eraArt(eraId, panel = null) {
  if (!eraId) {
    if (panel === 'details') return join('eras', 'details.png')
    if (panel === 'characteristics') return join('eras', 'characteristics.png')
    return shipSummaryArt()
  }
  if (panel === 'details') return join('eras', `${eraId}-details.png`)
  if (panel === 'characteristics') return join('eras', `${eraId}-characteristics.png`)
  return join('eras', `${eraId}.png`)
}

export function classArt(spaceframeId, view = null) {
  if (!spaceframeId) return shipEmptyArt()
  if (view != null) return join('classes', `${spaceframeId}-view-${view}.png`)
  return join('classes', `${spaceframeId}.png`)
}

export function classViewArts(spaceframeId) {
  if (!spaceframeId) return []
  return [1, 2, 3, 4].map((view) => classArt(spaceframeId, view))
}

export function technicalArt(spaceframeId) {
  if (!spaceframeId) return shipSummaryArt()
  return join('technical', `${spaceframeId}.png`)
}

export function profileArt(profileId) {
  if (!profileId) return shipEmptyArt()
  return join('profiles', `${profileId}.png`)
}

export function serviceHistoryArt(recordId) {
  if (!recordId) return join('service', 'none.png')
  return join('service', `${recordId}.png`)
}

export function serviceEventArt(eventId) {
  if (!eventId) return shipEmptyArt()
  return join('service', 'events', `${eventId}.png`)
}

export function serviceReputationArt(reputationId) {
  if (!reputationId) return shipEmptyArt()
  return join('service', 'reputation', `${reputationId}.png`)
}

export function serviceHonorArt(honorId) {
  if (!honorId) return shipEmptyArt()
  return join('service', 'honors', `${honorId}.png`)
}

export function traitArt(entry, spaceframeId = null) {
  if (!entry) return shipEmptyArt()
  if (entry.source === 'class' || entry.source === 'spaceframe') {
    return classArt(spaceframeId || entry.sourceId)
  }
  if (entry.source === 'serviceRecord') return serviceHistoryArt(entry.sourceId)
  if (entry.source === 'event') return serviceEventArt(entry.sourceId)
  if (entry.source === 'reputation') return serviceReputationArt(entry.sourceId)
  if (entry.source === 'honor') return serviceHonorArt(entry.sourceId)
  return shipEmptyArt()
}

export function refitSystemArt(systemId) {
  if (!systemId) return shipEmptyArt()
  return join('refits', `${systemId}.png`)
}

export function talentArt(talentId) {
  if (!talentId) return shipEmptyArt()
  return join('talents', `${talentId}.png`)
}

export function bridgeArt(bridgeId) {
  if (!bridgeId) return shipEmptyArt()
  return join('bridges', `${bridgeId}.png`)
}

/** Maps finishing field → folder under finishing/ (bridges live under bridges/). */
const FINISHING_FOLDERS = {
  hullMarkingsId: 'hull',
  stripingStyleId: 'striping',
  nacelleCapsId: 'nacelle',
  emblemStyleId: 'emblem',
  secondaryMarkingsId: 'secondary',
}

export function finishingArt(field, optionId) {
  if (!optionId) return shipEmptyArt()
  if (field === 'bridgeLayoutId') return bridgeArt(optionId)
  const folder = FINISHING_FOLDERS[field]
  if (!folder) return shipEmptyArt()
  return join('finishing', folder, `${optionId}.png`)
}

export function finishingFolderForField(field) {
  if (field === 'bridgeLayoutId') return 'bridges'
  return FINISHING_FOLDERS[field] ?? null
}

/** Layer/thumbnail under /art/ships/appearance/{file} (file may include subfolders). */
export function appearanceArt(file) {
  if (!file) return shipEmptyArt()
  const parts = String(file).replace(/^\/+/, '').split('/')
  return join('appearance', ...parts)
}

export function appearanceOptionArt(option) {
  return appearanceArt(option?.visual?.file)
}
