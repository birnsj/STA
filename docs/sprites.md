# Character map sprites

How full-body isometric figures work on exploration and combat boards (presentation only). Decision history: `design-tracker.md`. Sheet definitions: `src/data/adaptation/characterSprites.json`.

## Spike 3D (default, 2026-11)

**Map figures are procedural 3D by default** (`src/spike3d/`, plan: `docs/spike3d-figure-swap-plan.md`). Pixi character sheets are **not** loaded on the exploration/combat critical path while spike3d is on (`hideSprite` / `preload: false`). F1 toggles 2D sprites ↔ 3D for debug.

`characterSprites.json` remains the **clip name + timing contract** for procedural (and later Mixamo) bodies — see `src/spike3d/clips.js`. Environment / FX / dice sprites are unchanged.

Appearance (gender, hair, species) is driven by `src/data/adaptation/spike3dAppearance.json` and `src/spike3d/appearance.js`. **Humans** use the shared `HumanoidModel` head. **Other races** get unique placeholder meshes on that same rig (`src/spike3d/raceMeshes/`); optional GLB overrides live under `public/art/models/characters/{species}-{gender}.glb`. **Uniforms** swap discrete coloured tunic textures per division (`shared/uniform-*.png`) — no mask shader. Bake: `node tools/bakeSpike3dRaceMeshes.mjs`.

## Sets and lookup

- One **set** per species × gender (Human, Vulcan, Andorian, Tellarite, Trill, Caitian, Klingon).
- Chosen from the character’s **portrait** (`getSpriteSet` in `src/rules/appearance.js`). Klingon warrior portrait ids map through `portraitSets`. No matching set → portrait token (and a flat fallen body when down).
- Starfleet sets have a **uniform mask** per sheet; the shirt is recoloured to the department colour (`uniforms.json` divisions: command/conn gold, engineering/security red, science/medicine blue). Klingons keep armour (no mask). Sheets are **painted command gold** (`uniformDivision: "command"`); other departments wait on a masked recolour before that colour is shown.
- Nothing about sprites is stored in the character JSON.

## Uniform load (Pixi `SheetStore`)

Where: `src/components/maps/pixi/figures.js` (`SheetStore`), `src/components/maps/useRecolouredSheet.js` (workers), `src/components/maps/MapFadeIn.jsx`.

- **Recolour** runs off the main thread (`recolourWorker.js`, two workers). Portraits use the same mask rule via `useRecolouredSheet` / `useUniformImage.js` and stay null until ready so they never flash the wrong shirt.
- **Board figures:** `loadSheet` publishes the masked bitmap when the department colour differs from the sheet’s painted division. If recolour fails, the painted PNG is used so the figure is not blank.
- **Oversized sheets** (wider/taller than the WebGL texture limit, e.g. fall): no painted preview — strip textures are built only from the final image so throwaway strip uploads are avoided.
- **Load order (2026-10-31):** `updateSprite` asks for **base** (and getup while blasting) first. Walk / run / idle / fall / … start only after base can draw. Asking for every preload page up front starved the workers, so security/ops base shirts finished late and those party members were missing (or gold) through exploration beam-in.
- **MapFadeIn** waits for in-flight sheet promises (`sheetsSettled`) after the board’s first frame, then races a ceiling so a stuck worker cannot hold black forever. The ceiling must not start at mount alone (that lifted the cover while uniforms were still queued).

## Grid

| | Design cell | File cell (× resolution) | Iso floor at feet |
|---|---|---|---|
| **Migrated sheets** | 64×128 | 256×512 (resolution **4**) | 64×32 design |
| **Legacy base** | 40×64 | 160×256 (resolution 4) | same floor scale via resolution |
| **Fall** | 112×96 | 336×288 (resolution **3**) | wide prone reach |
| **Get-up** | 112×96 | 448×384 (resolution **4**) | same design as fall, sharper file |

Pixi draws at `1 / resolution` (and `displayScale` **1**). Sheet URLs carry `?v=` cache tags from resolution, paintScale, and frame size.

