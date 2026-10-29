# Character map sprites

How full-body isometric figures work on exploration and combat boards (presentation only). Decision history: `design-tracker.md`. Sheet definitions: `src/data/adaptation/characterSprites.json`.

## Sets and lookup

- One **set** per species × gender (Human, Vulcan, Andorian, Tellarite, Trill, Caitian, Klingon).
- Chosen from the character’s **portrait** (`getSpriteSet` in `src/rules/appearance.js`). Klingon warrior portrait ids map through `portraitSets`. No matching set → portrait token (and a flat fallen body when down).
- Starfleet sets have a **uniform mask** per sheet; the shirt is recoloured to the department colour (`uniforms.json` divisions: command/conn gold, engineering/security red, science/medicine blue). Klingons keep armour (no mask).
- Nothing about sprites is stored in the character JSON.

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
