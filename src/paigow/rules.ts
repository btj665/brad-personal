import { Category } from '../poker/eval'
import type { PaiGowRules, Ratio } from './types'

/** The Fortune bonus pays on a seven-card hand of trips or better — read from
 *  the whole hand, not the split. This is a common schedule; like every side
 *  bet it carries a stiff house edge, which is the price of the jackpot lines. */
export const DEFAULT_PAIGOW: PaiGowRules = {
  label: 'Pai Gow Poker',
  commission: 0.05,
  fortunePay: {
    sevenCardStraightFlush: [8000, 1],
    royal: [2000, 1],
    fiveAces: [400, 1],
    straightFlush: [50, 1],
    quads: [25, 1],
    fullHouse: [5, 1],
    flush: [4, 1],
    straight: [2, 1],
    trips: [3, 1],
  },
  fortuneEnvyMin: 5,
  fortuneEnvy: {
    sevenCardStraightFlush: 5000,
    royal: 1000,
    fiveAces: 250,
    straightFlush: 50,
    quads: 25,
  },
  minBet: 10,
  maxBet: 2000,
  chips: [5, 25, 100, 500, 1000],
}

export function ratio(r: Ratio): number {
  return r[0] / r[1]
}

/** Map a hand to a Fortune pay key. Needs the special seven-card hands, which a
 *  plain category can't express, so it takes those as flags. */
export function fortuneKey(
  category: Category,
  flags: { royal: boolean; fiveAces: boolean; sevenStraightFlush: boolean },
): string | null {
  if (flags.sevenStraightFlush) return 'sevenCardStraightFlush'
  if (flags.fiveAces) return 'fiveAces'
  if (flags.royal) return 'royal'
  switch (category) {
    case Category.StraightFlush:
      return 'straightFlush'
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
    default:
      return null
  }
}
