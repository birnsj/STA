// v2 art for every tile outside Starship & Station (scripts/makeTilesV2.mjs) and Bridge (TOS) (scripts/makeTilesBridge.mjs),
// written to each tile's palette-group folder (engine.mjs outFile).
// Floors and walls are lit materials (engine.mjs); objects are ray-marched distance fields standing on their ground
// (v2/kit.mjs objectScene). File names come from the tile catalogue (image, altImage, panelImages, big.image).
//
// Run with: node scripts/makeTilesV2World.mjs [--force] [--only=id,id] [--sheet]
//   existing files are kept unless --force; --only renders just those tile ids; --sheet also writes .tmp-sheet.png
//   (a contact sheet of what was rendered) for checking.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'
import { blockScene, DESIGN_H, FORCE, floorScene, imageHeightFor, OUT_H, OUT_W, outFile, render, renderBig, renderTile, rgb } from './v2/engine.mjs'
import { objectScene, writeSheet } from './v2/kit.mjs'
import { onPanelFace, panelScene, renderPanel, windowFeature, withFitting } from './v2/panels.mjs'
import { flagstones, ground, liquid, overlay, planks, plating, slabs } from './v2/grounds.mjs'
import { breach, builtWall, crateStack, drips, rockWall, shelves, strands, timbers } from './v2/walls.mjs'
import * as O from './v2/objects.mjs'

const hex = rgb
const catalogue = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../src/data/adaptation/maps/tiles.json', import.meta.url)), 'utf8'))

