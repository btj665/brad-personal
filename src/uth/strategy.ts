// Near-optimal Ultimate Texas Hold'em strategy.
//
// UTH has a known, compact strategy that gives up only a hair over the
// theoretical minimum house edge (about 2.19% of the ante). It's three
// decisions: raise 4x now, raise 2x after the flop, or raise 1x / fold at the
// river. The bots play it exactly, so the seat next to you isn't limping into
// every pot or folding aces.

import type { Card } from '../engine/types'
import { Category, rankValue, score5 } from '../poker/eval'
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
// A compact 7-card hand strength as one comparable integer — fast enough to weigh
// every dealer holding at the river, which the shared evaluator (built for
// correctness and the joker, not speed) is far too slow to do. UTH is a plain
// 52-card deck, so this needs no joker, and it only has to rank hands
// consistently against itself; a fuzz test pins it to the shared evaluator.
const SUIT_IX: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 }

// Reused across calls — rank7 runs 990 times per river decision, so allocating
// fresh count arrays each time is the whole cost. Single-threaded and reset at
// the top of every call, so sharing is safe.
const _count = new Int8Array(15)
const _suitCount = new Int8Array(4)
const _suitMask = new Int32Array(4)

export function rank7(cards: Card[]): number {
  const count = _count
  const suitCount = _suitCount
  const suitMask = _suitMask
  count.fill(0)
  suitCount.fill(0)
  suitMask.fill(0)
  let mask = 0
  for (const c of cards) {
    const r = val(c)
    const s = SUIT_IX[c.suit]
    count[r]++
    suitCount[s]++
    suitMask[s] |= 1 << r
    mask |= 1 << r
  }
  const straightTop = (m: number): number => {
    if (m & (1 << 14)) m |= 1 << 1 // ace plays low for the wheel
    for (let hi = 14; hi >= 5; hi--) {
      const run = (1 << hi) | (1 << (hi - 1)) | (1 << (hi - 2)) | (1 << (hi - 3)) | (1 << (hi - 4))
      if ((m & run) === run) return hi
    }
    return 0
  }

  let sf = 0
  let flush: number[] | null = null
  for (let s = 0; s < 4; s++) {
    if (suitCount[s] < 5) continue
    sf = Math.max(sf, straightTop(suitMask[s]))
    const rs: number[] = []
    for (let r = 14; r >= 2; r--) if (suitMask[s] & (1 << r)) rs.push(r)
    if (!flush || rs[0] > flush[0]) flush = rs.slice(0, 5)
  }

  let quad = 0
  const trips: number[] = []
  const pairs: number[] = []
  for (let r = 14; r >= 2; r--) {
    if (count[r] === 4) quad = r
    else if (count[r] === 3) trips.push(r)
    else if (count[r] === 2) pairs.push(r)
  }
  const straight = straightTop(mask)
  const kickers = (used: Set<number>, n: number): number[] => {
    const out: number[] = []
    for (let r = 14; r >= 2 && out.length < n; r--) if (count[r] > 0 && !used.has(r)) out.push(r)
    return out
  }

  let cat: number
  let tb: number[]
  if (sf) {
    cat = 8
    tb = [sf]
  } else if (quad) {
    cat = 7
    tb = [quad, kickers(new Set([quad]), 1)[0] ?? 0]
  } else if (trips.length >= 1 && (pairs.length >= 1 || trips.length >= 2)) {
    cat = 6
    tb = [trips[0], pairs.length ? pairs[0] : trips[1]]
  } else if (flush) {
    cat = 5
    tb = flush
  } else if (straight) {
    cat = 4
    tb = [straight]
  } else if (trips.length >= 1) {
    cat = 3
    tb = [trips[0], ...kickers(new Set([trips[0]]), 2)]
  } else if (pairs.length >= 2) {
    cat = 2
    tb = [pairs[0], pairs[1], kickers(new Set([pairs[0], pairs[1]]), 1)[0] ?? 0]
  } else if (pairs.length === 1) {
    cat = 1
    tb = [pairs[0], ...kickers(new Set([pairs[0]]), 3)]
  } else {
    cat = 0
    tb = kickers(new Set(), 5)
  }
  let v = cat
  for (let i = 0; i < 5; i++) v = v * 15 + (tb[i] ?? 0)
  return v
}

const ALL_CARDS: Card[] = (() => {
  const suits = ['S', 'H', 'D', 'C'] as Card['suit'][]
  const ranks: Card['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
  const out: Card[] = []
  let uid = 0
  for (const s of suits) for (const r of ranks) out.push({ uid: uid++, rank: r, suit: s })
  return out
})()

/** Fraction of a fifth: bet the 1x when you beat this share of dealer holdings.
 *  By the river the ante and the blind are already posted, so folding forfeits
 *  two units and the 1x bet risks only one — the break-even is a little over a
 *  fifth, so all but the hopeless hands are a bet. */
const RIVER_BET = 0.21

export function riverRaise(hole: Card[], board: Card[], _rules?: UthRules): boolean {
  const key = (c: Card) => c.rank + c.suit
  const seen = new Set([...hole, ...board].map(key))
  const deck = ALL_CARDS.filter((c) => !seen.has(key(c)))
  const me = rank7([...hole, ...board])

  // Weigh every two-card holding the dealer could have. A tie is a push, so it
  // counts as half — folding loses outright, a chop does not.
  let good = 0
  let total = 0
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const d = rank7([deck[i], deck[j], ...board])
      if (me > d) good += 1
      else if (me === d) good += 0.5
      total += 1
    }
  }
  return good / total >= RIVER_BET
}
