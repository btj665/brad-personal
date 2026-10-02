import { isTenValue } from './cards'
import { canRescue, evaluate, isBlackjack, isResolved, isSplittable } from './hand'
import type { Action, Hand, Ratio, Rank, RuleSet, Seat } from './types'

/** The reference game: 6 decks, dealer stands on soft 17, blackjack pays 3:2,
 *  double any two, double after split, split to four hands, late surrender.
 *  Perfect basic strategy against this is a house edge of about 0.4%. */
export const DEFAULT_RULES: RuleSet = {
  label: 'Vegas Strip',

  decks: 6,
  removeTens: false,
  penetration: 0.75,
  burnCard: true,
  csm: false,

  dealerHitsSoft17: false,
  dealerPeek: true,
  originalBetsOnly: true,
  dealerPush22: false,
  player21Wins: false,

  blackjackPayout: [3, 2],
  insurancePayout: [2, 1],
  spanishBonuses: false,

  double: 'any',
  doubleAfterSplit: true,
  doubleOnSplitAces: false,
  doubleAnyCards: false,
  doubleRescue: false,
  freeDouble: false,
  freeSplit: false,

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

// ---------------------------------------------------------------- free wagers
//
// Free Bet Blackjack. There is no separate "free double" button: at a Free Bet
// table the dealer simply puts the house's chip out when the hand qualifies, so
// the player presses Double and the engine decides whose money it is. That keeps
// the Action union — and therefore the UI — exactly as it was.

/** What one wager on this hand is worth. A hand riding on nothing but a free chip
 *  has no money of its own, so the free chip sets the size of any later double. */
export function wagerUnit(hand: Hand): number {
  return hand.bet > 0 ? hand.bet : hand.freeBet
}

/** The house doubles any hard 9, 10 or 11 for you — and only on two cards, so a
 *  hand that has already hit into 11 pays for its own double. */
export function isFreeDouble(hand: Hand, rules: RuleSet): boolean {
  if (!rules.freeDouble || hand.doubled || hand.cards.length !== 2) return false
  const { total, soft } = evaluate(hand.cards)
  return !soft && total >= 9 && total <= 11
}

/** The house splits any pair but ten-values. Split aces still take one card each:
 *  that is `hitSplitAces`, and free splitting does not change it. */
export function isFreeSplit(hand: Hand, rules: RuleSet): boolean {
  if (!rules.freeSplit || !isSplittable(hand, rules)) return false
  return !isTenValue(hand.cards[0])
}

// ---------------------------------------------------------------- bonuses

export interface Bonus {
  name: string
  pay: Ratio
}

/** Spanish 21's bonus ladder. These pay on the ORIGINAL wager, on top of the
 *  even money the 21 itself wins.
 *
 *  The restriction that makes the game work: no bonus is paid on a hand that has
 *  been doubled or split. Without it the player would double every four-card 16
 *  and the ladder would hand the game away.
 *
 *  Left out: the Super Bonus (7-7-7 suited against a dealer 7, a flat $1,000 or
 *  $5,000 depending on the bet) and the Match the Dealer side bet. Both are
 *  fixed-amount specials rather than ratios on the wager, and the Super Bonus is
 *  worth about 0.03% — it does not move the edge. */
export function spanishBonus(hand: Hand, rules: RuleSet): Bonus | null {
  if (!rules.spanishBonuses) return null
  if (hand.doubled || hand.fromSplit) return null
  if (evaluate(hand.cards).total !== 21) return null

  const ranks = hand.cards.map((c) => c.rank)

  // 6-7-8 and 7-7-7 both total 21 on exactly three cards, so there is no longer
  // hand to confuse them with.
  if (ranks.length === 3) {
    const sevens = ranks.every((r) => r === '7')
    const six78 = (['6', '7', '8'] as Rank[]).every((r) => ranks.includes(r))
    if (sevens || six78) {
      const name = sevens ? '7-7-7' : '6-7-8'
      const suits = new Set(hand.cards.map((c) => c.suit))
      if (suits.size > 1) return { name, pay: [3, 2] }
      return suits.has('S')
        ? { name: `${name} of spades`, pay: [3, 1] }
        : { name: `suited ${name}`, pay: [2, 1] }
    }
    return null
  }

  if (ranks.length === 5) return { name: 'five-card 21', pay: [3, 2] }
  if (ranks.length === 6) return { name: 'six-card 21', pay: [2, 1] }
  if (ranks.length >= 7) return { name: 'seven-card 21', pay: [3, 1] }
  return null
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
  // A free double is the house's chip, so neither the table's double restriction
  // nor the player's bankroll has any say in it.
  const free = isFreeDouble(hand, rules)

  // Re-doubling an already-doubled hand is left out. A few Spanish 21 tables
  // allow it; it is worth a hundredth of a percent and it would need the doubled
  // stake tracked separately to settle a rescue afterwards.
  if (hand.doubled) return false
  if (hand.cards.length < 2) return false
  if (hand.cards.length !== 2 && !rules.doubleAnyCards) return false
  if (hand.fromSplit && !rules.doubleAfterSplit) return false
  if (hand.splitAces && !rules.doubleOnSplitAces) return false
  if (free) return true

  if (rules.double === 'none') return false
  if (seat.bankroll < wagerUnit(hand)) return false

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
  // A free split needs no chips behind it: the house is putting the hand up.
  if (!isFreeSplit(hand, rules) && seat.bankroll < wagerUnit(hand)) return false
  return true
}

export function canSurrender(hand: Hand, rules: RuleSet): boolean {
  if (hand.stood || hand.surrendered) return false
  // Spanish 21's double-down rescue rides this path on purpose: handing back a
  // doubled hand for the original bet is a surrender, settles like a surrender,
  // and so needs no new action for the player to press.
  if (hand.doubled) return canRescue(hand, rules)

  if (rules.surrender === 'none') return false
  if (hand.cards.length !== 2) return false
  if (hand.fromSplit && !rules.surrenderAfterSplit) return false
  // You never surrender a natural.
  if (isBlackjack(hand)) return false
  return true
}

/** Everything this hand is allowed to do right now, in the order a dealer would
 *  read them out. An empty list means the hand is finished. */
export function legalActions(hand: Hand, seat: Seat, rules: RuleSet): Action[] {
  if (isResolved(hand, rules)) return []

  // The only unresolved doubled hand is one the house will buy back. It takes no
  // further cards, so the whole menu is keep-it or hand-it-back.
  if (hand.doubled) return ['stand', 'surrender']

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
