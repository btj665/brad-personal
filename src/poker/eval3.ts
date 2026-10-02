// A three-card poker evaluator, for Three Card Poker.
//
// This is a separate file from eval.ts on purpose. Three-card poker is not
// five-card poker with two cards missing: out of the 22,100 three-card hands
// there are only 720 non-flush straights but 1,096 non-straight flushes, so
// with three cards the straight is the RARER hand and outranks the flush. The
// order is
//
//   straight flush > three of a kind > straight > flush > pair > high card
//
// Folding that into `Category` would have silently reordered Pai Gow and
// Ultimate Hold'em, so the enum — and with it the comparator — lives here.
// Rank values still come from eval.ts, ace = 14.
//
// There is no wheel argument to have: A-2-3 is the lowest straight, Q-K-A the
// highest, and nothing in between is special.

import type { Card } from '../engine/types'
import { rankValue } from './eval'

export enum Cat3 {
  HighCard = 0,
  Pair = 1,
  Flush = 2,
  Straight = 3,
  Trips = 4,
  StraightFlush = 5,
}

export const CAT3_NAME: Record<Cat3, string> = {
  [Cat3.HighCard]: 'High card',
  [Cat3.Pair]: 'Pair',
  [Cat3.Flush]: 'Flush',
  [Cat3.Straight]: 'Straight',
  [Cat3.Trips]: 'Three of a kind',
  [Cat3.StraightFlush]: 'Straight flush',
}

/** The same shape as `Score` in eval.ts — a category plus the ranks that break
 *  ties inside it, best first — but over `Cat3`. Keeping the enums distinct is
 *  what stops a three-card hand from ever being handed to the five-card
 *  `compare`, where a flush would wrongly beat a straight. */
export interface Score3 {
  category: Cat3
  tiebreak: number[]
}

/** >0 means `a` beats `b`. Same algorithm as eval.ts's `compare`; it cannot be
 *  reused because it is typed to the five-card `Category`. */
export function compare3(a: Score3, b: Score3): number {
  if (a.category !== b.category) return a.category - b.category
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function score3(cards: Card[]): Score3 {
  if (cards.length !== 3) throw new Error(`need exactly three cards, got ${cards.length}`)

  const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a)
  const flush = cards.every((c) => c.suit === cards[0].suit)
  const top = straightHigh(values)

  if (flush && top !== null) return { category: Cat3.StraightFlush, tiebreak: [top] }
  if (values[0] === values[2]) return { category: Cat3.Trips, tiebreak: [values[0]] }
  if (top !== null) return { category: Cat3.Straight, tiebreak: [top] }
  if (flush) return { category: Cat3.Flush, tiebreak: values }

  // A pair plus a kicker: the pair rank breaks ties first, so it leads.
  if (values[0] === values[1]) return { category: Cat3.Pair, tiebreak: [values[0], values[2]] }
  if (values[1] === values[2]) return { category: Cat3.Pair, tiebreak: [values[1], values[0]] }

  return { category: Cat3.HighCard, tiebreak: values }
}

/** The straight's high card, or null. Values arrive sorted descending. */
function straightHigh(values: number[]): number | null {
  const [a, b, c] = values
  if (a === b || b === c) return null // a pair can't be a run
  if (a - c === 2) return a // an ordinary run, Q-K-A included at 14
  // A-2-3 reads as [14, 3, 2]. It is the lowest straight, so it tops out at 3
  // and ranks below 2-3-4.
  if (a === 14 && b === 3 && c === 2) return 3
  return null
}

/** A single integer that orders hands exactly as `compare3` does. Base 16 per
 *  rank, so three tiebreak ranks and the category fit in 15 bits. The exact
 *  enumeration in scripts/threecard-edge.ts walks 407 million hand pairs, and
 *  comparing packed integers instead of arrays is what makes that finish. */
export function strength3(s: Score3): number {
  const t = s.tiebreak
  return s.category * 4096 + (t[0] ?? 0) * 256 + (t[1] ?? 0) * 16 + (t[2] ?? 0)
}

const RANK_LABEL: Record<number, string> = {
  14: 'A',
  13: 'K',
  12: 'Q',
  11: 'J',
  10: '10',
  9: '9',
  8: '8',
  7: '7',
  6: '6',
  5: '5',
  4: '4',
  3: '3',
  2: '2',
}

/** A short label for the felt: "Q high", "Pair of 6s", "Straight to 9". */
export function handName(s: Score3): string {
  const top = RANK_LABEL[s.tiebreak[0]] ?? '?'
  switch (s.category) {
    case Cat3.StraightFlush:
      return `Straight flush to ${top}`
    case Cat3.Trips:
      return `Three ${top}s`
    case Cat3.Straight:
      return `Straight to ${top}`
    case Cat3.Flush:
      return `Flush, ${top} high`
    case Cat3.Pair:
      return `Pair of ${top}s`
    default:
      return `${top} high`
  }
}
