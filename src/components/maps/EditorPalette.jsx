import { useEffect, useMemo, useRef, useState } from 'react'
import { bustImage } from './canvasTiles.js'
import EditorContextMenu, { contextMenuPlacement } from './EditorContextMenu.jsx'
import {
  canEditTiles,
  createTile,
  deletePaletteGroup,
  deleteSection,
  deleteTile,
  importTileArt,
  putPaletteGroup,
  renameSection,
  renameTile,
  reorderPaletteGroups,
} from '../../maps/tileFiles.js'
import { getTile, PALETTE_GROUPS, TILES, tileCatalogueEpochOf } from '../../maps/mapFormat.js'
import { canEditTemplatePieces, deleteTemplatePiece } from '../../maps/templatePieceFiles.js'
import { templatePieceCatalogueEpochOf, templatePieceGroups } from '../../maps/templatePieces.js'
import { getCategoryName, getItems } from '../../rules/equipment.js'
import { propSpriteSize } from '../../rules/placement.js'
import { DESTRUCTIBLE_TYPES, destructibleTileId, HAZARD_TYPES } from '../../world/environment.js'
import { HAZARD_FRAMES, hazardStrip } from './environmentArt.js'
import { EDITOR_ITEM_DRAG_TYPE } from './editorItemDrag.js'
import { tileThumbTitle, templatePieceThumbTitle } from './assetThumbTitle.js'
import { loadThumbScale, saveThumbScale, THUMB_SCALES, thumbColsForScale } from './editorThumbScale.js'
import TemplatePieceThumbnail from './TemplatePieceThumbnail.jsx'
import TileThumbnail from './TileThumbnail.jsx'

const PALETTE_DRAG_TYPE = 'application/x-sta-palette-group'

// Left Asset Browser: tabbed catalogues (Tiles, Environment, Items, Markers, NPCs). Tool ids unchanged.
// Visual layout follows the Mission Editor mockup (thumbnail grid); catalogues unchanged.

const MARKER_TOOLS = [
  { id: 'playerStarts', label: 'Player Start', swatch: 'player' },
  { id: 'enemySpawns', label: 'Enemy Spawn', swatch: 'enemy' },
  { id: 'npcs', label: 'NPC', swatch: 'npc' },
  { id: 'area', label: 'Area Label', swatch: 'area' },
  { id: 'erase', label: 'Erase Marker', swatch: 'erase' },
  { id: 'eraseFloor', label: 'Erase Floor (Null)', swatch: 'erase' },
  { id: 'eraseStructure', label: 'Erase Wall / Prop', swatch: 'erase' },
]

const ASSET_TABS = [
  { id: 'tiles', label: 'Tiles' },
  { id: 'environment', label: 'Environment' },
  { id: 'items', label: 'Items' },
  { id: 'markers', label: 'Markers' },
  { id: 'npcs', label: 'NPCs' },
]

const CALIBRATION_ITEM_GROUPS = [
  { id: 'cal-footprints', label: 'Footprints', tag: 'footprint' },
  { id: 'cal-selection', label: 'Selection', tag: 'selection' },
]
const DIMENSION_ITEM_GROUPS = [
  { id: 'dim-footprints', label: 'Footprints', tag: 'footprint' },
  { id: 'dim-tiny', label: 'Tiny', tag: 'tiny' },
  { id: 'dim-selection', label: 'Selection', tag: 'selection' },
]
const itemMatches = (item, q) => matchesQuery(item.name, q) || matchesQuery(item.id, q) || matchesQuery(getCategoryName(item.category), q)
const calibrationItems = () => getItems().filter((item) => item.category === 'calibration')
const dimensionItems = () => getItems().filter((item) => item.category === 'dimension')

function setItemDragImage(event, item) {
  const tileImage = getTile(item.worldTile ?? 'crate')?.image
  const src = item.worldImage || tileImage || item.icon
  if (!src) return
  const size = propSpriteSize(item)
  const image = document.createElement('img')
  image.src = src
  image.alt = ''
  image.className = 'ed-item-drag-image'
  Object.assign(image.style, {
    position: 'fixed',
    left: '-10000px',
    top: '-10000px',
    width: `${size.width}px`,
    height: `${size.height}px`,
    objectFit: 'contain',
    pointerEvents: 'none',
  })
  document.body.appendChild(image)
  event.dataTransfer.setDragImage(image, size.width / 2, size.height)
  // Chrome snapshots the drag image after dragstart returns.
  window.setTimeout(() => image.remove(), 0)
}

