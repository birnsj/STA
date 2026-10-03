function mulberry32(initialState) {
  let state = initialState >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

// mulberry32: a small seeded generator, so reducers stay pure (the seed is drawn when the button is pressed).
// seed is a fraction in [0, 1), e.g. from Math.random().
export const seededRandom = (seed) => mulberry32(Math.floor(seed * 2 ** 32))

// The same generator for whole-number seeds a person can type and share (e.g. 12345).
export const seededRandomInt = (seed) => mulberry32(seed)

// A separate, repeatable seed for the index-th draw from one master seed (combat uses one per roll).
export const deriveSeed = (seed, index) => (seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0

export const MAX_SEED = 2 ** 32 - 1