// ---------- floors: id -> (alt) => material ----------
const pebbles = (colours, count = 6, size = 1, density = 0.5, height = 0.7) => ({ colours: colours.map(hex), count, size, density, height })
const G = {
  ground: (alt) => ground({ base: hex('#4e4c32'), seed: 11, rough: 0.8, alt, pebbles: pebbles(['#6a665a', '#58544a'], 6, 0.9, 0.35), blades: { colour: hex('#4a5a2a'), tip: hex('#6a7a3a'), cover: 0.35, height: 0.8 } }),
  path: (alt) => flagstones({ stone: hex('#7a766a'), mortar: hex('#3e3c36'), count: 3, seed: 12, alt }),
  caveFloor: (alt) => ground({ base: hex('#3a3430'), seed: 13, rough: 1.3, alt, pebbles: pebbles(['#4a423c', '#2e2925'], 7, 1.1, 0.4), cracks: { count: 3, colour: hex('#1e1a17'), width: 0.3, depth: 0.6 } }),
  grass: (alt) => ground({ base: hex('#35532c'), seed: 14, rough: 0.6, alt, blades: { colour: hex('#3a6430'), tip: hex('#6a9e4a'), cover: 0.9, height: 1.6 }, flecks: [{ colour: hex('#d8d070'), cells: 32, threshold: 0.9, amount: 0.7 }] }),
  mud: (alt) => ground({ base: hex('#3e3826'), dark: hex('#2a2519'), seed: 15, rough: 0.7, wet: 0.7, alt, flecks: [{ colour: hex('#2a3a30'), cells: 4, threshold: 0.7, amount: 0.5 }] }),
  water: () => liquid({ deep: hex('#123038'), shallow: hex('#2a5a60'), seed: 16 }),
  pavement: (alt) => slabs({ colour: hex('#5c5c60'), seam: hex('#38383c'), count: 2, seed: 17, alt }),
  sand: (alt) => ground({ base: hex('#a88a5a'), seed: 18, rough: 0.25, alt, ripples: { n: 3, m: 1, height: 0.4 }, flecks: [{ colour: hex('#c4a474'), cells: 32, threshold: 0.8, amount: 0.5 }] }),
  snow: (alt) => ground({ base: hex('#d0dae2'), dark: hex('#a8b6c2'), light: hex('#f0f5f8'), seed: 19, rough: 0.6, alt, glints: { colour: hex('#ffffff'), threshold: 0.95, strength: 0.25 } }),
  ice: () => ground({ base: hex('#8fb8cc'), light: hex('#c8e4f0'), seed: 20, rough: 0.12, wet: 1, cracks: { count: 3, colour: hex('#e4f6fc'), width: 0.22, depth: 0.4 } }),
  ash: (alt) => ground({ base: hex('#38353a'), seed: 21, rough: 0.5, alt, glow: { colour: hex('#ff6a20'), threshold: 0.94, cells: 32, strength: 0.9 } }),
  lava: () => liquid({ deep: hex('#c2410c'), shallow: hex('#ffc060'), seed: 22, emit: 1.2, crust: { count: 3, gap: 1.1, colour: hex('#2a1a14') } }),
  boardwalk: () => planks({ wood: hex('#7a5c3a'), count: 4, seed: 23, gap: 0.6 }),
  regolith: (alt) => ground({ base: hex('#5a5652'), seed: 24, rough: 0.8, alt, pebbles: pebbles(['#6e6a66', '#4a4744'], 5, 1.4, 0.45, -0.6) }),
  scorched: () => plating({ tint: hex('#2e3438'), seed: 25, soot: 0.85, cracks: 0.45, rust: 0.3 }),
  jungleFloor: (alt) => ground({ base: hex('#2a4424'), seed: 26, rough: 0.9, alt, blades: { colour: hex('#2e5226'), tip: hex('#4a7a30'), cover: 0.6, height: 1.2 }, flecks: [{ colour: hex('#6a4a24'), cells: 16, threshold: 0.75, amount: 0.8 }, { colour: hex('#8a5a2a'), cells: 32, threshold: 0.85, amount: 0.7 }] }),
  savanna: (alt) => ground({ base: hex('#8a7a3a'), seed: 27, rough: 0.6, alt, blades: { colour: hex('#9a8a40'), tip: hex('#d0b868'), cover: 0.85, height: 1.6 } }),
  tundra: (alt) => ground({ base: hex('#6a7258'), seed: 28, rough: 0.7, alt, blades: { colour: hex('#5a6a44'), tip: hex('#8a9a68'), cover: 0.5, height: 0.8 }, flecks: [{ colour: hex('#d8e0e4'), cells: 8, threshold: 0.78, amount: 0.85 }] }),
  beach: (alt) => ground({ base: hex('#d8c490'), seed: 29, rough: 0.2, alt, ripples: { n: 4, m: 1, height: 0.25 }, flecks: [{ colour: hex('#f4ecd8'), cells: 32, threshold: 0.92, amount: 0.9 }] }),
  shallows: () => liquid({ deep: hex('#3a8a98'), shallow: hex('#8ad0d0'), seed: 30, foam: { colour: hex('#e8f8f8'), threshold: 0.86 } }),
  scree: (alt) => ground({ base: hex('#6a6a66'), seed: 31, rough: 0.6, alt, pebbles: pebbles(['#8a8a84', '#5a5a56', '#76766f'], 10, 1.5, 0.9, 1) }),
  sulphurCrust: (alt) => ground({ base: hex('#c8b858'), seed: 32, rough: 0.6, alt, cracks: { count: 4, colour: hex('#8a7a30'), width: 0.3, depth: 0.6 }, flecks: [{ colour: hex('#f4ecb0'), cells: 16, threshold: 0.8, amount: 0.7 }] }),
  crystalGround: (alt) => ground({ base: hex('#8a7aa8'), seed: 33, rough: 0.4, alt, glints: { colour: hex('#f0e4ff'), threshold: 0.9, strength: 0.5 } }),
  fungalGround: (alt) => ground({ base: hex('#4a3a4c'), seed: 34, rough: 0.7, alt, blades: { colour: hex('#5a4460'), tip: hex('#8a6a90'), cover: 0.6, height: 1 }, glow: { colour: hex('#e0a0ff'), threshold: 0.95, cells: 32, strength: 0.7 } }),
  toxicMud: (alt) => ground({ base: hex('#5a6a2a'), seed: 35, rough: 0.6, wet: 0.8, alt, flecks: [{ colour: hex('#a8c040'), cells: 16, threshold: 0.8, amount: 0.6 }] }),
  acidPool: () => liquid({ deep: hex('#1e3a08'), shallow: hex('#6aa82a'), seed: 36, emit: 0.12 }),
  glowMoss: (alt) => ground({ base: hex('#163032'), seed: 37, rough: 0.6, alt, blades: { colour: hex('#1e4a48'), tip: hex('#2a8a80'), cover: 0.7, height: 1 }, glow: { colour: hex('#40e0d0'), threshold: 0.82, cells: 16, strength: 1.1 } }),
  rustDust: (alt) => ground({ base: hex('#9a4a2e'), seed: 38, rough: 0.4, alt, ripples: { n: 2, m: 1, height: 0.3 }, pebbles: pebbles(['#b05c3a', '#7a3a22'], 6, 0.9, 0.35) }),
  glassPlain: (alt) => ground({ base: hex('#1c1a24'), light: hex('#34324a'), seed: 39, rough: 0.2, wet: 1, alt, cracks: { count: 3, colour: hex('#6a68a0'), width: 0.18, depth: 0.5 } }),
  quarryFloor: (alt) => ground({ base: hex('#5a5048'), seed: 40, rough: 0.7, alt, pebbles: pebbles(['#6e645a', '#4a423a', '#7a7064'], 8, 1.1, 0.7) }),
  soil: (alt) => ground({ base: hex('#4a3624'), seed: 41, rough: 0.7, alt, pebbles: pebbles(['#5a4430', '#3a2a1c'], 7, 0.8, 0.4) }),
  landingPad: () => slabs({ colour: hex('#4e545a'), seam: hex('#2a2e32'), count: 1, seed: 42, stains: 0.3 }),
  labFloor: (alt) => slabs({ colour: hex('#c8d0d6'), seam: hex('#8a9298'), count: 4, seed: 43, gloss: 0.5, stains: 0.04, alt }),
  plankFloor: (alt) => planks({ wood: hex('#5a4028'), count: 5, seed: 44, alt }),
  templeFloor: (alt) => flagstones({ stone: hex('#7a6a56'), mortar: hex('#3a3026'), count: 3, seed: 45, alt }),
  hiveFloor: (alt) => ground({ base: hex('#3a2a20'), seed: 46, rough: 1, wet: 0.6, alt, cracks: { count: 4, colour: hex('#5a3a28'), width: 0.5, depth: -0.8 } }),
  slimePool: () => liquid({ deep: hex('#2a4410'), shallow: hex('#7a9a28'), seed: 47, emit: 0.1 }),
  alienDeck: (alt) => plating({ tint: hex('#2e2442'), seed: 48, alt, inlay: hex('#a070ff'), ribs: 4, rivets: false }),
  derelictDeck: () => plating({ tint: hex('#2a3034'), seed: 49, soot: 0.6, rust: 0.5, cracks: 0.5 }),
  cellFloor: () => plating({ tint: hex('#3a4246'), seed: 50 }),
}

