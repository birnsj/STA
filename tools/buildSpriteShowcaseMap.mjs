// One-shot: ensure showcase sprite characters exist, write maps/Sprite Showcase.json.
// Run: node --import ./tools/jsonLoader.mjs tools/buildSpriteShowcaseMap.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHARACTERS_PATH = path.join(ROOT, 'src/data/adaptation/characters.json')
const MAP_PATH = path.join(ROOT, 'maps/Sprite Showcase.json')

const SPECIES = {
  human: { name: 'Human', bonuses: ['daring', 'fitness', 'presence'] },
  vulcan: { name: 'Vulcan', bonuses: ['control', 'fitness', 'reason'] },
  andorian: { name: 'Andorian', bonuses: ['control', 'daring', 'presence'] },
  tellarite: { name: 'Tellarite', bonuses: ['control', 'fitness', 'insight'] },
  trill: { name: 'Trill', bonuses: ['control', 'presence', 'reason'] },
  caitian: { name: 'Caitian', bonuses: ['daring', 'fitness', 'insight'] },
  klingon: { name: 'Klingon', bonuses: ['daring', 'fitness', 'presence'] },
}

const ATTR = (bonuses) => {
  const base = { control: 9, daring: 9, fitness: 9, insight: 9, presence: 9, reason: 9 }
  for (const id of bonuses) base[id] += 1
  return base
}

// Shirt colour follows department → division (uniforms.json): command/conn gold, engineering/security red, science/medicine blue.
const DEPARTMENTS = {
  command: { id: 'command', name: 'Command' },
  conn: { id: 'conn', name: 'Conn' },
  engineering: { id: 'engineering', name: 'Engineering' },
  security: { id: 'security', name: 'Security' },
  science: { id: 'science', name: 'Science' },
  medicine: { id: 'medicine', name: 'Medicine' },
}

function starfleetShowcase({ id, speciesId, genderId, portraitId, displayName, departmentId }) {
  const species = SPECIES[speciesId]
  const female = genderId === 'female'
  const department = DEPARTMENTS[departmentId] ?? DEPARTMENTS.security
  const disciplines = { command: 1, conn: 1, engineering: 1, security: 1, science: 1, medicine: 1 }
  disciplines[department.id] = 2
  return {
    id,
    sourceClassification: {
      book: 'Star Trek Adventures 2E Core Rulebook',
      page: 352,
      statBlock: 'Starfleet Officer',
      npcCategory: 'minor',
      personalThreat: 0,
      protection: 0,
      note: 'Sprite Showcase lab NPC (map sprite variety + department shirt colours; presentation only).',
    },
    character: {
      faction: { id: 'federation', name: 'Federation' },
      species: {
        id: speciesId,
        name: species.name,
        attributeBonuses: species.bonuses.map((attr) => ({
          id: attr,
          name: attr[0].toUpperCase() + attr.slice(1),
          value: 1,
        })),
        traits: [{ id: speciesId, name: species.name }],
      },
      career: {
        department: { ...department },
        rank: { id: 'ensign', name: 'Ensign' },
        assignment: null,
      },
      identity: {
        name: displayName,
        pronouns: female ? 'She / her' : 'He / him',
        gender: { id: genderId, name: female ? 'Female' : 'Male' },
        portrait: { id: portraitId, name: displayName },
      },
      equipment: [{ itemId: 'standardUniform' }, { itemId: 'communicator' }, { itemId: 'phaserType2' }],
    },
    final: {
      attributes: ATTR(species.bonuses),
      disciplines,
      values: [],
      focuses: [],
      traits: [
        { id: speciesId, name: species.name },
        { id: 'starfleetOfficer', name: 'Starfleet Officer' },
      ],
      talents: [],
      rank: { id: 'ensign', name: 'Ensign' },
      department: { ...department },
      assignment: null,
      role: null,
    },
  }
}

