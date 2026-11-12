import { useMemo, useState } from 'react'
import { autoPaintRoleThumbTitle } from '../components/maps/assetThumbTitle.js'
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
  weightedIds,
} from '../maps/autoPaint/rulesets.js'
import { pieceIdForAutoPaintTile, resolveAutoPaintTileId } from '../maps/autoPaint/templatePalette.js'
import { normalizeWeightedEntries } from '../maps/generators/weightedChoice.js'
import { getTemplatePiece } from '../maps/templatePieces.js'
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
  { key: 'straight', label: 'Straight (64-long)', required: true },
  { key: 'straightLong', label: 'Straight long (128)', required: false },
  { key: 'corner', label: 'Corner (32×32)', required: true },
  { key: 'hull', label: 'Hull straight (optional)', required: false },
  { key: 'hullLong', label: 'Hull long (optional)', required: false },
  { key: 'hullCorner', label: 'Hull corner (optional)', required: false },
  { key: 'doorFrame', label: 'Door frame (optional)', required: false },
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

function withSelectedTiles(options, value) {
  const list = [...options]
  const ids = new Set(list.map((tile) => tile.id))
  const add = (id) => {
    if (!id || ids.has(id)) return
    // Keep Template Piece ids as display rows when the catalogue has no tile counterpart yet.
    if (getTemplatePiece(id)) {
      ids.add(id)
      list.push({ id, label: getTemplatePiece(id).label, __piece: getTemplatePiece(id) })
      return
    }
    const resolved = resolveAutoPaintTileId(id) || id
    const tile = getTile(resolved)
    if (!tile) return
    ids.add(tile.id)
    list.push(tile)
  }
  for (const id of weightedIds(value)) add(id)
  return list.sort((a, b) => a.label.localeCompare(b.label))
}

function mapWeightedRoleIds(entries) {
  return normalizeWeightedEntries(entries, { allowEmpty: true }).map((entry) => {
    if (getTemplatePiece(entry.id)) return entry
    return { id: resolveAutoPaintTileId(entry.id) || entry.id, weight: entry.weight }
  })
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

  // Keep Template Piece ids so Generate Map uses the exact piece from the slot (not a collapsed wall32).
  const resolveDropToRole = (asset) => {
    if (!asset) return null
    if (asset.kind === 'piece' && getTemplatePiece(asset.id)) return asset.id
    if (asset.kind === 'tile' || asset.kind === 'piece') return resolveAutoPaintTileId(asset.id)
    return null
  }

  const onWeightedRoleChange = (patchFn, { allowEmpty = false } = {}) => (entries) => {
    const next = mapWeightedRoleIds(entries)
    if (!next.length) {
      patchFn(allowEmpty ? null : next)
      return
    }
    patchFn(next)
  }

  const roleIdAllowed = (id) => Boolean(getTile(id) || getTemplatePiece(id) || resolveAutoPaintTileId(id))

  // Prefer Template Piece footprint (corner 32×32) over tile sprite size (often 64×128).
  const roleThumbTitle = (tile) => {
    const piece = tile?.__piece || getTemplatePiece(tile?.id) || getTemplatePiece(pieceIdForAutoPaintTile(tile?.id))
    const displayTile = tile?.__piece ? null : tile
    return autoPaintRoleThumbTitle(displayTile || getTile(resolveAutoPaintTileId(tile?.id)), piece, {
      extra: 'right-click to remove',
    })
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
              Drag Template Pieces into the roles. Hover shows <strong>footprint</strong> (corner = 32×32, straight 32 =
              64×32, long = 128×32) — not the tile sprite box. Template 32 Generate Map places those pieces tip-anchored.
              Show all adds Starship wall tiles for larger true cell walls.
            </p>

            <section className="ge-block">
              <h3 className="ge-block-title">1. Floors</h3>
              <p className="ge-block-hint">
                Drag Template floor pieces (or Show all → floor tiles) into the slot. Multiple allowed — mix % on each
                thumb. Right-click to remove.
              </p>
              <TileSpritePicker
                label={FLOOR_FIELD.label}
                options={tileOptions(FLOOR_FIELD, draft.floors.defaultTile)}
                value={draft.floors.defaultTile}
                multi
                weighted
                emptyText={emptyHint}
                resolveDropId={resolveDropToRole}
                acceptId={roleIdAllowed}
                titleForTile={roleThumbTitle}
                onChange={onWeightedRoleChange((entries) => patchFloors({ defaultTile: entries }))}
              />
            </section>

            <section className="ge-block">
              <h3 className="ge-block-title">2. Walls / Structure</h3>
              <p className="ge-block-hint">
                Drop Template Pieces into each role (multiple allowed). Mix % is relative among pieces in that role.
                Empty optional roles = rim uses straight/corner. Show all for full bulkhead tiles. Right-click to
                remove.
              </p>
              {WALL_TILE_FIELDS.map((field) => (
                <TileSpritePicker
                  key={field.key}
                  label={field.label}
                  options={tileOptions(WALL_FIELD, draft.walls[field.key] ?? [])}
                  value={draft.walls[field.key] ?? []}
                  multi
                  weighted
                  emptyText={emptyHint}
                  resolveDropId={resolveDropToRole}
                  acceptId={roleIdAllowed}
                  titleForTile={roleThumbTitle}
                  onChange={onWeightedRoleChange((entries) => patchWalls({ [field.key]: entries }), {
                    allowEmpty: !field.required,
                  })}
                />
              ))}
            </section>

            <section className="ge-block">
              <h3 className="ge-block-title">3. Doors / Openings</h3>
              <p className="ge-block-hint">Doorway tile(s) for openings — multiple allowed with mix %.</p>
              <TileSpritePicker
                label={DOOR_TILE_FIELD.label}
                options={tileOptions(DOOR_TILE_FIELD, draft.doors.underlayTile)}
                value={draft.doors.underlayTile}
                multi
                weighted
                emptyText={emptyHint}
                resolveDropId={resolveDropToRole}
                acceptId={roleIdAllowed}
                titleForTile={roleThumbTitle}
                onChange={onWeightedRoleChange((entries) => patchDoors({ underlayTile: entries }))}
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
