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
//
// Free Bet and Spanish 21 carry a second figure, `published`, because for those
// two the measured number is knowingly higher than the quoted one: the bots play
// the ordinary six-deck chart plus the deviations in `strategy/basic.ts`, not a
// chart drawn for the variant. Recording the gap rather than papering over it is
// the point — `edge` stays the number this engine actually produces.

import { DEFAULT_RULES } from '../engine/rules'
import type { RuleSet } from '../engine/types'

export interface Preset {
  id: string
  rules: RuleSet
  /** Measured house edge vs. basic strategy, in percent. Negative favours the
   *  player — which is exactly why the liberal game below does not exist. */
  edge: number
  /** The figure the outside world publishes for this game, where it differs from
   *  what we measure. It differs only for the two variants, and only because the
   *  bots play the ordinary chart plus a few deviations rather than a chart drawn
   *  for the variant — see the notes in `strategy/basic.ts`. Leaving both numbers
   *  side by side is the honest way to record that gap. */
  published?: number
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
    id: 'free-bet',
    edge: 1.19,
    published: 1.04,
    note: 'The house pays for your doubles and your splits — free double on any hard 9, 10 or 11, free split on any pair but tens — and takes it all back with one line of small print: a dealer 22 pushes. Your blackjack still beats it.',
    rules: {
      ...DEFAULT_RULES,
      label: 'Free Bet',
      decks: 6,
      dealerHitsSoft17: true,
      dealerPush22: true,
      freeDouble: true,
      freeSplit: true,
      surrender: 'none',
    },
  },
  {
    id: 'spanish-21',
    edge: 1.28,
    published: 0.4,
    note: 'A 48-card deck with every ten pulled out, and a long list of gifts to pay for it: double on any number of cards, rescue a bad double, any 21 of yours always wins, and five, six and seven-card 21s pay a bonus.',
    rules: {
      ...DEFAULT_RULES,
      label: 'Spanish 21',
      decks: 6,
      removeTens: true,
      dealerHitsSoft17: true,
      player21Wins: true,
      spanishBonuses: true,
      doubleAnyCards: true,
      doubleRescue: true,
      resplitAces: true,
      hitSplitAces: true,
      surrender: 'late',
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
