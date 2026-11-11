import { useMemo, useState } from 'react'
import EditorSelect from '../components/maps/EditorSelect.jsx'
import EditorSubScreen from '../components/maps/EditorSubScreen.jsx'
import GeSourcePalette from '../components/maps/GeSourcePalette.jsx'
import TemplatePieceSpritePicker from '../components/maps/TemplatePieceSpritePicker.jsx'
import TileSpritePicker from '../components/maps/TileSpritePicker.jsx'
import {
  AUTO_PAINT_ENVIRONMENTS,
  getAutoPaintRuleset,
  listAutoPaintRulesets,
  resolveAutoPaintRuleset,
} from '../maps/autoPaint/rulesets.js'
import { canEditAutoPaintRulesets, saveAutoPaintRuleset } from '../maps/autoPaintFiles.js'
import { getTile, PALETTE_GROUPS, TILES } from '../maps/mapFormat.js'
import { TEMPLATE_PIECES } from '../maps/templatePieces.js'

// Tools → Auto-Paint Ruleset Editor. UI matches Generator Editor (palette + sprite slots).
// Independent of Generate Map / Generator Editor data paths.

const ENV_TILE_GROUPS = {
  starshipStation: ['starship'],
  indoorBuilding: ['settlement', 'laboratory', 'detention', 'cantina'],
  outdoorSettlement: ['settlement', 'city', 'farm', 'landingField'],
  naturalTerrain: [
    'forest',
    'swamp',
    'desert',
    'iceField',
    'volcanic',
    'jungle',
    'grassland',
    'tundra',
    'coast',
    'mountains',
    'geothermal',
  ],
}

const FLOOR_FIELD = {
  key: 'defaultTile',
  label: 'Default floor tile',
  filter: (tile) => !tile.wall && !tile.solid && !tile.empty,
}

const UNDERLAY_FIELD = {
  key: 'underlayWallTile',
  label: 'Wall underlay tile',
  filter: (tile) => Boolean(tile.wall) || tile.id === 'templateWall',
}

const DOOR_TILE_FIELD = {
  key: 'underlayTile',
  label: 'Doorway underlay tile',
  filter: () => true,
}

const WALL_PIECE_FIELDS = [
  { key: 'straight', label: 'Straight wall (64×32)' },
  { key: 'straightLong', label: 'Long straight (128×32)' },
  { key: 'corner', label: 'Corner post (32×32)' },
  { key: 'hull', label: 'Hull straight' },
  { key: 'hullLong', label: 'Hull long' },
  { key: 'hullCorner', label: 'Hull corner' },
]

const DOOR_PIECE_FIELD = { key: 'doorFrame', label: 'Door frame' }

function cloneRuleset(ruleset) {
  return resolveAutoPaintRuleset(structuredClone(ruleset))
}

function rulesetEqual(a, b) {
  return JSON.stringify(resolveAutoPaintRuleset(a)) === JSON.stringify(resolveAutoPaintRuleset(b))
}

function tileIdsForEnvironment(environment) {
  const groupIds = ENV_TILE_GROUPS[environment] ?? []
  const ids = new Set()
  for (const groupId of groupIds) {
    const group = PALETTE_GROUPS.find((entry) => entry.id === groupId)
    for (const id of group?.tiles ?? []) ids.add(id)
  }
  return ids
}

function piecesForEnvironment(environment) {
  if (environment === 'starshipStation') {
    return TEMPLATE_PIECES.filter((piece) => (piece.tags ?? []).includes('starship'))
  }
  // Other environments: only pieces explicitly tagged for that setting. Empty is allowed —
  // Show all is the explicit way to browse unrelated assets (no silent fallback to all walls).
  if (environment === 'indoorBuilding') {
    return TEMPLATE_PIECES.filter((piece) => (piece.tags ?? []).includes('indoor') || (piece.tags ?? []).includes('settlement'))
  }
  if (environment === 'outdoorSettlement') {
    return TEMPLATE_PIECES.filter((piece) => (piece.tags ?? []).includes('outdoor') || (piece.tags ?? []).includes('settlement'))
  }
  if (environment === 'naturalTerrain') {
    return TEMPLATE_PIECES.filter((piece) => (piece.tags ?? []).includes('terrain') || (piece.tags ?? []).includes('natural'))
  }
  return []
}