**paintScale** (generator only): sizes the placeholder model in the cell — walk/stand/fidgets **1.25**, run **1.37**, combat/reaction/sneak/surrender/panic **1.25**. Runtime still samples file pixels 1:1.

## Sheet layout

Each catalogue sheet is one PNG under `public/art/sprites/characters/{species}/{gender}/`:

- **Rows:** five drawn facings (`s`, `se`, `e`, `ne`, `n`). West-side facings mirror `se`/`e`/`ne`.
- **Columns:** that sheet’s animations end to end (`start` + `frames` in JSON).

| Sheet id | File suffix | Animations (game) |
|---|---|---|
| `base` | *(none)* | legacy idle / walk / run (fallback if a dedicated page is missing) |
| `walk` | `-walk` | walk |
| `run` | `-run` | run |
| `idle` | `-stand` | idle (breathing loop) |
| `fidgets` | `-idle` | idleLookAround, idleShiftWeight, idleTurn, idleCheckPhaser, idleScratchHead |
| `combat` | `-combat` | attack, melee, cover |
| `reaction` | `-reaction` | punch, kick, dodge, getHit |
| `fall` | `-fall` | crumple / back / forward / spin / blast falls |
| `getup` | `-getup` | getUp |
| `sneak` | `-sneak` | sneakIdle, sneakWalk |
| `surrender` | `-surrender` | surrender |
| `panic` | `-panic` | hazardPanic |

`getSpriteAnimation(name)` prefers a sheet whose **id matches the animation** (e.g. `walk` → `sheets.walk`) so one-anim pages win over a legacy copy on `base`.

### Split pages (editor review)

On disk there are also one-anim pages (`*-attack`, `*-melee`, `*-cover`, `*-punch`, `*-kick`, `*-dodge`, `*-gethit`, `*-sneak-idle`, …) on the same 64×128 grid. They are **not** catalogue sheets yet — gameplay still loads the combined `*-combat` / `*-reaction` / `*-sneak` PNGs. The Sprites editor can preview them (inferred grid + filename → anim).

## When clips play

- **Exploration:** idle + fidgets while still; walk / run / sneak from movement; downed figures hold a fall pose.
- **Combat:** attack or melee on strike; cover while in cover; reaction clips on punch/kick/dodge/getHit; falls on Defeat; getUp after First Aid or blast stagger; surrender holds hands up; hazard panic may replace idle while afflicted (`hazardPanic.js`).
- **Play modes:** `loop`, `once` (return to loop), `hold` (stay on last frame). Timing in `src/components/maps/spriteTiming.js`; combat pose selection in `src/components/combat/unitPose.js`.

## Generating placeholders

```text
node scripts/makeCharacterSprites.mjs [set id ...] [--sheet=walk|run|idle|fidgets|combat|…] [--force]
```

Never overwrites an existing PNG without `--force`. Replace a file with real art of the **same pixel size** to swap art without code changes.

## Sprites editor

Main menu → **Sprites**. Browse Characters / Environment / FX / Dice under `public/art/sprites/`.

- Preview: extended iso floor, wheel zoom, left-drag pan; yellow cell grid on character sheets.
- Catalogue sheets: Anim dropdown from that sheet’s JSON animations; **Loop** forces repeat in the corner preview; **Angle** cycles facing.
- Unlisted character PNGs (split pages): grid inferred from size vs known frame×resolution×5 rows; single anim from filename suffix.
- Export always; Import needs Vite DEV (`/__sprites`). Built apps list known character sheets from JSON.

Where: `SpriteSheetsScreen.jsx`, `SpriteSheetPreview.jsx`, `spriteCatalogue.js`, `tools/spriteStore.cjs`.

## Lab map

**Sprite Showcase** (`maps/Sprite Showcase.json`): all 14 sets in a lineup, cover crates, fire strip, explosives, and a small combat pocket. Starfleet lab NPCs (`sprite*` in `characters.json`) cycle departments so shirts are gold / blue / red. Rebuild: `node --import ./tools/jsonLoader.mjs tools/buildSpriteShowcaseMap.mjs`.
