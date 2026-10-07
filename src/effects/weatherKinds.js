// The weather overlay's layer kinds (see the fx notes in weather.json). Each kind makes its own state for the screen
// size, advances it every frame (skipped under reduced motion) and draws it:
//   make(layer, width, height) -> state; step(state, layer, dt, time, width, height); draw(ctx, state, layer, time, width, height)
// Ground-level kinds also give period(width, height) -> [x, y], the span their state wraps around in, so an overlay that
// follows a board can repeat them seamlessly across the map. Kinds without one (sky and screen effects) stay on screen.
const AREA_UNIT = 10000
const TAU = Math.PI * 2

export const between = ([low, high]) => low + Math.random() * (high - low)
const wrap = (value, size, margin) => {
  const span = size + margin * 2
  return ((((value + margin) % span) + span) % span) - margin
}
const countFor = (layer, width, height, min = 1) => Math.max(min, Math.round(((layer.density ?? 0) * width * height) / AREA_UNIT))
const rgba = (colour, alpha) => `rgba(${colour}, ${alpha})`

// Rain, sand, snow and ash: particles that travel along the layer's angle and wrap around the screen.
function driftingParticles(layer, width, height) {
  const radians = ((layer.angle ?? 0) * Math.PI) / 180
  return Array.from({ length: countFor(layer, width, height) }, () => {
    const speed = layer.speed * between([0.7, 1.3])
    const ember = layer.embers > 0 && Math.random() < layer.embers
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.sin(radians) * speed,
      vy: ember ? -speed * 0.8 : Math.cos(radians) * speed,
      size: between(layer.size ?? [1, 2]),
      phase: Math.random() * TAU,
      ember,
    }
  })
}

function stepDrifting(particles, dt, time, width, height, sway) {
  for (const p of particles) {
    p.x = wrap(p.x + (p.vx + Math.sin(time * 1.3 + p.phase) * sway) * dt, width, 40)
    p.y = wrap(p.y + p.vy * dt, height, 40)
  }
}

const driftingPeriod = (width, height) => [width + 80, height + 80]

const streaks = {
  make: (layer, width, height) => ({ particles: driftingParticles(layer, width, height) }),
  period: driftingPeriod,
  step: (state, layer, dt, time, width, height) => stepDrifting(state.particles, dt, time, width, height, 0),
  draw(ctx, state, layer) {
    ctx.strokeStyle = layer.colour
    ctx.lineWidth = layer.width ?? (layer.kind === 'rain' ? 1.1 : 1.6)
    ctx.beginPath()
    for (const p of state.particles) {
      const speed = Math.hypot(p.vx, p.vy) || 1
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - (p.vx / speed) * layer.length, p.y - (p.vy / speed) * layer.length)
    }
    ctx.stroke()
  },
}

const flakes = {
  make: streaks.make,
  period: driftingPeriod,
  step: (state, layer, dt, time, width, height) => stepDrifting(state.particles, dt, time, width, height, layer.sway ?? 18),
  draw(ctx, state, layer, time) {
    ctx.fillStyle = layer.colour
    ctx.beginPath()
    for (const p of state.particles) {
      if (p.ember) continue
      ctx.moveTo(p.x + p.size, p.y)
      ctx.arc(p.x, p.y, p.size, 0, TAU)
    }
    ctx.fill()
    for (const p of state.particles) {
      if (!p.ember) continue
      ctx.fillStyle = `rgba(255, ${120 + Math.round(60 * Math.sin(time * 6 + p.phase))}, 40, 0.85)`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 0.8, 0, TAU)
      ctx.fill()
    }
  },
}

// Fog: large soft banks drifting sideways.
const fog = {
  make: (layer, width, height) => ({
    banks: Array.from({ length: countFor(layer, width, height, 3) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: layer.speed * between([0.5, 1.2]),
      size: between([0.18, 0.4]) * Math.min(width, height),
    })),
  }),
  period: (width, height) => [width + Math.min(width, height) * 0.8, height],
  step(state, layer, dt, time, width, height) {
    const margin = Math.min(width, height) * 0.4
    for (const bank of state.banks) bank.x = wrap(bank.x + bank.vx * dt, width, margin)
  },
  draw(ctx, state, layer) {
    for (const bank of state.banks) {
      // A bank's gradient only ever moves, so it is built once around the origin and then translated into place rather
      // than rebuilt every frame (make() runs again on a resize, which drops these with the old banks).
      if (!bank.fill) {
        bank.fill = ctx.createRadialGradient(0, 0, 0, 0, 0, bank.size)
        bank.fill.addColorStop(0, layer.colour)
        bank.fill.addColorStop(1, 'rgba(0, 0, 0, 0)')
      }
      ctx.save()
      ctx.translate(bank.x, bank.y)
      ctx.fillStyle = bank.fill
      ctx.fillRect(-bank.size, -bank.size, bank.size * 2, bank.size * 2)
      ctx.restore()
    }
  },
}

