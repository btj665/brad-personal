// The exact keno maths. Eighty balls, the house calls twenty, the ticket holds
// one to ten spots, and the chance of catching exactly k of n is hypergeometric:
//
//     P(k) = C(n, k) · C(80 − n, 20 − k) / C(80, 20)
//
// Every number in this game is countable, so nothing here is sampled. The
// denominator C(80,20) = 3,535,316,142,212,174,320 is roughly 393 times
// Number.MAX_SAFE_INTEGER, so the combinatorics run in BigInt and the result is
// converted to a double exactly once, at the very end. A float factorial would
// still *look* right — it just quietly stops being right somewhere around the
// fifteenth digit, which is the difference between "1 in 8,911,711" and a number
// you cannot print on a rate card.

/** The keno rack. */
export const BALLS = 80
/** The house always calls twenty. */
export const DRAWN = 20
export const MIN_PICKS = 1
export const MAX_PICKS = 10

/** C(n, k) exactly. The running product is C(n, i) at every step, and C(n, i) ·
 *  (n − i) is always divisible by (i + 1), so the integer division never
 *  truncates — this is exact, not merely close. */
export function choose(n: number, k: number): bigint {
  if (k < 0 || k > n || n < 0) return 0n
  const kk = Math.min(k, n - k)
  const N = BigInt(n)
  let r = 1n
  for (let i = 0n; i < BigInt(kk); i++) r = (r * (N - i)) / (i + 1n)
  return r
}

/** Every distinct set of twenty balls the house could call. */
export const TOTAL_DRAWS: bigint = choose(BALLS, DRAWN)

/** 2^96 as a scale factor. Both the shift and the divide-back are exact in
 *  binary, so a ratio converted through it is rounded once instead of three
 *  times (numerator, denominator, quotient). */
const SCALE_BITS = 96n
const SCALE = 2 ** 96

/** The closest double to num/den. Never divide two BigInt-sized doubles
 *  directly: each conversion rounds, and the errors do not cancel. */
function ratioToNumber(num: bigint, den: bigint): number {
  if (num === 0n) return 0
  return Number((num << SCALE_BITS) / den) / SCALE
}

/** How many of the C(80,20) possible draws catch exactly `caught` of `picks`.
 *  Zero when the count is impossible (more catches than spots, or more misses
 *  than there are uncalled balls). */
export function catchWays(picks: number, caught: number): bigint {
  if (picks < 0 || caught < 0 || caught > picks) return 0n
  return choose(picks, caught) * choose(BALLS - picks, DRAWN - caught)
}

/** P(catching exactly `caught` of `picks`). */
export function catchProbability(picks: number, caught: number): number {
  return ratioToNumber(catchWays(picks, caught), TOTAL_DRAWS)
}

/** The whole distribution for a pick count, indexed by catches. Sums to 1 —
 *  exactly, by Vandermonde's identity, before the doubles get involved. */
export function catchDistribution(picks: number): number[] {
  const out: number[] = []
  for (let k = 0; k <= picks; k++) out.push(catchProbability(picks, k))
  return out
}

/** The odds as a rate card quotes them: "1 in N". Infinite when impossible. */
export function oneIn(picks: number, caught: number): number {
  const ways = catchWays(picks, caught)
  if (ways === 0n) return Infinity
  return ratioToNumber(TOTAL_DRAWS, ways)
}

/** `oneIn` floored to a whole number, in BigInt — the form printed on a keno
 *  ticket. Catching all ten on a ten-spot is the famous 1 in 8,911,711. */
export function oneInFloor(picks: number, caught: number): bigint {
  const ways = catchWays(picks, caught)
  if (ways === 0n) return 0n
  return TOTAL_DRAWS / ways
}
