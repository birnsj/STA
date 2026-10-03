import { getTile } from '../../maps/mapFormat.js'
import { isBlock, tileImage, tileImageBox } from '../../maps/iso.js'
import './maps.css'

// Tile PNGs for any map view. Floors are one layer under everything; blocks are drawn one at a time so the caller can
// depth-sort them with units (painter's order by x + y). Presentation only: images never take pointer input.

function TileImage({ href, position, className }) {
  return <image className={className} href={href} {...tileImageBox(position)} preserveAspectRatio="none" />
}

// hazardLive: the map's hazard tiles show their active (discharging) image.
export function FloorTiles({ map, hazardLive = false }) {
  const tiles = []
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      if (isBlock(id)) return
      const position = { x, y }
      const tile = getTile(id)
      tiles.push(<TileImage key={`${x},${y}`} className="tilemap-tile" href={tileImage(map, position)} position={position} />)
      if (hazardLive && tile.role === 'hazard' && tile.activeImage) {
        tiles.push(<TileImage key={`${x},${y}live`} className="tilemap-tile is-live" href={tile.activeImage} position={position} />)
      }
    }),
  )
  return <g className="tilemap-floor">{tiles}</g>
}

// ghost: drawn see-through (the editor uses it to see tiles behind tall blocks).
export function BlockTile({ map, position, ghost = false }) {
  const tile = getTile(map.tiles[position.y][position.x])
  return (
    <g className={`tilemap-block${ghost ? ' is-ghost' : ''}`}>
      <TileImage className="tilemap-tile" href={tileImage(map, position)} position={position} />
      {tile.role === 'hazardControl' && tile.activeImage && <TileImage className="tilemap-tile is-blink" href={tile.activeImage} position={position} />}
    </g>
  )
}
