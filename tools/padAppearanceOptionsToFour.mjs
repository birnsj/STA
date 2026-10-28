/**
 * Pads Screen 06 appearance slots (and secondary markings) to four selectable options
 * so every setting chip presents a full 2×2 choice grid. Honor Insignia stays at five.
 *
 * Usage: node tools/padAppearanceOptionsToFour.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dataRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'data', 'ships')

function readJson(name) {
  return JSON.parse(readFileSync(join(dataRoot, name), 'utf8'))
}

function writeJson(name, value) {
  writeFileSync(join(dataRoot, name), `${JSON.stringify(value, null, 2)}\n`)
}

function cosmetic(id, name, caption, layer, file) {
  return {
    id,
    name,
    caption,
    description: `${caption} Prototype cosmetic only. Does not change Systems or Departments.`,
    gameplay: 'cosmetic',
    visual: { layer, file },
  }
}

const PADS = {
  registryStyleId: [
    cosmetic('registry-offset', 'Offset Registry', 'Registry lettering shifted toward the bow.', 'registry', 'registry/registry-offset.png'),
  ],
  hullIdMarkingsId: [
    cosmetic('id-minimal', 'Minimal Hull ID', 'Reduced hull identification graphics.', 'hull-id', 'hull-id/id-minimal.png'),
    cosmetic('id-high-contrast', 'High-Contrast Hull ID', 'High-contrast hull identification graphics.', 'hull-id', 'hull-id/id-high-contrast.png'),
    cosmetic('id-survey', 'Survey Hull ID', 'Survey-oriented hull identification graphics.', 'hull-id', 'hull-id/id-survey.png'),
  ],
  pennantId: [
    cosmetic('pennant-none', 'No Pennant', 'Omits pennant markings from the hull.', 'pennant', 'pennant/pennant-none.png'),
    cosmetic('pennant-minimal', 'Minimal Pennant', 'Small, low-contrast pennant marking.', 'pennant', 'pennant/pennant-minimal.png'),
    cosmetic('pennant-escort', 'Escort Pennant', 'Escort-style pennant presentation.', 'pennant', 'pennant/pennant-escort.png'),
  ],
  missionIdMarkingsId: [
    cosmetic('mission-none', 'No Mission Markings', 'No exterior mission identification.', 'mission', 'mission/mission-none.png'),
    cosmetic('mission-survey', 'Survey Mission Markings', 'Exterior markings suggesting survey duty.', 'mission', 'mission/mission-survey.png'),
  ],
  stripingPatternId: [
    cosmetic('stripe-none', 'No Striping Pattern', 'No additional striping pattern layer.', 'striping', 'striping/stripe-none.png'),
    cosmetic('stripe-thin-gold', 'Thin Gold Accent', 'Thin gold accent striping along hull lines.', 'striping', 'striping/stripe-thin-gold.png'),
  ],
  nacelleMarkingsId: [
    cosmetic('nacelle-none', 'No Nacelle Marks', 'Omits extra nacelle identification marks.', 'nacelle-marks', 'nacelle-marks/nacelle-none.png'),
    cosmetic('nacelle-fleet', 'Fleet Nacelle Marks', 'Fleet-standard nacelle tip markings.', 'nacelle-marks', 'nacelle-marks/nacelle-fleet.png'),
  ],
  engineeringHullId: [
    cosmetic('eng-hull-none', 'No Engineering Marks', 'Omits extra engineering-hull markings.', 'engineering', 'engineering/eng-hull-none.png'),
    cosmetic('eng-hull-grid', 'Grid Pattern', 'Grid-style engineering-hull markings.', 'engineering', 'engineering/eng-hull-grid.png'),
  ],
  hullColorId: [
    cosmetic('color-bright-fleet', 'Bright Fleet', 'Brighter fleet hull coloration.', 'color', 'color/color-bright-fleet.png'),
    cosmetic('color-deep-space', 'Deep Space', 'Darker deep-space hull coloration.', 'color', 'color/color-deep-space.png'),
  ],
  finishId: [
    cosmetic('finish-satin', 'Satin Finish', 'Soft satin hull sheen.', 'finish', 'finish/finish-satin.png'),
    cosmetic('finish-polished', 'Polished Finish', 'High-sheen polished hull finish.', 'finish', 'finish/finish-polished.png'),
  ],
  panelContrastId: [
    cosmetic('panel-medium', 'Medium Panel Contrast', 'Balanced panel line contrast.', 'panels', 'panels/panel-medium.png'),
    cosmetic('panel-uniform', 'Uniform Panels', 'Nearly uniform panel presentation.', 'panels', 'panels/panel-uniform.png'),
  ],
  weatheringId: [
    cosmetic('weather-patrol', 'Patrol Wear', 'Light patrol wear without battle scarring.', 'weathering', 'weathering/weather-patrol.png'),
  ],
}

const catalog = readJson('appearanceCatalog.json')
let added = 0
for (const category of catalog.categories ?? []) {
  for (const slot of category.slots ?? []) {
    if (slot.id === 'honorInsigniaId') continue
    const pads = PADS[slot.id] ?? []
    const have = new Set((slot.options ?? []).map((entry) => entry.id))
    for (const option of pads) {
      if (have.has(option.id)) continue
      if ((slot.options?.length ?? 0) >= 4) break
      slot.options.push(option)
      have.add(option.id)
      added += 1
    }
  }
}
writeJson('appearanceCatalog.json', catalog)

const finishing = readJson('finishingTouches.json')
const secondaryPads = [
  {
    id: 'squadron',
    name: 'Squadron Badge',
    caption: 'Small squadron badge on secondary hull surfaces.',
    description: 'Adds a small squadron-style secondary badge. Prototype cosmetic only. No Systems or Departments change.',
    gameplay: 'cosmetic',
  },
  {
    id: 'mission-patch',
    name: 'Mission Patch',
    caption: 'Decorative mission patch marking.',
    description: 'Adds a decorative mission-patch secondary marking. Prototype cosmetic only. No Systems or Departments change.',
    gameplay: 'cosmetic',
  },
  {
    id: 'dedication',
    name: 'Dedication Plaque Mark',
    caption: 'Subtle dedication-plaque style secondary mark.',
    description: 'Adds a subtle dedication-style secondary mark. Prototype cosmetic only. No Systems or Departments change.',
    gameplay: 'cosmetic',
  },
]
const secondary = finishing.secondaryMarkings ?? []
const secondaryHave = new Set(secondary.map((entry) => entry.id))
let secondaryAdded = 0
for (const option of secondaryPads) {
  if (secondaryHave.has(option.id)) continue
  if (secondary.length >= 4) break
  secondary.push(option)
  secondaryHave.add(option.id)
  secondaryAdded += 1
}
finishing.secondaryMarkings = secondary
writeJson('finishingTouches.json', finishing)

console.log(`Padded appearance options: +${added}; secondary markings: +${secondaryAdded}`)
