// The optimal hold.
//
// For a dealt five-card hand there are 32 ways to choose which cards to keep.
// The value of each is the average payout over every possible draw, so the best
// play is exact arithmetic, not a guess. When the draw is small we enumerate it
// (that covers every hold of two or more cards); when it is large — holding one
// card or none — we sample, because those holds are rarely the best anyway.

import { buildShoeCards } from '../engine/cards'
import type { Rng } from '../engine/rng'
import type { Card } from '../engine/types'
import { classify } from './classify'
import { payFor, type Variant } from './paytables'

export interface HoldEV {
  /** Bitmask over the five dealt cards: bit i set = keep card i. */
  mask: number
  ev: number
}

export interface SolveOptions {
  /** Enumerate the draw exactly when it has at most this many combinations;
   *  sample it otherwise. The UI keeps this high (exact holds of two-plus
   *  cards); the bulk return simulator lowers it to stay fast. */
  enumerateLimit?: number
  samples?: number
}

const UI_LIMIT = 20000
const UI_SAMPLES = 4000

/** The remaining 47 cards, given the five in hand. */
function remaining(hand: Card[]): Card[] {
  const seen = new Set(hand.map((c) => `${c.rank}${c.suit}`))
  return buildShoeCards(1).filter((c) => !seen.has(`${c.rank}${c.suit}`))
}

/** Expected payout of keeping `held` and drawing the rest from `pool`. */
function drawEV(
  held: Card[],
  pool: Card[],
  variant: Variant,
  rng: Rng,
  limit: number,
  samples: number,
): number {
  const need = 5 - held.length
  if (need === 0) return payFor(variant, classify(held, variant.family))

  const combos = choose(pool.length, need)
  let total = 0
  let count = 0

  if (combos <= limit) {
    forEachCombination(pool, need, (draw) => {
      total += payFor(variant, classify([...held, ...draw], variant.family))
      count++
    })
  } else {
    for (let s = 0; s < samples; s++) {
      const draw = sample(pool, need, rng)
      total += payFor(variant, classify([...held, ...draw], variant.family))
      count++
    }
  }
  return total / count
}

/** The value of every one of the 32 holds, and the best. */
export function solve(
  hand: Card[],
  variant: Variant,
  rng: Rng,
  opts: SolveOptions = {},
): { best: HoldEV; all: HoldEV[] } {
  const limit = opts.enumerateLimit ?? UI_LIMIT
  const samples = opts.samples ?? UI_SAMPLES
  const pool = remaining(hand)
  const all: HoldEV[] = []
  let best: HoldEV = { mask: 0, ev: -1 }

  for (let mask = 0; mask < 32; mask++) {
    const held = hand.filter((_, i) => mask & (1 << i))
    const ev = drawEV(held, pool, variant, rng, limit, samples)
    const entry = { mask, ev }
    all.push(entry)
    if (ev > best.ev) best = entry
  }
  return { best, all }
}

/** The exact expected pay, per coin, of keeping `held` and drawing the rest from
 *  `pool` — every possible draw enumerated, nothing sampled. `null` when the
 *  draw is wider than `limit` combinations, because a caller asking for an exact
 *  number would rather have none than an estimate.
 *
 *  This is what multi-hand is checked against: every hand's pool holds the same
 *  47 cards, so this must return the identical number for all of them. It returns
 *  it bit-for-bit, not merely to within rounding — pay values are integers and
 *  the total stays well inside a double's exact integer range, so the order the
 *  pool happens to be shuffled into cannot move the sum. */
export function exactDrawEV(
  held: Card[],
  pool: Card[],
  variant: Variant,
  limit = 200000,
): number | null {
  const need = 5 - held.length
  if (need === 0) return payFor(variant, classify(held, variant.family))
  const combos = choose(pool.length, need)
  if (combos > limit) return null

  let total = 0
  forEachCombination(pool, need, (draw) => {
    total += payFor(variant, classify([...held, ...draw], variant.family))
  })
  return total / combos
}

/** Just the best hold, as a boolean per card. */
export function optimalHold(hand: Card[], variant: Variant, rng: Rng): boolean[] {
  const { best } = solve(hand, variant, rng)
  return hand.map((_, i) => Boolean(best.mask & (1 << i)))
}

// --- combinatorics ---------------------------------------------------------

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return Math.round(r)
}

function forEachCombination(items: Card[], k: number, fn: (combo: Card[]) => void): void {
  const n = items.length
  const idx = Array.from({ length: k }, (_, i) => i)
  if (k === 0) {
    fn([])
    return
  }
  for (;;) {
    fn(idx.map((i) => items[i]))
    let i = k - 1
    while (i >= 0 && idx[i] === n - k + i) i--
    if (i < 0) return
    idx[i]++
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1
  }
}

function sample(pool: Card[], k: number, rng: Rng): Card[] {
  // Partial Fisher–Yates on a scratch copy of the indices.
  const idx = Array.from({ length: pool.length }, (_, i) => i)
  const out: Card[] = []
  for (let i = 0; i < k; i++) {
    const j = i + rng.int(idx.length - i)
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
    out.push(pool[idx[i]])
  }
  return out
}
