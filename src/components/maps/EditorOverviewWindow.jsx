import EditorFloatWindow from './EditorFloatWindow.jsx'
import EditorMinimap from './EditorMinimap.jsx'

// Floating Map Overview: minimap + view toggles. Grid controls live on the main toolbar.

export default function EditorOverviewWindow({
  open,
  onClose,
  onBusyChange,
  map,
  ghostBlocks,
  onGhostBlocks,
  animateTiles,
  onAnimateTiles,
  showLighting,
  onShowLighting,
  showSurfaces = false,
  onShowSurfaces,
}) {
  return (
    <EditorFloatWindow title="Overview" open={open} onClose={onClose} onBusyChange={onBusyChange} x={24} y={360} width={260}>
      <p className="ed-dock-title">Map</p>
      <EditorMinimap map={map} />
      <p className="ed-dock-title" style={{ marginTop: 8 }}>
        View
      </p>
      <label className="me-check">
        <input type="checkbox" checked={ghostBlocks} onChange={(event) => onGhostBlocks(event.target.checked)} />
        See-through blocks
      </label>
      <label className="me-check">
        <input type="checkbox" checked={animateTiles} onChange={(event) => onAnimateTiles(event.target.checked)} />
        Tile animations
      </label>
      <label className="me-check">
        <input type="checkbox" checked={showLighting} onChange={(event) => onShowLighting(event.target.checked)} />
        Lighting
      </label>
      <label className="me-check" title="Highlight tops that items and stacked props can rest on">
        <input type="checkbox" checked={showSurfaces} onChange={(event) => onShowSurfaces?.(event.target.checked)} />
        Placement surfaces
      </label>
    </EditorFloatWindow>
  )
}
