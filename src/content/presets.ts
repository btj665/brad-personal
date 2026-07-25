// Real games, as they are actually dealt. Pick one, or open the rules panel and
// build your own — every field is live.
//
// `edge` is the house edge against perfect basic strategy, as a percentage of
// the original bet, MEASURED by simulating eight million rounds of each game:
// `npm run edge` reproduces the whole table. It is not copied from anywhere, so
// it stays honest when the rules are edited.
//
// The one figure worth checking against the outside world is Vegas Strip, whose
// house edge is published as 0.41% from combinatorial analysis. The simulator
// lands on 0.391% ± 0.081%, which is how we know the dealer rules, the payouts,
// the split and double logic and the strategy chart are all right.

import { DEFAULT_RULES } from '../engine/rules'
import type { RuleSet } from '../engine/types'

export interface Preset {
  id: string
  rules: RuleSet
  /** Measured house edge vs. basic strategy, in percent. Negative favours the
   *  player — which is exactly why the liberal game below does not exist. */
  edge: number
  note: string
}

export const PRESETS: Preset[] = [
  {
    id: 'vegas-strip',
    edge: 0.39,
    note: 'Six decks, dealer stands on all 17s, blackjack pays 3:2, late surrender. The reference game, and a fair one.',
    rules: { ...DEFAULT_RULES },
  },
  {
    id: 'downtown-vegas',
    edge: 0.37,
    note: 'Two decks, and the dealer hits soft 17. The extra dealer card costs you a fifth of a percent; the shallower shoe hands most of it back.',
    rules: {
      ...DEFAULT_RULES,
      label: 'Downtown Vegas',
      decks: 2,
      dealerHitsSoft17: true,
      penetration: 0.7,
    },
  },
  {
    id: 'atlantic-city',
    edge: 0.39,
    note: 'Eight decks, but generous with everything else: stand on soft 17, double after split, late surrender, re-split to four.',
    rules: {
      ...DEFAULT_RULES,
      label: 'Atlantic City',
      decks: 8,
      penetration: 0.8,
    },
  },
  {
    id: 'european',
    edge: 0.57,
    note: 'No hole card: the dealer takes a second card only after you have played. A dealer blackjack takes your original bet and returns what you doubled and split.',
    rules: {
      ...DEFAULT_RULES,
      label: 'European',
      decks: 6,
      dealerPeek: false,
      originalBetsOnly: true,
      double: 'nine-eleven',
      surrender: 'none',
      maxSplitHands: 3,
      splitUnlikeTens: false,
    },
  },
  {
    id: 'single-deck-65',
    edge: 1.99,
    note: 'One deck sounds like a gift until you read the felt: blackjack pays 6:5, and you can only double on 10 and 11. This is the worst game on the floor. It is also the most common.',
    rules: {
      ...DEFAULT_RULES,
      label: 'Single Deck 6:5',
      decks: 1,
      penetration: 0.6,
      dealerHitsSoft17: true,
      blackjackPayout: [6, 5],
      double: 'ten-eleven',
      doubleAfterSplit: false,
      surrender: 'none',
      maxSplitHands: 2,
    },
  },
  {
    id: 'liberal',
    edge: -0.41,
    note: 'Everything a player could ask for: single deck, stand on soft 17, re-split and hit aces, early surrender, a Charlie at seven cards. The edge is NEGATIVE — the player is favoured — which is precisely why no casino on earth deals this game.',
    rules: {
      ...DEFAULT_RULES,
      label: 'Liberal House',
      decks: 1,
      penetration: 0.65,
      doubleOnSplitAces: true,
      resplitAces: true,
      hitSplitAces: true,
      surrender: 'early',
      surrenderAfterSplit: true,
      charlie: 7,
    },
  },
]

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0]
}
