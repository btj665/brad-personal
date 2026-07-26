// The published Let It Ride pull-back charts.
//
// Both decisions are "is this worth another unit?", and both have a short,
// well-known chart that plays them essentially perfectly — unlike video poker
// there is nothing to solve, because the bet is fixed and only the answer is
// binary. Playing these two charts is what lands the game on its 3.51% figure;
// `scripts/letitride-edge.ts` enumerates every deal to prove it.
//
// A "high card" throughout means ten, jack, queen, king or ace: the ranks that
// can pair up into the bottom row of the pay table.

import type { Card } from '../engine/types'
import { rankValue } from '../poker/eval'
import { MIN_PAIR } from './rules'

export interface Advice {
  ride: boolean
  /** Index into `BET1_CHART` / `BET2_CHART`, or −1 when nothing on the chart
   *  fits and the bet comes back. Lets the coach highlight the exact line. */
  clause: number
  reason: string
}

/** The first decision, in chart order: three cards in hand, nothing revealed. */
export const BET1_CHART: readonly string[] = [
  'Any paying hand — pair of tens or better, or three of a kind',
  'Three to a royal flush',
  'Three suited in sequence, except A-2-3 and 2-3-4',
  'Three to a straight flush spanning four ranks, one card ten or higher',
  'Three to a straight flush spanning five ranks, two cards ten or higher',
]

/** The second decision: three in hand plus the first community card. */
export const BET2_CHART: readonly string[] = [
  'Any paying hand',
  'Four to a royal flush or straight flush',
  'Four to a flush',
  'Four to an outside straight',
  'Four to an inside straight with four cards ten or higher',
]

const PULL: Advice = { ride: false, clause: -1, reason: 'Nothing on the chart — take it back' }

const val = (c: Card) => rankValue(c.rank)

/** Ten through ace: the ranks that can pair into a paying hand. */
function highCards(cards: Card[]): number {
  let n = 0
  for (const c of cards) if (val(c) >= MIN_PAIR) n++
  return n
}

function suited(cards: Card[]): boolean {
  return cards.every((c) => c.suit === cards[0].suit)
}

/** The two ways to read a hand's ranks for straight purposes: ace high, ace low.
 *  Both are always tried and the tighter span wins, so A-2-3 is a sequence and
 *  Q-K-A is too. */
function readings(cards: Card[]): number[][] {
  const high = cards.map(val)
  if (!high.includes(14)) return [high]
  return [high, high.map((v) => (v === 14 ? 1 : v))]
}

/** How many consecutive ranks the cards span at their tightest, or null when two
 *  of them share a rank — a pair can never be part of a straight flush. */
function span(cards: Card[]): number | null {
  let best: number | null = null
  for (const vs of readings(cards)) {
    if (new Set(vs).size !== vs.length) return null
    const width = Math.max(...vs) - Math.min(...vs) + 1
    if (best === null || width < best) best = width
  }
  return best
}

/** Rank value → how many cards hold it. */
function counts(cards: Card[]): number[] {
  const m = new Map<number, number>()
  for (const c of cards) m.set(val(c), (m.get(val(c)) ?? 0) + 1)
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .map(([, n]) => n)
}

/** The highest rank appearing at least `n` times, or 0. */
function topOfCount(cards: Card[], n: number): number {
  const m = new Map<number, number>()
  for (const c of cards) m.set(val(c), (m.get(val(c)) ?? 0) + 1)
  let best = 0
  for (const [v, k] of m) if (k >= n && v > best) best = v
  return best
}

/** A made paying hand inside three or four cards. With fewer than five cards no
 *  straight or flush exists yet, so this is only about repeated ranks: trips or
 *  quads, two pair, or a single pair of tens up. */
function alreadyPaying(cards: Card[]): boolean {
  const shape = counts(cards)
  if (shape[0] >= 3) return true // trips or quads
  if (shape[0] === 2 && shape[1] === 2) return true // two pair
  if (shape[0] === 2) return topOfCount(cards, 2) >= MIN_PAIR
  return false
}

// ---------------------------------------------------------------- decision 1

/** Bet 1, on the three cards in hand. */
export function adviseBet1(three: Card[]): Advice {
  if (alreadyPaying(three)) return { ride: true, clause: 0, reason: BET1_CHART[0] }
  if (!suited(three)) return PULL

  const width = span(three)
  if (width === null) return PULL

  // Three to a royal is any three suited cards ten-or-higher — 10-J-A counts as
  // much as J-Q-K — so it's a high-card count, not a span.
  if (highCards(three) === 3) return { ride: true, clause: 1, reason: BET1_CHART[1] }
  if (width === 3) {
    // A-2-3 and 2-3-4 are the two sequences not worth the extra unit: they can
    // only ever make the wheel, and none of their cards can pair into a paying
    // hand, so the draw is all there is.
    if (isLowSequenceException(three)) return PULL
    return { ride: true, clause: 2, reason: BET1_CHART[2] }
  }
  if (width === 4 && highCards(three) >= 1) {
    return { ride: true, clause: 3, reason: BET1_CHART[3] }
  }
  if (width === 5 && highCards(three) >= 2) {
    return { ride: true, clause: 4, reason: BET1_CHART[4] }
  }
  return PULL
}

function isLowSequenceException(three: Card[]): boolean {
  const low = three
    .map((c) => (val(c) === 14 ? 1 : val(c)))
    .sort((a, b) => a - b)
    .join('-')
  return low === '1-2-3' || low === '2-3-4'
}

export function letBet1Ride(three: Card[]): boolean {
  return adviseBet1(three).ride
}

// ---------------------------------------------------------------- decision 2

/** Bet 2, on the three cards in hand plus the first community card. */
export function adviseBet2(four: Card[]): Advice {
  if (alreadyPaying(four)) return { ride: true, clause: 0, reason: BET2_CHART[0] }

  if (suited(four)) {
    // Four to a flush is already enough, but the chart calls out the royal and
    // straight-flush draws separately because they're the ones worth the money
    // even when the player is sure they've misread the suits.
    const width = span(four)
    const line = width !== null && width <= 5 ? 1 : 2
    return { ride: true, clause: line, reason: BET2_CHART[line] }
  }

  if (fourOutsideStraight(four)) return { ride: true, clause: 3, reason: BET2_CHART[3] }
  if (fourToStraight(four) && highCards(four) === 4) {
    return { ride: true, clause: 4, reason: BET2_CHART[4] }
  }
  return PULL
}

/** Four distinct ranks a straight can still be built through: they fit inside a
 *  five-rank window. */
function fourToStraight(four: Card[]): boolean {
  const width = span(four)
  return width !== null && width <= 5
}

/** Four consecutive ranks open at both ends — eight cards fill it. A-2-3-4 and
 *  J-Q-K-A are consecutive but open at one end only, so they count as inside
 *  straights and need the four-high-cards clause instead. */
function fourOutsideStraight(four: Card[]): boolean {
  for (const vs of readings(four)) {
    if (new Set(vs).size !== 4) continue
    const lo = Math.min(...vs)
    const hi = Math.max(...vs)
    if (hi - lo === 3 && lo >= 2 && hi <= 13) return true
  }
  return false
}

export function letBet2Ride(four: Card[]): boolean {
  return adviseBet2(four).ride
}
