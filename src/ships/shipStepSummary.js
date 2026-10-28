import creationSteps from '../data/ships/creationSteps.json'
import { classArt, eraArt, profileArt, shipSummaryArt } from './shipArtPaths.js'
import {
  getMissionProfileById,
  getServiceRecordById,
  getSpaceframeById,
  getTimeframeById,
  isFinishingTouchesComplete,
  isMissionProfileComplete,
  isRefitsFinished,
  isServiceRecordFinished,
  missionSystemLabel,
  refitSummary,
  serviceRecordLabel,
  shipDisplayName,
  shipDisplayRegistry,
  shipTalentNames,
} from './shipModel.js'
import { isShipStepComplete } from './creationProgress.js'

const SUMMARY_STEPS = new Set([
  'timeframe',
  'spaceframe',
  'missionProfile',
  'serviceRecord',
  'refits',
  'finishingTouches',
])

const stepsById = Object.fromEntries(creationSteps.steps.map((step) => [step.id, step]))

export function hasShipStepSummary(stepId) {
  return SUMMARY_STEPS.has(stepId)
}

export function getShipStepSignature(stepId, ship) {
  switch (stepId) {
    case 'timeframe':
      return `${ship.timeframeId ?? ''}|${ship.campaignYear ?? ''}`
    case 'spaceframe':
      return ship.spaceframeId ?? ''
    case 'missionProfile':
      return `${ship.missionProfileId ?? ''}|${ship.missionProfileTalentId ?? ''}|${ship.missionProfileSystemId ?? ''}`
    case 'serviceRecord':
      return [
        ship.serviceRecordId ?? '',
        ship.serviceRecordDetail ?? '',
        (ship.serviceNotableEventIds ?? []).join(','),
        ship.serviceReputationId ?? '',
        (ship.serviceHonorIds ?? []).join(','),
      ].join('|')
    case 'refits':
      return `${(ship.refits ?? []).join(',')}|${(ship.extraTalentIds ?? []).join(',')}|${JSON.stringify(ship.talentChoices ?? {})}`
    case 'finishingTouches':
      return [
        ship.shipName ?? '',
        ship.registry ?? '',
        ship.classDesignation ?? '',
        ship.bridgeLayoutId ?? '',
        ship.hullMarkingsId ?? '',
        ship.stripingStyleId ?? '',
        ship.nacelleCapsId ?? '',
        ship.emblemStyleId ?? '',
        ship.secondaryMarkingsId ?? '',
      ].join('|')
    default:
      return ''
  }
}

function shell(stepId, fields) {
  const step = stepsById[stepId]
  return {
    stepId,
    number: step?.number ?? '',
    title: step?.title ?? stepId,
    kicker: 'Here is what your choices on this screen did to your starship, and why.',
    ...fields,
  }
}

