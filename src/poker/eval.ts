// A poker hand evaluator, shared by Pai Gow and Ultimate Texas Hold'em.
//
// It ranks 5-card hands, finds the best five out of any larger set, and knows
// two things a plain poker evaluator doesn't, because Pai Gow needs them:
//
//   1. The semi-wild joker. A Pai Gow deck is 53 cards. The joker completes a
//      straight, a flush or a straight flush; otherwise it is an ace. It cannot
//      be used to make a pair or trips of anything but aces.
//
//   2. The wheel. In Pai Gow, A-2-3-4-5 is the SECOND highest straight, ranking
//      above K-Q-J-10-9 and below A-K-Q-J-10. In ordinary poker it is the
//      lowest straight. `EvalOptions.wheelHigh` switches between the two.

import type { Card } from '../engine/types'

export enum Category {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAME: Record<Category, string> = {
  [Category.HighCard]: 'High card',
  [Category.Pair]: 'Pair',
  [Category.TwoPair]: 'Two pair',
  [Category.Trips]: 'Three of a kind',
  [Category.Straight]: 'Straight',
  [Category.Flush]: 'Flush',
  [Category.FullHouse]: 'Full house',
  [Category.Quads]: 'Four of a kind',
  [Category.StraightFlush]: 'Straight flush',
}

/** A hand's strength, as a category plus the ranks that break ties within it.
 *  Two Scores compare with `compare`; the tiebreak arrays are already in the
 *  right order (best rank first) and may hold half-integers for the wheel. */
export interface Score {
  category: Category
  tiebreak: number[]
  /** True when the joker stood in for this card, for display only. */
  usedJoker?: boolean
}

export interface EvalOptions {
  /** Pai Gow: rank the A-2-3-4-5 wheel just below A-K-Q-J-10. */
  wheelHigh?: boolean
}

/** Ace high. The wheel treats the ace as 1, handled inside `straightHigh`. */
export function rankValue(rank: Card['rank']): number {
  switch (rank) {
    case 'A':
      return 14
    case 'K':
      return 13
    case 'Q':
      return 12
    case 'J':
      return 11
    case '10':
      return 10
    default:
      return Number(rank)
  }
}

export function compare(a: Score, b: Score): number {
  if (a.category !== b.category) return a.category - b.category
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

// ---------------------------------------------------------------- 5-card

interface Plain {
  values: number[] // rank values, no joker
  suits: string[]
}

/** Rank a concrete five-card hand that contains no joker. */
function scoreConcrete(cards: Card[], opts: EvalOptions): Score {
  const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a)
  const suits = cards.map((c) => c.suit)
  return scorePlain({ values, suits }, opts)
}

function scorePlain({ values, suits }: Plain, opts: EvalOptions): Score {
  const flush = suits.every((s) => s === suits[0])
  const straightTop = straightHigh(values, opts)

  // Count ranks: Map<value, count>, read out as groups sorted by (count, value).
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const shape = groups.map((g) => g[1]).join('') // e.g. "32" = full house
  const byGroup = groups.map((g) => g[0]) // the ranks, most-repeated first

  if (flush && straightTop !== null) {
    return { category: Category.StraightFlush, tiebreak: [straightTop] }
  }
  if (shape === '41') return { category: Category.Quads, tiebreak: byGroup }
  if (shape === '32') return { category: Category.FullHouse, tiebreak: byGroup }
  if (flush) return { category: Category.Flush, tiebreak: values }
  if (straightTop !== null) return { category: Category.Straight, tiebreak: [straightTop] }
  if (shape === '311') return { category: Category.Trips, tiebreak: byGroup }
  if (shape === '221') return { category: Category.TwoPair, tiebreak: byGroup }
  if (shape === '2111') return { category: Category.Pair, tiebreak: byGroup }
  return { category: Category.HighCard, tiebreak: values }
}

/** The straight's high card, or null if the five values aren't a straight.
 *  Returns 13.5 for the wheel in Pai Gow, so it sorts above a king-high straight
 *  (top card 13) and below an ace-high straight (top card 14). */
function straightHigh(values: number[], opts: EvalOptions): number | null {
  const uniq = [...new Set(values)].sort((a, b) => b - a)
  if (uniq.length !== 5) return null

  if (uniq[0] - uniq[4] === 4) return uniq[0] // ordinary run of five

  // The wheel: A-5-4-3-2 reads as values [14, 5, 4, 3, 2].
  const wheel = uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2
  if (wheel) return opts.wheelHigh ? 13.5 : 5

  return null
}

// ---------------------------------------------------------------- joker

/** The single joker in a hand, if there is one. */
function findJoker(cards: Card[]): number {
  return cards.findIndex((c) => c.joker)
}

/** Rank exactly five cards, resolving a joker if present. The joker is tried as
 *  every legal substitute — any ace, or any card that finishes a straight or
 *  flush — and the best legal result wins. It may never pair a non-ace. */
export function score5(cards: Card[], opts: EvalOptions = {}): Score {
  const jokerAt = findJoker(cards)
  if (jokerAt === -1) return scoreConcrete(cards, opts)

  const others = cards.filter((_, i) => i !== jokerAt)
  const present = new Set(others.map((c) => `${c.rank}${c.suit}`))

  let best: Score | null = null
  const consider = (sub: Card, isAce: boolean) => {
    const s = scoreConcrete([...others, sub], opts)
    // The joker is only allowed to help a straight/flush, or to be an ace.
    const legal =
      isAce ||
      s.category === Category.Straight ||
      s.category === Category.Flush ||
      s.category === Category.StraightFlush
    if (!legal) return
    if (!best || compare(s, best) > 0) best = { ...s, usedJoker: true }
  }

  const RANKS: Card['rank'][] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
  const SUITS: Card['suit'][] = ['S', 'H', 'D', 'C']
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      if (present.has(`${rank}${suit}`)) continue // no duplicate real cards
      consider({ uid: -1, rank, suit }, rank === 'A')
    }
  }

  // A joker with four unrelated cards is, at worst, an ace-high hand.
  return best ?? scoreConcrete([...others, { uid: -1, rank: 'A', suit: 'S' }], opts)
}

// ---------------------------------------------------------------- best of N

/** The best five-card hand out of any set of five-or-more cards. Used for the
 *  seven-card Fortune bonus and for Ultimate Texas Hold'em's seven cards. */
export function bestOf(cards: Card[], opts: EvalOptions = {}): Score {
  if (cards.length < 5) throw new Error(`need at least five cards, got ${cards.length}`)
  if (cards.length === 5) return score5(cards, opts)

  let best: Score | null = null
  for (const combo of combinations(cards, 5)) {
    const s = score5(combo, opts)
    if (!best || compare(s, best) > 0) best = s
  }
  return best!
}

function* combinations<T>(items: T[], k: number): Generator<T[]> {
  const n = items.length
  const idx = Array.from({ length: k }, (_, i) => i)
  for (;;) {
    yield idx.map((i) => items[i])
    let i = k - 1
    while (i >= 0 && idx[i] === n - k + i) i--
    if (i < 0) return
    idx[i]++
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1
  }
}

// ---------------------------------------------------------------- 2-card

/** Pai Gow's low hand is two cards: a pair, or two singles. A joker here is an
 *  ace. Returned as a Score so it compares with the same `compare`. */
export function score2(cards: Card[], _opts: EvalOptions = {}): Score {
  const values = cards
    .map((c) => (c.joker ? 14 : rankValue(c.rank)))
    .sort((a, b) => b - a)
  if (values[0] === values[1]) return { category: Category.Pair, tiebreak: values }
  return { category: Category.HighCard, tiebreak: values }
}