// Sparks: a few fixed burst points; each spark waits until its point bursts, then flies and falls until it fades.
const SPARK_BURST = 0.45
const sparks = {
  make(layer, width, height) {
    const emitters = Array.from({ length: layer.emitters ?? 3 }, () => ({ x: Math.random() * width, y: Math.random() * height, wait: between(layer.every), burst: 0 }))
    const particles = Array.from({ length: countFor(layer, width, height) }, (_, index) => ({ emitter: index % emitters.length, life: 0, maxLife: 1, x: 0, y: 0, vx: 0, vy: 0 }))
    return { emitters, particles }
  },
  period: (width, height) => [width, height],
  step(state, layer, dt) {
    for (const emitter of state.emitters) {
      emitter.burst -= dt
      emitter.wait -= dt
      if (emitter.wait <= 0) {
        emitter.burst = SPARK_BURST
        emitter.wait = between(layer.every)
      }
    }
    for (const p of state.particles) {
      if (p.life > 0) {
        p.vy += 700 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
        continue
      }
      const emitter = state.emitters[p.emitter]
      if (emitter.burst > 0 && Math.random() < dt * 20) {
        const angle = -Math.PI / 2 + between([-1.2, 1.2])
        const speed = between([120, 320])
        Object.assign(p, { x: emitter.x, y: emitter.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, maxLife: between([0.35, 0.8]) })
        p.life = p.maxLife
      }
    }
  },
  draw(ctx, state, layer) {
    for (const emitter of state.emitters) {
      if (emitter.burst <= 0) continue
      const glow = ctx.createRadialGradient(emitter.x, emitter.y, 0, emitter.x, emitter.y, 26)
      glow.addColorStop(0, rgba(layer.colour, 0.9 * (emitter.burst / SPARK_BURST)))
      glow.addColorStop(1, rgba(layer.colour, 0))
      ctx.fillStyle = glow
      ctx.fillRect(emitter.x - 26, emitter.y - 26, 52, 52)
    }
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    for (const p of state.particles) {
      if (p.life <= 0) continue
      ctx.strokeStyle = rgba(layer.colour, p.life / p.maxLife)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04)
      ctx.stroke()
    }
  },
}

// Bolt: a jagged, branching strike from the top of the screen, every [min, max] seconds.
const BOLT_LIFE = 0.4
function boltBranch(x, y) {
  const points = [[x, y]]
  const lean = Math.random() < 0.5 ? -1 : 1
  const steps = Math.round(between([3, 7]))
  for (let i = 0; i < steps; i++) {
    x += lean * between([6, 24])
    y += between([10, 22])
    points.push([x, y])
  }
  return points
}
function boltPaths(width, height) {
  let x = Math.random() * width
  let y = -10
  const end = between([0.45, 0.9]) * height
  const main = [[x, y]]
  const branches = []
  while (y < end) {
    x += between([-22, 22])
    y += between([14, 30])
    main.push([x, y])
    if (Math.random() < 0.18) branches.push(boltBranch(x, y))
  }
  return [main, ...branches]
}
const bolt = {
  make: (layer) => ({ wait: between(layer.every), age: Infinity, paths: [] }),
  // Fires on the next step (still pictures want the strike in frame).
  strike: (state) => {
    state.wait = 0
  },
  step(state, layer, dt, time, width, height) {
    state.age += dt
    state.wait -= dt
    if (state.wait <= 0) {
      state.paths = boltPaths(width, height)
      state.age = 0
      state.wait = between(layer.every)
    }
  },
  draw(ctx, state, layer) {
    if (state.age > BOLT_LIFE) return
    const flicker = state.age < 0.06 ? 1 : state.age < 0.12 ? 0.3 : 1 - state.age / BOLT_LIFE
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const [lineWidth, alpha] of [[8, 0.22], [2.2, 1]]) {
      ctx.lineWidth = lineWidth
      ctx.strokeStyle = rgba(layer.colour, alpha * flicker)
      ctx.beginPath()
      for (const path of state.paths) path.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.stroke()
    }
  },
}

