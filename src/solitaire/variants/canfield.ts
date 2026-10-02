import type { Variant } from '../types'

// Richard Canfield's casino game (1890s): you bought a $50 deck and were paid $5
// a card sent home, so the house barely had to cheat — most deals simply can't be
// won. Its signatures are the thirteen-card reserve pressing on you the whole game
// and foundations that start not at the ace but at whatever rank the deal turned
// up, then climb round the corner through the king back to the card below the base.
//
// The reserve is dealt fourteen deep on purpose: the engine lifts its top card to
// found the first foundation, which leaves the classic squared thirteen — the same
// physical result as dealing thirteen and turning a separate base card.

const build = { direction: 'down', match: 'alternateColour', wrap: true } as const
const foundation = { direction: 'up', match: 'sameSuit', wrap: true } as const

export const CANFIELD: Variant = {
  id: 'canfield',
  label: 'Canfield',
  family: 'Canfield',
  blurb: 'The demon: a 13-card reserve, foundations from a dealt rank.',
  note: 'Four columns of one card, a thirteen-card reserve you feed from, and four foundations that begin at the rank the first turned-up card sets — build them up in suit, turning the corner from king to ace. The tableau builds down in alternating colour and also wraps. Turn the stock three at a time, as often as you like.',
  decks: 1,
  tableau: { piles: 4, deal: 1, faceDown: 'none' },
  foundations: { piles: 4, base: 'dealt', build: foundation },
  cells: 0,
  reserve: { piles: 1, cards: 14, faceUp: true },
  stock: { kind: 'waste', draw: 3, redeals: -1 },
  build,
  lift: 'sequence',
  empty: 'any',
  foundationToTableau: true,
  solvable: null,
  published: 'generally reckoned a low-odds game — well under half of deals go out even with care',
}

/** Draw one instead of three, which turns the whole stock reachable. */
export const CANFIELD_1: Variant = {
  ...CANFIELD,
  id: 'canfield-1',
  label: 'Canfield (draw 1)',
  blurb: 'Canfield with the stock turned one at a time.',
  note: 'The same demon, but the stock turns a single card, so every card in it can be reached — the kindest way to meet the game before the draw-three version takes your money.',
  stock: { kind: 'waste', draw: 1, redeals: -1 },
  published: 'materially easier than draw-three Canfield',
}

/** "Rainbow": drop the colour rule, build down by any suit. */
export const RAINBOW: Variant = {
  ...CANFIELD,
  id: 'rainbow',
  label: 'Rainbow',
  blurb: 'Canfield, but the tableau builds down regardless of suit.',
  note: 'A gentler Canfield in which the tableau ignores colour entirely — any card may sit on the next rank up — and the stock turns one at a time. The loosened build rule is what earns it the easy name.',
  build: { direction: 'down', match: 'anySuit', wrap: true },
  stock: { kind: 'waste', draw: 1, redeals: -1 },
  published: 'one of the easier Canfields thanks to the free tableau build',
}

/** Storehouse (a.k.a. Thirteen, Provisions): the four twos are the bases and the
 *  tableau builds down in suit. Foundations start at 2 by definition rather than
 *  from the deal, so this one keeps a full thirteen-card reserve. */
export const STOREHOUSE: Variant = {
  ...CANFIELD,
  id: 'storehouse',
  label: 'Storehouse',
  blurb: 'Canfield with the twos as bases and a suit build.',
  note: 'Canfield fixed to start every foundation at a two and climb in suit up to the ace, while the tableau builds down strictly in suit. The rigid same-suit tableau makes it a tighter, more deliberate game than the parent.',
  foundations: { piles: 4, base: '2', build: { direction: 'up', match: 'sameSuit', wrap: true } },
  reserve: { piles: 1, cards: 13, faceUp: true },
  build: { direction: 'down', match: 'sameSuit', wrap: true },
  stock: { kind: 'waste', draw: 3, redeals: 2 },
  published: 'harder than Canfield proper; the suit build strangles the tableau',
}

/** Chameleon: three columns, a twelve-card reserve, one card at a time, any suit.
 *  A stripped-down Canfield that plays fast and a little easier. */
export const CHAMELEON: Variant = {
  ...CANFIELD,
  id: 'chameleon',
  label: 'Chameleon',
  blurb: 'A three-column Canfield, build down any suit.',
  note: 'A compact Canfield: three tableau columns and a twelve-card reserve, the tableau building down regardless of suit and moving one card at a time. A single pass through a draw-one stock is all you get.',
  tableau: { piles: 3, deal: 1, faceDown: 'none' },
  reserve: { piles: 1, cards: 13, faceUp: true },
  build: { direction: 'down', match: 'anySuit', wrap: true },
  lift: 'one',
  stock: { kind: 'waste', draw: 1, redeals: 0 },
  published: 'a brisk, fairly forgiving Canfield relative',
}