function withSelectedTiles(options, value, multi = false) {
  const list = [...options]
  const ids = new Set(list.map((tile) => tile.id))
  const add = (id) => {
    if (!id || ids.has(id)) return
    const tile = getTile(id)
    if (!tile) return
    ids.add(id)
    list.push(tile)
  }
  if (multi) (value ?? []).forEach(add)
  else add(value)
  return list.sort((a, b) => a.label.localeCompare(b.label))
}

function withSelectedPieces(options, value, multi = false) {
  const list = [...options]
  const ids = new Set(list.map((piece) => piece.id))
  const add = (id) => {
    if (!id || ids.has(id)) return
    const piece = TEMPLATE_PIECES.find((entry) => entry.id === id)
    if (!piece) return
    ids.add(id)
    list.push(piece)
  }
  if (multi) (value ?? []).forEach(add)
  else add(value)
  return list
}

function filterPiecesForRole(pool, fieldKey) {
  const isHull = (piece) => (piece.tags ?? []).includes('hull') || String(piece.id).includes('Hull')
  return pool.filter((piece) => {
    if (fieldKey === 'hullCorner') return isHull(piece) && (piece.tags ?? []).includes('corner')
    if (fieldKey === 'hullLong') return isHull(piece) && (piece.tags ?? []).includes('long')
    if (fieldKey === 'hull') return isHull(piece) && (piece.tags ?? []).includes('straight') && !(piece.tags ?? []).includes('long')
    if (fieldKey === 'straightLong') return !isHull(piece) && (piece.tags ?? []).includes('long')
    if (fieldKey === 'corner') return !isHull(piece) && (piece.tags ?? []).includes('corner')
    if (fieldKey === 'doorFrame') return (piece.tags ?? []).includes('door')
    if (fieldKey === 'straight') {
      return (
        !isHull(piece) &&
        (piece.tags ?? []).includes('straight') &&
        !(piece.tags ?? []).includes('long') &&
        !(piece.tags ?? []).includes('door')
      )
    }
    return false
  })
}

