import { memo, useId } from 'react'
import { FULL_LIGHT, getTile, imageSize, isRotated, TILE_IMAGE } from '../../maps/mapFormat.js'
import { isBlock, mapBounds, project, pts, TILE_H, TILE_W, tileImage, tileImageBox } from '../../maps/iso.js'
import { BIG_IMAGE } from '../../maps/bigObjects.js'
import { joinedImage } from '../../maps/railJoins.js'
import {
  activeFlipbook,
  animationDelay,
  bigFlipbook,
  panelArt,
  tileActiveGlow,
  tileFlipbook,
  tileGlow,
  WALL_GLOW_SIZE,
  wallGlow,
  wallVariant,
} from '../../maps/tileArt.js'
import { frameStyle } from './flipbookStyles.js'
import { edgeStrip, FRAME, SHADE_BANDS, SIDES, WINDOW } from './tileShapes.js'
import './maps.css'

// Tile PNGs for any map view. Floors are one layer under everything; blocks are drawn one at a time so the caller can
// depth-sort them with units (painter's order by x + y). Presentation only: images never take pointer input.
// Every image is drawn at its own design size (mapFormat.js imageSize, bigObjects.js BIG_IMAGE), never stretched.
// Both layers are memoised: a map holds hundreds of tiles that never change while it is being played, so they are only
// rebuilt when the map itself does, not on every turn, hover or camera move.

// A rotated tile (mapFormat.js rotated) is drawn mirrored about its own centre line, except a wall with panels: its
// rotation turns the panel run instead (wallPanels.js).
const isMirrored = (map, position) => isRotated(map, position) && !getTile(map.tiles[position.y][position.x]).panels
const mirrorTransform = (position) => `translate(${2 * project(position).x} 0) scale(-1 1)`

// size: the image's (mapFormat.js imageSize); floors and most blocks have the standard one.
function TileImage({ href, position, className, style, mirror = false, size = TILE_IMAGE }) {
  return <image className={className} href={href} {...tileImageBox(position, size)} style={style} transform={mirror ? mirrorTransform(position) : undefined} />
}

// An animated tile (a flipbook, tileArt.js): its whole sprites stacked, each shown only on its own frames
// (flipbookStyles.js). draw(href, className) draws one sprite where the tile's image goes. emissive: drawn into the
// darkness's mask (EmissiveMask), where each sprite's emission goes too.
function Flipbook({ book, delay, emissive = false, draw }) {
  return book.sprites.map((sprite, index) => (
    <g key={index} className="tilemap-frame" style={frameStyle(book, index, delay)}>
      {draw(sprite.href)}
      {emissive && sprite.emission && draw(sprite.emission, 'tilemap-emission')}
    </g>
  ))
}

// hazardLive: the map's hazard tiles play their active (discharging) animation, all in step.
export const FloorTiles = memo(function FloorTiles({ map, hazardLive = false }) {
  const tiles = []
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      if (isBlock(id)) return
      const position = { x, y }
      const tile = getTile(id)
      const mirror = isMirrored(map, position)
      const live = hazardLive && tile.role === 'hazard' ? activeFlipbook(tile) : null
      if (!live) {
        tiles.push(<TileImage key={`${x},${y}`} className="tilemap-tile" href={tileImage(map, position)} position={position} mirror={mirror} />)
        return
      }
      tiles.push(
        <g key={`${x},${y}`}>
          <Flipbook book={live} delay="0s" draw={(href) => <TileImage className="tilemap-tile" href={href} position={position} mirror={mirror} />} />
        </g>,
      )
    }),
  )
  return (
    <g className="tilemap-floor">
      {tiles}
      <FloorLighting map={map} hazardLive={hazardLive} />
    </g>
  )
})

const pathOf = (quads) => quads.map((quad) => `M${quad.map((point) => `${point.x},${point.y}`).join('L')}Z`).join('')

