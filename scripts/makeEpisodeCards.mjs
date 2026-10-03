// Generates placeholder art for the catalogue episode cards (src/data/adaptation/maps/episodeCards.json) as PNGs in
// public/art/episodes/, using the same drawing code as the map editor's Generate Card (src/maps/cardArt.js), seeded
// by the card id. Run with: node scripts/makeEpisodeCards.mjs
// Existing files are not overwritten unless --force is passed, so replaced art is safe.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CARD_HEIGHT, CARD_WIDTH, drawEpisodeCard, seededRandom } from '../src/maps/cardArt.js'
import { encodePng } from './png.mjs'

const OUT = fileURLToPath(new URL('../public/art/episodes/', import.meta.url))
const read = (file) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8'))
const { cards } = read('../src/data/adaptation/maps/episodeCards.json')
const { biomes } = read('../src/data/adaptation/maps/biomes.json')
const FORCE = process.argv.includes('--force')

fs.mkdirSync(OUT, { recursive: true })
for (const card of cards) {
  const file = path.join(OUT, `${card.id}.png`)
  if (fs.existsSync(file) && !FORCE) {
    console.log(`kept   ${card.id}.png (already exists)`)
    continue
  }
  // A card for any location or biome is drawn as the first one it lists (or a temperate starship deck).
  const location = card.locations[0] ?? 'starshipDeck'
  const biome = biomes.find((entry) => entry.id === card.biomes[0]) ?? biomes[0]
  fs.writeFileSync(file, encodePng(CARD_WIDTH, CARD_HEIGHT, drawEpisodeCard(location, biome.card, seededRandom(card.id), card.label)))
  console.log(`wrote  ${card.id}.png`)
}