// Floors that are another floor with something laid over it.
const square = (u, v) => Math.max(Math.abs(u - 16), Math.abs(v - 16))
Object.assign(G, {
  crevasse: () =>
    overlay(G.snow(false), (u, v) => {
      const d = square(u, v) - 9 + Math.sin(u * 0.9) * 0.6 + Math.cos(v * 1.1) * 0.6
      if (d > 1.2) return null
      if (d > 0) return { height: -d * 2, surface: { albedo: hex('#9ab4c8'), spec: 0.5, shininess: 40 } }
      return { height: -3, surface: { albedo: hex('#0a141c').map((c) => c * (1 + d * 0.02)), ao: 0.6 } }
    }),
  sulphurPool: () =>
    overlay(G.sulphurCrust(false), (u, v) => {
      const r = Math.hypot(u - 16, v - 16)
      if (r > 13) return null
      if (r > 10.5) return { height: 0.8, surface: { albedo: hex('#d89a20'), spec: 0.3 } }
      return { height: 0, surface: { albedo: hex('#2a9a98'), emit: hex('#2a9a98').map((c) => c * 0.25 * (1 - r / 12)), spec: 0.9, shininess: 70 } }
    }),
  cropRows: (alt) =>
    overlay(G.soil(alt), (u, v) => {
      const row = ((v % 8) + 8) % 8
      const ridge = Math.cos(((row - 4) / 8) * Math.PI * 2)
      const plant = row > 2.6 && row < 5.4 && Math.hypot(((u % 4) + 4) % 4 - 2, row - 4) < 1.6
      if (plant) return { height: 1.4, surface: { albedo: hex('#5a9a32'), spec: 0.2 } }
      return { height: ridge * 0.9, surface: null }
    }),
  railTrack: () =>
    overlay(G.quarryFloor(false), (u, v) => {
      const rail = Math.min(Math.abs(v - 10), Math.abs(v - 22))
      if (rail < 0.9) return { height: 1.4, surface: { albedo: hex('#9a9a98'), spec: 0.8, shininess: 50 } }
      const sleeper = Math.abs(((u % 8) + 8) % 8 - 4) < 1.6 && v > 6 && v < 26
      if (sleeper) return { height: 0.8, surface: { albedo: hex('#4a3626'), spec: 0.05 } }
      return null
    }),
  padMarking: () =>
    overlay(G.landingPad(), (u, v) => {
      const s = square(u, v)
      if ((s > 10 && s < 11.6) || s < 2.4) return { surface: { albedo: hex('#e8c040'), spec: 0.2 } }
      return null
    }),
  forceField: () =>
    overlay(G.cellFloor(), (u, v) => {
      const s = square(u, v)
      if (Math.abs(s - 12) < 0.6) return { surface: { albedo: hex('#5fd0ff'), emit: hex('#5fd0ff').map((c) => c * 0.9), tag: 'glow' } }
      if (Math.abs(s - 7) < 0.35) return { surface: { albedo: hex('#3a90c0'), emit: hex('#3a90c0').map((c) => c * 0.6), tag: 'glow' } }
      return null
    }),
  glyphTile: () =>
    overlay(G.templeFloor(false), (u, v) => {
      const s = square(u, v)
      const r = Math.hypot(u - 16, v - 16)
      if (Math.abs(s - 11) < 0.5 || Math.abs(r - 6) < 0.45 || (r < 6 && Math.abs(Math.sin(Math.atan2(v - 16, u - 16) * 3)) < 0.08)) {
        return { height: -0.4, surface: { albedo: hex('#d8b040'), emit: hex('#d8b040').map((c) => c * 0.5), spec: 0.7, tag: 'glow' } }
      }
      return null
    }),
})

