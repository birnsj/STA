import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { directionFor, getSpriteAnimation, getSpriteMetrics, getSpriteSetById, spriteMaskFile, spriteSheetColumns, spriteSheetFile } from '../../rules/appearance.js'
import useIdleFidget from './useIdleFidget.js'
import useRecolouredSheet from './useRecolouredSheet.js'
import { gaitDelay, lastColumn, loopOffset, oneShotKey, restColumn, startOf } from './spriteTiming.js'

const METRICS = getSpriteMetrics()
const frameSize = (sheet) => ({ width: sheet.frame.width * sheet.resolution, height: sheet.frame.height * sheet.resolution })

// A new gait is only shown once it has held a moment (spriteTiming.js gaitDelay), so a flicker between walking and
// running doesn't swap the loop every few frames.
function useSteadyGait(gait) {
  const [steady, setSteady] = useState(gait)
  const immediate = gaitDelay(steady, gait) === 0 && gait !== steady
  useEffect(() => {
    if (gait === steady) return undefined
    const timer = setTimeout(() => setSteady(gait), gaitDelay(steady, gait))
    return () => clearTimeout(timer)
  }, [gait, steady])
  return immediate ? gait : steady
}

// The image's inline style and its animation. The style's transform is the frame shown without animation (reduced
// motion): a loop's first, a once's middle, a hold's last (or first, played backwards). The plan is element.animate's
// keyframes and options, and how far into it (ms) the animation stands at now, or null for none.
// now: performance.now() when the image was put on the page.
function animationPlan(animation, { seed, phase, settled, reverse, speed, playKey, now }) {
  const width = frameSize(animation.sheet).width
  const { start, frames, seconds, play } = animation
  const rest = restColumn(animation, reverse)
  const style = { transform: `translateX(${-rest * width}px)` }
  const keyframes = [{ transform: `translateX(${-start * width}px)` }, { transform: `translateX(${-lastColumn(animation) * width}px)` }]
  if (play === 'loop') {
    const elapsed = ((now / 1000 + loopOffset(animation, seed, phase, now / 1000) * seconds) % seconds) * 1000
    return { style, plan: { keyframes, options: { duration: seconds * 1000, iterations: Infinity, easing: `steps(${frames})` }, elapsed } }
  }
  if (settled) return { style, plan: null }
  const elapsed = now - startOf(oneShotKey(seed, animation.name, playKey, reverse), now)
  const options = { duration: (seconds / speed) * 1000, iterations: 1, easing: `steps(${frames}, jump-none)`, direction: reverse ? 'reverse' : 'normal', fill: 'both' }
  return { style, plan: { keyframes, options, elapsed } }
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// The sheet image, its animation started when it is put on the page (so re-renders leave it running undisturbed).
// The board re-sorts its figures by depth as they pass one another, which moves this element in the page. A CSS
// animation starts over whenever its element is moved; a script animation (element.animate) keeps its place on the
// page clock, so the figure walks on without being re-timed after every render.
function SheetImage({ animation, timing, ...image }) {
  const ref = useRef(null)
  const [{ style, plan, shownAt }] = useState(() => {
    const now = performance.now()
    return { ...animationPlan(animation, { ...timing, now }), shownAt: now }
  })
  useLayoutEffect(() => {
    const element = ref.current
    if (!plan || !element?.animate || reducedMotion()) return undefined
    const running = element.animate(plan.keyframes, plan.options)
    running.currentTime = plan.elapsed + performance.now() - shownAt
    return () => running.cancel()
  }, [plan, shownAt])
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
    surrender: useRecolouredSheet(...later('surrender')),
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
