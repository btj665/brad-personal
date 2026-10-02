import type { Variant } from '../types'

// Scorpion and Wasp are Spider's temperament with Yukon's hands. You build DOWN in
// suit inside the tableau and win by assembling four king-to-ace suit runs, exactly
// like Spider — but a move is a Yukon move: pick up any face-up card and the heap on
// top of it, ordered or not, and drop it on the next rank up in suit. The three
// leftover cards form a tiny stock that deals across the first columns when you jam.
//
// The completed runs are modelled as Spider-style foundations that swallow a whole
// finished suit, which is how "four runs built in place" becomes a win condition the
// engine can see.

const foundation = { direction: 'down', match: 'sameSuit', wrap: false } as const

const BASE: Omit<Variant, 'id' | 'label' | 'blurb' | 'note' | 'empty' | 'published'> = {
  family: 'Scorpion',
  decks: 1,
  // First four columns carry three buried cards each; the last three are open.
  tableau: { piles: 7, deal: 7, faceDown: [3, 3, 3, 3, 0, 0, 0] },
  foundations: { piles: 4, base: 'K', build: foundation },
  cells: 0,
  stock: { kind: 'tableau', draw: 3, redeals: 0 },
  build: foundation,
  lift: 'anyFaceUp',
  foundationToTableau: false,
  solvable: null,
}

export const SCORPION: Variant = {
  ...BASE,
  id: 'scorpion',
  label: 'Scorpion',
  blurb: 'Spider build, Yukon lift, a three-card sting in the stock.',
  note: 'Seven columns of seven, the first four with three buried cards. Build down in suit within the tableau, but lift any face-up card with everything piled on it, ordered or not. When stuck, deal the last three cards one apiece onto the first three columns. Win by forming four king-to-ace suits. Only a king may fill an empty column.',
  empty: 'kingOnly',
  published: 'generally winnable with care — the free lift rescues most tangles',
}

/** Wasp: Scorpion with the empty-column rule relaxed to any card. */
export const WASP: Variant = {
  ...BASE,
  id: 'wasp',
  label: 'Wasp',
  blurb: 'Scorpion where any card may fill a space.',
  note: 'Scorpion in every detail but one: an empty column will take any card, not just a king. That single freedom — somewhere to park an awkward card or run — makes Wasp the more forgiving of the pair.',
  empty: 'any',
  published: 'easier than Scorpion; a free space for any card unknots most deals',
}
