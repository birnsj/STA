import { useMemo, useState } from 'react'
import EditorSubScreen from '../components/maps/EditorSubScreen.jsx'
import TileSpritePicker from '../components/maps/TileSpritePicker.jsx'
import { canEditDeckGenerators, saveDeckGeneratorStyle } from '../maps/deckGeneratorFiles.js'
import { DECK_GENERATOR_META, getDeckStyle, setDeckStyleLocal } from '../maps/generators/deckStyles.js'
import {
  emptyWallVariantSet,
  getWallVariantDraft,
  setWallVariantSetLocal,
  wallVariantEqual,
} from '../maps/generators/wallVariantStyles.js'
import { getTile, PALETTE_GROUPS, TILES } from '../maps/mapFormat.js'
import { canEditWallVariants, saveWallVariantSet } from '../maps/wallVariantFiles.js'

// Dev Generator Editor: sprite pickers default to the Location palette (+ tiles on the open map); Show all = catalogue.
const PALETTE_BY_DECK = {
  starshipDeck: ['starship'],
  laboratory: ['laboratory'],
  alienVessel: ['alienVessel'],
}

// Step 1 — one tile for each Generate Map role.
const ROOM_FIELDS = [
  { key: 'floor', label: 'Floor', filter: (tile) => !tile.wall && !tile.solid },
  { key: 'door', label: 'Door', filter: () => true },
  { key: 'crate', label: 'Crate / prop', filter: (tile) => !tile.wall },
  { key: 'machinery', label: 'Machinery / console', filter: (tile) => !tile.wall },
]

const WALL_FIELD = { key: 'wall', label: 'Plain wall', filter: (tile) => Boolean(tile.wall) }
const CORNER_FIELD = { key: 'corner', label: 'Corner piece', filter: (tile) => Boolean(tile.wall) }

function styleEqual(a, b) {
  if (!a || !b) return false
  if (Boolean(a.hazard) !== Boolean(b.hazard)) return false
  if ((a.corner ?? null) !== (b.corner ?? null)) return false
  return ['floor', 'wall', 'door', 'crate', 'machinery'].every((key) => a[key] === b[key])
}

function initialVariantDrafts(styles) {
  const out = {}
  for (const style of Object.values(styles)) {
    const wall = style.wall
    if (wall && !out[wall]) out[wall] = getWallVariantDraft(wall)
  }
  return out
}

function tilesOnMap(map) {
  const ids = new Set()
  for (const row of map?.tiles ?? []) {
    for (const id of row) {
      if (id) ids.add(id)
    }
  }
  return ids
}

function paletteTileIds(deckId) {
  const groupIds = PALETTE_BY_DECK[deckId] ?? []
  const ids = new Set()
  for (const groupId of groupIds) {
    const group = PALETTE_GROUPS.find((entry) => entry.id === groupId)
    for (const id of group?.tiles ?? []) ids.add(id)
  }
  return ids
}

function withSelected(options, value, multi) {
  const list = [...options]
  const ids = new Set(list.map((tile) => tile.id))
  const add = (id) => {
    if (!id || ids.has(id)) return
    ids.add(id)
    list.push(getTile(id))
  }
  if (multi) (value ?? []).forEach(add)
  else add(value)
  return list.sort((a, b) => a.label.localeCompare(b.label))
}

function locationDirty(draft, saved, variantDrafts, variantSaved) {
  if (!styleEqual(draft, saved)) return true
  const wall = draft?.wall
  if (!wall) return false
  return !wallVariantEqual(variantDrafts[wall] ?? emptyWallVariantSet(), variantSaved[wall] ?? emptyWallVariantSet())
}

