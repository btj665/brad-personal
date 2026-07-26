// Caribbean Stud Poker — the two pay schedules.
//
// There are only two numbers a Caribbean Stud table advertises: the odds the
// Raise is paid at when the player beats a qualified dealer, and whatever the
// progressive meter says. Everything else about the game is fixed.

import { Category, type Score } from '../poker/eval'
import type { Card } from '../engine/types'

/** The rows of the Raise schedule. Everything below two pair — one pair, and a
 *  high-card hand that still happened to beat the dealer — pays even money, so
 *  the bottom row covers both. */
export type PayKey =
  | 'royal'
  | 'straightFlush'
  | 'quads'
  | 'fullHouse'
  | 'flush'
  | 'straight'
  | 'trips'
  | 'twoPair'
  | 'pairOrLess'

/** Top of the table first, which is the order a rack card prints them in. */
export const PAY_ORDER: readonly PayKey[] = [
  'royal',
  'straightFlush',
  'quads',
  'fullHouse',
  'flush',
  'straight',
  'trips',
  'twoPair',
  'pairOrLess',
]

export const PAY_LABEL: Record<PayKey, string> = {
  royal: 'Royal flush',
  straightFlush: 'Straight flush',
  quads: 'Four of a kind',
  fullHouse: 'Full house',
  flush: 'Flush',
  straight: 'Straight',
  trips: 'Three of a kind',
  twoPair: 'Two pair',
  pairOrLess: 'Pair or less',
}

export interface ProgressiveRules {
  /** Flat cost of the side bet, in dollars — never scaled to the ante. */
  cost: number
  /** What the meter reads. Held constant here; see `progressiveReturn`. */
  meter: number
  /** Fraction of the meter this hand takes. */
  share: Partial<Record<PayKey, number>>
  /** Flat dollar amounts, independent of the meter. */
  fixed: Partial<Record<PayKey, number>>
}

export interface CaribbeanRules {
  label: string
  /** Raise odds, expressed as the "to 1" multiplier on the Raise. */
  raisePay: Record<PayKey, number>
  progressive: ProgressiveRules
  minAnte: number
  maxAnte: number
  chips: number[]
}

/** The standard Caribbean Stud schedule. This one is near-universal: the only
 *  common variations are a 100:1 royal being cut to 50:1 and quads paying 15:1
 *  instead of 20:1, both of which cost the player a few tenths of a percent.
 *
 *  The progressive is the fixed-jackpot form — the meter is a number we hold
 *  still rather than a counter that creeps up 70¢ a bet — because that is the
 *  only version whose return is a single checkable number. It is a bad bet at
 *  the seeded meter and a good one above break-even; `breakEvenMeter` says
 *  where the line is, and `scripts/caribbean-edge.ts` prints both. */
export const DEFAULT_CARIBBEAN: CaribbeanRules = {
  label: 'Caribbean Stud Poker',
  raisePay: {
    royal: 100,
    straightFlush: 50,
    quads: 20,
    fullHouse: 7,
    flush: 5,
    straight: 4,
    trips: 3,
    twoPair: 2,
    pairOrLess: 1,
  },
  progressive: {
    cost: 1,
    meter: 200_000,
    share: { royal: 1, straightFlush: 0.1 },
    fixed: { quads: 500, fullHouse: 100, flush: 50 },
  },
  minAnte: 5,
  maxAnte: 500,
  chips: [5, 25, 100, 500],
}

/** Exact counts of the 2,598,960 five-card hands, by Raise-schedule row.
 *  `scripts/caribbean-edge.ts` re-derives every one of these by enumerating the
 *  whole deck and throws if they disagree, so they cannot quietly rot. */
export const HAND_COUNTS: Record<PayKey, number> = {
  royal: 4,
  straightFlush: 36,
  quads: 624,
  fullHouse: 3744,
  flush: 5108,
  straight: 10_200,
  trips: 54_912,
  twoPair: 123_552,
  // One pair (1,098,240) plus high card (1,302,540) — one row, one price.
  pairOrLess: 2_400_780,
}

export const TOTAL_HANDS = 2_598_960

/** A straight flush to the ace. */
export function isRoyalFlush(score: Score): boolean {
  return score.category === Category.StraightFlush && score.tiebreak[0] === 14
}

/** Which row of the Raise schedule a five-card hand is paid on. Unlike the
 *  bonus tables in the other games this never returns null: every hand that
 *  beats the dealer gets paid something. */
export function payKey(score: Score): PayKey {
  switch (score.category) {
    case Category.StraightFlush:
      return isRoyalFlush(score) ? 'royal' : 'straightFlush'
    case Category.Quads:
      return 'quads'
    case Category.FullHouse:
      return 'fullHouse'
    case Category.Flush:
      return 'flush'
    case Category.Straight:
      return 'straight'
    case Category.Trips:
      return 'trips'
    case Category.TwoPair:
      return 'twoPair'
    default:
      return 'pairOrLess'
  }
}

/** Ace-king or better. A pair or better always opens; below that the dealer
 *  needs both an ace and a king, which in a no-pair hand means it reads
 *  A-K-x-x-x. So A-K-4-3-2 opens and A-Q-J-10-8 does not. */
export function dealerQualifies(cards: Card[], score: Score): boolean {
  if (score.category >= Category.Pair) return true
  let ace = false
  let king = false
  for (const c of cards) {
    if (c.rank === 'A') ace = true
    else if (c.rank === 'K') king = true
  }
  return ace && king
}

/** What the progressive pays this hand, in dollars. These are amounts won, not
 *  odds: quads collects $500 and the $1 stake stays with the house. */
export function progressiveWin(p: ProgressiveRules, key: PayKey): number {
  return (p.share[key] ?? 0) * p.meter + (p.fixed[key] ?? 0)
}

/** The progressive's return per dollar staked, at the meter it is currently
 *  set to. Exact — it only depends on the five-card frequencies, which are
 *  combinatorial constants. */
export function progressiveReturn(p: ProgressiveRules): number {
  let ev = 0
  for (const key of PAY_ORDER) {
    ev += (HAND_COUNTS[key] / TOTAL_HANDS) * progressiveWin(p, key)
  }
  return ev / p.cost
}

/** The meter at which the progressive stops being a losing bet. Below it the
 *  side bet is terrible; above it, it is the rare positive-expectation wager on
 *  a casino floor — though the variance is such that you will not live long
 *  enough to realise it. */
export function breakEvenMeter(p: ProgressiveRules): number {
  let fixedReturn = 0
  let meterCoefficient = 0
  for (const key of PAY_ORDER) {
    const freq = HAND_COUNTS[key] / TOTAL_HANDS
    fixedReturn += freq * (p.fixed[key] ?? 0)
    meterCoefficient += freq * (p.share[key] ?? 0)
  }
  return (p.cost - fixedReturn) / meterCoefficient
}
