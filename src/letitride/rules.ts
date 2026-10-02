// Let It Ride's pay table.
//
// There is no dealer hand and nothing to beat: the player's own five cards are
// read straight off this schedule, and every bet still on the table is paid the
// same odds. That last part is why the game's two published edge figures differ
// by a factor of three — see scripts/letitride-edge.ts.

import { Category, type Score } from '../poker/eval'

export type PayKey =
  | 'royalFlush'
  | 'straightFlush'
  | 'quads'
  | 'fullHouse'
  | 'flush'
  | 'straight'
  | 'trips'
  | 'twoPair'
  | 'tensOrBetter'

export interface PayRow {
  key: PayKey
  label: string
  /** Paid to one, on every bet still riding. */
  odds: number
}

/** The standard Let It Ride schedule, in the order a layout prints it. The only
 *  common variant drops the flush to 7:1, which costs the player another ~1.5%;
 *  this is the 8:1 table the 3.51% figure is quoted against. */
export const PAYTABLE: readonly PayRow[] = [
  { key: 'royalFlush', label: 'Royal flush', odds: 1000 },
  { key: 'straightFlush', label: 'Straight flush', odds: 200 },
  { key: 'quads', label: 'Four of a kind', odds: 50 },
  { key: 'fullHouse', label: 'Full house', odds: 11 },
  { key: 'flush', label: 'Flush', odds: 8 },
  { key: 'straight', label: 'Straight', odds: 5 },
  { key: 'trips', label: 'Three of a kind', odds: 3 },
  { key: 'twoPair', label: 'Two pair', odds: 2 },
  { key: 'tensOrBetter', label: 'Pair of tens or better', odds: 1 },
]

const ROWS = new Map<PayKey, PayRow>(PAYTABLE.map((r) => [r.key, r]))

export function oddsFor(key: PayKey): number {
  return ROWS.get(key)!.odds
}

export function labelFor(key: PayKey): string {
  return ROWS.get(key)!.label
}

/** The lowest pair the table pays. Let It Ride's bottom rung is a rank, not a
 *  category, so settling a hand needs the pair's rank and not just "a pair". */
export const MIN_PAIR = 10

/** Which row of the schedule a five-card hand pays, or null for a loser.
 *
 *  `Score.tiebreak[0]` carries the extra rank the table needs: for a Pair it is
 *  the pair's rank, and for a StraightFlush it is the straight's top card, so 14
 *  there means the royal. Hands are scored with ordinary poker ranking — no
 *  `wheelHigh` — so A-2-3-4-5 suited tops out at 5 and pays the straight flush
 *  row rather than the royal. */
export function payKeyFor(score: Score): PayKey | null {
  switch (score.category) {
    case Category.StraightFlush:
      return score.tiebreak[0] === 14 ? 'royalFlush' : 'straightFlush'
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
    case Category.Pair:
      return score.tiebreak[0] >= MIN_PAIR ? 'tensOrBetter' : null
    default:
      return null
  }
}

/** Net units won per unit still riding: the schedule's odds on a paying hand,
 *  −1 on a loser. The edge script sums this. */
export function netRatio(score: Score): number {
  const key = payKeyFor(score)
  return key === null ? -1 : oddsFor(key)
}

/** What comes back to the player at the end of a round: the stakes that were
 *  pulled back, untouched, plus stake and win on each of the `riding` bets still
 *  out there. `riding` is 1, 2 or 3 — bet 3 can never be pulled. */
export function settleAmount(score: Score, unit: number, riding: number): number {
  const pulled = (3 - riding) * unit
  const key = payKeyFor(score)
  if (key === null) return pulled
  return pulled + riding * unit * (1 + oddsFor(key))
}
