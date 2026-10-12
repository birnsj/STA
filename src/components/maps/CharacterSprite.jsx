import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { directionFor, getSpriteAnimation, getSpriteMetrics, getSpriteSetById, spriteMaskFile, spriteSheetColumns, spriteSheetFile } from '../../rules/appearance.js'
import useIdleFidget from './useIdleFidget.js'
import useRecolouredSheet from './useRecolouredSheet.js'

const METRICS = getSpriteMetrics()
const frameSize = (sheet) => ({ width: sheet.frame.width * sheet.resolution, height: sheet.frame.height * sheet.resolution })
const keyframeName = (name) => `char-sprite-${name}`
// The last frame a non-looping animation shows (a loop slides on to the next frame's edge and starts again).
const lastColumn = ({ start, frames, play }) => (play === 'loop' ? start + frames : start + frames - 1)

// One keyframe animation per animation in characterSprites.json, sliding its sheet a frame at a time along the row
// (the steps are set where it is used), so the figures animate without re-rendering. Added to the page once.
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.dataset.characterSprites = ''
  style.textContent = Object.values(METRICS.sheets)
    .flatMap((sheet) =>
      Object.entries(sheet.animations).map(([name, animation]) => {
        const width = frameSize(sheet).width
        return `@keyframes ${keyframeName(name)} { from { transform: translateX(${-animation.start * width}px); } to { transform: translateX(${-lastColumn(animation) * width}px); } }`
      }),
    )
    .join('\n')
  document.head.appendChild(style)
}

