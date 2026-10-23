import { useEffect, useMemo, useState } from 'react'
import { getTile, PALETTE_GROUPS, TILES } from '../../maps/mapFormat.js'
import { getCategoryName, getItems } from '../../rules/equipment.js'
import { DESTRUCTIBLE_TYPES, destructibleTileId, HAZARD_TYPES } from '../../world/environment.js'
import { HAZARD_FRAMES, hazardStrip } from './environmentArt.js'
import TileThumbnail from './TileThumbnail.jsx'

// Left Asset Browser: tabbed catalogues (Tiles, Environment, Items, Markers, NPCs). Tool ids unchanged.
// Visual layout follows the Mission Editor mockup (thumbnail grid); catalogues unchanged.

const THUMB_SCALE_KEY = 'sta-editor-thumb-scale'
const THUMB_SCALES = [
  { id: 's', label: 'S', cols: 4, title: 'Small thumbnails' },
  { id: 'm', label: 'M', cols: 3, title: 'Medium thumbnails' },
  { id: 'l', label: 'L', cols: 2, title: 'Large thumbnails' },
  { id: 'xl', label: 'XL', cols: 1, title: 'Extra-large thumbnails' },
]

function loadThumbScale() {
  try {
    const saved = localStorage.getItem(THUMB_SCALE_KEY)
    if (THUMB_SCALES.some((entry) => entry.id === saved)) return saved
  } catch {
    /* ignore */
  }
  return 's'
}

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
const itemMatches = (item, q) => matchesQuery(item.name, q) || matchesQuery(item.id, q) || matchesQuery(getCategoryName(item.category), q)
const calibrationItems = () => getItems().filter((item) => item.category === 'calibration')

function ItemGrid({ items, tool, onTool }) {
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
          >
            {item.worldImage || item.icon ? (
              <img className="me-thumb-preview" src={item.worldImage || item.icon} alt="" />
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

const BY_ID = new Map(TILES.map((tile) => [tile.id, tile]))
const GROUPED = new Set(PALETTE_GROUPS.flatMap((group) => group.tiles))
const GROUPS = [
  ...PALETTE_GROUPS.map((group) => ({ ...group, tiles: group.tiles.map((id) => BY_ID.get(id)).filter(Boolean) })),
  {
    id: 'other',
    label: 'Other',
    // Null/empty cells are authoring-only (erase-to-Null); they are not a palette brush.
    tiles: TILES.filter((tile) => !GROUPED.has(tile.id) && tile.role !== 'destructible' && !tile.empty),
  },
]

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

export default function EditorPalette({ tool, onTool, onOpenCharacterLibrary, animateTiles = true, activeLayer = null }) {
  const [tab, setTab] = useState('tiles')
  const [query, setQuery] = useState('')
  const [thumbScale, setThumbScale] = useState(loadThumbScale)
  const [open, setOpen] = useState(() => new Set())
  const q = query.trim().toLowerCase()
  const thumbCols = THUMB_SCALES.find((entry) => entry.id === thumbScale)?.cols ?? 4

  useEffect(() => {
    try {
      localStorage.setItem(THUMB_SCALE_KEY, thumbScale)
    } catch {
      /* ignore */
    }
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
      })).filter((group) => group.tiles.length > 0),
    [q],
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
            {filteredGroups.map((group, index) => {
              const isOpen = open.has(group.id) || Boolean(q)
              const startsSection = group.section && group.section !== filteredGroups[index - 1]?.section
              return (
                <div key={group.id} className="me-group">
                  {startsSection && <p className="me-section">{group.section}</p>}
                  <button type="button" className="me-group-tag" aria-expanded={isOpen} onClick={() => toggle(group.id)}>
                    <span className="me-group-arrow" aria-hidden="true">
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className="me-group-label">{group.label}</span>
                    <span className="me-group-count">{group.tiles.length}</span>
                  </button>
                  {isOpen && (
                    <div className="ed-asset-grid">
                      {group.tiles.map((tile) => (
                        <div key={tile.id} className="ed-asset-cell">
                          <button
                            type="button"
                            className={`ed-thumb-btn${tool === `tile:${tile.id}` ? ' is-selected' : ''}`}
                            aria-pressed={tool === `tile:${tile.id}`}
                            title={tile.label}
                            onClick={() => onTool(`tile:${tile.id}`)}
                          >
                            <TileThumbnail tile={tile} className="me-thumb-preview" animate={animateTiles} />
                            {tile.big && (
                              <span className="me-thumb-badge" title="Four in a 2x2 square are drawn as one big object">
                                2×2
                              </span>
                            )}
                          </button>
                          <span className="ed-thumb-label">{tile.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {!filteredGroups.length && <p className="me-text">No tiles match.</p>}
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
                    <ItemGrid items={items} tool={tool} onTool={onTool} />
                  </ToolGroup>
                </div>
              )
            })}
            <ItemGrid items={getItems().filter((item) => item.category !== 'calibration' && itemMatches(item, q))} tool={tool} onTool={onTool} />
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
