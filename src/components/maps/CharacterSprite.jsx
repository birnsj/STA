import { useState } from 'react'
import { directionFor, getSpriteAnimation, getSpriteMetrics, getSpriteSetById, spriteMaskFile, spriteSheetColumns, spriteSheetFile } from '../../rules/appearance.js'
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

// A stable 0..1 from a figure's id, so neighbours don't breathe or step in time.
function phaseOf(seed) {
  let h = 0
  for (const character of String(seed)) h = (Math.imul(h, 31) + character.charCodeAt(0)) | 0
  return ((h >>> 0) % 1000) / 1000
}

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

// The image's inline style. Its transform is the frame shown without animation (reduced motion): a loop's first, a
// once's middle, a hold's last (or first, played backwards). now: performance.now() when the image was put on the page.
function animationStyle(animation, { seed, settled, reverse, speed, playKey, now }) {
  const width = frameSize(animation.sheet).width
  const { start, frames, seconds, play } = animation
  const rest = play === 'loop' ? start : play === 'once' ? start + Math.floor(frames / 2) : reverse ? start : start + frames - 1
  const style = { transform: `translateX(${-rest * width}px)` }
  if (play === 'loop') {
    const delay = -((now / 1000 + phaseOf(seed) * seconds) % seconds)
    style.animation = `${keyframeName(animation.name)} ${seconds}s steps(${frames}) ${delay}s infinite`
  } else if (!settled) {
    const delay = -(now - startOf(`${seed}|${animation.name}|${playKey}|${reverse}`, now)) / 1000
    style.animation = `${keyframeName(animation.name)} ${seconds / speed}s steps(${frames}, jump-none) ${delay}s 1 ${reverse ? 'reverse' : 'normal'} both`
  }
  return style
}

// The sheet image, its animation timed when it is put on the page (so re-renders leave it running undisturbed).
function SheetImage({ animation, timing, ...image }) {
  const [style] = useState(() => animationStyle(animation, { ...timing, now: performance.now() }))
  return <image className="char-sprite-sheet" {...image} style={style} />
}

// The full-body figure of a character on the maps, its feet at (0, 0). setId: characterSprites.json set; colour: the
// uniform colour (getUniformColour) or null; facing: { x, y } along the map axes.
// animation: an animation by name (characterSprites.json), else walk / run / idle from walking and running, or the
// crouched sneakWalk / sneakIdle while sneaking.
// playKey: a non-looping animation plays again whenever it changes. settled: a hold animation (a fall) shows its last
// frame without playing. reverse: plays it backwards (getting up). speed: divides a non-looping animation's time.
// preload: load every sheet now (combat), not when first shown.
export default function CharacterSprite({ setId, colour = null, facing, animation: named = null, walking = false, running = false, sneaking = false, seed = '', playKey = 0, settled = false, reverse = false, speed = 1, preload = false }) {
  const set = getSpriteSetById(setId)
  const moving = sneaking ? (walking ? 'sneakWalk' : 'sneakIdle') : running ? 'run' : walking ? 'walk' : 'idle'
  const animation = getSpriteAnimation(named ?? moving)
  // Each sheet loads only once it is in use (or all at once, with preload); base always.
  const sheetArgs = (sheetId) => [set && spriteSheetFile(set, sheetId), set && spriteMaskFile(set, sheetId), set?.uniformDivision, colour, Boolean(set) && (preload || sheetId === 'base' || sheetId === animation.sheetId)]
  const sheets = {
    base: useRecolouredSheet(...sheetArgs('base')),
    combat: useRecolouredSheet(...sheetArgs('combat')),
    fall: useRecolouredSheet(...sheetArgs('fall')),
    sneak: useRecolouredSheet(...sheetArgs('sneak')),
  }
  if (!set) return null
  const { row, mirror } = directionFor(facing)
  const sheet = animation.sheet
  const frame = frameSize(sheet)
  const href = sheets[animation.sheetId]
  return (
    <g className="char-sprite">
      <ellipse className="char-sprite-shadow" cx="0" cy="0" rx="11" ry="5" />
      {/* What a click lands on: the figure's outline, not the whole sheet. */}
      <rect x="-9" y="-54" width="18" height="56" rx="6" fill="transparent" />
      {href && (
        <svg pointerEvents="none" x={-sheet.anchor.x} y={-sheet.anchor.y} width={sheet.frame.width} height={sheet.frame.height} viewBox={`0 0 ${frame.width} ${frame.height}`} overflow="hidden">
          <g transform={mirror ? `matrix(-1 0 0 1 ${frame.width} 0)` : undefined}>
            <SheetImage
              key={animation.play === 'loop' ? animation.name : `${animation.name}:${playKey}:${reverse}:${settled}:${speed}`}
              animation={animation}
              timing={{ seed, settled, reverse, speed, playKey }}
              href={href}
              x="0"
              y={-row * frame.height}
              width={spriteSheetColumns(animation.sheetId) * frame.width}
              height={METRICS.directions.length * frame.height}
            />
          </g>
        </svg>
      )}
    </g>
  )
}
