import type { Variant } from '../types'

// Spider builds *within* the tableau and discards a completed king-to-ace run to
// a "foundation". Two decks, ten columns. The number of suits in play is the
// whole difficulty knob: one suit is a puzzle, four is brutal.

const foundation = { direction: 'down', match: 'sameSuit', wrap: false } as const

const BASE: Omit<Variant, 'id' | 'label' | 'blurb' | 'note' | 'strip' | 'build' | 'published'> = {
  family: 'Spider',
  decks: 2,
  tableau: { piles: 10, deal: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], faceDown: 'allButLast' },
  // Eight discarded runs, one per suit-deck; modelled as eight foundations that
  // each hold a finished sequence.
  foundations: { piles: 8, base: 'K', build: foundation },
  cells: 0,
  stock: { kind: 'tableau', draw: 10, redeals: 0 },
  lift: 'sequence',
  empty: 'any',
  foundationToTableau: false,
  solvable: null,
}

/** One suit — everything a spade. The place to learn the game. */
export const SPIDER_1: Variant = {
  ...BASE,
  id: 'spider-1',
  label: 'Spider (1 suit)',
  blurb: 'Two decks of spades. The gentle Spider.',
  note: 'Ten columns, two decks, but every card is a spade — so a run may be built and lifted regardless of colour, and most deals can be won.',
  build: { direction: 'down', match: 'anySuit', wrap: false },
  published: 'the easiest Spider; a large majority winnable',
}

/** Two suits. */
export const SPIDER_2: Variant = {
  ...BASE,
  id: 'spider-2',
  label: 'Spider (2 suits)',
  blurb: 'Two suits. The usual middle ground.',
  note: 'Spades and hearts. A run only lifts as a unit when it is all one suit, so the two colours are constantly in each other’s way. The common tournament setting.',
  build: { direction: 'down', match: 'anySuit', wrap: false },
  published: 'roughly half of deals winnable with good play',
}

/** Four suits — the full-strength game. */
export const SPIDER_4: Variant = {
  ...BASE,
  id: 'spider-4',
  label: 'Spider (4 suits)',
  blurb: 'All four suits. The hard one.',
  note: 'The complete game: all four suits, so a liftable run must be a single suit in sequence. Even strong play wins a minority of deals.',
  build: { direction: 'down', match: 'anySuit', wrap: false },
  published: 'a hard game; well under half of deals winnable',
}

/** Spider's cousin: ten columns of one deck, build by suit. */
export const SPIDERETTE: Variant = {
  ...BASE,
  id: 'spiderette',
  label: 'Spiderette',
  blurb: 'One-deck Spider on a Klondike deal.',
  note: 'Spider shrunk to a single deck and seven columns dealt in the Klondike triangle. Same idea — build down and discard full suits — in a quarter of the space.',
  decks: 1,
  tableau: { piles: 7, deal: [1, 2, 3, 4, 5, 6, 7], faceDown: 'allButLast' },
  foundations: { piles: 4, base: 'K', build: foundation },
  stock: { kind: 'tableau', draw: 7, redeals: 0 },
  build: { direction: 'down', match: 'anySuit', wrap: false },
  published: 'comparable to 1-suit Spider',
}