// Glints: points that twinkle on and off (crystals, ice, charged motes), optionally drifting sideways.
const glints = {
  make: (layer, width, height) => ({
    particles: Array.from({ length: countFor(layer, width, height) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      phase: Math.random() * TAU,
      rate: between([0.6, 1.6]) * (layer.twinkle ?? 2),
      size: between(layer.size ?? [1.5, 3.5]),
    })),
  }),
  period: (width, height) => [width + 20, height],
  step(state, layer, dt, time, width) {
    for (const p of state.particles) p.x = wrap(p.x + (layer.speed ?? 0) * dt, width, 10)
  },
  draw(ctx, state, layer, time) {
    ctx.lineWidth = 1
    for (const p of state.particles) {
      const alpha = Math.max(0, Math.sin(time * p.rate + p.phase)) ** 4
      if (alpha < 0.02) continue
      ctx.strokeStyle = rgba(layer.colour, alpha)
      ctx.fillStyle = rgba(layer.colour, alpha)
      ctx.beginPath()
      ctx.moveTo(p.x - p.size * 2, p.y)
      ctx.lineTo(p.x + p.size * 2, p.y)
      ctx.moveTo(p.x, p.y - p.size * 2)
      ctx.lineTo(p.x, p.y + p.size * 2)
      ctx.stroke()
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
  },
}

// Aurora: translucent ribbons waving across the top of the view, one per colour.
const aurora = {
  make: (layer) => ({ bands: layer.colours.map((colour, index) => ({ colour, phase: Math.random() * TAU, top: 0.06 + index * 0.08 })) }),
  step() {},
  draw(ctx, state, layer, time, width, height) {
    const depth = (layer.height ?? 0.35) * height
    for (const band of state.bands) {
      const top = band.top * height
      const edge = (x, offset) =>
        top + offset + Math.sin(x * 0.006 + time * (layer.speed ?? 0.4) + band.phase) * height * 0.05 + Math.sin(x * 0.017 + time * 0.9 + band.phase) * height * 0.015
      const gradient = ctx.createLinearGradient(0, top, 0, top + depth)
      gradient.addColorStop(0, rgba(band.colour, 0))
      gradient.addColorStop(0.25, rgba(band.colour, layer.alpha ?? 0.22))
      gradient.addColorStop(1, rgba(band.colour, 0))
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.moveTo(0, edge(0, 0))
      for (let x = 24; x <= width + 24; x += 24) ctx.lineTo(x, edge(x, 0))
      for (let x = width + 24; x >= 0; x -= 24) ctx.lineTo(x, edge(x, depth))
      ctx.closePath()
      ctx.fill()
    }
  },
}

// Ripple: rings (flattened to the isometric ground) spreading from random points and fading, every [min, max] seconds.
const ripple = {
  make: (layer) => ({ rings: [], wait: between(layer.every) }),
  period: (width, height) => [width, height],
  step(state, layer, dt, time, width, height) {
    state.wait -= dt
    if (state.wait <= 0) {
      state.rings.push({ x: Math.random() * width, y: Math.random() * height, age: 0 })
      state.wait = between(layer.every)
    }
    for (const ring of state.rings) ring.age += dt
    state.rings = state.rings.filter((ring) => ring.age < layer.life)
  },
  draw(ctx, state, layer) {
    ctx.lineWidth = layer.width ?? 2
    for (const ring of state.rings) {
      for (const lag of [0, 0.18]) {
        const t = ring.age / layer.life - lag
        if (t <= 0) continue
        ctx.strokeStyle = rgba(layer.colour, (1 - t) * (layer.alpha ?? 0.5))
        ctx.beginPath()
        ctx.ellipse(ring.x, ring.y, t * layer.radius, t * layer.radius * 0.5, 0, 0, TAU)
        ctx.stroke()
      }
    }
  },
}

