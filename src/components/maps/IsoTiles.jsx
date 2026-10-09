import { memo } from 'react'
import { getTile, imageSize, isRotated, TILE_IMAGE } from '../../maps/mapFormat.js'
import { isBlock, project, pts, TILE_H, TILE_W, tileImage, tileImageBox } from '../../maps/iso.js'
import { BIG_IMAGE } from '../../maps/bigObjects.js'
import { joinedImage } from '../../maps/railJoins.js'
import { animationDelay, bigFlipbook, panelArt, tileFlipbook, wallVariant } from '../../maps/tileArt.js'
import { frameStyle } from './flipbookStyles.js'
import { FRAME, WINDOW } from './tileShapes.js'
import './maps.css'

// Single tiles as SVG: the blocks the play views draw over their figures (useFigureWindows), the editor's brush and
// its palette previews. The maps themselves are drawn into canvases (MapCanvas, canvasTiles.js), which draw every tile
// as these do. Presentation only: images never take pointer input. Every image is drawn at its own design size
// (mapFormat.js imageSize, bigObjects.js BIG_IMAGE), never stretched.

// A rotated tile (mapFormat.js rotated) is drawn mirrored about its own centre line, except a wall with panels: its
// rotation turns the panel run instead (wallPanels.js).
const isMirrored = (map, position) => isRotated(map, position) && !getTile(map.tiles[position.y][position.x]).panels
const mirrorTransform = (position) => `translate(${2 * project(position).x} 0) scale(-1 1)`

// size: the image's (mapFormat.js imageSize); floors and most blocks have the standard one.
function TileImage({ href, position, className, style, mirror = false, size = TILE_IMAGE }) {
  return <image className={className} href={href} {...tileImageBox(position, size)} style={style} transform={mirror ? mirrorTransform(position) : undefined} />
}

// An animated tile (a flipbook, tileArt.js): its whole sprites stacked, each shown only on its own frames
// (flipbookStyles.js). draw(href) draws one sprite where the tile's image goes.
function Flipbook({ book, delay, draw }) {
  return book.sprites.map((sprite, index) => (
    <g key={index} className="tilemap-frame" style={frameStyle(book, index, delay)}>
      {draw(sprite.href)}
    </g>
  ))
}

// This tile's half of a two-tile wall panel (wallPanels.js), drawn over the wall's front face: the panel's outer edge
// and, on window panels of a wall without panel art, its share of the window. Painted windows (with their stars) and
// long wall fittings are all in the panel art (tileArt.js panelArt).
// Points are (U along the panel 0..2, height above the floor).
function PanelFace({ tile, position, panel, height }) {
  const c = project(position)
  const start = panel.axis === 'x' ? { x: c.x - TILE_W / 2, y: c.y } : { x: c.x + TILE_W / 2, y: c.y }
  const end = { x: c.x, y: c.y + TILE_H / 2 }
  const at = (U, v) => {
    const u = U - panel.half
    return [start.x + (end.x - start.x) * u, start.y + (end.y - start.y) * u - v]
  }
  const line = (a, b) => ({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] })
  const edgeU = panel.half === 0 ? 0 : 2
  return (
    <g className="wall-panel" pointerEvents="none">
      <line className="wall-panel-edge" {...line(at(edgeU, 0), at(edgeU, height))} />
      {!tile.panelFitting && !tile.panelImages && panel.window && <WindowHalf half={panel.half} height={height} at={at} />}
    </g>
  )
}

// One tile's half of a panel window: a bevelled frame, tinted glass lit softly from inside, a reflection band, the
// centre mullion and a sill.
function WindowHalf({ half, height, at }) {
  const lo = half
  const hi = half + 1
  const from = Math.max(WINDOW.from, lo)
  const to = Math.min(WINDOW.to, hi)
  const bottom = height * WINDOW.bottom
  const top = height * WINDOW.top
  // The frame only reaches past the glass at the window's outer ends, not across the mullion between the halves.
  const frameFrom = from === WINDOW.from ? from - FRAME.along : from
  const frameTo = to === WINDOW.to ? to + FRAME.along : to
  const quad = (u0, u1, v0, v1) => pts([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)])
  const line = (a, b) => ({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] })
  const glow = bottom + (top - bottom) * 0.38
  // The reflection: a slanted band across the left half's glass and a thin one across the right half's.
  const band = half === 0 ? [0.5, 0.66, 0.08] : [1.25, 1.31, 0.05]
  return (
    <>
      <polygon className="wall-window-frame" points={quad(frameFrom, frameTo, bottom - FRAME.height, top + FRAME.height)} />
      <line className="wall-window-frame-light" {...line(at(frameFrom, top + FRAME.height), at(frameTo, top + FRAME.height))} />
      <polygon className="wall-window" points={quad(from, to, bottom, top)} />
      <polygon className="wall-window-glow" points={quad(from, to, bottom, glow)} />
      <polygon className="wall-window-reflection" points={pts([at(band[0], top), at(band[1], top), at(band[1] - band[2] * 2, bottom), at(band[0] - band[2] * 2, bottom)])} />
      {half === 1 && <line className="wall-window-mullion" {...line(at(1, bottom), at(1, top))} />}
      <line className="wall-window-sill" {...line(at(frameFrom, bottom - FRAME.height), at(frameTo, bottom - FRAME.height))} />
    </>
  )
}

