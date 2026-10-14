// Development-only performance probe (docs/performance.md). Active only in `vite dev` (or a build made with
// VITE_PERF_PROBE=1, for measuring the production React bundle) with `?perf=1` in the page URL; otherwise every export
// is a no-op that costs a boolean test, so nothing here can change gameplay or the shipped build.
//
// Console / automation use:
//   __perf.reset()           start a fresh sampling window
//   __perf.report()          { frames, timers, counters, profilers, memory, flags } for the window so far
//   ?perf=1&off=tick,filters ablation flags: temporarily switch one suspect off to measure its marginal cost
//     tick     the world clock stops dispatching (isolates React render and simulation cost)
//     filters  challenge-object outlines are not drawn (SVG filter off; Pixi outline sprite hidden)
//     weather  WeatherFx draws nothing
//     animtick animated tiles stop (Pixi MapLayers skips animate)
//     npcs     the exploration world is created with no NPCs
//   Timers: world.frame (one world-clock frame, render included), sim.tickTotal (the reducer's tick), pixi.frame (each
//   Pixi board frame callback), board.wallFade, board.figureWindows, canvas.drawBoard, canvas.drawDarkness, anim.poll,
//   anim.redraw. Profilers: exploration.board, combat.board (PerfProfiler.jsx).
//   (tools/perfRun.mjs also takes `scrollpulse`, handled in the runner: it stops the scrollbar-colour animation on <html>.)
// Flags exist to attribute cost only; they are never read when the probe is off.

const search = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null
export const PERF = Boolean((import.meta.env?.DEV || import.meta.env?.VITE_PERF_PROBE) && search?.has('perf'))
const OFF = PERF ? new Set((search.get('off') ?? '').split(',').filter(Boolean)) : new Set()

// True while the named suspect is switched off for an ablation run.
export const perfOff = (name) => PERF && OFF.has(name)

const SAMPLE_CAP = 20000
let timers = new Map()
let counters = new Map()
let profilers = new Map()
let frames = []
let heap = []
let windowStart = typeof performance !== 'undefined' ? performance.now() : 0

const bucketFor = (map, name) => {
  let bucket = map.get(name)
  if (!bucket) map.set(name, (bucket = { count: 0, total: 0, max: 0, samples: [] }))
  return bucket
}
const record = (bucket, value) => {
  bucket.count += 1
  bucket.total += value
  if (value > bucket.max) bucket.max = value
  if (bucket.samples.length < SAMPLE_CAP) bucket.samples.push(value)
}

// perfStart() then perfEnd(name, started): times a stretch of code. started is 0 while the probe is off.
export const perfStart = () => (PERF ? performance.now() : 0)
export function perfEnd(name, started) {
  if (PERF && started) record(bucketFor(timers, name), performance.now() - started)
}
// Adds to a named counter (draw calls, tiles drawn, ...). Per-call values are kept so the report can give per-frame means.
export function perfCount(name, amount = 1) {
  if (PERF) bucketFor(counters, name).count += amount
}
// React <Profiler onRender> callback (PerfProfiler.jsx).
export function perfCommit(id, phase, actualDuration) {
  if (PERF) record(bucketFor(profilers, id), actualDuration)
}

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0)
const round = (value) => Math.round(value * 1000) / 1000
function summarise(bucket) {
  const sorted = [...bucket.samples].sort((a, b) => a - b)
  return { count: bucket.count, totalMs: round(bucket.total), meanMs: round(bucket.count ? bucket.total / bucket.count : 0), p95Ms: round(percentile(sorted, 0.95)), maxMs: round(bucket.max) }
}

function report() {
  const seconds = (performance.now() - windowStart) / 1000
  const deltas = frames.slice(1).map((time, i) => time - frames[i])
  const sorted = [...deltas].sort((a, b) => a - b)
  const mean = deltas.length ? deltas.reduce((sum, d) => sum + d, 0) / deltas.length : 0
  // A heap drop between two samples means the collector ran: a rough count of garbage-collection events.
  let collections = 0
  for (let i = 1; i < heap.length; i++) if (heap[i] < heap[i - 1] - 500_000) collections += 1
  return {
    seconds: round(seconds),
    frames: {
      count: deltas.length,
      fps: round(seconds ? deltas.length / seconds : 0),
      meanMs: round(mean),
      p95Ms: round(percentile(sorted, 0.95)),
      p99Ms: round(percentile(sorted, 0.99)),
      maxMs: round(sorted[sorted.length - 1] ?? 0),
      over33ms: deltas.filter((d) => d > 33.4).length,
    },
    // Per-frame cost of each timed stretch: totalMs divided by frames, which compares stretches that run once per frame
    // with those that don't.
    timers: Object.fromEntries([...timers].map(([name, bucket]) => [name, { ...summarise(bucket), perFrameMs: round(deltas.length ? bucket.total / deltas.length : 0) }])),
    counters: Object.fromEntries([...counters].map(([name, bucket]) => [name, { total: bucket.count, perFrame: round(deltas.length ? bucket.count / deltas.length : 0) }])),
    profilers: Object.fromEntries([...profilers].map(([name, bucket]) => [name, { ...summarise(bucket), commitsPerSecond: round(seconds ? bucket.count / seconds : 0) }])),
    memory: {
      usedMB: heap.length ? round(heap[heap.length - 1] / 1048576) : null,
      collections,
      collectionsPerMinute: round(seconds ? (collections * 60) / seconds : 0),
    },
    flags: [...OFF],
    userAgent: navigator.userAgent,
    viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
  }
}

function reset() {
  timers = new Map()
  counters = new Map()
  profilers = new Map()
  frames = []
  heap = []
  windowStart = performance.now()
}

if (PERF) {
  window.__perf = { report, reset, flags: [...OFF] }
  // One sampler for the whole page: frame times from requestAnimationFrame, and the JS heap twice a second where the
  // browser reports it (Chromium).
  const sample = (now) => {
    if (frames.length < SAMPLE_CAP) frames.push(now)
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
  setInterval(() => {
    const used = performance.memory?.usedJSHeapSize
    if (used && heap.length < SAMPLE_CAP) heap.push(used)
  }, 250)
}
