# Tile catalogue

`src/data/adaptation/maps/tiles.json` is the shared tile catalogue: every map file (`maps/*.json`) is written in its symbols, and the map editor's palette is built from it. Maps are independent of any combat type; a combat mode reads the tile properties and decides what they mean for its rules.

This page holds the notes that used to sit in the JSON's `notes` array. When a field or tile family is added, describe it here and keep the JSON's one-line pointer and "next free symbol" current.

## File layout

| Key | Meaning |
|---|---|
| `imageSize` | Tile PNGs are 64 x 96, with the tile's 64 x 32 floor diamond across the bottom. |
| `wallHeightScale` | How many times taller walls and tall objects are drawn in the tall-wall views (exploration, Combat Type 1, the map editor). Designer decision (Oct 2026): 2. |
| `paletteGroups` | The editor's collapsible tile categories, in order, by what each tile was made for. `section` is the heading the category sits under (Locations, Alien Locations, Earth-like Biomes, Alien Biomes). A tile listed in no group shows under Other. |
| `tiles` | The catalogue, one entry per tile. |

## Symbols

`symbol` is the character a tile is saved as in a map file's rows. Unknown symbols load as floor.

Allocation order: the printable ASCII characters first (`"` and `\` are avoided; only `'` is left), then single Latin-1 letters from `À` (skipping `×` and `÷`), then Latin Extended-A from `Ā`. The next free symbol is recorded in the JSON's `notes` line.

## Tile fields

| Field | Meaning |
|---|---|
| `solid` | Blocks movement. |
| `blocksSight` | Blocks line of sight. |
| `cover` | Standing next to it can give cover. The editor's palette Cover checkbox edits it (saved back to the JSON by the dev server). |
| `height` | Block height in pixels; 0 is a floor tile. |
| `image`, `altImage` | The tile's PNG; `altImage` is drawn on alternate (checkerboard) tiles for variety. |
| `heightVariants` | `{ mid, low }`: lower versions of a wall used inside the map and on its front edge so walls don't hide the room (not used in the tall-wall views, where walls fade instead). |
| `activeImage` | Drawn over the tile while it is active (a live hazard, a console light). |
| `fade` | Drawn see-through while it hides a party member standing behind it (exploration and Combat Type 1; the editor's Fade checkbox edits it). Designer decision (Oct 2026): walls fade by default. |
| `wall` | Drawn `wallHeightScale` times as tall in the tall-wall views, always at full height there, since fading keeps the party visible. |
| `panels` | A built wall (not rock, ice, cliffs or hive) that, in the tall-wall views, is drawn in two-tile panels: two of the same wall side by side in a straight run read as one panel, and every other panel along a run has a window (`src/maps/wallPanels.js`). Presentation only: windows don't change sight. Designer decision (Oct 2026). |
| `windowView` | `'space'`: the panel windows show a star field (starship and alien vessel bulkheads). |
| `tall` | A large object (trees, spires, pillars, silos, masts) drawn `wallHeightScale` times as tall in the tall-wall views, like walls. |
| `big` | In the tall-wall views, a 2x2 square of the same object is drawn as one object twice the size; objects left over stay single (`src/maps/bigObjects.js`). Tall and big objects fade, except objects 32 high or lower (boulders, ice blocks, ore veins, cacti, fountains, fuel tanks, parked shuttles; designer decision Oct 2026). Presentation only: movement, sight and cover still read the single tiles. Which tiles are tall or big is a prototype proposal following the designer request "large objects such as trees should be 2x high... some boulders or large land features 2x or 2x2". |
| `role` | `'hazard'` (a floor tile a hazard control can make dangerous), `'hazardControl'` (the interactable that sets it off), or `null`. |
| `lights` | Animated light-only overlays (`image`, `style`: pulse, blink or flicker) drawn over the tile. Presentation only. |
| `panelFitting` | On the long wall fittings: the fitting (`lcars`, `conduit`, `hatch`, `computer`) each two-tile panel shows instead of a window. |
| `joinImages` | A path template with `{joins}`: in the tall-wall views the tile is drawn as the piece joining it to up to two neighbouring tiles of the same kind (`{joins}` = their directions, e.g. `N-SE`; `src/maps/railJoins.js`), so curved runs read as one railing. Combat Type 2 draws the plain `image`. |

Flat but impassable floors (deep water, lava, crevasses) are `solid` with `height` 0 and don't block sight.

## Tile families

- **Starship wall fittings** (`lcarsWall`, `conduitWall`, `hatchWall`, `computerWall`): bulkheads with an LCARS display, EPS conduit, Jefferies tube hatch or computer bank, placed by hand in the editor. Their art is the v2 art (`public/art/tiles-v2/`, `scripts/makeTilesV2.mjs`) whichever tile art set is chosen; their lower versions are the plain bulkhead's. They don't pair into window panels.
- **Long wall fittings** (`lcarsPanel`, `conduitPanel`, `hatchPanel`, `computerPanel`): a plain bulkhead with `panels` whose every two-tile panel shows the fitting (drawn by `IsoTiles.jsx` `FittingHalf`). The editor lays both tiles at once. Designer request (Oct 2026).
- **Outdoor, cave, city and wreck tiles**: prototype placeholders for Generate Map's layout types.
- **Walls for locations and biomes that had none** (`breachedBulkhead` to `obsidianWall`) and the **Derelict Ship and Detention Block floors** (`derelictDeck`, `cellFloor`): prototype placeholders added on designer request (Oct 2026); names, heights and looks are a prototype proposal.
- **Bridge (TOS)** (`tosDeck` to `tosVoid`): a TOS-inspired starship bridge (station walls with framed displays, main viewscreen, turbolift doors, command well, captain's chair, helm, stations, red railing), art by `scripts/makeTilesBridge.mjs`. Added on designer request (Oct 2026); the tile list, names, heights and looks are a prototype proposal. The station walls don't pair into window panels. Station consoles and the helm run the length of their tile, so a row of them reads as one console. `tosHull` is the plain outside of the ring, for the near walls (which show their outer faces); `tosVoid` is empty space outside the room (a transparent, impassable floor).

Map rotation (tiles turned with the editor's right click) is described in `src/maps/mapFormat.js`.

## Where the behaviour lives

| Concern | Code |
|---|---|
| Loading, symbols, rotation, ambient light | `src/maps/mapFormat.js` |
| Tile art sets and glows | `src/maps/tileArt.js`, `src/data/adaptation/maps/tileArtSets.json` |
| Wall fade | `src/maps/wallFade.js` |
| Window panels and long wall fittings | `src/maps/wallPanels.js` |
| 2x2 big objects | `src/maps/bigObjects.js` |
| Joined railings | `src/maps/railJoins.js` |
| Drawing | `src/components/maps/IsoTiles.jsx` |
| Art generation | `scripts/makeTiles.mjs` (placeholder set); `scripts/makeTilesV2.mjs`, `scripts/makeTilesV2World.mjs`, `scripts/makeTilesBridge.mjs` (v2 set) |
