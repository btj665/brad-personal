import { isTenValue, rankValue } from './cards'
import type { Card, Hand, RuleSet } from './types'

export interface HandValue {
  /** The best total that isn't a bust, or the busted total if there isn't one. */
  total: number
  /** True when an ace is still counting as 11 — i.e. the hand can't bust on a hit. */
  soft: boolean
  busted: boolean
}

export function evaluate(cards: readonly Card[]): HandValue {
  let total = 0
  let aces = 0
  for (const card of cards) {
    total += rankValue(card.rank)
    if (card.rank === 'A') aces++
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return { total, soft: aces > 0, busted: total > 21 }
}

export function handTotal(hand: Hand): number {
  return evaluate(hand.cards).total
}

export function isBusted(hand: Hand): boolean {
  return evaluate(hand.cards).busted
}

/** A natural: 21 on the first two cards. A 21 made after a split is not one. */
export function isBlackjack(hand: Hand): boolean {
  return hand.cards.length === 2 && !hand.fromSplit && evaluate(hand.cards).total === 21
}

/** Two cards the house will let you split. */
export function isSplittable(hand: Hand, rules: RuleSet): boolean {
  if (hand.cards.length !== 2) return false
  const [a, b] = hand.cards
  if (a.rank === b.rank) return true
  return rules.splitUnlikeTens && isTenValue(a) && isTenValue(b)
}

/** A Charlie is N unbusted cards, which the house pays immediately. */
export function isCharlie(hand: Hand, rules: RuleSet): boolean {
  if (rules.charlie == null) return false
  return hand.cards.length >= rules.charlie && !isBusted(hand)
}

/** A doubled hand takes its one card and stops — unless the house offers
 *  double-down rescue, in which case the player still owes one decision: keep the
 *  hand or hand it back for the original bet.
 *
 *  A free double is deliberately excluded. The house's chip costs nothing when it
 *  loses, so buying the hand back could only throw away the live half. */
export function canRescue(hand: Hand, rules: RuleSet): boolean {
  if (!rules.doubleRescue || !hand.doubled) return false
  if (hand.freeBet > 0) return false
  if (hand.stood || hand.surrendered || isBusted(hand)) return false
  return evaluate(hand.cards).total !== 21
}

/** A hand is done when it can take no more cards. */
export function isResolved(hand: Hand, rules: RuleSet): boolean {
  if (hand.stood || hand.surrendered) return true
  if (isBusted(hand) || isCharlie(hand, rules)) return true
  if (evaluate(hand.cards).total === 21) return true
  if (hand.doubled) return !canRescue(hand, rules)
  return false
}

export function makeHand(id: string, cards: Card[], bet: number, opts: Partial<Hand> = {}): Hand {
  return {
    id,
    cards,
    bet,
    freeBet: 0,
    doubled: false,
    fromSplit: false,
    splitAces: false,
    stood: false,
    surrendered: false,
    ...opts,
  }
}
