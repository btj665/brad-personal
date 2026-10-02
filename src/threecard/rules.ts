// Three Card Poker's schedules and the two rules of play that aren't in the
// paytables at all: when the dealer's hand plays, and when the player's does.
//
// The Ante bonus is the same at every table I have ever seen. Pair Plus is the
// line that varies, and the one pip of difference on the flush row — 4:1 in
// 1996, 3:1 almost everywhere now — is worth about five percentage points of
// house edge. Both tables are here so the swing is visible on the felt.

import { Cat3, type Score3 } from '../poker/eval3'

export interface TableLimits {
  min: number
  max: number
  chips: number[]
}

export const LIMITS: TableLimits = {
  min: 5,
  max: 500,
  // A table that takes a $5 minimum racks these.
  chips: [5, 25, 100, 500],
}

export type BonusKey = 'straight' | 'trips' | 'straightFlush'

/** Paid on the player's own three cards at n:1 whenever the player makes the
 *  Play bet — win, lose or push, and whether or not the dealer qualifies. It is
 *  the only reason a losing hand can still be a winning round. */
export const ANTE_BONUS: Readonly<Record<BonusKey, number>> = {
  straight: 1,
  trips: 4,
  straightFlush: 5,
}

export type PairPlusKey = 'pair' | 'flush' | 'straight' | 'trips' | 'straightFlush'

export interface PairPlusTable {
  id: string
  label: string
  /** n:1 per key. A hand with no key in the table simply loses. */
  pay: Readonly<Record<PairPlusKey, number>>
  /** House edge, exact, from `npx tsx scripts/threecard-edge.ts`. */
  edge: number
  note: string
}

export const PAIR_PLUS_TABLES: readonly PairPlusTable[] = [
  {
    id: '1-3-6-30-40',
    label: 'Pair Plus · flush 3:1',
    pay: { pair: 1, flush: 3, straight: 6, trips: 30, straightFlush: 40 },
    edge: 0.0728,
    note: 'The table you will actually find. 7.28% to the house.',
  },
  {
    id: '1-4-6-30-40',
    label: 'Pair Plus · flush 4:1',
    pay: { pair: 1, flush: 4, straight: 6, trips: 30, straightFlush: 40 },
    edge: 0.0232,
    note: 'The original 1996 schedule. One pip on the flush row, and the edge falls to 2.32%.',
  },
]

export const DEFAULT_TABLE: PairPlusTable = PAIR_PLUS_TABLES[0]

export function tableById(id: string): PairPlusTable {
  return PAIR_PLUS_TABLES.find((t) => t.id === id) ?? DEFAULT_TABLE
}

/** The Pair Plus row a hand pays on, or null if it loses. */
export function pairPlusKey(s: Score3): PairPlusKey | null {
  switch (s.category) {
    case Cat3.StraightFlush:
      return 'straightFlush'
    case Cat3.Trips:
      return 'trips'
    case Cat3.Straight:
      return 'straight'
    case Cat3.Flush:
      return 'flush'
    case Cat3.Pair:
      return 'pair'
    default:
      return null
  }
}

/** Pair Plus odds as n:1, or 0 when the bet loses. */
export function pairPlusOdds(table: PairPlusTable, s: Score3): number {
  const key = pairPlusKey(s)
  return key ? table.pay[key] : 0
}

/** Ante bonus odds as n:1, or 0 for anything below a straight. Note there is no
 *  bonus for a flush or a pair: the Ante bonus starts where Pair Plus's middle
 *  rows already are. */
export function anteBonusOdds(s: Score3): number {
  switch (s.category) {
    case Cat3.StraightFlush:
      return ANTE_BONUS.straightFlush
    case Cat3.Trips:
      return ANTE_BONUS.trips
    case Cat3.Straight:
      return ANTE_BONUS.straight
    default:
      return 0
  }
}

/** The dealer's hand plays on queen high or better — that is, any pair or up,
 *  or a high-card hand topped by a queen, king or ace. Q-3-2 qualifies; J-10-9
 *  does not, and the ante pays anyway. */
export function dealerQualifies(s: Score3): boolean {
  return s.category > Cat3.HighCard || s.tiebreak[0] >= 12
}

/** Optimal Ante/Play strategy: raise on Q-6-4 or better, fold below it.
 *
 *  The cutoff is exactly where the Play bet's expectation crosses the one unit
 *  a fold gives up, and it is a hair, not a range — Q-6-4 raises, Q-6-3 folds.
 *  Anything with a pair or better, or a king or ace high, is an easy raise. */
export function shouldRaise(s: Score3): boolean {
  if (s.category > Cat3.HighCard) return true
  const [a, b, c] = s.tiebreak
  if (a > 12) return true // king or ace high
  if (a < 12) return false // jack high or worse
  return b > 6 || (b === 6 && c >= 4)
}

export const STRATEGY_NOTE = 'Raise on Q-6-4 or better; fold anything below it.'
