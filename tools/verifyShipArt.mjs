/**
 * Confirms every shipArtPaths target exists under public/art/ships.
 * Exit 1 if any required PNG is missing.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appearanceArt,
  bridgeArt,
  classArt,
  classViewArts,
  eraArt,
  finishingArt,
  profileArt,
  refitSystemArt,
  serviceEventArt,
  serviceHistoryArt,
  serviceHonorArt,
  serviceReputationArt,
  shipEmptyArt,
  shipSummaryArt,
  shipUnavailableArt,
  talentArt,
  technicalArt,
} from '../src/ships/shipArtPaths.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const data = (name) => JSON.parse(readFileSync(join(root, 'src', 'data', 'ships', name), 'utf8'))

const paths = new Set([
  shipSummaryArt(),
  shipEmptyArt(),
  shipUnavailableArt(),
  eraArt(null, 'details'),
  eraArt(null, 'characteristics'),
  serviceHistoryArt(null),
])

for (const era of data('timeframes.json').eras ?? []) {
  paths.add(eraArt(era.id))
  paths.add(eraArt(era.id, 'details'))
  paths.add(eraArt(era.id, 'characteristics'))
}

for (const frame of data('spaceframes.json').spaceframes ?? []) {
  paths.add(classArt(frame.id))
  for (const src of classViewArts(frame.id)) paths.add(src)
  paths.add(technicalArt(frame.id))
}

for (const profile of data('missionProfiles.json').profiles ?? []) paths.add(profileArt(profile.id))
for (const record of data('serviceRecords.json').records ?? []) paths.add(serviceHistoryArt(record.id))

const narrative = data('serviceNarrative.json')
for (const entry of narrative.events ?? []) paths.add(serviceEventArt(entry.id))
for (const entry of narrative.reputations ?? []) paths.add(serviceReputationArt(entry.id))
for (const entry of narrative.honors ?? []) paths.add(serviceHonorArt(entry.id))

for (const system of ['comms', 'computers', 'engines', 'sensors', 'structure', 'weapons']) {
  paths.add(refitSystemArt(system))
}

for (const talent of data('starshipTalents.json').talents ?? []) paths.add(talentArt(talent.id))

const finishing = data('finishingTouches.json')
for (const entry of finishing.bridges ?? []) paths.add(bridgeArt(entry.id))
for (const entry of finishing.hullMarkings ?? []) paths.add(finishingArt('hullMarkingsId', entry.id))
for (const entry of finishing.stripingStyles ?? []) paths.add(finishingArt('stripingStyleId', entry.id))
for (const entry of finishing.nacelleCaps ?? []) paths.add(finishingArt('nacelleCapsId', entry.id))
for (const entry of finishing.emblemStyles ?? []) paths.add(finishingArt('emblemStyleId', entry.id))
for (const entry of finishing.secondaryMarkings ?? []) paths.add(finishingArt('secondaryMarkingsId', entry.id))

const appearanceCatalog = data('appearanceCatalog.json')
for (const category of appearanceCatalog.categories ?? []) {
  for (const slot of category.slots ?? []) {
    for (const option of slot.options ?? []) {
      if (option.visual?.file) paths.add(appearanceArt(option.visual.file))
    }
  }
}

const missing = []
for (const url of [...paths].sort()) {
  const rel = url.replace(/^\//, '')
  if (!existsSync(join(root, 'public', rel))) missing.push(url)
}

if (missing.length) {
  console.error(`Missing ${missing.length} ship PNG(s):`)
  for (const path of missing) console.error(`  ${path}`)
  process.exit(1)
}

console.log(`Ship art OK: ${paths.size} PNG paths present.`)
