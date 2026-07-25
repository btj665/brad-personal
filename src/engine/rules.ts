import { evaluate, isBlackjack, isResolved, isSplittable } from './hand'
import type { Action, Hand, Ratio, RuleSet, Seat } from './types'

/** The reference game: 6 decks, dealer stands on soft 17, blackjack pays 3:2,
 *  double any two, double after split, split to four hands, late surrender.
 *  Perfect basic strategy against this is a house edge of about 0.4%. */
export const DEFAULT_RULES: RuleSet = {
  label: 'Vegas Strip',

  decks: 6,
  penetration: 0.75,
  burnCard: true,
  csm: false,

  dealerHitsSoft17: false,
  dealerPeek: true,
  originalBetsOnly: true,
  dealerPush22: false,

  blackjackPayout: [3, 2],
  insurancePayout: [2, 1],

  double: 'any',
  doubleAfterSplit: true,
  doubleOnSplitAces: false,

  maxSplitHands: 4,
  resplitAces: false,
  hitSplitAces: false,
  splitUnlikeTens: true,

  surrender: 'late',
  surrenderAfterSplit: false,

  insurance: true,
  evenMoney: true,

  charlie: null,

  minBet: 10,
  maxBet: 2000,
  chips: [5, 25, 100, 500, 1000],
}

export function ratio(r: Ratio): number {
  return r[0] / r[1]
}

/** What a blackjack pays on top of the bet returning. */
export function blackjackWinnings(bet: number, rules: RuleSet): number {
  return bet * ratio(rules.blackjackPayout)
}

// ---------------------------------------------------------------- legality
//
// One function per action, so the UI, the bots and the settlement logic all
// agree on what is and isn't allowed. Every one of these is rule-driven.

export function canHit(hand: Hand, rules: RuleSet): boolean {
  if (isResolved(hand, rules)) return false
  // Split aces get one card and that's the end of it, unless the house says
  // otherwise.
  if (hand.splitAces && !rules.hitSplitAces && hand.cards.length >= 2) return false
  return true
}

export function canDouble(hand: Hand, seat: Seat, rules: RuleSet): boolean {
  if (rules.double === 'none') return false
  if (hand.cards.length !== 2 || hand.doubled) return false
  if (hand.fromSplit && !rules.doubleAfterSplit) return false
  if (hand.splitAces && !rules.doubleOnSplitAces) return false
  if (seat.bankroll < hand.bet) return false

  const { total, soft } = evaluate(hand.cards)
  if (rules.double === 'nine-eleven') return !soft && total >= 9 && total <= 11
  if (rules.double === 'ten-eleven') return !soft && total >= 10 && total <= 11
  return true
}

export function canSplit(hand: Hand, seat: Seat, rules: RuleSet): boolean {
  if (!isSplittable(hand, rules)) return false
  if (seat.hands.length >= rules.maxSplitHands) return false
  // Re-splitting aces is its own permission, separate from hitting them.
  if (hand.splitAces && !rules.resplitAces) return false
  if (seat.bankroll < hand.bet) return false
  return true
}

export function canSurrender(hand: Hand, rules: RuleSet): boolean {
  if (rules.surrender === 'none') return false
  if (hand.cards.length !== 2) return false
  if (hand.doubled || hand.stood || hand.surrendered) return false
  if (hand.fromSplit && !rules.surrenderAfterSplit) return false
  // You never surrender a natural.
  if (isBlackjack(hand)) return false
  return true
}

/** Everything this hand is allowed to do right now, in the order a dealer would
 *  read them out. An empty list means the hand is finished. */
export function legalActions(hand: Hand, seat: Seat, rules: RuleSet): Action[] {
  if (isResolved(hand, rules)) return []

  const actions: Action[] = []

  // A pair of aces produced by splitting aces in a one-card-only game may be
  // re-split, but may not be hit. Stand is the only other choice.
  const frozenSplitAce = hand.splitAces && !rules.hitSplitAces && hand.cards.length >= 2
  if (!frozenSplitAce) actions.push('hit')
  actions.push('stand')
  if (canDouble(hand, seat, rules)) actions.push('double')
  if (canSplit(hand, seat, rules)) actions.push('split')
  if (canSurrender(hand, rules)) actions.push('surrender')

  return actions
}
