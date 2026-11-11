import { useMemo, useState } from 'react'
import EditorBoard from '../components/maps/EditorBoard.jsx'
import { EDITOR_GRID_SIZES } from '../components/maps/editorGrid.js'
import EditorGridOptions from '../components/maps/EditorGridOptions.jsx'
import EditorSelect from '../components/maps/EditorSelect.jsx'
import EditorSubScreen from '../components/maps/EditorSubScreen.jsx'
import { subEditorFileMenus } from '../components/maps/editorSubMenus.js'
import GeSourcePalette from '../components/maps/GeSourcePalette.jsx'
import TileSpritePicker from '../components/maps/TileSpritePicker.jsx'
import {
  AUTO_PAINT_ENVIRONMENTS,
  getAutoPaintRuleset,
  listAutoPaintRulesets,
  resolveAutoPaintRuleset,
} from '../maps/autoPaint/rulesets.js'
import { resolveAutoPaintTileId } from '../maps/autoPaint/templatePalette.js'
import {
  canEditAutoPaintRulesets,
  putAutoPaintRulesetLocal,
  reloadAutoPaintRulesetsFromDisk,
  saveAutoPaintRuleset,
} from '../maps/autoPaintFiles.js'
import { layerOfTile } from '../maps/layers.js'
import { getTile, PALETTE_GROUPS, TILES } from '../maps/mapFormat.js'
import {
  editorTemplatePaletteItems,
  templatePieceCatalogueEpochOf,
} from '../maps/templatePieces.js'

// Tools → Auto-Paint Ruleset Editor. Palette = Dev Edit Template Pieces catalogue (one file). Wall roles place tiles.

const FLOOR_FIELD = {
  key: 'defaultTile',
  label: 'Default floor tile',
  filter: (tile) => !tile.wall && !tile.solid && !tile.empty,
}

const WALL_FIELD = {
  filter: (tile) => Boolean(tile.wall),
}

const DOOR_TILE_FIELD = {
  key: 'underlayTile',
  label: 'Doorway tile',
  filter: (tile) => !tile.empty,
}

const WALL_TILE_FIELDS = [
  { key: 'straight', label: 'Straight wall (default 32)', required: true },
  { key: 'corner', label: 'Corner wall', required: true },
  { key: 'hull', label: 'Hull straight (optional)', required: false },
  { key: 'hullCorner', label: 'Hull corner (optional)', required: false },
]

/** Larger wall tiles from the Starship tileset (optional; Show all). Same PALETTE_GROUPS as Dev Edit Assets. */
function starshipWallTiles() {
  const group = PALETTE_GROUPS.find((entry) => entry.id === 'starship')
  return (group?.tiles ?? []).map((id) => getTile(id)).filter((tile) => tile?.wall)
}

function cloneRuleset(ruleset) {
  return resolveAutoPaintRuleset(structuredClone(ruleset))
}

function rulesetEqual(a, b) {
  return JSON.stringify(resolveAutoPaintRuleset(a)) === JSON.stringify(resolveAutoPaintRuleset(b))
}

function withSelectedTiles(options, value, multi = false) {
  const list = [...options]
  const ids = new Set(list.map((tile) => tile.id))
  const add = (id) => {
    if (!id || ids.has(id)) return
    const resolved = resolveAutoPaintTileId(id) || id
    const tile = getTile(resolved)
    if (!tile) return
    ids.add(tile.id)
    list.push(tile)
  }
  if (multi) (value ?? []).forEach(add)
  else add(value)
  return list.sort((a, b) => a.label.localeCompare(b.label))
}