// The tile lighting effects (tileArt.js): contact shadows, then light pools round glowing tiles.
function FloorLighting({ map, hazardLive }) {
  const uid = useId()
  const bands = SHADE_BANDS.map(() => [])
  const glows = []
  const blockAt = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && isBlock(map.tiles[y][x])
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      const position = { x, y }
      const colour = tileGlow(id) ?? (hazardLive ? tileActiveGlow(id) : null)
      if (colour) glows.push({ position, colour, size: 1.5 })
      const fitting = wallGlow(map, position)
      if (fitting) glows.push({ position: fitting.centre, colour: fitting.colour, size: WALL_GLOW_SIZE })
      if (isBlock(id)) return
      for (const side of SIDES) {
        if (!blockAt(x + side.dx, y + side.dy)) continue
        SHADE_BANDS.forEach(([from, to], i) => bands[i].push(edgeStrip(position, side, from, to)))
      }
    }),
  )
  const colours = [...new Set(glows.map((glow) => glow.colour))]
  const gradientId = (colour) => `${uid}-glow-${colours.indexOf(colour)}`
  // Light pools stop at the map's outline instead of spilling into the empty space round it.
  const outline = [
    project({ x: -0.5, y: -0.5 }),
    project({ x: map.width - 0.5, y: -0.5 }),
    project({ x: map.width - 0.5, y: map.height - 0.5 }),
    project({ x: -0.5, y: map.height - 0.5 }),
  ]
  return (
    <g className="tilemap-lighting" pointerEvents="none">
      <defs>
        <clipPath id={`${uid}-outline`}>
          <polygon points={outline.map((point) => `${point.x},${point.y}`).join(' ')} />
        </clipPath>
        {colours.map((colour) => (
          <radialGradient key={colour} id={gradientId(colour)}>
            <stop offset="0%" stopColor={colour} stopOpacity="0.55" />
            <stop offset="45%" stopColor={colour} stopOpacity="0.2" />
            <stop offset="100%" stopColor={colour} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      {bands.map((quads, i) => quads.length > 0 && <path key={i} d={pathOf(quads)} fill="#000" opacity={SHADE_BANDS[i][2]} />)}
      <g className="tilemap-glows" clipPath={`url(#${uid}-outline)`}>
        {glows.map(({ position, colour, size }) => {
          const c = project(position)
          return (
            <ellipse
              key={`${position.x},${position.y}`}
              cx={c.x}
              cy={c.y}
              rx={TILE_W * size}
              ry={TILE_H * size}
              fill={`url(#${gradientId(colour)})`}
              style={{ animationDelay: animationDelay(position) }}
            />
          )
        })}
      </g>
    </g>
  )
}

// Darkness over a dim map (mapFormat.js ambient), drawn above the tiles and units. Glowing tiles (tileEffects.json glows)
// and lit wall fittings cut soft holes in it so their light shows through. Pitch dark (0) still leaves the map faintly
// visible, so units can be found.
// blocks ({ faded, panels, bigGroups }, as WallBlock takes them): the views that draw lights inline with their tiles pass
// these, and the darkness is also cut away wherever an animated tile's lights show (EmissiveMask), so lights stay at
// full brightness however dark the map is. The editor draws its lit sprites above the darkness instead (EditorCanvas).
const MAX_DARKNESS = 0.9
// Covers the tallest tiles standing on the back rows.
const DARK_MARGIN = 200
export const AmbientDarkness = memo(function AmbientDarkness({ map, blocks = null }) {
  const uid = useId()
  const ambient = map.ambient ?? FULL_LIGHT
  if (ambient >= FULL_LIGHT) return null
  const lights = []
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      const position = { x, y }
      if (tileGlow(id)) lights.push({ position, radius: 2.6, lift: 0 })
      else if (isBlock(id) && wallVariant(getTile(id), position)) lights.push({ position, radius: 1.5, lift: TILE_H })
      // A lit fitting shows through on its wall face and the floor in front of it.
      const fitting = wallGlow(map, position)
      if (fitting) lights.push({ position: fitting.centre, radius: 1.8, lift: TILE_H / 2 })
    }),
  )
  const bounds = mapBounds(map, DARK_MARGIN)
  const area = { x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY }
  return (
    <g className="tilemap-ambient" pointerEvents="none">
      <defs>
        <radialGradient id={`${uid}-light`}>
          <stop offset="0%" stopColor="#000" stopOpacity="1" />
          <stop offset="45%" stopColor="#000" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <mask id={`${uid}-lights`} maskUnits="userSpaceOnUse" {...area}>
          <rect {...area} fill="#fff" />
          {lights.map(({ position, radius, lift }) => {
            const c = project(position)
            return <ellipse key={`${position.x},${position.y}`} cx={c.x} cy={c.y - lift} rx={TILE_W * radius} ry={TILE_H * radius} fill={`url(#${uid}-light)`} />
          })}
        </mask>
        {blocks && (
          <mask id={`${uid}-emissive`} maskUnits="userSpaceOnUse" {...area}>
            <rect {...area} fill="#fff" />
            <EmissiveMask map={map} blocks={blocks} />
          </mask>
        )}
      </defs>
      <g mask={blocks ? `url(#${uid}-emissive)` : undefined}>
        <rect {...area} fill="#02040a" opacity={(1 - ambient / FULL_LIGHT) * MAX_DARKNESS} mask={`url(#${uid}-lights)`} />
      </g>
    </g>
  )
})