// ---------- walls: id -> (H) => material ----------
const strata = (colours, spacing = 7, wobble = 4) => ({ colours: colours.map(hex), spacing, wobble, amount: 0.5 })
const W = {
  rockWall: rockWall({ base: hex('#5e554c'), seed: 61 }),
  ruinWall: builtWall({ kind: 'blocks', colour: hex('#8c826e'), mortar: hex('#4a4438'), course: 6, blockLength: 10, seed: 62 }),
  prefabWall: builtWall({ kind: 'panels', colour: hex('#9ca1a6'), trim: hex('#c0c4c8'), dark: hex('#5c6166'), stripe: { at: 0.78, width: 1.2, colour: hex('#3a6aa0') }, seed: 63 }),
  cityWall: builtWall({ kind: 'blocks', colour: hex('#a8977a'), mortar: hex('#6a5e4a'), course: 6, blockLength: 11, seed: 64 }),
  sandstone: rockWall({ base: hex('#a86c42'), light: hex('#c88c5a'), seed: 65, strata: strata(['#c08050', '#9a5e36', '#b07448']) }),
  timberWall: builtWall({ kind: 'boards', colour: hex('#6e5234'), dark: hex('#2e2214'), trim: hex('#8a6a44'), boardWidth: 4.6, seed: 66 }),
  adobeWall: builtWall({ kind: 'stucco', colour: hex('#b8986a'), dark: hex('#7a6040'), trim: hex('#c9a878'), seed: 67 }),
  snowPrefabWall: builtWall({ kind: 'panels', colour: hex('#8a8f94'), trim: hex('#a8adb2'), dark: hex('#54585c'), cap: { colour: hex('#eef3f6'), depth: 6 }, seed: 68 }),
  heatWall: builtWall({ kind: 'panels', colour: hex('#45494f'), trim: hex('#5a5e64'), dark: hex('#26292d'), across: 2, stripe: { at: 0.72, width: 1.1, colour: hex('#ff7a2a'), emit: 0.9 }, seed: 69 }),
  iceWall: rockWall({ base: hex('#8fb8cc'), light: hex('#d8eef8'), dark: hex('#5a88a0'), seed: 70, gloss: 0.6, facets: 2 }),
  basaltWall: rockWall({ base: hex('#3a3842'), seed: 71, columns: 4, facets: 2 }),
  cliff: rockWall({ base: hex('#6a6a64'), seed: 72, strata: strata(['#7a7a76', '#5a5a54'], 9) }),
  crystalWall: rockWall({ base: hex('#8a70c0'), light: hex('#c8b0f0'), seed: 73, gloss: 0.7, facets: 2, veins: { colour: hex('#f0e4ff'), emit: 0.8, width: 0.45 } }),
  rustMesa: rockWall({ base: hex('#9a5034'), seed: 74, strata: strata(['#b8603e', '#8a4428', '#a85a3a']) }),
  barnWall: builtWall({ kind: 'boards', vertical: true, colour: hex('#8a3a2a'), dark: hex('#3a1a12'), trim: hex('#e0d8c8'), boardWidth: 4, seed: 75 }),
  labWall: builtWall({ kind: 'panels', colour: hex('#d8dee2'), trim: hex('#eef2f4'), dark: hex('#9aa4aa'), stripe: { at: 0.8, width: 0.9, colour: hex('#5fd0ff'), emit: 0.9 }, gloss: 0.4, seed: 76 }),
  cantinaWall: builtWall({ kind: 'boards', colour: hex('#5e4228'), dark: hex('#24180e'), trim: hex('#7a5a3a'), boardWidth: 5, stripe: { at: 0.35, width: 1.4, colour: hex('#c08040') }, seed: 77 }),
  templeWall: builtWall({ kind: 'blocks', colour: hex('#8a7a5e'), mortar: hex('#4a4030'), course: 9, blockLength: 16, stripe: { at: 0.7, width: 1.6, colour: hex('#d8b040'), emit: 0.35 }, seed: 78 }),
  hiveWall: rockWall({ base: hex('#5a3a28'), seed: 79, gloss: 0.4, facets: 4, extra: strands({ colour: hex('#7a4a30'), count: 5, width: 1.8 }) }),
  alienBulkhead: builtWall({ kind: 'panels', colour: hex('#4a3a6a'), trim: hex('#5e4c84'), dark: hex('#261c3a'), stripe: { at: 0.6, width: 0.8, colour: hex('#a070ff'), emit: 1 }, gloss: 0.5, seed: 80 }),
  breachedBulkhead: builtWall({ kind: 'panels', colour: hex('#4e575e'), trim: hex('#66727a'), dark: hex('#262c30'), seed: 81, extra: breach() }),
  shoredWall: rockWall({ base: hex('#5a5048'), seed: 82, extra: timbers({ colour: hex('#7a5a34') }) }),
  blastBarrier: builtWall({ kind: 'panels', colour: hex('#8a8a82'), trim: hex('#a4a49c'), dark: hex('#5c5c56'), stripe: { at: 0.14, width: 2.4, hazard: true }, gloss: 0.1, seed: 83 }),
  hullBarricade: builtWall({ kind: 'panels', colour: hex('#5a646c'), trim: hex('#6a767e'), dark: hex('#3a4248'), across: 2, seed: 84, extra: drips({ colour: hex('#6a3a1e'), count: 5 }) }),
  campBarricade: builtWall({ kind: 'boards', colour: hex('#6a6a3a'), seed: 85, extra: crateStack() }),
  cellWall: builtWall({ kind: 'panels', colour: hex('#3e464c'), trim: hex('#545e66'), dark: hex('#262c30'), stripe: { at: 0.45, width: 0.9, colour: hex('#e04040'), emit: 0.7 }, seed: 86 }),
  rootWall: rockWall({ base: hex('#3a3424'), seed: 87, extra: strands({ colour: hex('#5a4a30'), count: 5, width: 1.6 }) }),
  vineWall: rockWall({ base: hex('#4e4a40'), seed: 88, extra: strands({ colour: hex('#2e6a2a'), count: 4, width: 0.9, leaves: { colour: hex('#3e8a36'), threshold: 0.55 } }) }),
  stoneWall: builtWall({ kind: 'blocks', colour: hex('#8a8478'), mortar: hex('#3a3730'), course: 5, blockLength: 8, seed: 89 }),
  frostRockWall: rockWall({ base: hex('#6e767a'), seed: 90, cap: { colour: hex('#eef4f8'), depth: 9, spec: 0.3 } }),
  seaCliff: rockWall({ base: hex('#80705a'), seed: 91, strata: strata(['#a89878', '#80705a', '#9a8a6c']), cap: { colour: hex('#5a7a3a'), depth: 5 } }),
  sinterWall: rockWall({ base: hex('#c8b488'), seed: 92, gloss: 0.3, strata: strata(['#e8dcb8', '#d08a3a', '#f0e8d0'], 6, 2) }),
  regolithRidge: rockWall({ base: hex('#666058'), seed: 93 }),
  fungalWall: rockWall({ base: hex('#34283a'), seed: 94, extra: shelves({ colour: hex('#c8506a'), gills: hex('#f0e0e0') }) }),
  corrodedWall: rockWall({ base: hex('#40402c'), seed: 95, extra: drips({ colour: hex('#a8c040'), emit: 0.5, count: 6 }) }),
  glowRootWall: rockWall({ base: hex('#18222c'), seed: 96, extra: strands({ colour: hex('#40e0d0'), count: 4, width: 0.7, emit: 1.2 }) }),
  obsidianWall: rockWall({ base: hex('#1a1824'), light: hex('#3a3850'), seed: 97, gloss: 0.8, facets: 2 }),
}

