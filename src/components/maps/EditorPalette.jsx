import { useState } from 'react'
import { PALETTE_GROUPS, TILES } from '../../maps/mapFormat.js'
import { canEditTiles, setTileCover } from '../../maps/tileFiles.js'

// The map editor's tool list: catalogue tiles in collapsible categories (each tile's PNG as its thumbnail, with a Cover
// checkbox that edits the catalogue), then the marker tools. tool: 'tile:{id}' | 'playerStarts' | 'enemySpawns' | 'area' | 'erase'.
const MARKER_TOOLS = [
  { id: 'playerStarts', label: 'Player Start', swatch: 'player' },
  { id: 'enemySpawns', label: 'Enemy Spawn', swatch: 'enemy' },
  { id: 'area', label: 'Area Label', swatch: 'area' },
  { id: 'erase', label: 'Erase Marker', swatch: 'erase' },
]

const BY_ID = new Map(TILES.map((tile) => [tile.id, tile]))
const GROUPED = new Set(PALETTE_GROUPS.flatMap((group) => group.tiles))
// Unknown ids in a group are skipped; tiles in no group still show, under Other.
const GROUPS = [
  ...PALETTE_GROUPS.map((group) => ({ ...group, tiles: group.tiles.map((id) => BY_ID.get(id)).filter(Boolean) })),
  { id: 'other', label: 'Other', tiles: TILES.filter((tile) => !GROUPED.has(tile.id)) },
].filter((group) => group.tiles.length)

function ToolButton({ selected, onClick, children }) {
  return (
    <button type="button" className={`me-tool${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  )
}

// Cover is a property of the tile type, so ticking it changes every map that uses the tile.
function CoverBox({ tile, onStatus }) {
  const [cover, setCover] = useState(tile.cover)
  const [saving, setSaving] = useState(false)
  const change = (next) => {
    setSaving(true)
    setTileCover(tile.id, next)
      .then(() => {
        setCover(next)
        onStatus(`${tile.label} ${next ? 'now gives' : 'no longer gives'} cover (saved to tiles.json).`)
      })
      .catch((error) => onStatus(`Could not change cover for ${tile.label}: ${error.message}`))
      .finally(() => setSaving(false))
  }
  return (
    <label className="me-cover" title={canEditTiles ? 'Standing next to this tile gives cover' : 'Cover can only be changed in the dev build'}>
      <input type="checkbox" checked={cover} disabled={!canEditTiles || saving} onChange={(event) => change(event.target.checked)} />
      Cover
    </label>
  )
}

export default function EditorPalette({ tool, onTool, ghostBlocks, onGhostBlocks, onStatus }) {
  // UI state: which categories are open. Starts with just the selected tile's category open.
  const [open, setOpen] = useState(() => new Set(GROUPS.filter((group) => group.tiles.some((tile) => tool === `tile:${tile.id}`)).map((group) => group.id)))
  const toggle = (id) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="me-palette">
      <p className="me-heading">Tiles</p>
      {GROUPS.map((group) => {
        const isOpen = open.has(group.id)
        return (
          <div key={group.id} className="me-group">
            <button type="button" className="me-group-tag" aria-expanded={isOpen} onClick={() => toggle(group.id)}>
              <span className="me-group-arrow" aria-hidden="true">
                {isOpen ? '▾' : '▸'}
              </span>
              <span className="me-group-label">{group.label}</span>
              <span className="me-group-count">{group.tiles.length}</span>
            </button>
            {isOpen &&
              group.tiles.map((tile) => (
                <div key={tile.id} className="me-tile">
                  <ToolButton selected={tool === `tile:${tile.id}`} onClick={() => onTool(`tile:${tile.id}`)}>
                    <img className="me-thumb" src={tile.image} alt="" />
                    <span>{tile.label}</span>
                  </ToolButton>
                  <CoverBox tile={tile} onStatus={onStatus} />
                </div>
              ))}
          </div>
        )
      })}
      <p className="me-heading">Markers</p>
      {MARKER_TOOLS.map((marker) => (
        <ToolButton key={marker.id} selected={tool === marker.id} onClick={() => onTool(marker.id)}>
          <span className={`me-swatch is-${marker.swatch}`} aria-hidden="true" />
          <span>{marker.label}</span>
        </ToolButton>
      ))}
      <label className="me-check">
        <input type="checkbox" checked={ghostBlocks} onChange={(event) => onGhostBlocks(event.target.checked)} />
        See-through blocks
      </label>
    </div>
  )
}