// Full Starfleet lineup: cycle departments so gold / red / blue shirts sit next to each other (not a red wall).
const SHOWCASE_CHARACTERS = [
  starfleetShowcase({
    id: 'spriteHumanMale',
    speciesId: 'human',
    genderId: 'male',
    portraitId: 'human-male-1',
    displayName: 'Ensign Mallory',
    departmentId: 'command',
  }),
  starfleetShowcase({
    id: 'spriteHumanFemale',
    speciesId: 'human',
    genderId: 'female',
    portraitId: 'human-female-3',
    displayName: 'Ensign Okafor',
    departmentId: 'science',
  }),
  starfleetShowcase({
    id: 'spriteVulcanMale',
    speciesId: 'vulcan',
    genderId: 'male',
    portraitId: 'vulcan-male-1',
    displayName: 'Ensign Solok',
    departmentId: 'engineering',
  }),
  starfleetShowcase({
    id: 'spriteVulcanFemale',
    speciesId: 'vulcan',
    genderId: 'female',
    portraitId: 'vulcan-female-1',
    displayName: "Ensign T'Prena",
    departmentId: 'conn',
  }),
  starfleetShowcase({
    id: 'spriteAndorianMale',
    speciesId: 'andorian',
    genderId: 'male',
    portraitId: 'andorian-male-1',
    displayName: 'Ensign Tharen',
    departmentId: 'medicine',
  }),
  starfleetShowcase({
    id: 'spriteAndorianFemale',
    speciesId: 'andorian',
    genderId: 'female',
    portraitId: 'andorian-female-2',
    displayName: 'Ensign Reyes',
    departmentId: 'security',
  }),
  starfleetShowcase({
    id: 'spriteTellariteMale',
    speciesId: 'tellarite',
    genderId: 'male',
    portraitId: 'tellarite-male-3',
    displayName: 'Ensign Chen',
    departmentId: 'command',
  }),
  starfleetShowcase({
    id: 'spriteTellariteFemale',
    speciesId: 'tellarite',
    genderId: 'female',
    portraitId: 'tellarite-female-1',
    displayName: 'Ensign Grix',
    departmentId: 'science',
  }),
  starfleetShowcase({
    id: 'spriteTrillMale',
    speciesId: 'trill',
    genderId: 'male',
    portraitId: 'trill-male-1',
    displayName: 'Ensign Jorel',
    departmentId: 'engineering',
  }),
  starfleetShowcase({
    id: 'spriteTrillFemale',
    speciesId: 'trill',
    genderId: 'female',
    portraitId: 'trill-female-1',
    displayName: 'Ensign Lenara',
    departmentId: 'conn',
  }),
  starfleetShowcase({
    id: 'spriteCaitianMale',
    speciesId: 'caitian',
    genderId: 'male',
    portraitId: 'caitian-male-1',
    displayName: "Ensign Mrr'shan",
    departmentId: 'medicine',
  }),
  starfleetShowcase({
    id: 'spriteCaitianFemale',
    speciesId: 'caitian',
    genderId: 'female',
    portraitId: 'caitian-female-1',
    displayName: "Ensign Sh'ra",
    departmentId: 'security',
  }),
  // Combat-pocket Starfleet hostiles (distinct ids so lineup colours stay fixed).
  starfleetShowcase({
    id: 'spriteFightAndorian',
    speciesId: 'andorian',
    genderId: 'male',
    portraitId: 'andorian-male-2',
    displayName: 'Hostile Andorian',
    departmentId: 'science',
  }),
  starfleetShowcase({
    id: 'spriteFightHuman',
    speciesId: 'human',
    genderId: 'male',
    portraitId: 'human-male-2',
    displayName: 'Hostile Human',
    departmentId: 'command',
  }),
]

const W = 26
const H = 18