// ---------- objects: id -> scene ----------
const g = (id) => G[id](false)
const leaves = (dark, light) => [hex(dark), hex(light)]
const reeds = () => {
  const stems = []
  for (let i = 0; i < 14; i++) stems.push([5 + ((i * 37) % 23), 5 + ((i * 53) % 23), 14 + ((i * 7) % 8), ((i % 5) - 2) * 0.8, ((i % 3) - 1) * 0.8, 0.55])
  return stems
}
const fernFronds = () => Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2
  return [16, 16, 11 + (i % 3), Math.cos(a) * 10, Math.sin(a) * 10, 1.4]
})
// Each takes the options its tall version (TALL) changes, so the same model can be built at either size.
const OBJ = {
  rock: () => O.boulder(g('ground'), { colour: hex('#7a7268'), seed: 3 }),
  tree: (t) => O.tree(g('ground'), { trunk: hex('#5a3e26'), leaves: leaves('#24501f', '#5a9a48'), seed: 2, ...t }),
  fence: () => O.fence(g('ground')),
  bush: () => O.bush(g('grass'), { leaves: leaves('#24501f', '#5aa04e'), h: 16, seed: 3, berries: hex('#c03a3a') }),
  log: () => O.log(g('grass'), {}),
  reeds: () => O.cluster(g('mud'), { stems: reeds(), mat: O.matte(hex('#7a8a3a'), { vary: 0.35 }), tipMat: O.matte(hex('#6a4a2a')), top: 24 }),
  planter: () => O.planter(g('pavement')),
  fountain: () => O.fountain(g('pavement')),
  cactus: (t) => O.cactus(g('sand'), t),
  iceBlock: () => O.block(g('snow'), { colour: hex('#a8d4e8'), h: 28, cracks: hex('#f0fbff'), translucent: true }),
  basalt: (t) => O.basaltColumns(g('ash'), { ...t }),
  debris: () => O.debris(g('scorched')),
  broadleaf: (t) => O.tree(g('grass'), { trunk: hex('#5a3e26'), leaves: leaves('#2a5a24', '#6aaa50'), crownR: 12, seed: 5, ...t }),
  pine: (t) => O.conifer(g('grass'), { trunk: hex('#4a321e'), leaves: leaves('#14301a', '#3a7040'), seed: 6, ...t }),
  mangrove: (t) => O.mangrove(g('mud'), t),
  desertRock: () => O.boulder(g('sand'), { colour: hex('#b0784a'), seed: 7 }),
  snowRock: () => O.boulder(g('snow'), { colour: hex('#5e6670'), cap: hex('#eef4f8'), capFrom: 0.25, seed: 8 }),
  mossRock: () => O.boulder(g('grass'), { colour: hex('#625a50'), cap: hex('#5a8a48'), capFrom: 0.4, seed: 9 }),
  barrenRock: () => O.boulder(g('regolith'), { colour: hex('#7e7a76'), seed: 10 }),
  jungleTree: (t) => O.tree(g('jungleFloor'), { trunk: hex('#5a3e26'), leaves: leaves('#18401a', '#3a8a34'), h: 46, crownR: 14, crownZ: 32, lumps: 6, seed: 11, ...t }),
  fern: () => O.cluster(g('jungleFloor'), { stems: fernFronds(), mat: O.matte(hex('#3e9040'), { vary: 0.35 }), top: 16 }),
  acacia: (t) => O.acacia(g('savanna'), t),
  termiteMound: (t) => O.termiteMound(g('savanna'), t),
  lichenRock: () => O.boulder(g('tundra'), { colour: hex('#5e6258'), cap: hex('#9aaa80'), capFrom: 0.45, seed: 12 }),
  shrub: () => O.bush(g('tundra'), { leaves: leaves('#3a4a24', '#7a8a50'), h: 12, r: 8, seed: 13 }),
  palm: (t) => O.palm(g('beach'), { trunk: hex('#8a6a44'), leaves: leaves('#205420', '#5aa04a'), ...t }),
  driftwood: () => O.driftwood(g('beach')),
  screeRock: () => O.boulder(g('scree'), { colour: hex('#8e8e88'), seed: 14 }),
  geyser: () => O.geyser(g('sulphurCrust')),
  crystalSpire: (t) => O.spire(g('crystalGround'), { colour: hex('#a888e0'), glowColour: hex('#f0e0ff'), h: 46, seed: 2, ...t }),
  crystalCluster: () => O.spire(g('crystalGround'), { colour: hex('#b898e8'), glowColour: hex('#f0e0ff'), h: 18, r: 3.6, shards: 4, seed: 3 }),
  giantMushroom: (t) => O.mushroom(g('fungalGround'), { stem: hex('#d8d0c0'), cap: hex('#c8506a'), spots: hex('#f0e0e0'), ...t }),
  puffball: () => O.pods(g('fungalGround'), { pods: [[16, 16, 6, 0.85], [22, 11, 3.5, 0.9], [10, 21, 3, 0.9]], mat: O.matte(hex('#b8a0c0'), { vary: 0.2, spec: 0.2 }) }),
  bloatPod: () => O.pods(g('toxicMud'), { pods: [[16, 16, 6, 1.1, 6], [22, 20, 3.2, 1, 3]], mat: () => ({ albedo: hex('#a8c040'), emit: hex('#a8c040').map((c) => c * 0.25), spec: 0.8, shininess: 50, tag: 'glow' }), stalk: { r: 0.9, mat: O.matte(hex('#4e5c22')) } }),
  glowTree: (t) => O.tree(g('glowMoss'), { trunk: hex('#3a2a4a'), leaves: leaves('#0e4a48', '#2aa0a0'), h: 42, glowLeaves: hex('#4af0e0'), seed: 15, ...t }),
  glowPod: () => O.pods(g('glowMoss'), { pods: [[12, 16, 2.4, 1.2, 4], [19, 12, 2, 1.2, 6], [19, 21, 2.2, 1.2, 3]], mat: O.glow(hex('#80fff0'), 0.9), stalk: { r: 0.5, mat: O.matte(hex('#209080')) } }),
  rustRock: () => O.boulder(g('rustDust'), { colour: hex('#a85a3a'), seed: 16 }),
  glassShard: () => O.glassShards(g('glassPlain')),
  glassSpire: (t) => O.spire(g('glassPlain'), { colour: hex('#4a4868'), h: 42, r: 7, seed: 5, ...t }),
  tallCrop: () => O.tallCrop(g('soil')),
  silo: (t) => O.silo(g('soil'), t),
  hayBale: () => O.hayBale(g('soil')),
  oreVein: () => O.oreVein(g('quarryFloor')),
  oreCart: () => O.oreCart(g('quarryFloor')),
  drillRig: (t) => O.drillRig(g('quarryFloor'), t),
  shuttleHull: () => O.shuttleHull(G.landingPad()),
  fuelTank: () => O.fuelTank(G.landingPad()),
  hullWreck: () => O.hullWreck(G.scorched()),
  burningWreck: () => O.burningWreck(G.scorched()),
  tent: () => O.tent(g('ground')),
  campfire: () => O.campfire(g('ground')),
  sensorMast: (t) => O.sensorMast(g('ground'), t),
  labBench: () => O.labBench(g('labFloor')),
  containmentPod: (t) => O.containmentPod(g('labFloor'), t),
  barCounter: () => O.barCounter(g('plankFloor')),
  table: () => O.table(g('plankFloor')),
  cellBunk: () => O.cellBunk(G.cellFloor()),
  templePillar: (t) => O.templePillar(g('templeFloor'), t),
  altar: () => O.altar(g('templeFloor')),
  eggPod: () => O.eggPod(g('hiveFloor')),
  alienConsole: () => O.alienConsole(g('alienDeck')),
  bioPod: () => O.bioPod(g('alienDeck')),
}

