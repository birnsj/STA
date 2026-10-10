import { isHostile } from '../../exploration/awareness.js'
import MinimapTiles from './MinimapTiles.jsx'

function Marker({ position, kind, label }) {
  return (
    <g className={`me-minimap-marker is-${kind}`} transform={`translate(${position.x} ${position.y})`}>
      <title>{label}</title>
      <circle r="0.75" />
    </g>
  )
}

// The map editor's minimap, top down, over the top right of the board: the tiles as the exploration minimap draws
// them, the area labels, objectives, NPCs (red when hostile) and the player start (P) and enemy spawn (E) markers.
// Display only; never takes pointer input.
export default function EditorMinimap({ map }) {
  const size = Math.max(map.width, map.height)
  const viewBox = `${-0.5 - (size - map.width) / 2} ${-0.5 - (size - map.height) / 2} ${size} ${size}`
  return (
    <section className="me-minimap" aria-label="Minimap">
      <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        <MinimapTiles tiles={map.tiles} />
        {map.areas.map((area) => (
          <text key={`${area.position.x},${area.position.y}`} className="me-minimap-label" x={area.position.x - 0.4} y={area.position.y + 0.3}>
            {area.name.toUpperCase()}
          </text>
        ))}
        {(map.objectives ?? []).map(
          (objective, index) =>
            objective.position && (
              <g key={`o${index}`} className="me-minimap-marker is-objective" transform={`translate(${objective.position.x} ${objective.position.y})`}>
                <title>{`Objective: ${objective.title || objective.id}`}</title>
                <path d="M0 -0.95L0.95 0L0 0.95L-0.95 0Z" />
              </g>
            ),
        )}
        {(map.npcs ?? []).map((npc) => (
          <Marker key={`n${npc.id}`} position={npc.position} kind={isHostile(npc) ? 'enemy' : 'npc'} label={npc.name || npc.characterId || npc.id} />
        ))}
        {map.markers.enemySpawns.map((position, index) => (
          <Marker key={`e${position.x},${position.y}`} position={position} kind="enemy" label={`E${index + 1}`} />
        ))}
        {map.markers.playerStarts.map((position, index) => (
          <Marker key={`p${position.x},${position.y}`} position={position} kind="player" label={`P${index + 1}`} />
        ))}
      </svg>
    </section>
  )
}