// Vortex: dust devils; funnels of grains spiralling upward, each funnel wandering sideways.
const vortex = {
  make: (layer, width, height) => ({
    devils: Array.from({ length: layer.count ?? 2 }, () => ({
      x: Math.random() * width,
      y: Math.min(height, Math.max((layer.height ?? 110) + 20, between([0.3, 0.95]) * height)),
      vx: between([-1, 1]) * (layer.speed ?? 30),
      grains: Array.from({ length: layer.grains ?? 50 }, () => ({ angle: Math.random() * TAU, radius: between([0.15, 1]), lift: Math.random() })),
    })),
  }),
  period: (width, height) => [width + 120, height],
  step(state, layer, dt, time, width) {
    for (const devil of state.devils) {
      devil.x = wrap(devil.x + devil.vx * dt, width, 60)
      for (const grain of devil.grains) {
        grain.angle += (layer.spin ?? 5) * dt * (1.3 - grain.radius * 0.6)
        grain.lift = (grain.lift + dt * 0.35) % 1
      }
    }
  },
  draw(ctx, state, layer) {
    const radius = layer.radius ?? 40
    const tall = layer.height ?? 110
    const size = layer.grainSize ?? 1.5
    ctx.fillStyle = layer.colour
    ctx.beginPath()
    for (const devil of state.devils) {
      for (const grain of devil.grains) {
        const spread = radius * grain.radius * (0.25 + grain.lift)
        const x = devil.x + Math.cos(grain.angle) * spread
        const y = devil.y - grain.lift * tall + Math.sin(grain.angle) * spread * 0.35
        ctx.moveTo(x + size, y)
        ctx.arc(x, y, size, 0, TAU)
      }
    }
    ctx.fill()
  },
}

// Meteors: a few bright streaks with fading tails crossing the view, each waiting [min, max] seconds before the next.
function launchMeteor(layer, width) {
  const radians = ((layer.angle ?? 50) * Math.PI) / 180
  const speed = between(layer.speed ?? [500, 900])
  return { x: between([-0.3, 1]) * width, y: -30, vx: Math.sin(radians) * speed, vy: Math.cos(radians) * speed }
}
const meteors = {
  make: (layer, width) => ({
    particles: Array.from({ length: layer.count ?? 3 }, () => ({ ...launchMeteor(layer, width), delay: between([0, layer.every?.[1] ?? 3]) })),
  }),
  step(state, layer, dt, time, width, height) {
    for (const p of state.particles) {
      if (p.delay > 0) {
        p.delay -= dt
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.y > height + 60 || p.x > width + 60 || p.x < -60) Object.assign(p, launchMeteor(layer, width), { delay: between(layer.every ?? [1, 4]) })
    }
  },
  draw(ctx, state, layer) {
    const tail = layer.length ?? 90
    ctx.lineCap = 'round'
    ctx.lineWidth = 2
    for (const p of state.particles) {
      if (p.delay > 0) continue
      const speed = Math.hypot(p.vx, p.vy) || 1
      const tailX = p.x - (p.vx / speed) * tail
      const tailY = p.y - (p.vy / speed) * tail
      const gradient = ctx.createLinearGradient(p.x, p.y, tailX, tailY)
      gradient.addColorStop(0, rgba(layer.colour, 1))
      gradient.addColorStop(1, rgba(layer.colour, 0))
      ctx.strokeStyle = gradient
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(tailX, tailY)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.2, 0, TAU)
      ctx.fill()
    }
  },
}

// Scanlines: faint horizontal lines creeping down the view, with bright glitch bands every [min, max] seconds.
const GLITCH_LIFE = 0.25
const scanlines = {
  make: (layer) => ({ offset: 0, wait: between(layer.every ?? [2, 6]), glitch: 0, bands: [] }),
  step(state, layer, dt, time, width, height) {
    state.offset = (state.offset + (layer.speed ?? 20) * dt) % (layer.spacing ?? 4)
    state.glitch -= dt
    state.wait -= dt
    if (state.wait <= 0) {
      state.glitch = GLITCH_LIFE
      state.wait = between(layer.every ?? [2, 6])
      state.bands = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({ y: Math.random() * height, height: between([4, 22]), shift: between([-30, 30]) }))
    }
  },
  draw(ctx, state, layer, time, width, height) {
    ctx.fillStyle = rgba(layer.colour, layer.alpha ?? 0.08)
    for (let y = state.offset; y < height; y += layer.spacing ?? 4) ctx.fillRect(0, y, width, 1)
    if (state.glitch <= 0) return
    ctx.fillStyle = rgba(layer.colour, (0.35 * state.glitch) / GLITCH_LIFE)
    for (const band of state.bands) ctx.fillRect(band.shift, band.y, width, band.height)
  },
}

export const WEATHER_KINDS = { rain: streaks, sand: streaks, snow: flakes, ash: flakes, fog, sparks, bolt, glints, aurora, ripple, vortex, meteors, scanlines }