function ItemGrid({ items, tool, onTool, onItemDragStart, onItemDragEnd }) {
  if (!items.length) return null
  return (
    <div className="ed-asset-grid">
      {items.map((item) => (
        <div key={item.id} className="ed-asset-cell">
          <button
            type="button"
            className={`ed-thumb-btn${tool === `inventory:${item.id}` ? ' is-selected' : ''}`}
            aria-pressed={tool === `inventory:${item.id}`}
            title={getCategoryName(item.category)}
            onClick={() => onTool(`inventory:${item.id}`)}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'copy'
              event.dataTransfer.setData(EDITOR_ITEM_DRAG_TYPE, item.id)
              setItemDragImage(event, item)
              onItemDragStart?.(item.id)
            }}
            onDragEnd={onItemDragEnd}
          >
            {item.worldImage || item.icon ? (
              <img className="me-thumb-preview" src={item.worldImage || item.icon} alt="" draggable={false} />
            ) : (
              <span className="me-swatch is-area" aria-hidden="true" />
            )}
          </button>
          <span className="ed-thumb-label">{item.name}</span>
        </div>
      ))}
    </div>
  )
}

function buildPaletteGroups() {
  const byId = new Map(TILES.map((tile) => [tile.id, tile]))
  const grouped = new Set(PALETTE_GROUPS.flatMap((group) => group.tiles))
  return [
    ...PALETTE_GROUPS.map((group) => ({ ...group, tiles: group.tiles.map((id) => byId.get(id)).filter(Boolean) })),
    {
      id: 'other',
      label: 'Other',
      // Null/empty cells are authoring-only (erase-to-Null); they are not a palette brush.
      tiles: TILES.filter((tile) => !grouped.has(tile.id) && tile.role !== 'destructible' && !tile.empty),
    },
  ]
}

function ToolButton({ selected, onClick, title, children }) {
  return (
    <button type="button" className={`me-tool${selected ? ' is-selected' : ''}`} aria-pressed={selected} title={title} onClick={onClick}>
      {children}
    </button>
  )
}

function ToolGroup({ id, label, count, open, onToggle, children }) {
  const isOpen = open.has(id)
  return (
    <div className="me-group">
      <button type="button" className="me-group-tag" aria-expanded={isOpen} onClick={() => onToggle(id)}>
        <span className="me-group-arrow" aria-hidden="true">
          {isOpen ? '▾' : '▸'}
        </span>
        <span className="me-group-label">{label}</span>
        <span className="me-group-count">{count}</span>
      </button>
      {isOpen && children}
    </div>
  )
}

function matchesQuery(text, query) {
  if (!query) return true
  return String(text).toLowerCase().includes(query)
}

// Active editor layer → Assets tab. Ground/Walls stay on Tiles; Furniture → Environment; Characters → NPCs; Markers → Markers.
const TAB_FOR_LAYER = {
  ground: 'tiles',
  walls: 'tiles',
  furniture: 'environment',
  characters: 'npcs',
  markers: 'markers',
}

