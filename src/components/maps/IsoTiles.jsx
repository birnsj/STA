import { memo, useId } from 'react'
import { FULL_LIGHT, getTile, isRotated, TILE_IMAGE } from '../../maps/mapFormat.js'
import { isBlock, mapBounds, project, pts, TILE_H, TILE_W, tileImage, tileImageBox } from '../../maps/iso.js'
import { BIG_SCALE } from '../../maps/bigObjects.js'
import { joinedImage } from '../../maps/railJoins.js'
import { animationDelay, PANEL_IMAGE, panelArt, tileActiveGlow, tileAnimations, tileGlow, wallVariant } from '../../maps/tileArt.js'
import { drawnHeight } from '../../maps/wallFade.js'
import { edgeStrip, FRAME, SHADE_BANDS, SIDES, WINDOW } from './tileShapes.js'
import './maps.css'

// Tile PNGs for any map view. Floors are one layer under everything; blocks are drawn one at a time so the caller can
// depth-sort them with units (painter's order by x + y). Presentation only: images never take pointer input.
// Both layers are memoised: a map holds hundreds of tiles that never change while it is being played, so they are only
// rebuilt when the map itself does, not on every turn, hover or camera move.

// A rotated tile (mapFormat.js rotated) is drawn mirrored about its own centre line, except a wall with panels: its
// rotation turns the panel run instead (wallPanels.js).
const isMirrored = (map, position) => isRotated(map, position) && !getTile(map.tiles[position.y][position.x]).panels
const mirrorTransform = (position) => `translate(${2 * project(position).x} 0) scale(-1 1)`

function TileImage({ href, position, className, style, mirror = false }) {
  return <image className={className} href={href} {...tileImageBox(position)} preserveAspectRatio="none" style={style} transform={mirror ? mirrorTransform(position) : undefined} />
}

// The animated light overlays for a tile (tileArt.js), drawn over it. timing: the tile whose position
// sets the animation offset (a big object's origin, so all its strips stay in step).
function TileLights({ tile, position, timing = position, mirror = false }) {
  return tileAnimations(tile).map((light) => (
    <TileImage
      key={light.style}
      className={`tilemap-tile tilemap-light is-${light.style}`}
      href={light.href}
      position={position}
      style={{ animationDelay: animationDelay(timing) }}
      mirror={mirror}
    />
  ))
}

