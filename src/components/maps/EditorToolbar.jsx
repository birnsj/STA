import { useState } from 'react'
import { MAX_SIZE, MIN_SIZE } from '../../maps/mapFormat.js'
import { EDITOR_GRID_SIZES } from './editorGrid.js'

// Slim toolbar under the menu bar. File / Mission / window commands live in the menus only.

function SizeFields({ width, height, onResize }) {
  const [draft, setDraft] = useState({ width, height, from: `${width}x${height}` })
  if (draft.from !== `${width}x${height}`) setDraft({ width, height, from: `${width}x${height}` })
  const field = (key) => (
    <input
      type="number"
      className="me-number"
      min={MIN_SIZE}
      max={MAX_SIZE}
      value={draft[key]}
      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
    />
  )
  const changed = Number(draft.width) !== width || Number(draft.height) !== height
  return (
    <span className="ed-seg ed-size">
      <span className="ed-size-label">Size</span>
      {field('width')}
      <span className="ed-size-x" aria-hidden="true">
        ×
      </span>
      {field('height')}
      <button type="button" className="me-button" disabled={!changed} onClick={() => onResize(Number(draft.width), Number(draft.height))}>
        Apply
      </button>
    </span>
  )
}

export default function EditorToolbar({
  map,
  dirty,
  onRename,
  onResize,
  enemiesActive,
  onEnemiesActive,
  onPlay,
  placing,
  onPlacing,
  moving,
  onMoving,
  showGrid,
  onShowGrid,
  gridSize,
  onGridSize,
  onGridOptions,
  animateTiles,
  onAnimateTiles,
}) {
  return (
    <div className="me-toolbar ed-toolbar">
      <div className="me-toolbar-row">
        <input className="me-name ed-map-name" value={map.name} aria-label="Map name" title="The map's name is also its file name" onChange={(event) => onRename(event.target.value)} />
        {dirty && <span className="ed-dirty" title="Unsaved changes">●</span>}
        <div className="ed-seg" role="group" aria-label="Tools">
          <button
            type="button"
            className={`me-button${placing ? ' is-on' : ''}`}
            aria-pressed={placing}
            title="Paint the tile chosen in Assets → Tiles"
            onClick={() => onPlacing(!placing)}
          >
            Paint
          </button>
          <button
            type="button"
            className={`me-button${moving ? ' is-on' : ''}`}
            aria-pressed={moving}
            title="Swap tiles or move markers"
            onClick={() => onMoving(!moving)}
          >
            Move
          </button>
        </div>
        <div className="ed-seg" role="group" aria-label="View">
          <button
            type="button"
            className={`me-button${animateTiles ? ' is-on' : ''}`}
            aria-pressed={animateTiles}
            title="Play animated tiles (LCARS, conduits, machinery, …)"
            onClick={() => onAnimateTiles?.(!animateTiles)}
          >
            Animate
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
          <select
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
          </select>
          <button type="button" className="me-button" title="Grid options" onClick={() => onGridOptions?.()}>
            …
          </button>
        </div>
        <SizeFields width={map.width} height={map.height} onResize={onResize} />
        <div className="ed-toolbar-end">
          <label className="me-check" title="Off: enemies never notice the away team or start a fight.">
            <input type="checkbox" checked={enemiesActive} onChange={(event) => onEnemiesActive(event.target.checked)} /> Enemies
          </label>
          <button type="button" className="me-button is-primary" title="Play this map in game mode. The map doesn't need saving first." onClick={onPlay}>
            Play
          </button>
        </div>
      </div>
    </div>
  )
}