export default function EditorPalette({
  tool,
  onTool,
  paintTileIds = null,
  onTogglePaintTile = null,
  paintTemplateIds = null,
  onTogglePaintTemplate = null,
  onOpenCharacterLibrary,
  onItemDragStart,
  onItemDragEnd,
  animateTiles = true,
  activeLayer = null,
  askConfirm = null,
  askText = null,
  onStatus = null,
}) {
  const [tab, setTab] = useState('tiles')
  const [query, setQuery] = useState('')
  const [thumbScale, setThumbScale] = useState(loadThumbScale)
  const [open, setOpen] = useState(() => new Set())
  const [catalogueEpoch, setCatalogueEpoch] = useState(
    () => tileCatalogueEpochOf() + templatePieceCatalogueEpochOf(),
  )
  const [busy, setBusy] = useState(false)
  const [ctxMenu, setCtxMenu] = useState(null)
  // Photoshop-style layer drag: which tileset is lifted, and where the insert line sits.
  const [dragGroupId, setDragGroupId] = useState(null)
  const [dropInsert, setDropInsert] = useState(null)
  const layerDragMovedRef = useRef(false)
  const importInputRef = useRef(null)
  const importTileIdRef = useRef(null)
  const q = query.trim().toLowerCase()
  const thumbCols = thumbColsForScale(thumbScale)
  const GROUPS = useMemo(() => buildPaletteGroups(), [catalogueEpoch])
  const pieceGroups = useMemo(() => templatePieceGroups(), [catalogueEpoch])
  const refreshCatalogue = () => setCatalogueEpoch(tileCatalogueEpochOf() + templatePieceCatalogueEpochOf())

  const clearToolIfDeleted = (prefix, id) => {
    if (tool === `${prefix}:${id}`) onTool?.('eraseStructure')
  }

  const runAuthoring = async (work) => {
    if (busy) return
    setBusy(true)
    try {
      await work()
      refreshCatalogue()
    } catch (error) {
      onStatus?.(error.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async (kind, id, label) => {
    if (!askConfirm || busy) return
    if (kind === 'tile' && !canEditTiles) {
      onStatus?.('Deleting tiles needs the Vite DEV server.')
      return
    }
    if (kind === 'piece' && !canEditTemplatePieces) {
      onStatus?.('Deleting Template Pieces needs the Vite DEV server.')
      return
    }
    const confirmed = await askConfirm({
      title: 'Delete Sprite?',
      message: `Permanently delete “${label}” from the game (catalogue entry and unused art files)? The change is staged in git — commit & push to remove it on other machines. Maps that still use it will break until fixed.`,
      confirmLabel: 'Delete',
    })
    if (!confirmed) return
    await runAuthoring(async () => {
      const gitNote = (result) =>
        result?.git?.staged?.length ? ' Staged for git — commit & push to sync other machines.' : ''
      if (kind === 'tile') {
        const result = await deleteTile(id)
        clearToolIfDeleted('tile', id)
        onStatus?.(
          `Deleted tile ${result.label ?? label}${result.deletedArt?.length ? ` (${result.deletedArt.length} art file${result.deletedArt.length === 1 ? '' : 's'})` : ''}.${gitNote(result)}`,
        )
      } else {
        const result = await deleteTemplatePiece(id)
        clearToolIfDeleted('template', id)
        onStatus?.(
          `Deleted Template Piece ${result.label ?? label}${result.deletedArt?.length ? ` (${result.deletedArt.length} art file${result.deletedArt.length === 1 ? '' : 's'})` : ''}.${gitNote(result)}`,
        )
      }
    })
  }

  const openCtxMenu = (event, items) => {
    event.preventDefault()
    event.stopPropagation()
    const placement = contextMenuPlacement(event)
    if (!placement) return
    setCtxMenu({ ...placement, items })
  }

  const onTileContextMenu = (event, tile) => {
    if (tile.id === 'null' || tile.empty) return
    if (!canEditTiles) {
      event.preventDefault()
      event.stopPropagation()
      confirmDelete('tile', tile.id, tile.label)
      return
    }
    openCtxMenu(event, [
      { id: 'rename', label: 'Rename…', onSelect: () => onRenameTile(tile) },
      { id: 'import', label: 'Import PNG…', onSelect: () => onImportTile(tile) },
      { id: 'delete', label: 'Delete…', onSelect: () => confirmDelete('tile', tile.id, tile.label) },
    ])
  }

  const onCategoryContextMenu = (event, section) => {
    if (!canEditTiles) return
    openCtxMenu(event, [
      { id: 'rename', label: 'Rename…', onSelect: () => onRenameCategory(section) },
      { id: 'delete', label: 'Delete…', onSelect: () => onDeleteCategory(section) },
      { id: 'add-tileset', label: 'Add tileset…', onSelect: () => onAddTileset(section) },
    ])
  }

  const onTilesetContextMenu = (event, group) => {
    if (!canEditTiles || group.id === 'other') return
    openCtxMenu(event, [
      { id: 'rename', label: 'Rename…', onSelect: () => onRenameTileset(group) },
      { id: 'delete', label: 'Delete…', onSelect: () => onDeleteTileset(group) },
      { id: 'create', label: 'Add tile…', onSelect: () => onCreateSprite(group.id) },
    ])
  }

  const onPieceContextMenu = (event, piece) => {
    event.preventDefault()
    event.stopPropagation()
    confirmDelete('piece', piece.id, piece.label)
  }

  const onRenameTile = async (tile) => {
    if (!askText || !canEditTiles) return
    const next = await askText({
      title: 'Rename Sprite',
      message: 'Display name for this tile:',
      initialValue: tile.label,
      saveLabel: 'Rename',
      maxLength: 80,
    })
    if (next == null || !String(next).trim() || String(next).trim() === tile.label) return
    await runAuthoring(async () => {
      const result = await renameTile(tile.id, String(next).trim())
      onStatus?.(`Renamed tile to “${result.label}”.`)
    })
  }

  const onImportTile = (tile) => {
    if (!canEditTiles) return
    importTileIdRef.current = tile.id
    importInputRef.current?.click()
  }

  const onImportFile = async (event) => {
    const file = event.target.files?.[0]
    const tileId = importTileIdRef.current
    event.target.value = ''
    importTileIdRef.current = null
    if (!file || !tileId) return
    await runAuthoring(async () => {
      const result = await importTileArt(tileId, file)
      if (result.image) bustImage(result.image, result.cacheVersion ?? result.version)
      onStatus?.(`Imported art for ${getTile(tileId)?.label ?? tileId}.`)
    })
  }

  const onCreateSprite = async (groupId) => {
    if (!askText || !canEditTiles) return
    const label = await askText({
      title: 'Add Tile',
      message: 'Name for the new tile (default placeholder art):',
      initialValue: 'New Tile',
      saveLabel: 'Add',
      maxLength: 80,
    })
    if (label == null || !String(label).trim()) return
    await runAuthoring(async () => {
      const result = await createTile(groupId, String(label).trim())
      setOpen((current) => new Set(current).add(groupId))
      onTool?.(`tile:${result.id}`)
      onStatus?.(`Created tile “${result.label}” in ${groupId}.`)
    })
  }

  const onAddCategory = async () => {
    if (!askText || !canEditTiles) return
    const section = await askText({
      title: 'Add Category',
      message: 'Category name (e.g. Locations):',
      initialValue: '',
      saveLabel: 'Next',
      maxLength: 60,
    })
    if (section == null || !String(section).trim()) return
    const tileset = await askText({
      title: 'Add Tileset',
      message: `First tileset under “${String(section).trim()}”:`,
      initialValue: 'New Tileset',
      saveLabel: 'Create',
      maxLength: 80,
    })
    if (tileset == null || !String(tileset).trim()) return
    await runAuthoring(async () => {
      const result = await putPaletteGroup({ label: String(tileset).trim(), section: String(section).trim() })
      setOpen((current) => new Set(current).add(result.id))
      onStatus?.(`Created category “${result.section}” with tileset “${result.label}”.`)
    })
  }

  const onRenameCategory = async (section) => {
    if (!askText || !canEditTiles) return
    const next = await askText({
      title: 'Rename Category',
      message: 'Category name:',
      initialValue: section,
      saveLabel: 'Rename',
      maxLength: 60,
    })
    if (next == null || !String(next).trim() || String(next).trim() === section) return
    await runAuthoring(async () => {
      const result = await renameSection(section, String(next).trim())
      onStatus?.(`Renamed category “${result.from}” → “${result.to}” (${result.updated} tilesets).`)
    })
  }

  const onDeleteCategory = async (section) => {
    if (!askConfirm || !canEditTiles) return
    const remaining = PALETTE_GROUPS.filter((group) => group.section === section)
    if (remaining.length) {
      onStatus?.(`Move or delete the ${remaining.length} tileset${remaining.length === 1 ? '' : 's'} in “${section}” first.`)
      return
    }
    const confirmed = await askConfirm({
      title: 'Delete Category?',
      message: `Remove empty category “${section}”?`,
      confirmLabel: 'Delete',
    })
    if (!confirmed) return
    await runAuthoring(async () => {
      await deleteSection(section)
      onStatus?.(`Removed category “${section}”.`)
    })
  }

  const onAddTileset = async (section) => {
    if (!askText || !canEditTiles) return
    const label = await askText({
      title: 'Add Tileset',
      message: `Tileset name under “${section}”:`,
      initialValue: 'New Tileset',
      saveLabel: 'Create',
      maxLength: 80,
    })
    if (label == null || !String(label).trim()) return
    await runAuthoring(async () => {
      const result = await putPaletteGroup({ label: String(label).trim(), section })
      setOpen((current) => new Set(current).add(result.id))
      onStatus?.(`Created tileset “${result.label}”.`)
    })
  }

  const onRenameTileset = async (group) => {
    if (!askText || !canEditTiles || group.id === 'other') return
    const next = await askText({
      title: 'Rename Tileset',
      message: 'Tileset name:',
      initialValue: group.label,
      saveLabel: 'Rename',
      maxLength: 80,
    })
    if (next == null || !String(next).trim() || String(next).trim() === group.label) return
    await runAuthoring(async () => {
      const result = await putPaletteGroup({ id: group.id, label: String(next).trim(), section: group.section })
      onStatus?.(`Renamed tileset to “${result.label}”.`)
    })
  }

  const onDeleteTileset = async (group) => {
    if (!askConfirm || !canEditTiles || group.id === 'other') return
    const confirmed = await askConfirm({
      title: 'Delete Tileset?',
      message: `Remove tileset “${group.label}” from the palette? Its tiles stay in the catalogue (Other) until deleted.`,
      confirmLabel: 'Delete',
    })
    if (!confirmed) return
    await runAuthoring(async () => {
      await deletePaletteGroup(group.id)
      onStatus?.(`Removed tileset “${group.label}”.`)
    })
  }

  const clearLayerDrag = () => {
    setDragGroupId(null)
    setDropInsert(null)
  }

  const onLayerRowClick = (groupId) => {
    if (layerDragMovedRef.current) {
      layerDragMovedRef.current = false
      return
    }
    toggle(groupId)
  }

  const onLayerDragOver = (event, groupId) => {
    if (!canEditTiles || !dragGroupId || groupId === 'other' || dragGroupId === groupId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const row = event.currentTarget
    const rect = row.getBoundingClientRect()
    const edge = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDropInsert((prev) => (prev?.id === groupId && prev.edge === edge ? prev : { id: groupId, edge }))
  }

  const onLayerDrop = async (event, targetId) => {
    event.preventDefault()
    const fromId = dragGroupId
    const edge = dropInsert?.id === targetId ? dropInsert.edge : 'before'
    clearLayerDrag()
    if (!canEditTiles || !fromId || targetId === 'other' || fromId === 'other' || fromId === targetId) return
    const ids = PALETTE_GROUPS.map((group) => group.id)
    if (!ids.includes(fromId) || !ids.includes(targetId)) return
    const next = ids.filter((id) => id !== fromId)
    let insert = next.indexOf(targetId)
    if (insert < 0) return
    if (edge === 'after') insert += 1
    next.splice(insert, 0, fromId)
    if (next.every((id, index) => id === ids[index])) return
    await runAuthoring(async () => {
      await reorderPaletteGroups(next)
      onStatus?.('Reordered tilesets.')
    })
  }

  useEffect(() => {
    saveThumbScale(thumbScale)
  }, [thumbScale])

  // Layers window active layer steers the Assets tab (does not override a hand-picked tab until the layer changes).
  const [seenLayer, setSeenLayer] = useState(activeLayer)
  if (activeLayer && activeLayer !== seenLayer) {
    setSeenLayer(activeLayer)
    const next = TAB_FOR_LAYER[activeLayer]
    if (next) setTab(next)
  }

  const toggle = (id) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const filteredGroups = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        tiles: group.tiles.filter((tile) => matchesQuery(tile.label, q) || matchesQuery(tile.id, q)),
      })).filter((group) => group.tiles.length > 0 || (canEditTiles && group.id !== 'other' && !q)),
    [GROUPS, q],
  )

  const anyOpen = filteredGroups.some((group) => open.has(group.id))
  const showCollapse = anyOpen || Boolean(q)
  const collapseAll = () => {
    setOpen(new Set())
    setQuery('')
  }
  const expandAll = () => setOpen(new Set(filteredGroups.map((group) => group.id)))

  return (
    <aside className="ed-assets me-palette" style={{ '--ed-thumb-cols': thumbCols }} data-thumb-scale={thumbScale}>
      <div className="ed-panel-head">
        <span>Assets</span>
        <div className="ed-seg ed-thumb-scale" role="group" aria-label="Thumbnail size">
          {THUMB_SCALES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`me-button${thumbScale === entry.id ? ' is-on' : ''}`}
              aria-pressed={thumbScale === entry.id}
              title={entry.title}
              onClick={() => setThumbScale(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <div className="ed-asset-tabs" role="tablist">
        {ASSET_TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className={`ed-tab${tab === entry.id ? ' is-active' : ''}`}
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="ed-asset-tools">
        <input className="ed-asset-search me-name" type="search" value={query} placeholder="Search assets…" aria-label="Search assets" onChange={(event) => setQuery(event.target.value)} />
        {tab === 'tiles' && canEditTiles && (
          <button type="button" className="me-button ed-collapse-all" disabled={busy} title="Add category" onClick={onAddCategory}>
            Add category
          </button>
        )}
        {tab === 'tiles' && (
          <button
            type="button"
            className="me-button ed-collapse-all"
            disabled={!filteredGroups.length}
            title={showCollapse ? 'Collapse all groups' : 'Expand all groups'}
            onClick={() => (showCollapse ? collapseAll() : expandAll())}
          >
            {showCollapse ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
      <div className="ed-asset-body">
        {tab === 'tiles' && (
          <>
            {canEditTiles && (
              <input
                ref={importInputRef}
                type="file"
                accept="image/png"
                hidden
                onChange={onImportFile}
              />
            )}
            {pieceGroups
              .map((group) => ({
                ...group,
                pieces: group.pieces.filter(
                  (piece) => !q || matchesQuery(piece.label, q) || matchesQuery(piece.id, q) || (piece.tags ?? []).some((tag) => matchesQuery(tag, q)),
                ),
              }))
              .filter((group) => group.pieces.length)
              .map((group) => (
                <ToolGroup key={group.id} id={`tiles:templates:${group.id}`} label={group.label} count={group.pieces.length} open={open} onToggle={toggle}>
                  <div className="ed-asset-grid">
                    {group.pieces.map((piece) => {
                      const inPaintSet = paintTemplateIds?.has(piece.id) ?? tool === `template:${piece.id}`
                      return (
                      <div key={piece.id} className="ed-asset-cell">
                        <div className="ed-thumb-wrap">
                          <button
                            type="button"
                            className={`ed-thumb-btn${tool === `template:${piece.id}` ? ' is-selected' : ''}${inPaintSet ? ' is-paint-set' : ''}`}
                            aria-pressed={tool === `template:${piece.id}`}
                            title={templatePieceThumbTitle(piece, {
                              extra: canEditTemplatePieces
                                ? 'paint cycle · right-click to delete'
                                : 'paint cycle',
                            })}
                            onClick={() => onTool(`template:${piece.id}`)}
                            onContextMenu={(event) => onPieceContextMenu(event, piece)}
                          >
                            <TemplatePieceThumbnail piece={piece} className="me-thumb-preview" animate={animateTiles} />
                          </button>
                          <label
                            className="ed-thumb-check me-check"
                            title="Include in Template Piece paint cycle"
                            onClick={(event) => event.stopPropagation()}
                            onContextMenu={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={inPaintSet}
                              aria-label={`Paint with ${piece.label}`}
                              onChange={(event) => onTogglePaintTemplate?.(piece.id, event.target.checked)}
                            />
                          </label>
                        </div>
                        <span className="ed-thumb-label">{piece.label}</span>
                      </div>
                      )
                    })}
                  </div>
                </ToolGroup>
              ))}
            {filteredGroups.map((group, index) => {
              const isOpen = open.has(group.id) || Boolean(q)
              const startsSection = group.section && group.section !== filteredGroups[index - 1]?.section
              const editableGroup = canEditTiles && group.id !== 'other'
              const dropBefore = dropInsert?.id === group.id && dropInsert.edge === 'before'
              const dropAfter = dropInsert?.id === group.id && dropInsert.edge === 'after'
              return (
                <div
                  key={group.id}
                  className={[
                    'me-group',
                    'ed-palette-layer',
                    dragGroupId === group.id ? 'is-dragging' : '',
                    dropBefore ? 'is-drop-before' : '',
                    dropAfter ? 'is-drop-after' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {startsSection && (
                    <div className="ed-palette-section">
                      <p
                        className="me-section"
                        title={canEditTiles ? `${group.section} — right-click for Rename / Delete` : group.section}
                        onContextMenu={(event) => onCategoryContextMenu(event, group.section)}
                      >
                        {group.section}
                      </p>
                      {canEditTiles && (
                        <button
                          type="button"
                          className="me-button ed-collapse-all ed-palette-add-tileset"
                          disabled={busy}
                          title="Add tileset in this category"
                          onClick={() => onAddTileset(group.section)}
                        >
                          Add tileset
                        </button>
                      )}
                    </div>
                  )}
                  <div
                    className={`ed-palette-layer-row${editableGroup ? ' is-draggable' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    title={
                      editableGroup
                        ? `${group.label} — drag to reorder · right-click for Rename / Delete`
                        : group.label
                    }
                    draggable={editableGroup && !busy}
                    onDragStart={
                      editableGroup
                        ? (event) => {
                            layerDragMovedRef.current = true
                            setDragGroupId(group.id)
                            setDropInsert(null)
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData(PALETTE_DRAG_TYPE, group.id)
                            try {
                              event.dataTransfer.setDragImage(event.currentTarget, 12, 12)
                            } catch {
                              /* ignore */
                            }
                          }
                        : undefined
                    }
                    onDragEnd={
                      editableGroup
                        ? () => {
                            clearLayerDrag()
                            window.setTimeout(() => {
                              layerDragMovedRef.current = false
                            }, 0)
                          }
                        : undefined
                    }
                    onDragOver={editableGroup ? (event) => onLayerDragOver(event, group.id) : undefined}
                    onDragLeave={
                      editableGroup
                        ? (event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) {
                              setDropInsert((prev) => (prev?.id === group.id ? null : prev))
                            }
                          }
                        : undefined
                    }
                    onDrop={editableGroup ? (event) => onLayerDrop(event, group.id) : undefined}
                    onClick={() => onLayerRowClick(group.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onLayerRowClick(group.id)
                      }
                    }}
                    onContextMenu={(event) => onTilesetContextMenu(event, group)}
                  >
                    {editableGroup && <span className="ed-palette-grip" aria-hidden="true" />}
                    <span className="me-group-arrow" aria-hidden="true">
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className="me-group-label">{group.label}</span>
                    <span className="me-group-count">{group.tiles.length}</span>
                  </div>
                  {isOpen && (
                    <>
                      <div className="ed-asset-grid">
                        {group.tiles.map((tile) => {
                          const inPaintSet = paintTileIds?.has(tile.id) ?? tool === `tile:${tile.id}`
                          return (
                          <div key={tile.id} className="ed-asset-cell">
                            <div className="ed-thumb-wrap">
                              <button
                                type="button"
                                className={`ed-thumb-btn${tool === `tile:${tile.id}` ? ' is-selected' : ''}${inPaintSet ? ' is-paint-set' : ''}`}
                                aria-pressed={tool === `tile:${tile.id}`}
                                title={tileThumbTitle(tile, {
                                  extra: canEditTiles
                                    ? 'paint cycle · right-click Rename / Import / Delete'
                                    : 'paint cycle',
                                })}
                                onClick={() => onTool(`tile:${tile.id}`)}
                                onContextMenu={(event) => onTileContextMenu(event, tile)}
                              >
                                <TileThumbnail tile={tile} className="me-thumb-preview" animate={animateTiles} />
                                {tile.big && (
                                  <span className="me-thumb-badge" title="Four in a 2x2 square are drawn as one big object">
                                    2×2
                                  </span>
                                )}
                              </button>
                              <label
                                className="ed-thumb-check me-check"
                                title="Include in Place Tiles paint cycle"
                                onClick={(event) => event.stopPropagation()}
                                onContextMenu={(event) => event.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={inPaintSet}
                                  aria-label={`Paint with ${tile.label}`}
                                  onChange={(event) => onTogglePaintTile?.(tile.id, event.target.checked)}
                                />
                              </label>
                            </div>
                            <span className="ed-thumb-label">{tile.label}</span>
                          </div>
                          )
                        })}
                      </div>
                      {editableGroup && (
                        <button
                          type="button"
                          className="me-button ed-collapse-all ed-palette-create-sprite"
                          disabled={busy}
                          title="Create sprite"
                          onClick={() => onCreateSprite(group.id)}
                        >
                          Add tile
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
            {!filteredGroups.length && <p className="me-text">No tiles match.</p>}
            {ctxMenu && (
              <EditorContextMenu
                host={ctxMenu.host}
                x={ctxMenu.x}
                y={ctxMenu.y}
                items={ctxMenu.items}
                onClose={() => setCtxMenu(null)}
              />
            )}
          </>
        )}

        {tab === 'environment' && (
          <>
            <ToolGroup
              id="env:destructibles"
              label="Destructible Objects"
              count={Object.keys(DESTRUCTIBLE_TYPES).length}
              open={new Set([...open, 'env:destructibles', 'env:hazards'])}
              onToggle={toggle}
            >
              <div className="ed-asset-grid">
                {Object.entries(DESTRUCTIBLE_TYPES)
                  .filter(([, info]) => matchesQuery(info.name, q) || matchesQuery(info.description, q))
                  .map(([type, info]) => (
                    <div key={type} className="ed-asset-cell">
                      <button
                        type="button"
                        className={`ed-thumb-btn${tool === `destructible:${type}` ? ' is-selected' : ''}`}
                        aria-pressed={tool === `destructible:${type}`}
                        title={info.description}
                        onClick={() => onTool(`destructible:${type}`)}
                      >
                        <TileThumbnail tile={getTile(destructibleTileId(type))} className="me-thumb-preview" animate={animateTiles} />
                      </button>
                      <span className="ed-thumb-label">{info.name}</span>
                    </div>
                  ))}
              </div>
            </ToolGroup>
            <ToolGroup id="env:hazards" label="Hazards" count={Object.keys(HAZARD_TYPES).length} open={new Set([...open, 'env:destructibles', 'env:hazards'])} onToggle={toggle}>
              {Object.entries(HAZARD_TYPES)
                .filter(([, info]) => matchesQuery(info.name, q))
                .map(([type, info]) => (
                  <ToolButton key={type} selected={tool === `hazard:${type}`} onClick={() => onTool(`hazard:${type}`)}>
                    <span
                      className="me-swatch is-hazard"
                      style={{ backgroundColor: info.colour, backgroundImage: `url(${hazardStrip(type)})`, backgroundSize: `${HAZARD_FRAMES * 100}% 100%` }}
                      aria-hidden="true"
                    />
                    <span>{info.name}</span>
                  </ToolButton>
                ))}
              <ToolButton selected={tool === 'hazardErase'} onClick={() => onTool('hazardErase')}>
                <span className="me-swatch is-erase" aria-hidden="true" />
                <span>Erase Hazard</span>
              </ToolButton>
              <p className="me-text">Intensity is edited in Properties when a hazard is selected.</p>
            </ToolGroup>
          </>
        )}

        {tab === 'items' && (
          <>
            {CALIBRATION_ITEM_GROUPS.map((group, index) => {
              const items = calibrationItems().filter((item) => item.tags?.includes(group.tag) && itemMatches(item, q))
              if (!items.length) return null
              const earlier = CALIBRATION_ITEM_GROUPS.slice(0, index).some((other) =>
                calibrationItems().some((item) => item.tags?.includes(other.tag) && itemMatches(item, q)),
              )
              return (
                <div key={group.id}>
                  {!earlier && <p className="me-section">Calibration</p>}
                  <ToolGroup id={group.id} label={group.label} count={items.length} open={q ? new Set([group.id]) : open} onToggle={toggle}>
                    <ItemGrid items={items} tool={tool} onTool={onTool} onItemDragStart={onItemDragStart} onItemDragEnd={onItemDragEnd} />
                  </ToolGroup>
                </div>
              )
            })}
            {DIMENSION_ITEM_GROUPS.map((group, index) => {
              const items = dimensionItems().filter((item) => item.tags?.includes(group.tag) && itemMatches(item, q))
              if (!items.length) return null
              const earlier = DIMENSION_ITEM_GROUPS.slice(0, index).some((other) =>
                dimensionItems().some((item) => item.tags?.includes(other.tag) && itemMatches(item, q)),
              )
              return (
                <div key={group.id}>
                  {!earlier && <p className="me-section">Dimension</p>}
                  <ToolGroup id={group.id} label={group.label} count={items.length} open={q ? new Set([group.id]) : open} onToggle={toggle}>
                    <ItemGrid items={items} tool={tool} onTool={onTool} onItemDragStart={onItemDragStart} onItemDragEnd={onItemDragEnd} />
                  </ToolGroup>
                </div>
              )
            })}
            <ItemGrid
              items={getItems().filter((item) => item.category !== 'calibration' && item.category !== 'dimension' && itemMatches(item, q))}
              tool={tool}
              onTool={onTool}
              onItemDragStart={onItemDragStart}
              onItemDragEnd={onItemDragEnd}
            />
          </>
        )}

        {tab === 'markers' &&
          MARKER_TOOLS.filter((marker) => matchesQuery(marker.label, q)).map((marker) => (
            <ToolButton key={marker.id} selected={tool === marker.id} onClick={() => onTool(marker.id)}>
              <span className={`me-swatch is-${marker.swatch}`} aria-hidden="true" />
              <span>{marker.label}</span>
            </ToolButton>
          ))}

        {tab === 'npcs' && (
          <>
            <ToolButton selected={tool === 'npcs'} onClick={() => onTool('npcs')}>
              <span className="me-swatch is-npc" aria-hidden="true" />
              <span>Place / select NPC</span>
            </ToolButton>
            <p className="me-text">Click the board to place or select. Use Character Library to pick a sheet for the next placement.</p>
            <button type="button" className="me-button me-generate" onClick={() => onOpenCharacterLibrary?.()}>
              Character Library
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
