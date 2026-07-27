import type { Variant } from '../types'

// Yukon is Klondike with the training wheels off and the stock thrown away. Every
// one of the 52 cards is on the tableau, most of them face up, and — this is the
// whole game — you may pick up ANY face-up card together with the jumble sitting on
// top of it and drop the lot onto a legal card, sequence be damned. The buried
// block deepens one card per column, which is why the deal needs a per-column
// face-down count the uniform rule can't give.

const foundation = { direction: 'up', match: 'sameSuit', wrap: false } as const

const BASE: Omit<Variant, 'id' | 'label' | 'blurb' | 'note' | 'build' | 'published'> = {
  family: 'Yukon',
  decks: 1,
  tableau: { piles: 7, deal: [1, 6, 7, 8, 9, 10, 11], faceDown: [0, 1, 2, 3, 4, 5, 6] },
  foundations: { piles: 4, base: 'A', build: foundation },
  cells: 0,
  stock: { kind: 'none', draw: 0, redeals: 0 },
  lift: 'anyFaceUp',
  empty: 'kingOnly',
  foundationToTableau: false,
  solvable: null,
}

/** The classic: build down in alternating colour, move any face-up pile. */
export const YUKON: Variant = {
  ...BASE,
  id: 'yukon',
  label: 'Yukon',
  blurb: 'All face up, no stock, lift any pile you can reach.',
  note: 'Seven columns, everything dealt out and almost all of it face up. Build the tableau down in alternating colour and the foundations up in suit — but you may lift any face-up card with whatever sits on top of it, so a buried card is never truly stuck. Empty columns take a king.',
  build: { direction: 'down', match: 'alternateColour', wrap: false },
  published: 'a large majority of deals are winnable; the free lift makes it forgiving',
}

/** Russian Solitaire: Yukon's board, but the build is by suit. Brutal. */
export const RUSSIAN: Variant = {
  ...BASE,
  id: 'russian',
  label: 'Russian Solitaire',
  blurb: 'Yukon built strictly in suit. Notoriously hard.',
  note: 'Yukon in every respect except the one that matters: the tableau builds down in suit, not colour. The same free lift is still yours, but suit-locking every sequence makes this one of the hardest games in the catalogue.',
  build: { direction: 'down', match: 'sameSuit', wrap: false },
  published: 'generally considered very hard — far fewer deals fall than Yukon',
}

/** Alaska: Russian's suit build, but a run may be extended up OR down. */
export const ALASKA: Variant = {
  ...BASE,
  id: 'alaska',
  label: 'Alaska',
  blurb: 'Russian Solitaire, but build up or down in suit.',
  note: 'A Russian variant where a suit sequence may grow in either direction — you can lay a card on the rank above or below its neighbour, so long as the suit matches. The two-way build buys back some of the slack the suit rule takes away.',
  build: { direction: 'either', match: 'sameSuit', wrap: false },
  published: 'a shade kinder than Russian Solitaire but still a hard game',
}