export default function AutoPaintRulesetEditorScreen({
  map = null,
  boardKey = 0,
  showGrid = true,
  onShowGrid,
  gridSize = 32,
  onGridSize,
  showBounds = true,
  onShowBounds,
  showCentre = false,
  onShowCentre,
  onBack,
  onGenerateMap,
  onStatus,
}) {
  const [epoch, setEpoch] = useState(0)
  const rulesets = listAutoPaintRulesets()
  void epoch
  const [selectedId, setSelectedId] = useState(rulesets[0]?.id ?? 'template-32')
  const initial = cloneRuleset(getAutoPaintRuleset(selectedId) ?? rulesets[0])
  const [draft, setDraft] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [showAll, setShowAll] = useState(false)
  // 'rules' | 'map' — right pane only; left palette stays.
  const [viewMode, setViewMode] = useState('rules')
  const [showGridOptions, setShowGridOptions] = useState(false)

  const dirty = !rulesetEqual(draft, saved)
  const canSave = canEditAutoPaintRulesets
  const showingMap = viewMode === 'map' && map

  const openRuleset = (id) => {
    if (dirty && id !== selectedId) {
      const leave = window.confirm('Discard unsaved Auto-Paint ruleset changes?')
      if (!leave) return
    }
    const next = cloneRuleset(getAutoPaintRuleset(id) ?? rulesets[0])
    setSelectedId(id)
    setDraft(next)
    setSaved(next)
    setStatus('')
  }

  const patch = (partial) => setDraft((current) => resolveAutoPaintRuleset({ ...current, ...partial }))
  const patchWalls = (partial) =>
    setDraft((current) => resolveAutoPaintRuleset({ ...current, walls: { ...current.walls, ...partial } }))
  const patchFloors = (partial) =>
    setDraft((current) => resolveAutoPaintRuleset({ ...current, floors: { ...current.floors, ...partial } }))
  const patchDoors = (partial) =>
    setDraft((current) => resolveAutoPaintRuleset({ ...current, doors: { ...current.doors, ...partial } }))

  const revert = () => {
    setDraft(cloneRuleset(saved))
    setStatus('Reverted unsaved changes.')
  }

  const discardAndBack = () => {
    if (dirty) {
      const leave = window.confirm('Discard unsaved Auto-Paint ruleset changes?')
      if (!leave) return
    }
    onBack?.()
  }

  const onSave = async () => {
    if (!canSave) {
      const message = 'Auto-Paint rulesets save only in the Vite / Electron dev app.'
      setStatus(message)
      onStatus?.(message)
      return
    }
    setBusy(true)
    try {
      const result = await saveAutoPaintRuleset(draft)
      const next = cloneRuleset(result)
      setEpoch((value) => value + 1)
      setSelectedId(next.id)
      setDraft(next)
      setSaved(next)
      const message = `Saved Auto-Paint ruleset “${next.label}”.`
      setStatus(message)
      onStatus?.(message)
    } catch (error) {
      const message = String(error.message ?? error)
      setStatus(message)
      onStatus?.(message)
    } finally {
      setBusy(false)
    }
  }

  // Apply the on-screen draft in memory, generate into the open map, and switch to Map view.
  const generateMap = async () => {
    if (typeof onGenerateMap !== 'function') return
    if (dirty) {
      try {
        putAutoPaintRulesetLocal(draft)
        setSaved(cloneRuleset(draft))
      } catch (error) {
        const message = String(error.message ?? error)
        setStatus(message)
        onStatus?.(message)
        return
      }
    }
    setBusy(true)
    try {
      const ok = await onGenerateMap(selectedId)
      if (!ok) return
      setViewMode('map')
      const label = draft.label || selectedId
      const message = `Generated Auto-Paint map (${label}). Still in Ruleset Editor — Back to Map when done.`
      setStatus(message)
      onStatus?.(message)
    } finally {
      setBusy(false)
    }
  }

  // Same live Template Pieces catalogue as Dev Edit Assets (templatePieces.json via templatePieceGroups).
  const templateEpoch = templatePieceCatalogueEpochOf()
  const templateItems = useMemo(
    () => editorTemplatePaletteItems({ includeDimension: showAll }),
    [showAll, templateEpoch],
  )

  // Role options: tiles that Template Pieces resolve to, plus (Show all) Starship wall tiles for larger walls.
  const roleTiles = useMemo(() => {
    const byId = new Map()
    for (const item of templateItems) {
      const tileId = resolveAutoPaintTileId(item.id)
      const tile = tileId ? getTile(tileId) : null
      if (tile) byId.set(tile.id, tile)
    }
    // Always allow the Template 32 placement tiles and doorway/floor.
    for (const id of ['wall32', 'wall32Corner', 'floor', 'doorway', 'grating']) {
      const tile = getTile(id)
      if (tile) byId.set(tile.id, tile)
    }
    if (showAll) {
      for (const tile of starshipWallTiles()) byId.set(tile.id, tile)
      for (const tile of TILES) {
        if (!tile.wall && !tile.solid && !tile.empty) byId.set(tile.id, tile)
      }
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [templateItems, showAll])

  const emptyHint = showAll
    ? 'No matching assets.'
    : 'Drop a Template Piece from the palette (same catalogue as Dev Edit Assets).'

  const tileOptions = (field, value) => withSelectedTiles(roleTiles.filter(field.filter), value)

  const paletteItems = useMemo(() => {
    if (!showAll) return templateItems
    // Show all: Template Pieces + Starship wall tiles (larger walls) — still one Dev Edit tileset + one Template file.
    const tiles = starshipWallTiles().map((tile) => ({
      kind: 'tile',
      id: tile.id,
      label: tile.label,
      layer: layerOfTile(tile),
    }))
    const seen = new Set(templateItems.map((item) => `${item.kind}:${item.id}`))
    const out = [...templateItems]
    for (const item of tiles) {
      const key = `${item.kind}:${item.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
    return out
  }, [templateItems, showAll])

  const resolveDropToTile = (asset) => {
    if (!asset) return null
    return resolveAutoPaintTileId(asset.kind === 'tile' || asset.kind === 'piece' ? asset.id : null)
  }

  const onRoleChange = (patchFn) => (id) => {
    const resolved = resolveAutoPaintTileId(id) || id
    patchFn(resolved)
  }

  const loadFromDisk = async () => {
    if (dirty) {
      const leave = window.confirm('Discard unsaved Auto-Paint ruleset changes and reload from disk?')
      if (!leave) return
    }
    setBusy(true)
    try {
      await reloadAutoPaintRulesetsFromDisk()
      setEpoch((value) => value + 1)
      const next = cloneRuleset(getAutoPaintRuleset(selectedId) ?? listAutoPaintRulesets()[0])
      setSelectedId(next.id)
      setDraft(next)
      setSaved(next)
      const message = `Loaded Auto-Paint rulesets from disk (“${next.label}”).`
      setStatus(message)
      onStatus?.(message)
    } catch (error) {
      const message = String(error.message ?? error)
      setStatus(message)
      onStatus?.(message)
    } finally {
      setBusy(false)
    }
  }

  const onMenuAction = (id) => {
    if (id === 'save') return onSave()
    if (id === 'load') return loadFromDisk()
    if (id === 'revert') return revert()
    if (id === 'generateMap') return generateMap()
    if (id === 'back') return discardAndBack()
    return undefined
  }

  return (
    <EditorSubScreen
      title="Auto-Paint Ruleset Editor"
      className="ap-ruleset-editor"
      menus={subEditorFileMenus({
        load: true,
        save: true,
        revert: true,
        loadLabel: 'Load from Disk',
        saveLabel: 'Save Ruleset',
        extraFileItems: [{ id: 'generateMap', label: 'Generate Map' }],
      })}
      onMenuAction={onMenuAction}
      toolbar={
        <>
          <button type="button" className="me-button" onClick={discardAndBack}>
            {dirty ? 'Back (discard)' : 'Back to Map'}
          </button>
          <button
            type="button"
            className={`me-button${viewMode === 'rules' ? ' is-on' : ''}`}
            aria-pressed={viewMode === 'rules'}
            onClick={() => setViewMode('rules')}
          >
            Rules
          </button>
          <button
            type="button"
            className={`me-button${viewMode === 'map' ? ' is-on' : ''}`}
            aria-pressed={viewMode === 'map'}
            disabled={!map}
            title={map ? 'Show the open map board' : 'Generate a map first'}
            onClick={() => setViewMode('map')}
          >
            Map
          </button>
          <button type="button" className="me-button" disabled={!canSave || !dirty || busy} onClick={onSave}>
            Save
          </button>
          <button type="button" className="me-button" disabled={!dirty || busy} onClick={revert}>
            Revert
          </button>
          <button
            type="button"
            className="me-button"
            disabled={busy || typeof onGenerateMap !== 'function'}
            title="Build an Auto-Paint map and show it in Map view."
            onClick={generateMap}
          >
            Generate Map
          </button>
          <button
            type="button"
            className={`me-button${showAll ? ' is-on' : ''}`}
            onClick={() => setShowAll((value) => !value)}
            title={showAll ? 'Template Pieces only (Dev Edit catalogue).' : 'Also show Starship wall tiles for larger walls.'}
          >
            {showAll ? 'Template Pieces only' : 'Show all'}
          </button>
          <button
            type="button"
            className={`me-button${showGrid ? ' is-on' : ''}`}
            aria-pressed={showGrid}
            title="Show the guide grid overlay"
            onClick={() => onShowGrid?.(!showGrid)}
          >
            Grid
          </button>
          <EditorSelect
            className="me-select ed-grid-select"
            value={gridSize}
            aria-label="Grid size"
            title="Grid spacing in world pixels"
            disabled={!showGrid}
            onChange={(event) => onGridSize?.(Number(event.target.value))}
          >
            {EDITOR_GRID_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </EditorSelect>
          <button
            type="button"
            className="me-button ed-icon-btn"
            title="Grid options"
            aria-label="Grid options"
            onClick={() => setShowGridOptions(true)}
          >
            <svg className="ed-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6.2 1.2h3.6l.3 1.6a4.8 4.8 0 0 1 1.2.7l1.5-.6 1.8 3.1-1.2 1.1c.1.4.1.7.1 1.1s0 .7-.1 1.1l1.2 1.1-1.8 3.1-1.5-.6a4.8 4.8 0 0 1-1.2.7l-.3 1.6H6.2l-.3-1.6a4.8 4.8 0 0 1-1.2-.7l-1.5.6L1.4 10l1.2-1.1A4.5 4.5 0 0 1 2.5 8c0-.4 0-.7.1-1.1L1.4 5.8l1.8-3.1 1.5.6a4.8 4.8 0 0 1 1.2-.7l.3-1.6ZM8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5Z"
              />
            </svg>
          </button>
          <span className="me-text">
            {status ||
              (showingMap
                ? `${map?.name || 'Untitled map'} · Grid ${gridSize}px`
                : `${templateItems.length} Template Pieces from templatePieces.json (same as Dev Edit Assets).`)}
            {!canSave && !showingMap && ' Dev server required to save.'}
          </span>
        </>
      }
    >
      <div className="ge-left-rail">
        <div className="ge-generator-pick">
          <span className="ce-field-label">Ruleset</span>
          <EditorSelect
            className="me-select me-wide"
            value={selectedId}
            aria-label="Ruleset"
            onChange={(event) => openRuleset(event.target.value)}
          >
            {rulesets.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id === selectedId && dirty ? `${entry.label} (unsaved)` : entry.label}
              </option>
            ))}
          </EditorSelect>
        </div>
        <label className="me-field">
          <span className="ce-field-label">Label</span>
          <input
            className="me-name"
            value={draft.label}
            onChange={(event) => patch({ label: event.target.value })}
          />
        </label>
        <label className="me-field">
          <span className="ce-field-label">Environment</span>
          <EditorSelect
            className="me-select me-wide"
            value={draft.environment}
            aria-label="Environment"
            onChange={(event) => patch({ environment: event.target.value })}
          >
            {AUTO_PAINT_ENVIRONMENTS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </EditorSelect>
        </label>
        <GeSourcePalette
          title="Palette"
          hint="Same Template Pieces catalogue as Dev Edit Assets. Layer tabs. Drops resolve to wall/floor tiles for placement."
          items={paletteItems}
        />
      </div>

      {showingMap ? (
        <div className="me-board-area ap-ruleset-board-area">
          <div className="ed-viewport-title">{map.name || 'Untitled map'}</div>
          <EditorBoard
            key={boardKey}
            map={map}
            showGrid={showGrid}
            gridSize={gridSize}
            showBounds={showBounds}
            showCentre={showCentre}
          />
        </div>
      ) : (
        <div className="oe-detail oe-wide">
          <div className="ce-inspector">
            <p className="ce-heading">{draft.label}</p>
            <p className="ge-lead">
              One catalogue: <strong>templatePieces.json</strong> (Dev Edit → Template Pieces). Auto-Paint places the
              matching wall <em>tiles</em> (`wall32` / …). Show all adds Starship wall tiles for larger walls.
            </p>

            <section className="ge-block">
              <h3 className="ge-block-title">1. Floors</h3>
              <p className="ge-block-hint">Drag a Template floor piece (or Show all → floor tile) onto the slot.</p>
              <TileSpritePicker
                label={FLOOR_FIELD.label}
                options={tileOptions(FLOOR_FIELD, draft.floors.defaultTile)}
                value={resolveAutoPaintTileId(draft.floors.defaultTile) ?? draft.floors.defaultTile}
                emptyText={emptyHint}
                resolveDropId={resolveDropToTile}
                onChange={onRoleChange((id) => patchFloors({ defaultTile: id }))}
              />
            </section>

            <section className="ge-block">
              <h3 className="ge-block-title">2. Walls / Structure</h3>
              <p className="ge-block-hint">
                Drag Template wall pieces here. Default Template 32 → Bulkhead 32 tiles. Show all to pick a full bulkhead.
              </p>
              {WALL_TILE_FIELDS.map((field) => (
                <TileSpritePicker
                  key={field.key}
                  label={field.label}
                  options={tileOptions(WALL_FIELD, draft.walls[field.key] ?? null)}
                  value={resolveAutoPaintTileId(draft.walls[field.key]) ?? draft.walls[field.key] ?? null}
                  allowNone={!field.required}
                  emptyText={emptyHint}
                  resolveDropId={resolveDropToTile}
                  onChange={onRoleChange((id) => patchWalls({ [field.key]: id }))}
                />
              ))}
            </section>

            <section className="ge-block">
              <h3 className="ge-block-title">3. Doors / Openings</h3>
              <p className="ge-block-hint">Doorway tile for openings (generation not yet).</p>
              <TileSpritePicker
                label={DOOR_TILE_FIELD.label}
                options={tileOptions(DOOR_TILE_FIELD, draft.doors.underlayTile)}
                value={resolveAutoPaintTileId(draft.doors.underlayTile) ?? draft.doors.underlayTile}
                emptyText={emptyHint}
                resolveDropId={resolveDropToTile}
                onChange={onRoleChange((id) => patchDoors({ underlayTile: id }))}
              />
            </section>
          </div>
        </div>
      )}
      <EditorGridOptions
        show={showGridOptions}
        onClose={() => setShowGridOptions(false)}
        showGrid={showGrid}
        onShowGrid={onShowGrid}
        gridSize={gridSize}
        onGridSize={onGridSize}
        showBounds={showBounds}
        onShowBounds={onShowBounds}
        showCentre={showCentre}
        onShowCentre={onShowCentre}
      />
    </EditorSubScreen>
  )
}