// A stable 0..1 from a figure's id, mixed so ids that differ by one letter still land far apart.
function hashOf(seed) {
  let h = 0
  for (const character of String(seed)) h = (Math.imul(h, 31) + character.charCodeAt(0)) | 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
// Where in its loops a figure starts, so neighbours don't breathe or step in time.
const phaseOf = (seed) => hashOf(seed)

// The maps move a figure's element about as it walks (re-sorted among the walls, into another occlusion window), and a
// CSS animation starts over whenever its element is put back in the page. So each animation is timed from a fixed
// point instead: a loop from the page clock (offset by the figure's phase), a one-shot from when it first played.
// 'seed|name|playKey|reverse' -> performance.now() when that one-shot began.
const oneShotStarts = new Map()
const ONE_SHOTS_KEPT = 200
function startOf(key, now) {
  if (!oneShotStarts.has(key)) {
    if (oneShotStarts.size >= ONE_SHOTS_KEPT) oneShotStarts.delete(oneShotStarts.keys().next().value)
    oneShotStarts.set(key, now)
  }
  return oneShotStarts.get(key)
}

// The walking loops share one stride (each starts with the same foot forward), so a figure switching between them
// carries on from the same point in its step instead of jumping to another foot: seed -> { name, seconds, offset }, the
// gait it last walked and where in the stride (0..1) that loop stood at time 0.
const GAITS = new Set(['walk', 'run', 'sneakWalk'])
const gaitClocks = new Map()
const wrap = (value) => value - Math.floor(value)
function loopOffset(animation, seed, phase, nowSeconds) {
  const fallback = phase ?? phaseOf(seed)
  if (!GAITS.has(animation.name)) return fallback
  const last = gaitClocks.get(seed)
  const offset = !last ? fallback : last.name === animation.name ? last.offset : wrap(nowSeconds / last.seconds + last.offset - nowSeconds / animation.seconds)
  gaitClocks.set(seed, { name: animation.name, seconds: animation.seconds, offset })
  return offset
}

// The movement simulation's walking and running can flick for a moment (speed hovering at the walk/run line, a
// follower easing into its slot, a pause while sidestepping), which would swap the loop every few frames. So a new gait
// is only shown once it has held for GAIT_SETTLE_MS; setting off from standing still shows at once, and stopping shows
// after STOP_SETTLE_MS (just long enough to ride out a one-frame pause, so the figure stops when the character does).
const GAIT_SETTLE_MS = 250
const STOP_SETTLE_MS = 100
const STANDING = new Set(['idle', 'sneakIdle'])
function useSteadyGait(gait) {
  const [steady, setSteady] = useState(gait)
  const immediate = STANDING.has(steady) && !STANDING.has(gait)
  useEffect(() => {
    if (gait === steady) return undefined
    const delay = immediate ? 0 : STANDING.has(gait) ? STOP_SETTLE_MS : GAIT_SETTLE_MS
    const timer = setTimeout(() => setSteady(gait), delay)
    return () => clearTimeout(timer)
  }, [gait, steady, immediate])
  return immediate ? gait : steady
}

// The image's inline style. Its transform is the frame shown without animation (reduced motion): a loop's first, a
// once's middle, a hold's last (or first, played backwards). now: performance.now() when the image was put on the page.
function animationStyle(animation, { seed, phase, settled, reverse, speed, playKey, now }) {
  const width = frameSize(animation.sheet).width
  const { start, frames, seconds, play } = animation
  const rest = play === 'loop' ? start : play === 'once' ? start + Math.floor(frames / 2) : reverse ? start : start + frames - 1
  const style = { transform: `translateX(${-rest * width}px)` }
  if (play === 'loop') {
    const delay = -((now / 1000 + loopOffset(animation, seed, phase, now / 1000) * seconds) % seconds)
    style.animation = `${keyframeName(animation.name)} ${seconds}s steps(${frames}) ${delay}s infinite`
  } else if (!settled) {
    const delay = -(now - startOf(`${seed}|${animation.name}|${playKey}|${reverse}`, now)) / 1000
    style.animation = `${keyframeName(animation.name)} ${seconds / speed}s steps(${frames}, jump-none) ${delay}s 1 ${reverse ? 'reverse' : 'normal'} both`
  }
  return style
}

// The sheet image, its animation timed when it is put on the page (so re-renders leave it running undisturbed).
// The board re-sorts its figures by depth as they pass one another, which moves this element in the page, and a moved
// element's CSS animation starts over from the delay it was given when it first appeared. Done every frame (followers
// jostling in formation), the figure froze on that first frame. So after each render the animation's clock is set back
// to the time since it appeared, before the frame is painted.
function SheetImage({ animation, timing, ...image }) {
  const ref = useRef(null)
  const [{ style, shownAt }] = useState(() => {
    const now = performance.now()
    return { style: animationStyle(animation, { ...timing, now }), shownAt: now }
  })
  useLayoutEffect(() => {
    const running = ref.current?.getAnimations?.()[0]
    if (running) running.currentTime = performance.now() - shownAt
  })
  return <image ref={ref} className="char-sprite-sheet" {...image} style={style} />
}

// The full-body figure of a character on the maps, its feet at (0, 0). setId: characterSprites.json set; colour: the
// uniform colour (getUniformColour) or null; facing: { x, y } along the map axes.
// animation: an animation by name (characterSprites.json), else walk / run / idle from walking and running, or the
// crouched sneakWalk / sneakIdle while sneaking.
// playKey: a non-looping animation plays again whenever it changes. settled: a hold animation (a fall) shows its last
// frame without playing. reverse: plays it backwards (getting up). speed: divides a non-looping animation's time.
// preload: load every sheet now (combat), not after the base sheet. fidgets: while standing idle, now and then play
// one of the idle sheet's fidgets (useIdleFidget). phase: where its loops start (0..1), else picked from seed.
export default function CharacterSprite({ setId, colour = null, facing, animation: named = null, walking = false, running = false, sneaking = false, seed = '', phase = null, playKey = 0, settled = false, reverse = false, speed = 1, preload = false, fidgets = false }) {
  const set = getSpriteSetById(setId)
  const moving = useSteadyGait(sneaking ? (walking ? 'sneakWalk' : 'sneakIdle') : running ? 'run' : walking ? 'walk' : 'idle')
  const posed = getSpriteAnimation(named ?? moving)
  // The base sheet first, then the rest in the background once it is ready, so the figure shows as soon as it can and
  // its first sneak, attack or fall doesn't wait for a sheet. All at once with preload, which MapFadeIn waits for.
  const sheetArgs = (sheetId, wanted) => [set && spriteSheetFile(set, sheetId), set && spriteMaskFile(set, sheetId), set?.uniformDivision, colour, Boolean(set) && wanted]
  const base = useRecolouredSheet(...sheetArgs('base', true))
  const later = (sheetId) => sheetArgs(sheetId, preload || Boolean(base) || sheetId === posed.sheetId)
  const sheets = {
    base,
    combat: useRecolouredSheet(...later('combat')),
    fall: useRecolouredSheet(...later('fall')),
    sneak: useRecolouredSheet(...later('sneak')),
    idle: useRecolouredSheet(...sheetArgs('idle', fidgets && Boolean(base))),
  }
  const fidget = useIdleFidget(fidgets && !named && moving === 'idle', sheets.idle)
  const animation = fidget ? getSpriteAnimation(fidget.name) : posed
  const shownPlayKey = fidget ? fidget.playKey : playKey
  const href = sheets[animation.sheetId]
  const layer = href && {
    key: `${animation.play === 'loop' ? animation.name : `${animation.name}:${shownPlayKey}:${reverse}:${settled}:${speed}`}|${href}`,
    animation,
    href,
    timing: { seed, phase, settled, reverse, speed, playKey: shownPlayKey },
  }
  // The last image that has loaded and drawn. A newly switched-to sheet takes a moment to decode, so this one stays
  // underneath until it has, instead of the figure blinking out for a frame.
  const [loadedLayer, setLoadedLayer] = useState(null)
  if (!set) return null
  const { row, mirror } = directionFor(facing)
  const layers = loadedLayer && layer && loadedLayer.key !== layer.key ? [loadedLayer, layer] : layer ? [layer] : []
  return (
    <g className="char-sprite" transform={METRICS.displayScale && METRICS.displayScale !== 1 ? `scale(${METRICS.displayScale})` : undefined}>
      <ellipse className="char-sprite-shadow" cx="0" cy="0" rx="11" ry="5" />
      {/* What a click lands on: the figure's outline, not the whole sheet. */}
      <rect x="-9" y="-54" width="18" height="56" rx="6" fill="transparent" />
      {layers.map((shown) => (
        <SpriteLayer key={shown.key} layer={shown} row={row} mirror={mirror} onShown={shown === layer ? () => setLoadedLayer(layer) : undefined} />
      ))}
    </g>
  )
}

// One animation's sheet, clipped to a frame and turned to the facing row. onShown: called once its image has loaded.
function SpriteLayer({ layer: { animation, href, timing }, row, mirror, onShown }) {
  const sheet = animation.sheet
  const frame = frameSize(sheet)
  return (
    <svg pointerEvents="none" x={-sheet.anchor.x} y={-sheet.anchor.y} width={sheet.frame.width} height={sheet.frame.height} viewBox={`0 0 ${frame.width} ${frame.height}`} overflow="hidden">
      <g transform={mirror ? `matrix(-1 0 0 1 ${frame.width} 0)` : undefined}>
        <SheetImage
          animation={animation}
          timing={timing}
          href={href}
          x="0"
          y={-row * frame.height}
          width={spriteSheetColumns(animation.sheetId) * frame.width}
          height={METRICS.directions.length * frame.height}
          onLoad={onShown}
          onError={onShown}
        />
      </g>
    </svg>
  )
}