// A wall: its image, a wall variant (tileArt.js wallVariant; never on a window half) or its animation (tileArt.js
// tileFlipbook). Panel art (tileArt.js panelArt) replaces them with this tile's slot of the two-tile image, or of its
// animation's sprites: a viewport the size of the tile's own image, looking at the slot.
function WallTile({ tile, position, panel }) {
  const art = panelArt(tile, panel, position)
  const variant = art || panel?.window ? null : wallVariant(tile, position)
  const size = imageSize(tile)
  const box = tileImageBox(position, size)
  const book = art ? art.flipbook : variant ? null : tileFlipbook(tile)
  const draw = art
    ? (href) => <image href={href} width={art.size.width} height={art.size.height} />
    : (href) => <image href={href} {...box} />
  const content = book ? (
    <Flipbook book={book} delay={animationDelay(art?.timing ?? position)} draw={draw} />
  ) : (
    draw(art?.href ?? variant?.href ?? tile.image)
  )
  return (
    <g className="tilemap-tile">
      {art ? (
        <svg {...box} viewBox={`${art.offset.x} ${art.offset.y} ${size.width} ${size.height}`}>
          {content}
        </svg>
      ) : (
        content
      )}
      {panel && <PanelFace tile={tile} position={position} panel={panel} height={tile.height} />}
    </g>
  )
}

// ghost: drawn see-through (the editor uses it to see tiles behind tall blocks). faded: see-through because it hides a
// party member (wallFade.js). panel: this wall's place in a two-tile panel (wallPanels.js), or null. A railing is drawn
// as the piece joining its neighbours (railJoins.js), never mirrored.
export const BlockTile = memo(function BlockTile({ map, position, ghost = false, faded = false, panel = null }) {
  const tile = getTile(map.tiles[position.y][position.x])
  const joined = joinedImage(map, position)
  const size = imageSize(tile)
  const book = tile.wall || joined ? null : tileFlipbook(tile)
  return (
    <g className={`tilemap-block${ghost ? ' is-ghost' : ''}${faded ? ' is-faded' : ''}`} transform={!joined && isMirrored(map, position) ? mirrorTransform(position) : undefined}>
      {tile.wall ? (
        <WallTile tile={tile} position={position} panel={panel} />
      ) : book ? (
        <Flipbook
          book={book}
          delay={animationDelay(position)}
         
          draw={(href, className) => <TileImage className={`tilemap-tile${className ? ` ${className}` : ''}`} href={href} position={position} size={size} />}
        />
      ) : (
        <TileImage className="tilemap-tile" href={joined ?? tileImage(map, position)} position={position} size={size} />
      )}
    </g>
  )
})

// Both halves of a faded two-tile panel, faded as one group: drawn solid inside it, the nearer half covers the seam
// between them as it does on a solid wall, so the panel fades as one wall rather than two overlapping tiles.
// positions: the far half then the near half.
function FadedPanel({ map, positions, panels }) {
  return (
    <g className="tilemap-block is-faded">
      {positions.map((position) => (
        <BlockTile key={`${position.x},${position.y}`} map={map} position={position} panel={panels.get(`${position.x},${position.y}`)} />
      ))}
    </g>
  )
}

