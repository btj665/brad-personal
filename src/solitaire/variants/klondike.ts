import type { Variant } from '../types'

const build = { direction: 'down', match: 'alternateColour', wrap: false } as const
const foundation = { direction: 'up', match: 'sameSuit', wrap: false } as const

/** The one everyone means by "solitaire": seven columns, build down in alternate
 *  colours, turn the stock three at a time. */
export const KLONDIKE_3: Variant = {
  id: 'klondike-3',
  label: 'Klondike (draw 3)',
  family: 'Klondike',
  blurb: 'The default. Seven columns, draw three, unlimited redeals.',
  note: 'Build the tableau down in alternate colours, the foundations up by suit from the ace. The stock turns three cards at a time and may be run through as often as you like.',
  decks: 1,
  tableau: { piles: 7, deal: [1, 2, 3, 4, 5, 6, 7], faceDown: 'allButLast' },
  foundations: { piles: 4, base: 'A', build: foundation },
  cells: 0,
  stock: { kind: 'waste', draw: 3, redeals: -1 },
  build,
  lift: 'sequence',
  empty: 'kingOnly',
  foundationToTableau: true,
  solvable: null,
  published: 'about 79% of deals are winnable with perfect play; a draw-3 human wins far fewer',
}

/** Draw one, which is much kinder, and the version most people picture. */
export const KLONDIKE_1: Variant = {
  ...KLONDIKE_3,
  id: 'klondike-1',
  label: 'Klondike (draw 1)',
  blurb: 'Seven columns, draw one, unlimited redeals.',
  note: 'The gentle Klondike: the stock turns one card at a time, so every card in it is reachable.',
  stock: { kind: 'waste', draw: 1, redeals: -1 },
  published: 'the easiest common Klondike; a large majority of deals go out',
}

/** Turn three, one pass through the stock, no second chances. Solitaire as a
 *  Vegas bankroll: this is the shape the wager was built on. */
export const KLONDIKE_VEGAS: Variant = {
  ...KLONDIKE_3,
  id: 'klondike-vegas',
  label: 'Klondike (Vegas, 1 pass)',
  blurb: 'Draw three, a single pass through the stock.',
  note: 'One pass through the stock and no redeals — the cut-throat Klondike the casino version bets on, where most deals cannot be won at all.',
  stock: { kind: 'waste', draw: 3, redeals: 0 },
  published: 'a single pass makes most deals unwinnable',
}
