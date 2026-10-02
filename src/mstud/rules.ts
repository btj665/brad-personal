import { Category, type Score } from '../poker/eval'
import type { MStudRules, PayKey, PayRow } from './types'

/** The standard Mississippi Stud pay table, as dealt everywhere the game is
 *  spread. Unlike most carnival games there is no side-bet schedule to argue
 *  about: this one table is the whole game, and it is applied to the total
 *  amount wagered rather than to the ante.
 *
 *  The two odd rows at the bottom are what make the game: a pair of 6s through
 *  10s gets your money back and a pair of 2s through 5s loses it. So low pairs
 *  are worth almost nothing and mid pairs are a free roll at two pair or trips. */
export const MSTUD_PAYTABLE: PayRow[] = [
  { key: 'royal', label: 'Royal flush', pay: 500 },
  { key: 'straightFlush', label: 'Straight flush', pay: 100 },
  { key: 'quads', label: 'Four of a kind', pay: 40 },
  { key: 'fullHouse', label: 'Full house', pay: 10 },
  { key: 'flush', label: 'Flush', pay: 6 },
  { key: 'straight', label: 'Straight', pay: 4 },
  { key: 'trips', label: 'Three of a kind', pay: 3 },
  { key: 'twoPair', label: 'Two pair', pay: 2 },
  { key: 'highPair', label: 'Pair of jacks or better', pay: 1 },
  { key: 'midPair', label: 'Pair of 6s – 10s', pay: 0 },
]

export const DEFAULT_MSTUD: MStudRules = {
  label: 'Mississippi Stud',
  paytable: MSTUD_PAYTABLE,
  minBet: 5,
  maxBet: 100,
  chips: [5, 25, 100],
}

const PAY_BY_KEY: Record<PayKey, number> = MSTUD_PAYTABLE.reduce(
  (acc, row) => {
    acc[row.key] = row.pay
    return acc
  },
  {} as Record<PayKey, number>,
)

const LABEL_BY_KEY: Record<PayKey, string> = MSTUD_PAYTABLE.reduce(
  (acc, row) => {
    acc[row.key] = row.label
    return acc
  },
  {} as Record<PayKey, string>,
)

/** The pay-table row a finished five-card hand lands on, or null when it pays
 *  nothing — high card, or a pair of 2s through 5s. */
export function payKeyFor(score: Score): PayKey | null {
  switch (score.category) {
    case Category.StraightFlush:
      return score.tiebreak[0] === 14 ? 'royal' : 'straightFlush'
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
    case Category.Pair: {
      // tiebreak[0] is the paired rank: the evaluator sorts groups by size first.
      const rank = score.tiebreak[0]
      if (rank >= 11) return 'highPair'
      if (rank >= 6) return 'midPair'
      return null
    }
    default:
      return null
  }
}

/** Units won per unit wagered: the pay table for a paying hand, 0 for a push,
 *  and -1 for a hand that loses the lot. */
export function multiplierFor(score: Score): number {
  const key = payKeyFor(score)
  return key === null ? -1 : PAY_BY_KEY[key]
}

/** Takes `undefined` too, so a hand that hasn't been scored yet reads sensibly. */
export function payLabel(key: PayKey | null | undefined): string {
  return key == null ? 'No pair' : LABEL_BY_KEY[key]
}

/** Chips handed back for a settled hand. The whole wager rides on the table, so
 *  a 6:1 flush on seven units returns 49, not 7. */
export function returnedFor(wagered: number, multiplier: number): number {
  return multiplier < 0 ? 0 : wagered * (1 + multiplier)
}