// A 2x2 big object (bigObjects.js): its big image (tiles.json big.image, BIG_IMAGE in size) standing on the 2x2
// footprint. origin: its top-left tile. One image would sort as a single block and cover neighbours beside it, so it is
// cut into vertical strips, each drawn by the tile it stands on in painter's order: the left quarter by the left tile
// (origin + 0, 1), the right quarter by the right tile (origin + 1, 0) and the middle half by the front tile
// (origin + 1, 1). The back tile draws nothing.
// strip: [from, to] across the image, as fractions of its width.
// mirror: the object is drawn mirrored (its origin tile is rotated); each strip still covers the same part of the
// footprint, cut from the mirrored image.
const BigObjectStrip = memo(function BigObjectStrip({ tile, origin, strip, faded, ghost = false, mirror = false }) {
  const centre = project({ x: origin.x + 0.5, y: origin.y + 0.5 })
  const { width, height } = BIG_IMAGE
  const [from, to] = strip
  const flip = mirror ? `translate(${width} 0) scale(-1 1)` : undefined
  const book = bigFlipbook(tile)
  const draw = (href) => <image className="tilemap-tile" href={href} width={width} height={height} transform={flip} />
  return (
    <g className={`tilemap-block${ghost ? ' is-ghost' : ''}${faded ? ' is-faded' : ''}`}>
      <svg x={centre.x - width / 2 + from * width} y={centre.y + TILE_H - height} width={(to - from) * width} height={height} viewBox={`${from * width} 0 ${(to - from) * width} ${height}`}>
        {book ? <Flipbook book={book} delay={animationDelay(origin)} draw={draw} /> : draw(tile.big.image)}
      </svg>
    </g>
  )
})

const LEFT_STRIP = [0, 0.25]
const MIDDLE_STRIP = [0.25, 0.75]
const RIGHT_STRIP = [0.75, 1]
function bigStrip(position, origin) {
  const dx = position.x - origin.x
  const dy = position.y - origin.y
  if (dx === 0 && dy === 1) return LEFT_STRIP
  if (dx === 1 && dy === 0) return RIGHT_STRIP
  if (dx === 1 && dy === 1) return MIDDLE_STRIP
  return null
}

// A block in a tall-wall view (exploration, Combat Type 1, the map editor). faded: Set of faded 'x,y' keys; panels:
// getWallPanels; bigGroups: getBigObjects; ghost: the editor's See-through blocks. A big object is drawn in strips by
// three of its tiles (BigObjectStrip).
// A faded panel is drawn whole by its nearer half (half 1, one step further along its axis), so the far half draws nothing.
export function WallBlock({ map, position, faded, panels, bigGroups, ghost = false }) {
  const key = `${position.x},${position.y}`
  const origin = bigGroups.get(key)
  if (origin) {
    const strip = bigStrip(position, origin)
    if (!strip) return null
    return (
      <BigObjectStrip
        tile={getTile(map.tiles[position.y][position.x])}
        origin={origin}
        strip={strip}
        faded={faded.has(key)}
        ghost={ghost}
        mirror={isRotated(map, origin)}
       
      />
    )
  }
  const panel = panels.get(key) ?? null
  if (!faded.has(key) || !panel) return <BlockTile map={map} position={position} ghost={ghost} faded={faded.has(key)} panel={panel} />
  if (panel.half === 0) return null
  const far = panel.axis === 'x' ? { x: position.x - 1, y: position.y } : { x: position.x, y: position.y - 1 }
  return <FadedPanel map={map} positions={[far, position]} panels={panels} />
}

// One tile on its own as the map views draw it (the editor's brush): a block with its panel (getWallPanels), or a
// floor tile.
export function LoneTile({ map, position, panel = null }) {
  if (isBlock(map.tiles[position.y][position.x])) return <BlockTile map={map} position={position} panel={panel} />
  return <TileImage className="tilemap-tile" href={tileImage(map, position)} position={position} mirror={isMirrored(map, position)} />
}

// A tile as the views draw it, for the editor palette: walls and tall objects at their full height, and a wall with
// panels as a two-tile panel, with a window unless the wall has none (tiles.json windows).
export function TilePreview({ tile, className }) {
  const positions = tile.panels ? [{ x: 0, y: 0 }, { x: 1, y: 0 }] : [{ x: 0, y: 0 }]
  const map = { width: positions.length, height: 1, tiles: [positions.map(() => tile.id)] }
  const hasWindow = tile.windows !== false
  const panels = new Map(positions.map((position, half) => [`${position.x},${position.y}`, { axis: 'x', half, window: hasWindow }]))
  const boxes = positions.map((position) => tileImageBox(position, imageSize(tile)))
  const minX = Math.min(...boxes.map((box) => box.x))
  const maxX = Math.max(...boxes.map((box) => box.x + box.width))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxY = Math.max(...boxes.map((box) => box.y + box.height))
  return (
    <svg className={className} viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      {tile.height > 0 ? (
        positions.map((position) => <BlockTile key={position.x} map={map} position={position} panel={tile.panels ? panels.get(`${position.x},0`) : null} />)
      ) : (
        <TileImage className="tilemap-tile" href={tile.image} position={positions[0]} />
      )}
    </svg>
  )
}
