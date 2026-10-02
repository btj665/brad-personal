// Hi-Lo counting. Used by the "counter" bot for its bet spread, its insurance
// decision, and the Illustrious 18 playing deviations — and by the UI's optional
// count display.

import { rankValue } from '../cards'
import { evaluate, isSplittable } from '../hand'
import { canDouble, canSplit } from '../rules'
import type { Action, Card, Hand, RuleSet, Seat } from '../types'

/** Hi-Lo tag: low cards are good for the player when they're gone. */
export function hiLo(card: Card): number {
  const v = rankValue(card.rank)
  if (v >= 2 && v <= 6) return +1
  if (v >= 10 || v === 11) return -1
  return 0
}

export class Counter {
  running = 0

  reset(): void {
    this.running = 0
  }

  see(card: Card): void {
    this.running += hiLo(card)
  }

  /** Running count divided by the decks still to be dealt. */
  true(decksRemaining: number): number {
    const decks = Math.max(0.5, decksRemaining)
    return this.running / decks
  }
}

/** Insurance is a bet that the hole card is a ten. It turns positive for the
 *  player at a Hi-Lo true count of +3. */
export function shouldInsure(trueCount: number): boolean {
  return trueCount >= 3
}

/** How many table minimums to bet at this count. A counter flat-bets one unit
 *  through a neutral or negative shoe and ramps as the count climbs. */
export function betUnits(trueCount: number, maxSpread: number): number {
  if (trueCount < 1) return 1
  return Math.min(maxSpread, Math.max(1, Math.floor(trueCount) - 1 || 1))
}

interface Deviation {
  /** 'hard' totals, or 'pair' keyed by the rank value of one card. */
  chart: 'hard' | 'pair'
  row: number
  up: number
  /** Take the action when the true count is at or beyond this. */
  index: number
  direction: 'atLeast' | 'atMost'
  action: Action
}

/** The Illustrious 18, less two.
 *
 *  The canonical list includes splitting a pair of tens against a 5 or a 6 at a
 *  high count. It is genuinely correct and it is genuinely the single most
 *  irritating thing a stranger can do at your table — breaking up a made 20 to
 *  eat the cards everyone is waiting on. The bots here don't do it. It is worth
 *  a hundredth of a percent, and it is not worth the noise.
 *
 *  Indices are Hi-Lo true counts. */
const ILLUSTRIOUS_18: Deviation[] = [
  { chart: 'hard', row: 16, up: 10, index: 0, direction: 'atLeast', action: 'stand' },
  { chart: 'hard', row: 15, up: 10, index: 4, direction: 'atLeast', action: 'stand' },
  { chart: 'hard', row: 10, up: 10, index: 4, direction: 'atLeast', action: 'double' },
  { chart: 'hard', row: 12, up: 3, index: 2, direction: 'atLeast', action: 'stand' },
  { chart: 'hard', row: 12, up: 2, index: 3, direction: 'atLeast', action: 'stand' },
  { chart: 'hard', row: 11, up: 11, index: 1, direction: 'atLeast', action: 'double' },
  { chart: 'hard', row: 9, up: 2, index: 1, direction: 'atLeast', action: 'double' },
  { chart: 'hard', row: 10, up: 11, index: 4, direction: 'atLeast', action: 'double' },
  { chart: 'hard', row: 9, up: 7, index: 3, direction: 'atLeast', action: 'double' },
  { chart: 'hard', row: 16, up: 9, index: 5, direction: 'atLeast', action: 'stand' },
  { chart: 'hard', row: 13, up: 2, index: -1, direction: 'atMost', action: 'hit' },
  { chart: 'hard', row: 12, up: 4, index: 0, direction: 'atMost', action: 'hit' },
  { chart: 'hard', row: 12, up: 5, index: -2, direction: 'atMost', action: 'hit' },
  { chart: 'hard', row: 12, up: 6, index: -1, direction: 'atMost', action: 'hit' },
  { chart: 'hard', row: 13, up: 3, index: -2, direction: 'atMost', action: 'hit' },
]

/** The count-based override for this hand, or null to play basic strategy.
 *  Only ever returns an action the hand is actually allowed to take. */
export function countDeviation(
  hand: Hand,
  up: Card,
  trueCount: number,
  seat: Seat,
  rules: RuleSet,
): Action | null {
  // A doubled hand still on the clock is waiting on a Spanish 21 rescue answer.
  // It takes no more cards, so every deviation below is illegal on it.
  if (hand.doubled) return null

  const upValue = rankValue(up.rank)
  const { total, soft } = evaluate(hand.cards)
  const pairRank =
    isSplittable(hand, rules) && hand.cards.length === 2 ? rankValue(hand.cards[0].rank) : null

  for (const dev of ILLUSTRIOUS_18) {
    if (dev.up !== upValue) continue

    if (dev.chart === 'pair') {
      if (pairRank !== dev.row) continue
    } else {
      if (soft || total !== dev.row) continue
      // A hard 9/10/11 double only exists on the first two cards.
      if (dev.action === 'double' && hand.cards.length !== 2) continue
    }

    const triggered =
      dev.direction === 'atLeast' ? trueCount >= dev.index : trueCount <= dev.index
    if (!triggered) continue

    if (dev.action === 'double' && !canDouble(hand, seat, rules)) continue
    if (dev.action === 'split' && !canSplit(hand, seat, rules)) continue

    return dev.action
  }

  return null
}
