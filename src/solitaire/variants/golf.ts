import type { Variant } from '../types'

// Golf and Black Hole aren't "build four foundations from a tableau" games at all —
// they build ONE pile, up or down a rank at a time regardless of suit, and you win
// by clearing the tableau onto it. That single bidirectional pile is the reason the
// engine grew a `direction: 'either'` foundation and a stock that turns straight
// onto it. (The pairing kind of Golf — matching two cards to thirteen — is a
// different machine and is left out; see the note in index.ts.)
//
// Modelling the play pile as a foundation makes the win condition fall out for free:
// once the tableau is empty every remaining stock card can be dumped onto the pile,
// so "everything is home" and "the tableau is clear" are the same finish line.

const golfFoundation = { direction: 'either', match: 'anySuit', wrap: false } as const

/** Standard Golf: seven columns of five, one card up to start the pile, sixteen in
 *  the stock. No wrap, so a king is a dead end going up and an ace going down. */
export const GOLF: Variant = {
  id: 'golf',
  label: 'Golf',
  family: 'Golf',
  blurb: 'One pile, built up or down by rank. Clear the columns.',
  note: 'Seven columns of five cards, all face up. Play the exposed card of any column onto the single pile whenever it is one rank above or below the top card, suit ignored; when nothing goes, turn a card from the stock straight onto the pile. King does not meet ace, so the sequence can dead-end. Win by emptying every column.',
  decks: 1,
  tableau: { piles: 7, deal: 5, faceDown: 'none' },
  foundations: { piles: 1, base: 'dealt', build: golfFoundation },
  cells: 0,
  // A one-card "reserve" exists only to hand its card to the pile as the base; it
  // is empty for the rest of the game.
  reserve: { piles: 1, cards: 1, faceUp: true },
  stock: { kind: 'foundation', draw: 1, redeals: 0 },
  build: { direction: 'down', match: 'none', wrap: false },
  lift: 'one',
  empty: 'none',
  foundationToTableau: false,
  solvable: null,
  published: 'roughly a third to a half of deals are clearable; the stock size is the whole difficulty',
}

/** Wrapping Golf (a.k.a. "around the corner"): king meets ace, so a run can loop.
 *  Distinctly easier. */
export const GOLF_WRAP: Variant = {
  ...GOLF,
  id: 'golf-wrap',
  label: 'Golf (wrapping)',
  blurb: 'Golf where king and ace connect, so the pile never dead-ends.',
  note: 'Golf with one mercy: the sequence turns the corner, so a king accepts an ace and an ace a king. The pile can never dead-end on rank alone, which lifts the win rate well above the standard game.',
  foundations: { piles: 1, base: 'dealt', build: { direction: 'either', match: 'anySuit', wrap: true } },
  published: 'noticeably easier than plain Golf — the wrap removes most dead ends',
}

/** Black Hole (David Parlett, 1987): seventeen fans of three around a central hole
 *  seeded with a card, no stock, wrap on. A pure open-information puzzle. */
export const BLACK_HOLE: Variant = {
  id: 'black-hole',
  label: 'Black Hole',
  family: 'Black Hole',
  blurb: 'Seventeen fans, one central pile, everything visible.',
  note: 'The whole pack is dealt to seventeen fans of three, with one card started in the hole at the centre. Play any exposed fan card into the hole when it is one rank above or below the current card, suit ignored and king meeting ace. There is no stock and nothing hidden, so it is pure calculation — get every card into the hole.',
  decks: 1,
  tableau: { piles: 17, deal: 3, faceDown: 'none' },
  foundations: { piles: 1, base: 'dealt', build: { direction: 'either', match: 'anySuit', wrap: true } },
  cells: 0,
  reserve: { piles: 1, cards: 1, faceUp: true },
  stock: { kind: 'none', draw: 0, redeals: 0 },
  build: { direction: 'down', match: 'none', wrap: false },
  lift: 'one',
  empty: 'none',
  foundationToTableau: false,
  solvable: null,
  published: 'about 87% of deals are solvable with perfect play, though far fewer by eye',
}