export function buildShipStepSummary(stepId, ship) {
  if (!hasShipStepSummary(stepId) || !isShipStepComplete(stepId, ship)) return null
  const era = getTimeframeById(ship.timeframeId)
  const frame = getSpaceframeById(ship.spaceframeId)
  const profile = getMissionProfileById(ship.missionProfileId)
  const record = getServiceRecordById(ship.serviceRecordId)

  switch (stepId) {
    case 'timeframe':
      return shell(stepId, {
        bookStep: 'Core p.185',
        grants: 'Sets the campaign era and year that gate available spaceframes.',
        grantsSource: 'Star Trek Adventures 2E Core Rulebook',
        imageSrc: era ? eraArt(era.id) : shipSummaryArt(),
        choices: [
          { label: 'Era', value: era?.name },
          { label: 'Years', value: era?.years },
          { label: 'Campaign year', value: Number.isFinite(ship.campaignYear) ? String(ship.campaignYear) : null },
        ],
        meaning: era?.summary ? [{ title: era.name, text: era.summary }] : [],
        why: ['Later screens only offer spaceframes that exist in this year.'],
      })
    case 'spaceframe':
      return shell(stepId, {
        bookStep: 'Core pp.185–215',
        grants: 'Locks Scale, Systems, Departments, weapons, and starting talents for the class.',
        grantsSource: 'Star Trek Adventures 2E Core Rulebook',
        imageSrc: frame ? classArt(frame.id) : shipSummaryArt(),
        choices: [
          { label: 'Class', value: frame?.name },
          { label: 'Launch year', value: frame ? String(frame.launchYear) : null },
          { label: 'Scale', value: frame ? String(frame.scale) : null },
        ],
        meaning: frame?.overview || frame?.capabilities
          ? [{ title: frame.name, text: frame.overview || frame.capabilities }]
          : [],
        why: ['Refit budget and talent capacity both follow Scale from this class.'],
      })
    case 'missionProfile': {
      const systemLabel = missionSystemLabel(profile?.system === 'choice' ? ship.missionProfileSystemId : profile?.system)
      const talentName = profile?.talents?.find((talent) => talent.id === ship.missionProfileTalentId)?.name ?? null
      return shell(stepId, {
        bookStep: 'Core p.216',
        grants: 'Adds a mission-profile talent and raises one System by +1.',
        grantsSource: 'Star Trek Adventures 2E Core Rulebook',
        imageSrc: profile ? profileArt(profile.id) : shipSummaryArt(),
        choices: [
          { label: 'Mission profile', value: profile?.name },
          { label: 'System +1', value: systemLabel },
          { label: 'Talent', value: talentName },
        ],
        meaning: profile?.overview ? [{ title: profile.name, text: profile.overview }] : [],
        why: ['The profile talent counts toward the ship Scale talent total.'],
      })
    }
    case 'serviceRecord': {
      const events = ship.serviceNotableEventIds?.length ?? 0
      const honors = ship.serviceHonorIds?.length ?? 0
      return shell(stepId, {
        bookStep: 'Core p.216',
        grants: record
          ? 'Applies the chosen service-record trait and special rule (when earned).'
          : 'Optional — no Core service record selected.',
        grantsSource: 'Star Trek Adventures 2E Core Rulebook',
        imageSrc: shipSummaryArt(),
        choices: [
          { label: 'Service record', value: serviceRecordLabel(ship) || 'None' },
          { label: 'Special rule', value: record?.ruleName ?? '—' },
          { label: 'Notable events', value: events ? String(events) : 'None' },
          { label: 'Honors', value: honors ? String(honors) : 'None' },
        ],
        meaning: record?.rule ? [{ title: record.ruleName, text: record.rule }] : [],
        why: ['Narrative events and honors are optional flavour; only a namesake Survivor trait can block Next.'],
      })
    }
    case 'refits': {
      const talents = shipTalentNames(ship)
      return shell(stepId, {
        bookStep: 'Core pp.217–225',
        grants: 'Spends earned system refits and fills starship talents up to Scale.',
        grantsSource: 'Star Trek Adventures 2E Core Rulebook',
        imageSrc: frame ? classArt(frame.id) : shipSummaryArt(),
        choices: [
          { label: 'System refits', value: refitSummary(ship) || 'None' },
          { label: 'Talents', value: talents.join(', ') || 'None' },
        ],
        meaning: [],
        why: ['Every earned refit must be assigned, and talent count must equal Scale, before Finishing Touches.'],
      })
    }
    case 'finishingTouches':
      return shell(stepId, {
        bookStep: 'Prototype',
        grants: 'Sets the ship identity for the record and export.',
        imageSrc: frame ? classArt(frame.id) : shipSummaryArt(),
        choices: [
          { label: 'Name', value: shipDisplayName(ship) },
          { label: 'Registry', value: shipDisplayRegistry(ship) || '—' },
          { label: 'Class designation', value: ship.classDesignation?.trim() || '—' },
        ],
        meaning: [],
        why: ['Name (and registry when required) must be filled before Review can complete the ship.'],
      })
    default:
      return null
  }
}

// Kept for call sites that only need a boolean gate matching the character creator pattern.
export function shipStepReady(stepId, ship) {
  switch (stepId) {
    case 'missionProfile':
      return isMissionProfileComplete(ship)
    case 'serviceRecord':
      return isServiceRecordFinished(ship)
    case 'refits':
      return isRefitsFinished(ship)
    case 'finishingTouches':
      return isFinishingTouchesComplete(ship)
    default:
      return isShipStepComplete(stepId, ship)
  }
}
