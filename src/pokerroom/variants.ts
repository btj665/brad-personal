// The variant catalogue. Each is data: the deal, how a hand is formed, how bets
// are sized. The engine plays them all — it holds no game-specific rules of its
// own, it just walks the `deal` and asks the ranker who won. Adding a game here
// is adding a row, not adding code.

import type { Variant } from './types'

export const HOLDEM: Variant = {
  id: 'holdem-nl',
  label: "No-Limit Hold'em",
  blurb: 'Two hole cards, five shared, bet anything.',
  note: 'The one everyone plays. Two private cards, a five-card board dealt flop-turn-river, and no cap on the bet — you can push your whole stack in at any point.',
  family: 'holdem',
  limit: 'noLimit',
  forced: 'blinds',
  deal: [
    { kind: 'hole', count: 2 },
    { kind: 'community', count: 3 },
    { kind: 'community', count: 1 },
    { kind: 'community', count: 1 },
  ],
  holeCardsUsed: 0,
}

export const LIMIT_HOLDEM: Variant = {
  id: 'holdem-limit',
  label: "Limit Hold'em",
  blurb: "Hold'em with fixed bets and a capped round.",
  note: "Hold'em with the brakes on. Bets and raises come in fixed steps — the small bet before and on the flop, double that on the turn and river — and a round is capped at a bet and three raises, so nobody can shove you off a hand with an all-in.",
  family: 'holdem',
  limit: 'fixedLimit',
  forced: 'blinds',
  deal: [
    { kind: 'hole', count: 2 },
    { kind: 'community', count: 3 },
    { kind: 'community', count: 1 },
    { kind: 'community', count: 1 },
  ],
  holeCardsUsed: 0,
  // Small bet preflop and on the flop, big bet on turn and river.
  smallBetStreets: 2,
  raiseCap: 4,
}

export const OMAHA_PL: Variant = {
  id: 'omaha-pl',
  label: 'Pot-Limit Omaha',
  blurb: 'Four hole cards, use exactly two, bet up to the pot.',
  note: "Four hole cards instead of two, and here's the catch everyone forgets: you must use exactly two of them, no more and no fewer, with three from the board. Four hearts on the table do you no good unless two of your own four are hearts too. The most you can bet is the size of the pot.",
  family: 'omaha',
  limit: 'potLimit',
  forced: 'blinds',
  deal: [
    { kind: 'hole', count: 4 },
    { kind: 'community', count: 3 },
    { kind: 'community', count: 1 },
    { kind: 'community', count: 1 },
  ],
  holeCardsUsed: 2,
}

export const OMAHA_LIMIT: Variant = {
  id: 'omaha-limit',
  label: 'Limit Omaha Hi',
  blurb: 'Omaha in fixed steps, not pot-sized swings.',
  note: "Pot-Limit Omaha's steadier cousin: the same four cards and the same use-exactly-two rule, but the bets come in fixed steps, so the pot grows in a straight line instead of exploding when someone bets the pot.",
  family: 'omaha',
  limit: 'fixedLimit',
  forced: 'blinds',
  deal: [
    { kind: 'hole', count: 4 },
    { kind: 'community', count: 3 },
    { kind: 'community', count: 1 },
    { kind: 'community', count: 1 },
  ],
  holeCardsUsed: 2,
  smallBetStreets: 2,
  raiseCap: 4,
}

export const SEVEN_STUD: Variant = {
  id: 'stud-7',
  label: 'Seven-Card Stud',
  blurb: 'Seven cards each, no board, best five win.',
  note: "No flop and no blinds. Everyone antes, then you're dealt seven cards of your own across five rounds — some face down, some face up for the table to read — and you make your best five out of them. The up-cards are the whole game: you're playing what you can see as much as what you hold.",
  family: 'stud',
  limit: 'fixedLimit',
  forced: 'anteBringIn',
  // Third street is two down and one up; a DealStep carries a single kind, so it
  // is dealt as one three-card step (see the report for the down/up caveat).
  // Fourth through sixth are single up-cards; seventh (the river) is face down.
  deal: [
    { kind: 'hole', count: 3 },
    { kind: 'up', count: 1 },
    { kind: 'up', count: 1 },
    { kind: 'up', count: 1 },
    { kind: 'hole', count: 1 },
  ],
  holeCardsUsed: 0,
  // Small bet on third and fourth street, big bet from fifth on.
  smallBetStreets: 2,
  raiseCap: 4,
}

export const FIVE_DRAW: Variant = {
  id: 'draw-5',
  label: 'Five-Card Draw',
  blurb: 'Five in the hand, swap what you like, bet twice.',
  note: "The kitchen-table classic. Five private cards, a round of betting, then you throw away what you don't want and draw replacements, and bet once more. Nothing is shared and nothing shows — it's all your hand and your read of the table.",
  family: 'draw',
  // Fixed-limit, the traditional casino form ("jacks or better"): a small bet
  // before the draw, a big bet after.
  limit: 'fixedLimit',
  forced: 'blinds',
  deal: [
    { kind: 'hole', count: 5 },
    { kind: 'draw', count: 0 },
  ],
  holeCardsUsed: 0,
  smallBetStreets: 1,
  raiseCap: 4,
}

/** Hold'em first — it's the game the room opens on. */
export const VARIANTS: Variant[] = [
  HOLDEM,
  LIMIT_HOLDEM,
  OMAHA_PL,
  OMAHA_LIMIT,
  SEVEN_STUD,
  FIVE_DRAW,
]

export function variantById(id: string): Variant {
  return VARIANTS.find((v) => v.id === id) ?? VARIANTS[0]
}