function buildRows() {
  const rows = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')).join(''),
  )
  const paint = (x, y, symbol) => {
    const row = rows[y].split('')
    row[x] = symbol
    rows[y] = row.join('')
  }
  // Cover bay (west): crates for cover anims.
  for (const [x, y] of [
    [3, 11],
    [4, 11],
    [5, 11],
    [3, 13],
    [5, 13],
  ])
    paint(x, y, 'c')
  // Hazard strip (east): EPS grating under a fire region + control to clear the authoring warning.
  for (let x = 18; x <= 22; x += 1) {
    paint(x, 11, 'h')
    paint(x, 12, 'h')
  }
  paint(17, 11, 'E')
  // Doorways into the combat pocket.
  paint(13, 0, 'D')
  return rows
}

// One NPC per sprite set, two rows facing the party.
const LINEUP = [
  // row y=3 — gold / blue / red / gold / blue / red / gold
  { id: 'showHumanM', characterId: 'spriteHumanMale', name: 'Human Male', x: 3, y: 3 },
  { id: 'showHumanF', characterId: 'spriteHumanFemale', name: 'Human Female', x: 5, y: 3 },
  { id: 'showVulcanM', characterId: 'spriteVulcanMale', name: 'Vulcan Male', x: 7, y: 3 },
  { id: 'showVulcanF', characterId: 'spriteVulcanFemale', name: 'Vulcan Female', x: 9, y: 3 },
  { id: 'showAndorianM', characterId: 'spriteAndorianMale', name: 'Andorian Male', x: 11, y: 3 },
  { id: 'showAndorianF', characterId: 'spriteAndorianFemale', name: 'Andorian Female', x: 13, y: 3 },
  { id: 'showTellariteM', characterId: 'spriteTellariteMale', name: 'Tellarite Male', x: 15, y: 3 },
  // row y=6
  { id: 'showTellariteF', characterId: 'spriteTellariteFemale', name: 'Tellarite Female', x: 3, y: 6 },
  { id: 'showTrillM', characterId: 'spriteTrillMale', name: 'Trill Male', x: 5, y: 6 },
  { id: 'showTrillF', characterId: 'spriteTrillFemale', name: 'Trill Female', x: 7, y: 6 },
  { id: 'showCaitianM', characterId: 'spriteCaitianMale', name: 'Caitian Male', x: 9, y: 6 },
  { id: 'showCaitianF', characterId: 'spriteCaitianFemale', name: 'Caitian Female', x: 11, y: 6 },
  {
    id: 'showKlingonM',
    characterId: 'klingonGuardKorath',
    name: 'Klingon Male',
    x: 13,
    y: 6,
    gender: 'male',
    portraitId: 'klingon-male-1',
  },
  {
    id: 'showKlingonF',
    characterId: 'klingonSentryTorak',
    name: 'Klingon Female',
    x: 15,
    y: 6,
    gender: 'female',
    portraitId: 'klingon-female-1',
  },
]

const COMBAT = [
  {
    id: 'fightKlingonM',
    characterId: 'klingonWarrior1',
    name: 'Hostile Klingon M',
    x: 19,
    y: 14,
    facing: 315,
    disposition: 'hostile',
    gender: 'male',
    portraitId: 'klingon-male-3',
  },
  {
    id: 'fightKlingonF',
    characterId: 'klingonWarrior2',
    name: 'Hostile Klingon F',
    x: 21,
    y: 15,
    facing: 270,
    disposition: 'aggressive',
    gender: 'female',
    portraitId: 'klingon-female-3',
  },
  {
    id: 'fightAndorian',
    characterId: 'spriteFightAndorian',
    name: 'Hostile Andorian',
    x: 17,
    y: 15,
    facing: 0,
    disposition: 'hostile',
  },
  {
    id: 'fightHuman',
    characterId: 'spriteFightHuman',
    name: 'Hostile Human',
    x: 20,
    y: 13,
    facing: 225,
    disposition: 'aggressive',
  },
]

