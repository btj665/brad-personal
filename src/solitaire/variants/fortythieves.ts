import type { Variant } from '../types'

// Forty Thieves (Napoleon at St Helena) is the two-deck grind: ten columns, build
// down in suit, one card at a time, everything face up in front of you and still
// almost unwinnable. The family is a ladder of mercies bolted onto that frame —
// move whole sequences, build by colour instead of suit, allow a redeal — each of
// which loosens the vice a notch.

const foundation = { direction: 'up', match: 'sameSuit', wrap: false } as const
const downSuit = { direction: 'down', match: 'sameSuit', wrap: false } as const
const downAlt = { direction: 'down', match: 'alternateColour', wrap: false } as const

export const FORTY_THIEVES: Variant = {
  id: 'forty-thieves',
  label: 'Forty Thieves',
  family: 'Forty Thieves',
  blurb: 'Two decks, ten columns, build down in suit, one card at a time.',
  note: 'Ten columns of four cards, all face up, and eight foundations to fill A to K in suit. The tableau builds down in suit and moves strictly one card at a time; the stock turns singly with no redeal. Reputedly the game Napoleon played in exile, and about as winnable as his second act.',
  decks: 2,
  tableau: { piles: 10, deal: 4, faceDown: 'none' },
  foundations: { piles: 8, base: 'A', build: foundation },
  cells: 0,
  stock: { kind: 'waste', draw: 1, redeals: 0 },
  build: downSuit,
  lift: 'one',
  empty: 'any',
  foundationToTableau: true,
  solvable: null,
  published: 'generally considered hard — only around a tenth of deals fall to good play',
}

/** Josephine: Forty Thieves that lets you move a built sequence as a unit. */
export const JOSEPHINE: Variant = {
  ...FORTY_THIEVES,
  id: 'josephine',
  label: 'Josephine',
  blurb: 'Forty Thieves, but built sequences move together.',
  note: 'Forty Thieves with the single-card shackle struck off: any properly built descending suit run may be lifted and moved as one. That single change turns the hardest of the family into one of its most tractable.',
  lift: 'sequence',
  published: 'much easier than Forty Thieves — moving runs opens the board up',
}

/** Streets (a.k.a. Rouge et Noir's tableau): build by alternating colour. */
export const STREETS: Variant = {
  ...FORTY_THIEVES,
  id: 'streets',
  label: 'Streets',
  blurb: 'Forty Thieves built down in alternating colour.',
  note: 'Forty Thieves with the tableau built down in alternating colour instead of suit, which frees up far more legal plays even though cards still move one at a time. Foundations still go up in suit from the ace.',
  build: downAlt,
  published: 'easier than Forty Thieves; the colour build is far less restrictive',
}

/** Limited: twelve columns of three, and sequences move. */
export const LIMITED: Variant = {
  ...FORTY_THIEVES,
  id: 'limited',
  label: 'Limited',
  blurb: 'Twelve short columns, suit build, sequences move.',
  note: 'Forty Thieves spread wider and shallower — twelve columns of three — and loosened to let built suit-runs travel as a unit. More columns mean more places to work, so it plays a good deal more openly than the parent.',
  tableau: { piles: 12, deal: 3, faceDown: 'none' },
  lift: 'sequence',
  published: 'the extra columns and run moves make it friendlier than Forty Thieves',
}

/** Forty and Eight: eight columns of five, and one redeal is allowed. */
export const FORTY_AND_EIGHT: Variant = {
  ...FORTY_THIEVES,
  id: 'forty-and-eight',
  label: 'Forty and Eight',
  blurb: 'Eight columns of five with a single redeal.',
  note: 'Forty Thieves rearranged into eight columns of five, with the one concession of a single redeal through the stock. Still a suit build moving one card at a time, so the redeal is the whole margin between winning and not.',
  tableau: { piles: 8, deal: 5, faceDown: 'none' },
  stock: { kind: 'waste', draw: 1, redeals: 1 },
  published: 'the lone redeal lifts it a little above Forty Thieves',
}

/** Number Ten: first two rows dealt face down, colour build, sequences move. */
export const NUMBER_TEN: Variant = {
  ...FORTY_THIEVES,
  id: 'number-ten',
  label: 'Number Ten',
  blurb: 'Forty Thieves with two buried rows but a colour build.',
  note: 'Ten columns of four whose bottom two cards start face down, offset by a generous ruleset: build down in alternating colour and move whole sequences. The hidden cards give it back the uncertainty the loose build takes away.',
  tableau: { piles: 10, deal: 4, faceDown: 2 },
  build: downAlt,
  lift: 'sequence',
  published: 'roughly mid-difficulty for the family',
}

/** Australian Patience: a one-deck cousin — Yukon's shape, Forty Thieves' rules. */
export const AUSTRALIAN: Variant = {
  id: 'australian',
  label: 'Australian Patience',
  family: 'Forty Thieves',
  blurb: 'One-deck Forty Thieves: seven columns, suit build.',
  note: 'A single-deck relative — seven columns of four dealt face up, foundations up in suit, tableau down in suit moving one card at a time, and a single pass through the stock. Empty columns take only a king, which is the pinch that keeps it honest.',
  decks: 1,
  tableau: { piles: 7, deal: 4, faceDown: 'none' },
  foundations: { piles: 4, base: 'A', build: foundation },
  cells: 0,
  stock: { kind: 'waste', draw: 1, redeals: 0 },
  build: downSuit,
  lift: 'one',
  empty: 'kingOnly',
  foundationToTableau: true,
  solvable: null,
  published: 'a hard single-decker; the one-pass stock and suit build bite',
}
