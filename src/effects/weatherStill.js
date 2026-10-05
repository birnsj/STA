import { WEATHER_KINDS } from './weatherKinds.js'

// One still frame of a weather's fx (weather.json), for Generate Card to paint onto an episode picture. Each layer runs
// for a few seconds first so its particles spread out, and lightning strikes on the final frame. Falling particles are
// thickened, since motion is what makes a sparse fall read on the moving overlay.
const WARM_UP = 3
const STEP = 1 / 30
const FALLING = new Set(['rain', 'sand', 'snow', 'ash'])
const STILL_DENSITY = 2.5

export function paintWeatherStill(ctx, fx, width, height) {
  if (!fx) return
  if (fx.tint) {
    ctx.fillStyle = fx.tint
    ctx.fillRect(0, 0, width, height)
  }
  for (const source of fx.layers ?? []) {
    const kind = WEATHER_KINDS[source.kind]
    if (!kind) continue
    const layer = FALLING.has(source.kind) ? { ...source, density: (source.density ?? 0) * STILL_DENSITY } : source
    const state = kind.make(layer, width, height)
    for (let time = 0; time < WARM_UP; time += STEP) kind.step(state, layer, STEP, time, width, height)
    kind.strike?.(state)
    kind.step(state, layer, STEP, WARM_UP, width, height)
    kind.draw(ctx, state, layer, WARM_UP, width, height)
  }
  if (fx.pulse) {
    const [low, high] = fx.pulse.alpha
    ctx.fillStyle = `rgba(${fx.pulse.colour}, ${(low + high) / 2})`
    ctx.fillRect(0, 0, width, height)
  }
}
