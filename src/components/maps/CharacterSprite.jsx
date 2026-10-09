import { directionFor, getSpriteMetrics, getSpriteSetById } from '../../rules/appearance.js'
import useRecolouredSheet from './useRecolouredSheet.js'

const METRICS = getSpriteMetrics()
const FRAME = { width: METRICS.frame.width * METRICS.resolution, height: METRICS.frame.height * METRICS.resolution }
const COLUMNS = Math.max(...Object.values(METRICS.animations).map((animation) => animation.start + animation.frames))
const keyframeName = (name) => `char-sprite-${name}`

// One keyframe animation per animation in characterSprites.json, sliding the sheet a frame at a time along its row
// (the steps are set where it is used), so the figures animate without re-rendering. Added to the page once.
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.dataset.characterSprites = ''
  style.textContent = Object.entries(METRICS.animations)
    .map(
      ([name, { start, frames }]) =>
        `@keyframes ${keyframeName(name)} { from { transform: translateX(${-start * FRAME.width}px); } to { transform: translateX(${-(start + frames) * FRAME.width}px); } }`,
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

// The full-body figure of a character on the maps, its feet at (0, 0). setId: characterSprites.json set; colour: the
// uniform colour (getUniformColour) or null; facing: { x, y } along the map axes; walking / running: plays the walk or
// run loop, else idle.
export default function CharacterSprite({ setId, colour = null, facing, walking = false, running = false, seed = '' }) {
  const set = getSpriteSetById(setId)
  const sheet = useRecolouredSheet(set, colour)
  if (!set) return null
  const { row, mirror } = directionFor(facing)
  const name = running ? 'run' : walking ? 'walk' : 'idle'
  const animation = METRICS.animations[name]
  const style = {
    transform: `translateX(${-animation.start * FRAME.width}px)`,
    animation: `${keyframeName(name)} ${animation.seconds}s steps(${animation.frames}) ${-phaseOf(seed) * animation.seconds}s infinite`,
  }
  return (
    <g className="char-sprite">
      <ellipse className="char-sprite-shadow" cx="0" cy="0" rx="11" ry="5" />
      {/* What a click lands on: the figure's outline, not the whole sheet. */}
      <rect x="-9" y="-54" width="18" height="56" rx="6" fill="transparent" />
      {sheet && (
        <svg
          pointerEvents="none"
          x={-METRICS.anchor.x}
          y={-METRICS.anchor.y}
          width={METRICS.frame.width}
          height={METRICS.frame.height}
          viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
          overflow="hidden"
        >
          <g transform={mirror ? `matrix(-1 0 0 1 ${FRAME.width} 0)` : undefined}>
            <image
              className="char-sprite-sheet"
              href={sheet}
              x="0"
              y={-row * FRAME.height}
              width={COLUMNS * FRAME.width}
              height={METRICS.directions.length * FRAME.height}
              style={style}
            />
          </g>
        </svg>
      )}
    </g>
  )
}
