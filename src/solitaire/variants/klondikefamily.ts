import type { Variant } from '../types'

// The rest of the Klondike diaspora — same seven-ish columns and ace-up foundations,
// each tweaking one knob: how the stock feeds (Easthaven deals a whole row across,
// the way Spider does), whether anything is hidden (Whitehead turns it all face up),
// which suits may stack (Thumb and Pouch: any but your own), what an empty column
// takes, and how many decks are in play.

const foundation = { direction: 'up', match: 'sameSuit', wrap: false } as const
const downAlt = { direction: 'down', match: 'alternateColour', wrap: false } as const

/** Easthaven: Klondike columns, but the stock deals a card onto every column at
 *  once — Spider's dealing hand grafted onto ordinary ace-up foundations. That
 *  crossing of wires is exactly why the record must say `discardRuns: false`. */
export const EASTHAVEN: Variant = {
  id: 'easthaven',
  label: 'Easthaven',
  family: 'Klondike',
  blurb: 'Klondike columns fed a full row at a time from the stock.',
  note: 'Seven columns of three, two down and one up, built down in alternating colour with sequences moving together. There is no waste: each turn of the stock deals one card onto every column at once, so you must fill any empty column before dealing. Foundations go up in suit from the ace.',
  decks: 1,
  tableau: { piles: 7, deal: 3, faceDown: 'allButLast' },
  foundations: { piles: 4, base: 'A', build: foundation, discardRuns: false },
  cells: 0,
  stock: { kind: 'tableau', draw: 7, redeals: 0 },
  build: downAlt,
  lift: 'sequence',
  empty: 'any',
  foundationToTableau: true,
  solvable: null,
  published: 'moderately hard; the row-deal forces the pace and buries progress',
}

/** Whitehead: everything face up, build down in colour, spaces take any card. */
export const WHITEHEAD: Variant = {
  id: 'whitehead',
  label: 'Whitehead',
  family: 'Klondike',
  blurb: 'Klondike, all face up, built down in colour.',
  note: 'A Klondike deal with nothing hidden. The tableau builds down in matching colour — red on red, black on black — and only a same-colour run counts as a movable sequence. Any card may fill an empty column, and the stock turns one at a time. The open board rewards planning over luck.',
  decks: 1,
  tableau: { piles: 7, deal: [1, 2, 3, 4, 5, 6, 7], faceDown: 'none' },
  foundations: { piles: 4, base: 'A', build: foundation },
  cells: 0,
  stock: { kind: 'waste', draw: 1, redeals: 0 },
  build: { direction: 'down', match: 'sameColour', wrap: false },
  lift: 'sequence',
  empty: 'any',
  foundationToTableau: true,
  solvable: null,
  published: 'friendlier than Klondike thanks to full information and free spaces',
}

/** Thumb and Pouch: build down in any suit but the card's own; spaces take any. */
export const THUMB_AND_POUCH: Variant = {
  id: 'thumb-and-pouch',
  label: 'Thumb and Pouch',
  family: 'Klondike',
  blurb: 'Klondike loosened: build down any suit but the same.',
  note: 'Klondike with a single, telling relaxation: a card may be built down onto any suit except its own, and an empty column will take any card. The near-free build makes it markedly kinder than straight Klondike while still turning three from the stock.',
  decks: 1,
  tableau: { piles: 7, deal: [1, 2, 3, 4, 5, 6, 7], faceDown: 'allButLast' },
  foundations: { piles: 4, base: 'A', build: foundation },
  cells: 0,
  stock: { kind: 'waste', draw: 3, redeals: -1 },
  build: { direction: 'down', match: 'differentSuit', wrap: false },
  lift: 'sequence',
  empty: 'any',
  foundationToTableau: true,
  solvable: null,
  published: 'easier than Klondike; only a same-suit stack is ever forbidden',
}

/** Westcliff (American): ten short columns, empty spaces take any card. */
export const WESTCLIFF: Variant = {
  id: 'westcliff',
  label: 'Westcliff',
  family: 'Klondike',
  blurb: 'Ten columns of three, any card to a space.',
  note: 'Klondike widened to ten columns of three — two down, one up — with foundations up in suit and the tableau down in alternating colour. Empty columns accept any card and the stock is turned once, singly. The shallow columns and free spaces make it a brisk, open game.',
  decks: 1,
  tableau: { piles: 10, deal: 3, faceDown: 'allButLast' },
  foundations: { piles: 4, base: 'A', build: foundation },
  cells: 0,
  stock: { kind: 'waste', draw: 1, redeals: 0 },
  build: downAlt,
  lift: 'sequence',
  empty: 'any',
  foundationToTableau: true,
  solvable: null,
  published: 'easier than Klondike; more columns and free spaces to work with',
}

/** Double Klondike (Gargantua): two decks, nine columns, eight foundations. */
export const DOUBLE_KLONDIKE: Variant = {
  id: 'double-klondike',
  label: 'Double Klondike',
  family: 'Klondike',
  blurb: 'Two-deck Klondike: nine columns, eight foundations.',
  note: 'Klondike doubled — two packs, nine columns dealt in the familiar triangle, and eight foundations to fill A to K in suit. Build down in alternating colour, move sequences, kings to empty columns; the stock turns one at a time with a single redeal. Also called Gargantua.',
  decks: 2,
  tableau: { piles: 9, deal: [1, 2, 3, 4, 5, 6, 7, 8, 9], faceDown: 'allButLast' },
  foundations: { piles: 8, base: 'A', build: foundation },
  cells: 0,
  stock: { kind: 'waste', draw: 1, redeals: 1 },
  build: downAlt,
  lift: 'sequence',
  empty: 'kingOnly',
  foundationToTableau: true,
  solvable: null,
  published: 'more forgiving than single Klondike — the second deck opens many more plays',
}
