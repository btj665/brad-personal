// Seeded PRNG (mulberry32). Serializes to one integer, so a whole game —
// shuffle, bot decisions, everything — replays exactly from its seed.

export interface Rng {
  next(): number
  int(maxExclusive: number): number
  pick<T>(xs: readonly T[]): T
  state(): number
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (max) => Math.floor(next() * max),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    state: () => s,
  }
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0
}