// Tall objects (tiles.json tall) as they stand on a single tile: rebuilt at wall scale, their trunks, stems, columns
// and masts longer and their crowns, caps and tops the size they were. A 2x2 square of one (tiles.json big) is the
// original model drawn twice the size instead.
const TALL = {
  tree: { h: 88, crownZ: 74 },
  broadleaf: { h: 88, crownZ: 74 },
  jungleTree: { h: 92, crownZ: 78 },
  glowTree: { h: 84, crownZ: 72 },
  mangrove: { h: 80, crownZ: 70 },
  pine: { h: 96, tiers: 8 },
  palm: { h: 84 },
  crystalSpire: { h: 92 },
  glassSpire: { h: 84 },
  giantMushroom: { h: 88 },
  basalt: { h: 68 },
  cactus: { h: 56, arms: [[22, 40], [30, 47]] },
  termiteMound: { h: 56, sides: [30, 22] },
  acacia: { fork: 52 },
  silo: { h: 84 },
  drillRig: { h: 92 },
  sensorMast: { h: 88 },
  containmentPod: { h: 81 },
  templePillar: { h: 92 },
}

// ---------- jobs from the catalogue ----------
const file = (image) => image?.split('/').pop()
// Tiles whose art the other two scripts draw.
const groupOf = new Map(catalogue.paletteGroups.flatMap((group) => group.tiles.map((id) => [id, group.id])))
const OTHER_SCRIPTS = new Set(['starship', 'tosBridge'])
const ours = (tile) => !OTHER_SCRIPTS.has(groupOf.get(tile.id))
// A tile's image height has to match what its art reaches (engine.mjs imageHeightFor); a mismatch is reported.
const mismatched = []
const checkImageHeight = (tile, top) => {
  const wanted = imageHeightFor(top)
  if ((tile.imageHeight ?? DESIGN_H) !== wanted) mismatched.push(`${tile.id}: imageHeight should be ${wanted}`)
}
const jobs = []
for (const tile of catalogue.tiles) {
  if (!ours(tile)) continue
  const imageHeight = tile.imageHeight ?? DESIGN_H
  if (G[tile.id]) {
    jobs.push({ id: tile.id, file: file(tile.image), draw: () => render(floorScene(G[tile.id](false))) })
    if (tile.altImage) jobs.push({ id: tile.id, file: file(tile.altImage), draw: () => render(floorScene(G[tile.id](true))) })
  } else if (W[tile.id]) {
    const h = tile.height
    checkImageHeight(tile, h)
    jobs.push({ id: tile.id, file: file(tile.image), draw: () => renderTile(blockScene(h, W[tile.id](h)), imageHeight) })
    // Window panels (tiles.json panelImages, v2/panels.mjs): the window built into the wall, one image per direction.
    for (const axis of Object.keys(tile.panelImages ?? {})) {
      const wall = (half) => withFitting(W[tile.id](h), onPanelFace(axis, half, windowFeature(h)))
      jobs.push({ id: tile.id, file: file(tile.panelImages[axis]), panel: true, draw: () => renderPanel(panelScene(axis, (half) => blockScene(h, wall(half)), imageHeight), imageHeight) })
    }
  } else if (OBJ[tile.id]) {
    const model = OBJ[tile.id](TALL[tile.id])
    checkImageHeight(tile, model.top)
    jobs.push({ id: tile.id, file: file(tile.image), draw: () => renderTile(objectScene(model), imageHeight, { subsamples: 2 }) })
    if (tile.big) jobs.push({ id: tile.id, file: file(tile.big.image), draw: () => renderBig(objectScene(OBJ[tile.id]()), { subsamples: 2 }) })
  }
}
if (mismatched.length) {
  console.log(`tiles.json image heights don't match the art:\n  ${mismatched.join('\n  ')}`)
  process.exit(1)
}
// Any of this script's tiles without v2 art defined is reported.
const handled = new Set(jobs.map((job) => job.id))
const missing = catalogue.tiles.filter((tile) => ours(tile) && !handled.has(tile.id)).map((tile) => tile.id)
if (missing.length) console.log(`no v2 art defined for: ${missing.join(', ')}`)

const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length).split(',')
const sheet = process.argv.includes('--sheet')
const rendered = []
for (const job of jobs) {
  if (only && !only.includes(job.id)) continue
  const target = outFile(job.file)
  if (fs.existsSync(target) && !FORCE && !only) {
    console.log(`kept   ${job.file} (already exists)`)
    continue
  }
  if (fs.existsSync(target) && !FORCE) {
    console.log(`kept   ${job.file} (already exists; --force to redraw)`)
    if (!sheet) continue
  }
  const started = Date.now()
  // A draw returns a tile image's bytes, or { width, height, bytes } for a taller or larger one. Two-tile panels are
  // left off the contact sheet.
  const drawn = job.draw()
  const { width = OUT_W, height = OUT_H, bytes = drawn } = drawn.bytes ? drawn : {}
  if (!fs.existsSync(target) || FORCE) fs.writeFileSync(target, encodePng(width, height, bytes))
  if (!job.panel) rendered.push({ id: job.id, bytes, width, height })
  console.log(`wrote  ${job.file} (${Date.now() - started} ms)`)
}
if (sheet && rendered.length) writeSheet(fileURLToPath(new URL('../.tmp-sheet.png', import.meta.url)), rendered)
