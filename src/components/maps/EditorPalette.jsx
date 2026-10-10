import { useState } from 'react'
import { PALETTE_GROUPS, TILES } from '../../maps/mapFormat.js'
import { canEditTiles, setTileFlag } from '../../maps/tileFiles.js'
import { TilePreview } from './IsoTiles.jsx'

// The map editor's tool list: catalogue tiles in collapsible categories (each tile drawn as the map shows it, with Cover
// and Fade checkboxes that edit the catalogue), then the marker tools. tool: 'tile:{id}' | 'playerStarts' | 'enemySpawns' | 'npcs' | 'area' | 'erase'.
const MARKER_TOOLS = [
  { id: 'playerStarts', label: 'Player Start', swatch: 'player' },
  { id: 'enemySpawns', label: 'Enemy Spawn', swatch: 'enemy' },
  { id: 'npcs', label: 'NPC', swatch: 'npc' },
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

const FLAG_BOXES = [
  { flag: 'cover', label: 'Cover', title: 'Standing next to this tile gives cover', on: 'now gives cover', off: 'no longer gives cover' },
  { flag: 'fade', label: 'Fade', title: 'Turns see-through when a party member is behind it (exploration and Combat Type 1)', on: 'now fades', off: 'no longer fades' },
]

// Cover and Fade are properties of the tile type, so ticking one changes every map that uses the tile.
function FlagBox({ tile, box, onStatus }) {
  const [value, setValue] = useState(Boolean(tile[box.flag]))
  const [saving, setSaving] = useState(false)
  const change = (next) => {
    setSaving(true)
    setTileFlag(tile.id, box.flag, next)
      .then(() => {
        setValue(next)
        onStatus(`${tile.label} ${next ? box.on : box.off} (saved to tiles.json).`)
      })
      .catch((error) => onStatus(`Could not change ${box.label.toLowerCase()} for ${tile.label}: ${error.message}`))
      .finally(() => setSaving(false))
  }
  return (
    <label className="me-cover" title={canEditTiles ? box.title : `${box.label} can only be changed in the dev build`}>
      <input type="checkbox" checked={value} disabled={!canEditTiles || saving} onChange={(event) => change(event.target.checked)} />
      {box.label}
    </label>
  )
}

// The tile list only chooses which tile the brush holds; the toolbar's Place Tiles turns painting on.
export default function EditorPalette({ tool, onTool, ghostBlocks, onGhostBlocks, animateTiles, onAnimateTiles, showLighting, onShowLighting, onStatus }) {
  // UI state: which categories are open. All start closed (designer request, Oct 2026).
  const [open, setOpen] = useState(() => new Set())
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
      {GROUPS.map((group, index) => {
        const isOpen = open.has(group.id)
        const startsSection = group.section && group.section !== GROUPS[index - 1]?.section
        return (
          <div key={group.id} className="me-group">
            {startsSection && (
              <p className="me-section">
                {group.section}
                {index === 0 && (
                  <button type="button" className="me-collapse-all" title="Collapse all groups" aria-label="Collapse all groups" disabled={!open.size} onClick={() => setOpen(new Set())}>
                    ▴
                  </button>
                )}
              </p>
            )}
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
                    <span className="me-thumb-wrap">
                      <TilePreview tile={tile} className="me-thumb-preview" />
                      {tile.big && (
                        <span className="me-thumb-badge" title="Four in a 2x2 square are drawn as one big object">
                          2x2
                        </span>
                      )}
                    </span>
                    <span>{tile.label}</span>
                  </ToolButton>
                  <div className="me-flags">
                    {FLAG_BOXES.map((box) => (
                      <FlagBox key={box.flag} tile={tile} box={box} onStatus={onStatus} />
                    ))}
                  </div>
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
      <label className="me-check" title="Animated tiles (blinking lights, machinery, window stars) on the map, in the tile list and in the brush. Off, each shows its first frame.">
        <input type="checkbox" checked={animateTiles} onChange={(event) => onAnimateTiles(event.target.checked)} />
        Tile animations
      </label>
      <label className="me-check" title="Contact shadows, light pools and the map's darkness (the Light level is still saved). Turn off to keep large maps responsive.">
        <input type="checkbox" checked={showLighting} onChange={(event) => onShowLighting(event.target.checked)} />
        Lighting
      </label>
    </div>
  )
}