// The blocks drawn again in painter's order, their art white and the emission of animated tiles black (maps.css
// tilemap-emissive): black where a light shows, so the darkness is cut away there, and white where a block in front
// hides it. Each emission is in its sprite's frame, so a blinking light's cut-out blinks with it.
function EmissiveMask({ map, blocks }) {
  const positions = []
  map.tiles.forEach((row, y) => row.forEach((id, x) => isBlock(id) && positions.push({ x, y })))
  positions.sort((a, b) => a.x + a.y - (b.x + b.y))
  return (
    <g className="tilemap-emissive">
      {positions.map((position) => (
        <WallBlock key={`${position.x},${position.y}`} map={map} position={position} {...blocks} emissive />
      ))}
    </g>
  )
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
function WallTile({ tile, position, panel, emissive }) {
  const art = panelArt(tile, panel, position)
  const variant = art || panel?.window ? null : wallVariant(tile, position)
  const size = imageSize(tile)
  const box = tileImageBox(position, size)
  const book = art ? art.flipbook : variant ? null : tileFlipbook(tile)
  const draw = art
    ? (href, className) => <image className={className} href={href} width={art.size.width} height={art.size.height} />
    : (href, className) => <image className={className} href={href} {...box} />
  const content = book ? (
    <Flipbook book={book} delay={animationDelay(art?.timing ?? position)} emissive={emissive} draw={draw} />
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
// as the piece joining its neighbours (railJoins.js), never mirrored. emissive: drawn into the darkness's mask.
export const BlockTile = memo(function BlockTile({ map, position, ghost = false, faded = false, panel = null, emissive = false }) {
  const tile = getTile(map.tiles[position.y][position.x])
  const joined = joinedImage(map, position)
  const size = imageSize(tile)
  const book = tile.wall || joined ? null : tileFlipbook(tile)
  return (
    <g className={`tilemap-block${ghost ? ' is-ghost' : ''}${faded ? ' is-faded' : ''}`} transform={!joined && isMirrored(map, position) ? mirrorTransform(position) : undefined}>
      {tile.wall ? (
        <WallTile tile={tile} position={position} panel={panel} emissive={emissive} />
      ) : book ? (
        <Flipbook
          book={book}
          delay={animationDelay(position)}
          emissive={emissive}
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
function FadedPanel({ map, positions, panels, emissive }) {
  return (
    <g className="tilemap-block is-faded">
      {positions.map((position) => (
        <BlockTile key={`${position.x},${position.y}`} map={map} position={position} panel={panels.get(`${position.x},${position.y}`)} emissive={emissive} />
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
const BigObjectStrip = memo(function BigObjectStrip({ tile, origin, strip, faded, ghost = false, mirror = false, emissive = false }) {
  const centre = project({ x: origin.x + 0.5, y: origin.y + 0.5 })
  const { width, height } = BIG_IMAGE
  const [from, to] = strip
  const flip = mirror ? `translate(${width} 0) scale(-1 1)` : undefined
  const book = bigFlipbook(tile)
  const draw = (href, className) => (
    <image className={`tilemap-tile${className ? ` ${className}` : ''}`} href={href} width={width} height={height} transform={flip} />
  )
  return (
    <g className={`tilemap-block${ghost ? ' is-ghost' : ''}${faded ? ' is-faded' : ''}`}>
      <svg x={centre.x - width / 2 + from * width} y={centre.y + TILE_H - height} width={(to - from) * width} height={height} viewBox={`${from * width} 0 ${(to - from) * width} ${height}`}>
        {book ? <Flipbook book={book} delay={animationDelay(origin)} emissive={emissive} draw={draw} /> : draw(tile.big.image)}
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
// emissive: drawn into the darkness's mask (EmissiveMask).
export function WallBlock({ map, position, faded, panels, bigGroups, ghost = false, emissive = false }) {
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
        emissive={emissive}
      />
    )
  }
  const panel = panels.get(key) ?? null
  if (!faded.has(key) || !panel) return <BlockTile map={map} position={position} ghost={ghost} faded={faded.has(key)} panel={panel} emissive={emissive} />
  if (panel.half === 0) return null
  const far = panel.axis === 'x' ? { x: position.x - 1, y: position.y } : { x: position.x, y: position.y - 1 }
  return <FadedPanel map={map} positions={[far, position]} panels={panels} emissive={emissive} />
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
