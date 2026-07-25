// Near-optimal Ultimate Texas Hold'em strategy.
//
// UTH has a known, compact strategy that gives up only a hair over the
// theoretical minimum house edge (about 2.19% of the ante). It's three
// decisions: raise 4x now, raise 2x after the flop, or raise 1x / fold at the
// river. The bots play it exactly, so the seat next to you isn't limping into
// every pot or folding aces.

import type { Card } from '../engine/types'
import { bestOf, Category, compare, rankValue, score5 } from '../poker/eval'
import type { UthRules } from './types'

const suit = (c: Card) => c.suit
const val = (c: Card) => rankValue(c.rank)

// ---------------------------------------------------------------- preflop

/** Raise 4x on the two hole cards, else check. This is the published preflop
 *  chart: any pair of 3s up, any ace, and kings/queens/jacks with a good enough
 *  kicker (looser when suited). */
export function preflopRaise(hole: Card[]): boolean {
  const [a, b] = hole
  const hi = Math.max(val(a), val(b))
  const lo = Math.min(val(a), val(b))
  const pair = a.rank === b.rank
  const suited = suit(a) === suit(b)

  if (pair) return hi >= 3 // pair of 3s or better; deuces check
  if (hi === 14) return true // any ace

  if (hi === 13) return suited ? lo >= 2 : lo >= 5 // K2s+ / K5o+
  if (hi === 12) return suited ? lo >= 6 : lo >= 8 // Q6s+ / Q8o+
  if (hi === 11) return suited ? lo >= 8 : lo >= 10 // J8s+ / JTo+

  return false
}

// ---------------------------------------------------------------- flop

/** Raise 2x after the flop (five cards known), else check. Raise with two pair
 *  or better, with a hidden pair (a hole card pairs the board, or a pocket
 *  pair), or with four to a flush that includes a hole card ten or higher. */
export function flopRaise(hole: Card[], flop: Card[]): boolean {
  const five = [...hole, ...flop]
  const best = score5(five, {})

  if (best.category >= Category.TwoPair) return true
  if (hasHiddenPair(hole, flop)) return true
  if (fourToFlushWithHighHole(hole, five)) return true

  return false
}

/** A pair where at least one hole card is part of it. */
function hasHiddenPair(hole: Card[], board: Card[]): boolean {
  if (hole[0].rank === hole[1].rank) return true // pocket pair
  const boardRanks = new Set(board.map((c) => c.rank))
  return hole.some((h) => boardRanks.has(h.rank))
}

/** Four cards of one suit among the five, with a hole card of that suit ranked
 *  ten or higher — a strong flush draw worth raising. */
function fourToFlushWithHighHole(hole: Card[], five: Card[]): boolean {
  for (const s of ['S', 'H', 'D', 'C'] as const) {
    const inSuit = five.filter((c) => c.suit === s)
    if (inSuit.length !== 4) continue
    if (hole.some((h) => h.suit === s && val(h) >= 10)) return true
  }
  return false
}

// ---------------------------------------------------------------- river

/** Raise 1x at the river, or fold. Raise with a hidden pair or better — whenever
 *  a hole card lifts the hand above what the board makes on its own — and also
 *  whenever the board itself is a straight or better, since then the hand can
 *  only tie or win. Fold everything else.
 *
 *  This is the standard simple river rule. The `rules` argument is accepted for
 *  symmetry with the other streets and isn't needed here. */
export function riverRaise(hole: Card[], board: Card[], _rules?: UthRules): boolean {
  const best = bestOf([...hole, ...board], {})
  const boardOnly = score5(board, {})

  if (best.category >= Category.Pair && compare(best, boardOnly) > 0) return true
  if (boardOnly.category >= Category.Straight) return true
  return false
}