// hazardLive: the map's hazard tiles show their active (discharging) image.
export const FloorTiles = memo(function FloorTiles({ map, hazardLive = false }) {
  const tiles = []
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      if (isBlock(id)) return
      const position = { x, y }
      const tile = getTile(id)
      const mirror = isMirrored(map, position)
      tiles.push(<TileImage key={`${x},${y}`} className="tilemap-tile" href={tileImage(map, position)} position={position} mirror={mirror} />)
      if (hazardLive && tile.role === 'hazard' && tile.activeImage) {
        tiles.push(<TileImage key={`${x},${y}live`} className="tilemap-tile is-live" href={tile.activeImage} position={position} mirror={mirror} />)
      }
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
      if (colour) glows.push({ position, colour })
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
        {glows.map(({ position, colour }) => {
          const c = project(position)
          return (
            <ellipse
              key={`${position.x},${position.y}`}
              cx={c.x}
              cy={c.y}
              rx={TILE_W * 1.5}
              ry={TILE_H * 1.5}
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
const MAX_DARKNESS = 0.9
// Covers the tallest tiles standing on the back rows.
const DARK_MARGIN = 200
export const AmbientDarkness = memo(function AmbientDarkness({ map }) {
  const uid = useId()
  const ambient = map.ambient ?? FULL_LIGHT
  if (ambient >= FULL_LIGHT) return null
  const lights = []
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      const position = { x, y }
      if (tileGlow(id)) lights.push({ position, radius: 2.6, lift: 0 })
      else if (isBlock(id) && wallVariant(getTile(id), position)) lights.push({ position, radius: 1.5, lift: TILE_H })
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
      </defs>
      <rect {...area} fill="#02040a" opacity={(1 - ambient / FULL_LIGHT) * MAX_DARKNESS} mask={`url(#${uid}-lights)`} />
    </g>
  )
})

// One horizontal band of a tile PNG (source rows sourceY..sourceY + sourceHeight) drawn into a box of any height.
function ImageBand({ href, x, y, height, sourceY, sourceHeight }) {
  return (
    <svg x={x} y={y} width={TILE_IMAGE.width} height={height} viewBox={`0 ${sourceY} ${TILE_IMAGE.width} ${sourceHeight}`} preserveAspectRatio="none">
      <image href={href} width={TILE_IMAGE.width} height={TILE_IMAGE.height} />
    </svg>
  )
}

// This tile's half of a two-tile wall panel (wallPanels.js), drawn over the wall's front face: the panel's outer edge
// and, on window panels, its share of the window (just the stars where the wall's panel art paints the window). Long
// wall fittings are all in their panel art (tileArt.js panelArt).
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
      {!tile.panelFitting && panel.window && <WindowHalf tile={tile} position={position} half={panel.half} height={height} at={at} />}
    </g>
  )
}

// One tile's half of a panel window: a bevelled frame, tinted glass lit softly from inside, a reflection band, the
// centre mullion and a sill. Walls with windowView 'space' (starships) show a star field through the glass. A wall with
// panel art (tiles.json panelImages) has the rest painted in, so only the stars are drawn.
function WindowHalf({ tile, position, half, height, at }) {
  const painted = Boolean(tile.panelImages)
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
  const stars =
    tile.windowView === 'space'
      ? Array.from({ length: 5 }, (_, i) => {
          const seed = position.x * 73 + position.y * 151 + i * 37
          return { u: from + 0.05 + ((seed * 13) % 89) / 89 * (to - from - 0.1), v: bottom + 3 + ((seed * 29) % 97) / 97 * (top - bottom - 6), size: i % 3 === 0 ? 0.9 : 0.55, delay: `${-((seed % 7) / 7) * 4}s` }
        })
      : []
  const starDots = stars.map((star, i) => {
    const [x, y] = at(star.u, star.v)
    return <circle key={i} className="wall-star" cx={x} cy={y} r={star.size} style={{ animationDelay: star.delay }} />
  })
  if (painted) return starDots
  return (
    <>
      <polygon className="wall-window-frame" points={quad(frameFrom, frameTo, bottom - FRAME.height, top + FRAME.height)} />
      <line className="wall-window-frame-light" {...line(at(frameFrom, top + FRAME.height), at(frameTo, top + FRAME.height))} />
      <polygon className="wall-window" points={quad(from, to, bottom, top)} />
      <polygon className="wall-window-glow" points={quad(from, to, bottom, glow)} />
      {starDots}
      <polygon className="wall-window-reflection" points={pts([at(band[0], top), at(band[1], top), at(band[1] - band[2] * 2, bottom), at(band[0] - band[2] * 2, bottom)])} />
      {half === 1 && <line className="wall-window-mullion" {...line(at(1, bottom), at(1, top))} />}
      <line className="wall-window-sill" {...line(at(frameFrom, bottom - FRAME.height), at(frameTo, bottom - FRAME.height))} />
    </>
  )
}

// A tall object drawn taller (wallFade.js drawnHeight): its full-height image cut into three bands. The top and the
// floor corners keep their shape; only the band between them is stretched. (Walls use TallWall.)
function TallBlock({ tile, position }) {
  const box = tileImageBox(position)
  const extra = drawnHeight(tile, true) - tile.height
  const faceTop = TILE_IMAGE.height - tile.height // where the top face ends and the straight sides begin
  const sidesEnd = TILE_IMAGE.height - TILE_H / 2 // the floor diamond's side corners
  return (
    <g className="tilemap-tile">
      <ImageBand href={tile.image} x={box.x} y={box.y - extra} height={faceTop} sourceY={0} sourceHeight={faceTop} />
      <ImageBand href={tile.image} x={box.x} y={box.y + faceTop - extra} height={sidesEnd - faceTop + extra} sourceY={faceTop} sourceHeight={sidesEnd - faceTop} />
      <ImageBand href={tile.image} x={box.x} y={box.y + sidesEnd} height={TILE_H / 2} sourceY={sidesEnd} sourceHeight={TILE_H / 2} />
    </g>
  )
}

// A wall drawn taller. Walls fill the whole tile, so each side face can be stretched upward from its own bottom edge
// (an affine map that keeps lines along the face parallel to its edges: seams and trim keep their slope), and the top
// face is moved up unchanged. Faces are cut out of the PNG with clip paths in image coordinates.
// A wall variant (tileArt.js wallVariant: Star Trek wall fittings) replaces the image, never on a window half, and its
// light overlays (or the wall's own, tileArt.js tileAnimations) are drawn through the same faces. Panel art (tileArt.js
// panelArt) replaces both with this tile's slot of the two-tile image: the image is placed offset so the slot lands on
// the tile, and the face clips (relative to the image's own box) move with it.
const NO_OFFSET = { x: 0, y: 0 }
function TallWall({ tile, position, panel }) {
  const art = panelArt(tile, panel, position)
  const variant = (art || panel?.window) ? null : wallVariant(tile, position)
  const imageSize = art ? PANEL_IMAGE : TILE_IMAGE
  const offset = art?.offset ?? NO_OFFSET
  const layers = [
    { key: 'wall', href: art?.href ?? variant?.href ?? tile.image },
    ...(art?.lights ?? variant?.lights ?? tileAnimations(tile)).map((light) => ({
      key: light.style,
      href: light.href,
      className: `tilemap-light is-${light.style}`,
      style: { animationDelay: animationDelay(art?.timing ?? position) },
    })),
  ]
  const box = tileImageBox(position)
  const h = tile.height
  const extra = drawnHeight(tile, true) - h
  const k = (h + extra) / h
  const { width, height } = TILE_IMAGE
  const slope = TILE_H / TILE_W
  const corners = height - TILE_H / 2 // y of the floor diamond's side corners
  const front = height // y of its front corner
  const middle = width / 2
  // y' = k * y + (1 - k) * bottomEdge(x), with bottomEdge(x) = c + m * x.
  const stretch = (c, m) => `matrix(1 ${(1 - k) * m} 0 ${k} 0 ${(1 - k) * c})`
  const polygon = (points) => `polygon(${points.map(([x, y]) => `${x + offset.x}px ${y + offset.y}px`).join(', ')})`
  // The side clips reach 1 px into the top face and past the front corner so no hairline shows between faces.
  const faces = [
    { clip: polygon([[0, corners - h - 1], [middle + 1, front - h - 1], [middle + 1, front], [0, corners]]), transform: stretch(corners, slope) },
    { clip: polygon([[middle, front - h - 1], [width, corners - h - 1], [width, corners], [middle, front]]), transform: stretch(front + middle * slope, -slope) },
    { clip: polygon([[0, 0], [width, 0], [width, corners - h], [middle, front - h], [0, corners - h]]), transform: `translate(0 ${-extra})` },
  ]
  return (
    <g className="tilemap-tile">
      <g transform={`translate(${box.x} ${box.y})`}>
        {layers.map((layer) =>
          faces.map((face, i) => (
            <g key={`${layer.key}${i}`} transform={face.transform}>
              <image
                className={layer.className}
                href={layer.href}
                x={-offset.x}
                y={-offset.y}
                width={imageSize.width}
                height={imageSize.height}
                style={{ ...layer.style, clipPath: face.clip }}
              />
            </g>
          )),
        )}
      </g>
      {panel && <PanelFace tile={tile} position={position} panel={panel} height={h + extra} />}
    </g>
  )
}

// ghost: drawn see-through (the editor uses it to see tiles behind tall blocks). tall: walls and tall objects drawn
// taller, walls always full height (exploration and Combat Type 1). faded: see-through because it hides a party member
// (wallFade.js). panel: this wall's place in a two-tile panel (wallPanels.js; tall walls only), or null. A railing in
// the tall-wall views is drawn as the piece joining its neighbours (railJoins.js), never mirrored.
export const BlockTile = memo(function BlockTile({ map, position, ghost = false, tall = false, faded = false, panel = null }) {
  const tile = getTile(map.tiles[position.y][position.x])
  const joined = tall ? joinedImage(map, position) : null
  const href = joined ?? tileImage(map, position)
  return (
    <g className={`tilemap-block${ghost ? ' is-ghost' : ''}${faded ? ' is-faded' : ''}`} transform={!joined && isMirrored(map, position) ? mirrorTransform(position) : undefined}>
      {tall && tile.wall ? (
        <TallWall tile={tile} position={position} panel={panel} />
      ) : tall && tile.tall ? (
        <TallBlock tile={tile} position={position} />
      ) : (
        <TileImage className="tilemap-tile" href={href} position={position} />
      )}
      {/* A lowered wall (heightVariants) is plain bulkhead, so its fitting's lights would float above it. */}
      {!(tall && tile.wall) && !Object.values(tile.heightVariants ?? {}).includes(href) && <TileLights tile={tile} position={position} />}
      {tile.role === 'hazardControl' && tile.activeImage && <TileImage className="tilemap-tile is-blink" href={tile.activeImage} position={position} />}
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
        <BlockTile key={`${position.x},${position.y}`} map={map} position={position} tall panel={panels.get(`${position.x},${position.y}`)} />
      ))}
    </g>
  )
}

// A 2x2 big object (bigObjects.js): its tile's PNG drawn twice the size over the 2x2 footprint. origin: its top-left tile.
// One image would sort as a single block and cover neighbours beside it, so it is cut into vertical strips, each drawn by
// the tile it stands on in painter's order: the left quarter by the left tile (origin + 0, 1), the right quarter by the
// right tile (origin + 1, 0) and the middle half by the front tile (origin + 1, 1). The back tile draws nothing.
// strip: [from, to] across the image, as fractions of its width.
// mirror: the object is drawn mirrored (its origin tile is rotated); each strip still covers the same part of the
// footprint, cut from the mirrored image.
const BigObjectStrip = memo(function BigObjectStrip({ tile, origin, strip, faded, ghost = false, mirror = false }) {
  const centre = project({ x: origin.x + 0.5, y: origin.y + 0.5 })
  const width = TILE_IMAGE.width * BIG_SCALE
  const height = TILE_IMAGE.height * BIG_SCALE
  const [from, to] = strip
  const flip = mirror ? `translate(${TILE_IMAGE.width} 0) scale(-1 1)` : undefined
  return (
    <g className={`tilemap-block${ghost ? ' is-ghost' : ''}${faded ? ' is-faded' : ''}`}>
      <svg
        x={centre.x - width / 2 + from * width}
        y={centre.y + TILE_H - height}
        width={(to - from) * width}
        height={height}
        viewBox={`${from * TILE_IMAGE.width} 0 ${(to - from) * TILE_IMAGE.width} ${TILE_IMAGE.height}`}
        preserveAspectRatio="none"
      >
        <image className="tilemap-tile" href={tile.image} width={TILE_IMAGE.width} height={TILE_IMAGE.height} transform={flip} />
        {tileAnimations(tile).map((light) => (
          <image
            key={light.style}
            className={`tilemap-tile tilemap-light is-${light.style}`}
            href={light.href}
            width={TILE_IMAGE.width}
            height={TILE_IMAGE.height}
            transform={flip}
            style={{ animationDelay: animationDelay(origin) }}
          />
        ))}
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
      <BigObjectStrip tile={getTile(map.tiles[position.y][position.x])} origin={origin} strip={strip} faded={faded.has(key)} ghost={ghost} mirror={isRotated(map, origin)} />
    )
  }
  const panel = panels.get(key) ?? null
  if (!faded.has(key) || !panel) return <BlockTile map={map} position={position} tall ghost={ghost} faded={faded.has(key)} panel={panel} />
  if (panel.half === 0) return null
  const far = panel.axis === 'x' ? { x: position.x - 1, y: position.y } : { x: position.x, y: position.y - 1 }
  return <FadedPanel map={map} positions={[far, position]} panels={panels} />
}

// One tile on its own as the tall-wall views draw it (the editor's brush): a block with its panel (getWallPanels), or a
// floor tile.
export function LoneTile({ map, position, panel = null }) {
  if (isBlock(map.tiles[position.y][position.x])) return <BlockTile map={map} position={position} tall panel={panel} />
  return <TileImage className="tilemap-tile" href={tileImage(map, position)} position={position} mirror={isMirrored(map, position)} />
}

// A tile as the tall-wall views draw it, for the editor palette: walls and tall objects at their drawn height, and a
// wall with panels as a two-tile panel, with a window unless the wall has none (tiles.json windows).
export function TilePreview({ tile, className }) {
  const positions = tile.panels ? [{ x: 0, y: 0 }, { x: 1, y: 0 }] : [{ x: 0, y: 0 }]
  const map = { width: positions.length, height: 1, tiles: [positions.map(() => tile.id)] }
  const hasWindow = tile.windows !== false
  const panels = new Map(positions.map((position, half) => [`${position.x},${position.y}`, { axis: 'x', half, window: hasWindow }]))
  const extra = drawnHeight(tile, true) - tile.height
  const boxes = positions.map(tileImageBox)
  const minX = Math.min(...boxes.map((box) => box.x))
  const maxX = Math.max(...boxes.map((box) => box.x + box.width))
  const minY = Math.min(...boxes.map((box) => box.y)) - extra
  const maxY = Math.max(...boxes.map((box) => box.y + box.height))
  return (
    <svg className={className} viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      {tile.height > 0 ? (
        positions.map((position) => <BlockTile key={position.x} map={map} position={position} tall panel={tile.panels ? panels.get(`${position.x},0`) : null} />)
      ) : (
        <TileImage className="tilemap-tile" href={tile.image} position={positions[0]} />
      )}
    </svg>
  )
}
