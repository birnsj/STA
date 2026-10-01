import { useMemo } from 'react'

// Depth layers, far to near. Drift durations differ so the layers never move in step.
const LAYERS = [
  { id: 'far', count: 70, size: [0.8, 1.2], opacity: [0.25, 0.55], twinkleShare: 0.3, drift: 'star-drift-far' },
  { id: 'mid', count: 38, size: [1.2, 1.8], opacity: [0.4, 0.75], twinkleShare: 0.45, drift: 'star-drift-mid' },
  { id: 'near', count: 14, size: [1.8, 2.4], opacity: [0.55, 0.9], twinkleShare: 0.6, drift: 'star-drift-near' },
  // Bright stars with cross-shaped glints that clearly flare and fade.
  { id: 'sparkle', count: 16, size: [2.5, 4], opacity: [0.8, 1], twinkleShare: 1, drift: 'star-drift-near', sparkle: true },
]

// Deterministic PRNG so the starfield is identical on every load.
function createRandom(seed) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
const inBox = (x, y, left, top, right, bottom) => x >= left && x <= right && y >= top && y <= bottom

// Keeps stars in open sky: off the planet, the Enterprise, the sun, the logo, and the menu (1024x576 image coordinates).
function isOpenSky(x, y) {
  if (inEllipse(x, y, 160, 1340, 1270, 1015)) return false
  if (inEllipse(x, y, 770, 200, 240, 95)) return false
  if (inEllipse(x, y, 540, 290, 230, 105)) return false
  if (inEllipse(x, y, 1010, 225, 70, 70)) return false
  if (inBox(x, y, 30, 20, 500, 190)) return false
  if (inBox(x, y, 35, 180, 320, 525)) return false
  return true
}

function createStars(width, height) {
  const random = createRandom(1701)
  const between = ([min, max]) => min + random() * (max - min)
  return LAYERS.map((layer) => {
    const stars = []
    while (stars.length < layer.count) {
      const x = random() * width
      const y = random() * height
      if (!isOpenSky(x, y)) continue
      stars.push({
        x,
        y,
        size: between(layer.size),
        opacity: between(layer.opacity),
        twinkle: random() < layer.twinkleShare,
        // Negative delays start each twinkle mid-cycle so no two stars pulse together.
        twinkleDuration: between([4, 12]),
        twinkleDelay: -between([0, 12]),
      })
    }
    return { ...layer, stars }
  })
}

export default function Starfield({ width, height }) {
  const layers = useMemo(() => createStars(width, height), [width, height])
  return (
    <div className="starfield" aria-hidden="true">
      {layers.map((layer) => (
        <div key={layer.id} className={`star-layer ${layer.drift}`}>
          {layer.stars.map((star, index) => (
            <span
              key={index}
              className={`star${layer.sparkle ? ' is-sparkle' : star.twinkle ? ' is-twinkling' : ''}`}
              style={{
                left: star.x,
                top: star.y,
                width: star.size,
                height: star.size,
                '--star-opacity': star.opacity,
                '--twinkle-duration': `${star.twinkleDuration}s`,
                '--twinkle-delay': `${star.twinkleDelay}s`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