export default function AutoPaintRulesetEditorScreen({ onBack, onStatus }) {
  const [epoch, setEpoch] = useState(0)
  // epoch bumps after Save so the ruleset dropdown re-reads the live catalogue.
  const rulesets = listAutoPaintRulesets()
  void epoch
  const [selectedId, setSelectedId] = useState(rulesets[0]?.id ?? 'starship-interior-default')
  const initial = cloneRuleset(getAutoPaintRuleset(selectedId) ?? rulesets[0])
  const [draft, setDraft] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [showAll, setShowAll] = useState(false)

  const dirty = !rulesetEqual(draft, saved)
  const canSave = canEditAutoPaintRulesets

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

  // Preserve unexposed fields (fittings, fittingChance, door minGap/preferOpenings, props, variants, wallMode).
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
      // Pass full draft so fittings / probabilities / door flags round-trip.
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

  const sortedTiles = useMemo(() => [...TILES].sort((a, b) => a.label.localeCompare(b.label)), [])
  const envTileIds = useMemo(() => tileIdsForEnvironment(draft.environment), [draft.environment])
  const envTiles = useMemo(
    () => sortedTiles.filter((tile) => envTileIds.has(tile.id)),
    [sortedTiles, envTileIds],
  )
  const envPieces = useMemo(() => piecesForEnvironment(draft.environment), [draft.environment])
  const catalogueTiles = showAll ? sortedTiles : envTiles
  const cataloguePieces = showAll ? TEMPLATE_PIECES : envPieces
  const emptyHint = showAll ? 'No matching assets.' : 'None for this environment — turn on Show all.'

  const tileOptions = (field, value) => withSelectedTiles(catalogueTiles.filter(field.filter), value)
  const pieceOptions = (fieldKey, value) =>
    withSelectedPieces(filterPiecesForRole(cataloguePieces, fieldKey), value)

  const paletteItems = useMemo(() => {
    const tiles = catalogueTiles.map((tile) => ({ kind: 'tile', id: tile.id, label: tile.label }))
    const pieces = cataloguePieces.map((piece) => ({
      kind: 'piece',
      id: piece.id,
      label: piece.label,
      href: piece.href,
    }))
    return [...tiles, ...pieces]
  }, [catalogueTiles, cataloguePieces])

  return (
    <EditorSubScreen
      title="Auto-Paint Ruleset Editor"
      toolbar={
        <>
          <button type="button" className="me-button" onClick={discardAndBack}>
            {dirty ? 'Back (discard)' : 'Back to Map'}
          </button>
          <button type="button" className="me-button" disabled={!canSave || !dirty || busy} onClick={onSave}>
            Save
          </button>
          <button type="button" className="me-button" disabled={!dirty || busy} onClick={revert}>
            Revert
          </button>
          <button
            type="button"
            className={`me-button${showAll ? ' is-on' : ''}`}
            onClick={() => setShowAll((value) => !value)}
            title={showAll ? 'Limit palette to this environment’s assets.' : 'Show every tile and Template Piece.'}
          >
            {showAll ? 'Environment assets only' : 'Show all'}
          </button>
          <span className="me-text">
            {status ||
              (showAll
                ? 'Full catalogue. Drag from Palette onto a role slot. Right-click a selected asset to remove it.'
                : `${catalogueTiles.length} tiles · ${cataloguePieces.length} pieces for this environment. Drag onto a role slot.`)}
            {!canSave && ' Dev server required to save.'}
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
          hint="Drag onto a role slot. Role filters still apply."
          items={paletteItems}
        />
      </div>

      <div className="oe-detail oe-wide">
        <div className="ce-inspector">
          <p className="ce-heading">{draft.label}</p>
          <p className="ge-lead">
            <strong>Auto-Paint</strong> uses this ruleset when painting floor footprints and rebuilding walls. Wall mode:{' '}
            {draft.wallMode === 'templatePieces' ? 'Template Pieces (32px)' : draft.wallMode}.
          </p>

          <section className="ge-block">
            <h3 className="ge-block-title">1. Floors</h3>
            <p className="ge-block-hint">Drag a floor tile from the Palette into the slot. Right-click to remove.</p>
            <TileSpritePicker
              label={FLOOR_FIELD.label}
              options={tileOptions(FLOOR_FIELD, draft.floors.defaultTile)}
              value={draft.floors.defaultTile ?? null}
              emptyText={emptyHint}
              onChange={(id) => patchFloors({ defaultTile: id })}
            />
          </section>

          <section className="ge-block">
            <h3 className="ge-block-title">2. Walls / Structure</h3>
            <p className="ge-block-hint">
              Underlay is solid for pathing; Template Pieces are the visible 32px walls. Drag from the Palette.
            </p>
            <TileSpritePicker
              label={UNDERLAY_FIELD.label}
              options={tileOptions(UNDERLAY_FIELD, draft.underlayWallTile)}
              value={draft.underlayWallTile ?? null}
              emptyText={emptyHint}
              onChange={(id) => patch({ underlayWallTile: id })}
            />
            {WALL_PIECE_FIELDS.map((field) => (
              <TemplatePieceSpritePicker
                key={field.key}
                label={field.label}
                options={pieceOptions(field.key, draft.walls[field.key] ?? null)}
                value={draft.walls[field.key] ?? null}
                allowNone={!['straight', 'corner'].includes(field.key)}
                emptyText={emptyHint}
                onChange={(id) => patchWalls({ [field.key]: id })}
              />
            ))}
          </section>

          <section className="ge-block">
            <h3 className="ge-block-title">3. Doors / Openings</h3>
            <p className="ge-block-hint">Door underlay tile and frame piece. Other door settings stay on the ruleset when saving.</p>
            <TileSpritePicker
              label={DOOR_TILE_FIELD.label}
              options={tileOptions(DOOR_TILE_FIELD, draft.doors.underlayTile)}
              value={draft.doors.underlayTile ?? null}
              emptyText={emptyHint}
              onChange={(id) => patchDoors({ underlayTile: id })}
            />
            <TemplatePieceSpritePicker
              label={DOOR_PIECE_FIELD.label}
              options={pieceOptions(DOOR_PIECE_FIELD.key, draft.walls.doorFrame ?? null)}
              value={draft.walls.doorFrame ?? null}
              allowNone
              emptyText={emptyHint}
              onChange={(id) => patchWalls({ doorFrame: id })}
            />
          </section>
        </div>
      </div>
    </EditorSubScreen>
  )
}