export default function GeneratorEditorScreen({ map = null, mapType = null, onBack, onPreview }) {
  const [selectedId, setSelectedId] = useState(DECK_GENERATOR_META[0].id)
  const [drafts, setDrafts] = useState(() => Object.fromEntries(DECK_GENERATOR_META.map(({ id }) => [id, getDeckStyle(id)])))
  const [saved, setSaved] = useState(() => Object.fromEntries(DECK_GENERATOR_META.map(({ id }) => [id, getDeckStyle(id)])))
  const [variantDrafts, setVariantDrafts] = useState(() =>
    initialVariantDrafts(Object.fromEntries(DECK_GENERATOR_META.map(({ id }) => [id, getDeckStyle(id)]))),
  )
  const [variantSaved, setVariantSaved] = useState(() =>
    initialVariantDrafts(Object.fromEntries(DECK_GENERATOR_META.map(({ id }) => [id, getDeckStyle(id)]))),
  )
  const [status, setStatus] = useState('')
  const [showAllTiles, setShowAllTiles] = useState(false)
  const [cornerOn, setCornerOn] = useState(() => Boolean(getDeckStyle(DECK_GENERATOR_META[0].id).corner))
  const [variantsOn, setVariantsOn] = useState(() => {
    const wall = getDeckStyle(DECK_GENERATOR_META[0].id).wall
    const set = getWallVariantDraft(wall)
    return set.panelVariants.length > 0 || set.tileVariants.length > 0
  })

  const draft = drafts[selectedId]
  const wallId = draft.wall
  const wallLabel = wallId ? getTile(wallId).label : '—'
  const variantDraft = variantDrafts[wallId] ?? emptyWallVariantSet()
  const variantSavedForWall = variantSaved[wallId] ?? emptyWallVariantSet()
  const effectiveStyle = { ...draft, corner: cornerOn ? draft.corner : null }
  const effectiveVariants = variantsOn
    ? variantDraft
    : { share: variantSavedForWall.share, panelVariants: [], tileVariants: [] }
  const styleDirty = !styleEqual(effectiveStyle, saved[selectedId])
  const variantDirty = Boolean(wallId) && !wallVariantEqual(effectiveVariants, variantSavedForWall)
  const dirty = styleDirty || variantDirty
  const canPreview = typeof onPreview === 'function' && mapType === selectedId
  const canSave = canEditDeckGenerators || canEditWallVariants
  const sharePct = Math.round(clampShare(variantDraft.share) * 100)

  const mapTileIds = useMemo(() => tilesOnMap(map), [map])
  const locationTileIds = useMemo(() => {
    const ids = paletteTileIds(selectedId)
    for (const id of mapTileIds) ids.add(id)
    return ids
  }, [selectedId, mapTileIds])
  const sortedTiles = useMemo(() => [...TILES].sort((a, b) => a.label.localeCompare(b.label)), [])
  const locationTiles = useMemo(
    () => sortedTiles.filter((tile) => locationTileIds.has(tile.id)),
    [sortedTiles, locationTileIds],
  )
  const catalogue = showAllTiles ? sortedTiles : locationTiles
  const emptyHint = showAllTiles ? 'No matching tiles.' : 'None in this Location — turn on Show all.'

  const optionsFor = (field, value, multi = false) => withSelected(catalogue.filter(field.filter), value, multi)
  const wallOptions = (value, multi = false) => withSelected(catalogue.filter((tile) => tile.wall), value, multi)
  const panelOptions = (value) => withSelected(wallOptions(value, true).filter((tile) => tile.panels), value, true)
  const loneWallOptions = (value) =>
    withSelected(
      wallOptions(value, true).filter((tile) => !tile.panels && tile.id !== wallId),
      value,
      true,
    )

  const ensureVariantDraft = (id) => {
    if (!id) return
    setVariantDrafts((current) => (current[id] ? current : { ...current, [id]: getWallVariantDraft(id) }))
    setVariantSaved((current) => (current[id] ? current : { ...current, [id]: getWallVariantDraft(id) }))
  }

  const setField = (key, value) => {
    if (key === 'wall') ensureVariantDraft(value)
    setDrafts((current) => ({ ...current, [selectedId]: { ...current[selectedId], [key]: value } }))
  }

  const setVariantField = (key, value) => {
    if (!wallId) return
    setVariantDrafts((current) => ({
      ...current,
      [wallId]: { ...(current[wallId] ?? emptyWallVariantSet()), [key]: value },
    }))
  }

  const save = async () => {
    try {
      const messages = []
      if (styleDirty) {
        const result = await saveDeckGeneratorStyle({ id: selectedId, ...effectiveStyle })
        setSaved((current) => ({ ...current, [selectedId]: result }))
        setDrafts((current) => ({ ...current, [selectedId]: result }))
        setCornerOn(Boolean(result.corner))
        messages.push('deck style')
      }
      if (variantDirty && wallId) {
        const result = await saveWallVariantSet({ wallId, ...effectiveVariants })
        setVariantSaved((current) => ({
          ...current,
          [wallId]: { share: result.share, panelVariants: result.panelVariants, tileVariants: result.tileVariants },
        }))
        setVariantDrafts((current) => ({
          ...current,
          [wallId]: { share: result.share, panelVariants: result.panelVariants, tileVariants: result.tileVariants },
        }))
        setVariantsOn(result.panelVariants.length > 0 || result.tileVariants.length > 0)
        messages.push('wall variety')
      }
      setStatus(messages.length ? `Saved ${messages.join(' and ')}.` : 'Nothing to save.')
    } catch (error) {
      setStatus(`Could not save: ${error.message}`)
    }
  }

  const revert = () => {
    setDeckStyleLocal(selectedId, saved[selectedId])
    setDrafts((current) => ({ ...current, [selectedId]: { ...saved[selectedId] } }))
    setCornerOn(Boolean(saved[selectedId]?.corner))
    if (wallId) {
      setWallVariantSetLocal(wallId, variantSavedForWall)
      setVariantDrafts((current) => ({ ...current, [wallId]: { ...variantSavedForWall } }))
      setVariantsOn(variantSavedForWall.panelVariants.length > 0 || variantSavedForWall.tileVariants.length > 0)
    }
    setStatus('')
  }

  const discardAndBack = () => {
    for (const { id } of DECK_GENERATOR_META) {
      if (!styleEqual(drafts[id], saved[id])) setDeckStyleLocal(id, saved[id])
    }
    for (const [id, draftSet] of Object.entries(variantDrafts)) {
      const savedSet = variantSaved[id] ?? emptyWallVariantSet()
      if (!wallVariantEqual(draftSet, savedSet)) setWallVariantSetLocal(id, savedSet)
    }
    onBack()
  }

  const preview = () => {
    setDeckStyleLocal(selectedId, effectiveStyle)
    if (wallId) setWallVariantSetLocal(wallId, effectiveVariants)
    onPreview?.(selectedId)
  }

  const selectLocation = (id) => {
    setSelectedId(id)
    ensureVariantDraft(drafts[id]?.wall)
    setCornerOn(Boolean(drafts[id]?.corner))
    const wall = drafts[id]?.wall
    const set = variantDrafts[wall] ?? getWallVariantDraft(wall)
    setVariantsOn(set.panelVariants.length > 0 || set.tileVariants.length > 0)
  }

  const toggleCorner = (on) => {
    setCornerOn(on)
    if (!on) setField('corner', null)
    else if (!draft.corner) {
      const first = optionsFor(CORNER_FIELD, null)[0]
      if (first) setField('corner', first.id)
    }
  }

  const selectedLabel = DECK_GENERATOR_META.find((entry) => entry.id === selectedId)?.label

  return (
    <EditorSubScreen
      title="Generator Editor"
      toolbar={
        <>
          <button type="button" className="me-button" onClick={discardAndBack}>
            {dirty ? 'Back (discard)' : 'Back to Map'}
          </button>
          <button type="button" className="me-button" disabled={!canSave || !dirty} onClick={save}>
            Save
          </button>
          <button type="button" className="me-button" disabled={!dirty} onClick={revert}>
            Revert
          </button>
          <button
            type="button"
            className="me-button"
            disabled={!canPreview}
            title={
              canPreview
                ? 'Run Generate Map on the open document with these settings.'
                : 'Open a map whose Location matches the selected deck (left list).'
            }
            onClick={preview}
          >
            Preview Generate Map
          </button>
          <button
            type="button"
            className={`me-button${showAllTiles ? ' is-on' : ''}`}
            onClick={() => setShowAllTiles((value) => !value)}
            title={showAllTiles ? 'Limit lists to this Location’s palette + open map.' : 'Show every tile in the game.'}
          >
            {showAllTiles ? 'Location tiles only' : 'Show all tiles'}
          </button>
          <span className="me-text">
            {status || (showAllTiles ? 'Full tile catalogue.' : `${locationTiles.length} Location tiles.`)}
            {!canSave && ' Dev server required to save.'}
          </span>
        </>
      }
    >
      <div className="oe-list">
        {DECK_GENERATOR_META.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`oe-item${id === selectedId ? ' is-selected' : ''}`}
            onClick={() => selectLocation(id)}
          >
            <span className="oe-item-title">{label}</span>
            <span className="oe-item-meta">
              {(id === selectedId ? dirty : locationDirty(drafts[id], saved[id], variantDrafts, variantSaved))
                ? 'unsaved'
                : 'saved'}
              {mapType === id ? ' · open map' : ''}
            </span>
          </button>
        ))}
      </div>

      <div className="oe-detail oe-wide">
        <div className="ce-inspector">
          <p className="ce-heading">{selectedLabel}</p>
          <p className="ge-lead">
            These tiles are what <strong>Generate Map</strong> paints for this Location. Pick the basics first, then turn
            on any wall extras you want.
          </p>

          <section className="ge-block">
            <h3 className="ge-block-title">1. Room tiles</h3>
            <p className="ge-block-hint">One sprite for each role. Click to select.</p>
            {ROOM_FIELDS.map((field) => (
              <TileSpritePicker
                key={field.key}
                label={field.label}
                options={optionsFor(field, draft[field.key] ?? null)}
                value={draft[field.key] ?? null}
                emptyText={emptyHint}
                onChange={(id) => setField(field.key, id)}
              />
            ))}
            <label className="ge-section-check">
              <input
                type="checkbox"
                checked={Boolean(draft.hazard)}
                onChange={(event) => setField('hazard', event.target.checked)}
              />
              Place an EPS grating hazard somewhere on the floor
            </label>
          </section>

          <section className="ge-block">
            <h3 className="ge-block-title">2. Walls</h3>
            <p className="ge-block-hint">
              Most wall cells use the plain wall. Optional extras below swap some of those cells for corners or fittings.
            </p>
            <TileSpritePicker
              label={WALL_FIELD.label}
              options={optionsFor(WALL_FIELD, draft.wall ?? null)}
              value={draft.wall ?? null}
              emptyText={emptyHint}
              onChange={(id) => setField('wall', id)}
            />

            <div className="ge-option">
              <label className="ge-section-check">
                <input type="checkbox" checked={cornerOn} onChange={(event) => toggleCorner(event.target.checked)} />
                Use a different tile at wall corners
              </label>
              {cornerOn && (
                <TileSpritePicker
                  label="Corner tile"
                  hint="Used wherever two wall runs meet (L, T, and crosses)."
                  options={optionsFor(CORNER_FIELD, draft.corner ?? null)}
                  value={draft.corner ?? null}
                  emptyText={emptyHint}
                  onChange={(id) => setField('corner', id)}
                />
              )}
            </div>

            <div className="ge-option">
              <label className="ge-section-check">
                <input
                  type="checkbox"
                  checked={variantsOn}
                  disabled={!wallId}
                  onChange={(event) => setVariantsOn(event.target.checked)}
                />
                Mix other wall tiles into long runs (variety)
              </label>
              {variantsOn && wallId && (
                <div className="ge-option-body">
                  <p className="ge-block-hint">
                    Checked tiles can replace plain <strong>{wallLabel}</strong>. Long fittings cover two cells in a
                    straight run; short fittings cover one cell.
                  </p>
                  <label className="ge-share">
                    <span className="ce-field-label">Chance to use a fitting instead of plain wall</span>
                    <div className="ge-share-row">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={sharePct}
                        onChange={(event) => setVariantField('share', Number(event.target.value) / 100)}
                      />
                      <span className="ge-share-pct">{sharePct}%</span>
                    </div>
                  </label>
                  <TileSpritePicker
                    label="Long fittings (2 tiles)"
                    options={panelOptions(variantDraft.panelVariants)}
                    value={variantDraft.panelVariants}
                    multi
                    emptyText={emptyHint}
                    onChange={(ids) => setVariantField('panelVariants', ids)}
                  />
                  <TileSpritePicker
                    label="Short fittings (1 tile)"
                    options={loneWallOptions(variantDraft.tileVariants)}
                    value={variantDraft.tileVariants}
                    multi
                    emptyText={emptyHint}
                    onChange={(ids) => setVariantField('tileVariants', ids)}
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </EditorSubScreen>
  )
}

function clampShare(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}
