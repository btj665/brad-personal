import { Category } from '../poker/eval'
import type { Ratio, UthRules } from './types'

/** The standard Ultimate Texas Hold'em pay tables.
 *
 *  Blind bonus (pays only when the player beats the dealer, on a straight or
 *  better): straight 1:1, flush 3:2, full house 3:1, quads 10:1, straight flush
 *  50:1, royal flush 500:1. Anything less than a straight pays even, no bonus.
 *
 *  Trips (pays regardless of the dealer, even on a fold): trips 3:1, straight
 *  4:1, flush 7:1, full house 8:1, quads 30:1, straight flush 40:1, royal 50:1.
 *  Simulated against the real seven-card hand distribution this is a house edge
 *  of about 3.5% — `npm run uth:trips` prints it. Real Trips schedules run from
 *  roughly 1.9% to 6%; this is a middle one. */
export const DEFAULT_UTH: UthRules = {
  label: 'Ultimate Texas Hold’em',
  blindPay: {
    royal: [500, 1],
    straightFlush: [50, 1],
    quads: [10, 1],
    fullHouse: [3, 1],
    flush: [3, 2],
    straight: [1, 1],
  },
  tripsPay: {
    royal: [50, 1],
    straightFlush: [40, 1],
    quads: [30, 1],
    fullHouse: [8, 1],
    flush: [7, 1],
    straight: [4, 1],
    trips: [3, 1],
  },
  minBet: 5,
  maxBet: 500,
  chips: [5, 25, 100, 500],
}

export function ratio(r: Ratio): number {
  return r[0] / r[1]
}

/** A five-card hand's key for the Blind and Trips tables, or null if it doesn't
 *  reach the bottom of the given table. `royal` is a straight flush to the ace. */
export function payKey(category: Category, isRoyal: boolean): string | null {
  switch (category) {
    case Category.StraightFlush:
      return isRoyal ? 'royal' : 'straightFlush'
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

/** A straight flush whose top card is the ace (tiebreak 14). */
export function isRoyal(category: Category, tiebreak: number[]): boolean {
  return category === Category.StraightFlush && tiebreak[0] === 14
}
