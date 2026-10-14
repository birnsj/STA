// CSS animation timing in code, so a Pixi effect plays as its old CSS keyframes did: the easing functions, a keyframe
// track eased per segment, and an animation's progress through its delay, duration and iterations.

// CSS cubic-bezier(x1, y1, x2, y2) as a function of progress.
export function cubicBezier(x1, y1, x2, y2) {
  const coord = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  return (x) => {
    if (x <= 0 || x >= 1) return x
    let lo = 0
    let hi = 1
    let t = x
    for (let i = 0; i < 24; i++) {
      const at = coord(t, x1, x2)
      if (Math.abs(at - x) < 1e-5) break
      if (at < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return coord(t, y1, y2)
  }
}

export const EASE = {
  linear: (t) => t,
  ease: cubicBezier(0.25, 0.1, 0.25, 1),
  easeIn: cubicBezier(0.42, 0, 1, 1),
  easeOut: cubicBezier(0, 0, 0.58, 1),
  easeInOut: cubicBezier(0.42, 0, 0.58, 1),
}

// The value of a keyframe track [[offset 0..1, value], ...] at progress t, eased within each segment as CSS does.
export function track(frames, t, ease = EASE.linear) {
  if (t <= frames[0][0]) return frames[0][1]
  for (let i = 1; i < frames.length; i++) {
    const [to, after] = frames[i]
    if (t > to) continue
    const [from, before] = frames[i - 1]
    return before + (after - before) * ease((t - from) / (to - from || 1))
  }
  return frames.at(-1)[1]
}

// Progress (0..1) of an animation `elapsed` ms after it started: null during its delay (the element's own style shows,
// as `fill-mode: forwards`; pass both: true for `both`, which holds the first keyframe instead), 1 once finished.
export function progress(elapsed, { duration, delay = 0, iterations = 1, both = false }) {
  const into = elapsed - delay
  if (into < 0) return both ? 0 : null
  if (into >= duration * iterations) return 1
  return (into % duration) / duration
}
