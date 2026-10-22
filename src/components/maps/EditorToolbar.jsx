import { useState } from 'react'
import { MAX_SIZE, MIN_SIZE } from '../../maps/mapFormat.js'
import { EDITOR_GRID_SIZES } from './editorGrid.js'

// Slim toolbar under the menu bar. Mission generate actions also sit as icon buttons
// before Enemies (Mission menu keeps the same commands).

function IconGenerateMap() {
  return (
    <svg className="ed-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M2 2h5v5H2V2Zm7 0h5v5H9V2ZM2 9h5v5H2V9Zm7 0h5v5H9V9Z" />
    </svg>
  )
}

function IconGenerateName() {
  return (
    <svg className="ed-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 13V3h3.2c1.7 0 2.8 1 2.8 2.5 0 1.1-.6 1.9-1.5 2.3L9.2 13H7.4l-1.5-4.4H5V13H3Zm2-6h1c.8 0 1.3-.4 1.3-1.1S6.8 4.8 6 4.8H5V7Zm6.2 6-.4-1.2H9.2L8.8 13H7l2.2-6.2h1.7L13.2 13h-1.8Zm-.6-2.6.6-1.9.6 1.9h-1.2Z"
      />
    </svg>
  )
}

function IconGenerateEpisode() {
  return (
    <svg className="ed-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2 3h12v2H2V3Zm0 4h8v2H2V7Zm0 4h12v2H2v-2Zm11.2-5.2 1.3.4-.4 1.3-.4-1.3-1.3-.4 1.3-.4.4-1.3.4 1.3Z"
      />
    </svg>
  )
}

function IconGenerateCard() {
  return (
    <svg className="ed-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm1 2v8h8V4H4Zm1.5 1.5h5v1.2h-5V5.5Zm0 2.5h5v1.2h-5V8Zm0 2.5h3.2V11.7H5.5V10.5Z"
      />
    </svg>
  )
}

function IconGeneratorEditor() {
  // Same 2×2 tile family as Generate Map, with a pencil on the last cell — edit the tiles generation uses.
  return (
    <svg className="ed-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2 2h5v5H2V2Zm7 0h5v5H9V2ZM2 9h5v5H2V9Zm8.2 1.5 3.3-3.3 1.5 1.5-3.3 3.3H8.2v-1.5Zm2.8 2.3.7-.7 1 1-.7.7-1-1Z"
      />
    </svg>
  )
}

const GENERATE_BUTTONS = [
  { id: 'generateMap', label: 'Generate Map', Icon: IconGenerateMap, prop: 'onGenerateMap' },
  { id: 'generateName', label: 'Generate Name', Icon: IconGenerateName, prop: 'onGenerateName' },
  { id: 'generateEpisode', label: 'Generate Episode Name', Icon: IconGenerateEpisode, prop: 'onGenerateEpisode' },
  { id: 'generateCard', label: 'Generate Card', Icon: IconGenerateCard, prop: 'onGenerateCard' },
  { id: 'generators', label: 'Generator Editor', Icon: IconGeneratorEditor, prop: 'onGeneratorEditor' },
]

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
  onGenerateMap,
  onGenerateName,
  onGenerateEpisode,
  onGenerateCard,
  onGeneratorEditor,
}) {
  const actions = {
    onGenerateMap,
    onGenerateName,
    onGenerateEpisode,
    onGenerateCard,
    onGeneratorEditor,
  }

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
          <button type="button" className="me-button ed-icon-btn" title="Grid options" aria-label="Grid options" onClick={() => onGridOptions?.()}>
            <svg className="ed-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6.2 1.2h3.6l.3 1.6a4.8 4.8 0 0 1 1.2.7l1.5-.6 1.8 3.1-1.2 1.1c.1.4.1.7.1 1.1s0 .7-.1 1.1l1.2 1.1-1.8 3.1-1.5-.6a4.8 4.8 0 0 1-1.2.7l-.3 1.6H6.2l-.3-1.6a4.8 4.8 0 0 1-1.2-.7l-1.5.6L1.4 10l1.2-1.1A4.5 4.5 0 0 1 2.5 8c0-.4 0-.7.1-1.1L1.4 5.8l1.8-3.1 1.5.6a4.8 4.8 0 0 1 1.2-.7l.3-1.6ZM8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5Z"
              />
            </svg>
          </button>
        </div>
        <SizeFields width={map.width} height={map.height} onResize={onResize} />
        <div className="ed-toolbar-end">
          <div className="ed-seg" role="group" aria-label="Generate">
            {GENERATE_BUTTONS.map(({ id, label, Icon, prop }) => (
              <button
                key={id}
                type="button"
                className="me-button ed-icon-btn"
                title={label}
                aria-label={label}
                onClick={() => actions[prop]?.()}
              >
                <Icon />
              </button>
            ))}
          </div>
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