function npcEntry(entry) {
  const facing = entry.facing ?? 90
  const npc = {
    id: entry.id,
    characterId: entry.characterId,
    position: [entry.x, entry.y],
    facing,
    name: entry.name,
    disposition: entry.disposition ?? 'neutral',
  }
  if (entry.gender) npc.gender = entry.gender
  if (entry.portraitId) npc.portraitId = entry.portraitId
  return npc
}

function ensureCharacters() {
  const data = JSON.parse(fs.readFileSync(CHARACTERS_PATH, 'utf8'))
  const byId = new Map(data.characters.map((c) => [c.id, c]))
  let added = 0
  let updated = 0
  for (const character of SHOWCASE_CHARACTERS) {
    if (byId.has(character.id)) {
      const index = data.characters.findIndex((c) => c.id === character.id)
      data.characters[index] = character
      updated += 1
    } else {
      data.characters.push(character)
      added += 1
    }
  }
  const note =
    'Sprite Showcase map (2026-10-29): sprite* lab NPCs for maps/Sprite Showcase.json — one Starfleet shell per species/gender plus combat hostiles; departments cycle command/conn/engineering/security/science/medicine so shirt colours (gold/red/blue) vary on the lineup.'
  const noteIndex = data.notes.findIndex((n) => n.includes('Sprite Showcase map'))
  if (noteIndex >= 0) data.notes[noteIndex] = note
  else data.notes.push(note)
  fs.writeFileSync(CHARACTERS_PATH, `${JSON.stringify(data, null, 2)}\n`)
  return { added, updated }
}

function writeMap() {
  const map = {
    schemaVersion: 1,
    name: 'Sprite Showcase',
    episodeName: 'Sprite Showcase',
    card: null,
    mapType: 'starshipDeck',
    biome: 'temperate',
    weather: 'clear',
    ambient: 100,
    rows: buildRows(),
    areas: [
      { name: 'Species Lineup', position: [9, 4] },
      { name: 'Cover Bay', position: [4, 12] },
      { name: 'Hazard Strip', position: [20, 11] },
      { name: 'Combat Pocket', position: [19, 14] },
    ],
    markers: {
      playerStarts: [
        [10, 12, 315],
        [11, 13, 315],
        [12, 12, 315],
        [11, 11, 315],
        [9, 13, 0],
        [13, 13, 270],
      ],
      enemySpawns: [
        [19, 14, 315],
        [21, 15, 270],
        [17, 15, 0],
        [20, 13, 225],
      ],
    },
    npcs: [...LINEUP.map(npcEntry), ...COMBAT.map(npcEntry)],
    objectives: [
      {
        id: 'reviewSprites',
        title: 'Review every sprite set',
        description:
          'Walk the lineup (idle/fidgets/facing). Sneak and run past them. Use cover crates, the fire strip for panic, explosives for blast/get-up, and the combat pocket for attack/melee/reactions.',
        startsActive: true,
      },
    ],
    destructibles: [
      { id: 'gas1', type: 'gasCylinder', position: [16, 10] },
      { id: 'gas2', type: 'gasCylinder', position: [17, 10] },
      { id: 'plasma1', type: 'plasmaJunction', position: [16, 12] },
      { id: 'eps1', type: 'epsConduit', position: [15, 14] },
    ],
    hazards: [
      {
        id: 'labFire',
        type: 'fire',
        tiles: [
          [18, 11, 2],
          [19, 11, 2],
          [20, 11, 1],
          [21, 11, 2],
          [22, 11, 1],
          [18, 12, 1],
          [19, 12, 2],
          [20, 12, 2],
          [21, 12, 1],
          [22, 12, 1],
        ],
        spreadChance: 0,
      },
    ],
    briefing:
      'Animation lab: every species/gender sprite set stands in the north lineup. No mission stakes — walk, run, sneak, take cover, step into the fire strip, shoot the cylinders, and fight the combat pocket.',
    stardate: 9999.2,
  }
  fs.writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`)
}

const { added, updated } = ensureCharacters()
writeMap()
console.log(`Sprite Showcase map written (${added} new, ${updated} updated character(s)).`)
