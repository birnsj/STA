import { useMemo } from 'react'
import { getTile, imageSize } from '../../maps/mapFormat.js'

// A tile PNG (iso, 64 wide, mapFormat.js imageSize) seen from above: its top face (the floor diamond, raised by the
// block height for walls) is unskewed onto a 1 x 1 square. The matrix maps the face's corners top / right / left to
// (0,0) / (1,0) / (0,1).
const TILE_SYMBOL_PREFIX = 'minimap-tile-'
const topFaceMatrix = (imageHeight, height) => {
  const top = imageHeight - 32 - height
  return `matrix(${1 / 64} ${-1 / 64} ${1 / 32} ${1 / 32} ${-0.5 - top / 32} ${0.5 - top / 32})`
}
const symbolId = (tileId) => `${TILE_SYMBOL_PREFIX}${tileId}`

// A map's tiles top down, one unit per tile with tile (x, y) centred on (x, y), for the minimaps (exploration, map editor).
// Rebuilt only when the tiles change.
export default function MinimapTiles({ tiles }) {
  return useMemo(() => {
    const ids = [...new Set(tiles.flat())]
    return (
      <>
        <defs>
          <clipPath id="minimap-tile-clip">
            <rect width="1" height="1" />
          </clipPath>
          {ids.map((id) => {
            const tile = getTile(id)
            const size = imageSize(tile)
            return (
              <g key={id} id={symbolId(id)} clipPath="url(#minimap-tile-clip)">
                <image href={tile.image} width={size.width} height={size.height} transform={topFaceMatrix(size.height, tile.height ?? 0)} />
              </g>
            )
          })}
        </defs>
        {tiles.map((row, y) => row.map((id, x) => <use key={`${x},${y}`} href={`#${symbolId(id)}`} x={x - 0.5} y={y - 0.5} />))}
      </>
    )
  }, [tiles])
}
