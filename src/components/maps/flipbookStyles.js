// CSS for the SVG views' flipbooks (tileArt.js): every sprite of a tile's animation is drawn stacked, and a keyframe
// animation per sprite shows it only on its own frames, so the views animate without re-rendering. Built once from
// tileEffects.json and added to the page. Nothing animating (maps.css reduced motion, the editor's Tile animations
// off), each sprite rests at its inline opacity: the loop's first frame shows.
import { allAnimations } from '../../maps/tileArt.js'

const keyframeName = (id, index) => `tile-frame-${id}-${index}`

// One sprite's keyframes: opacity 1 on its frames and 0 on the others, held in steps (maps.css tilemap-frame).
function keyframes(id, frames, index) {
  const stops = []
  frames.forEach((shown, k) => {
    const value = shown === index ? 1 : 0
    if (k === 0 || (frames[k - 1] === index ? 1 : 0) !== value) stops.push(`${((k / frames.length) * 100).toFixed(3)}% { opacity: ${value}; }`)
  })
  stops.push(`100% { opacity: ${frames[frames.length - 1] === index ? 1 : 0}; }`)
  return `@keyframes ${keyframeName(id, index)} { ${stops.join(' ')} }`
}

if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.dataset.flipbooks = ''
  style.textContent = allAnimations()
    .flatMap(({ id, frames }) => [...new Set(frames)].map((index) => keyframes(id, frames, index)))
    .join('\n')
  document.head.appendChild(style)
}

// The inline style for a flipbook's sprite `index` (class tilemap-frame), delay a CSS time offsetting this tile.
export function frameStyle(book, index, delay) {
  return {
    animationName: keyframeName(book.id, index),
    animationDuration: `${book.loop}s`,
    animationDelay: delay,
    opacity: book.frames[0] === index ? 1 : 0,
  }
}
