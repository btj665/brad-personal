import type { Variant } from '../types'

const build = { direction: 'down', match: 'alternateColour', wrap: false } as const
const foundation = { direction: 'up', match: 'sameSuit', wrap: false } as const

/** Everything face up, four free cells, no stock. Almost every deal is winnable,
 *  which is why it is the thinking player's game rather than the gambler's. */
export const FREECELL: Variant = {
  id: 'freecell',
  label: 'FreeCell',
  family: 'FreeCell',
  blurb: 'All face up, four cells, nothing hidden.',
  note: 'Eight columns dealt face up, four free cells each holding one card. Nothing is hidden and there is no stock, so it is pure calculation — of the first 32,000 numbered deals, exactly one is unwinnable.',
  decks: 1,
  tableau: { piles: 8, deal: [7, 7, 7, 7, 6, 6, 6, 6], faceDown: 'none' },
  foundations: { piles: 4, base: 'A', build: foundation },
  cells: 4,
  stock: { kind: 'none', draw: 0, redeals: 0 },
  build,
  lift: 'freeCell',
  empty: 'any',
  foundationToTableau: false,
  solvable: null,
  published: '≈99.999% winnable — 1 of the first 32,000 Microsoft deals cannot be solved (#11982)',
}

/** FreeCell with only the empty-column power, no cells. Harder, and it shows how
 *  much of FreeCell's ease was the cells rather than the open board. */
export const BAKERS_GAME: Variant = {
  ...FREECELL,
  id: 'bakers-game',
  label: "Baker's Game",
  blurb: 'FreeCell, but build by suit.',
  note: "FreeCell's board and four cells, but the tableau builds down in suit rather than alternating colour. The tighter build rule makes a materially harder game.",
  build: { direction: 'down', match: 'sameSuit', wrap: false },
  published: 'harder than FreeCell; a substantial minority of deals are unwinnable',
}

/** Two free cells instead of four. */
export const FREECELL_2: Variant = {
  ...FREECELL,
  id: 'freecell-2',
  label: 'FreeCell (2 cells)',
  blurb: 'Two cells. Much harder.',
  note: 'The same game with two of the four cells taken away, which roughly halves how many cards you can shift at once and turns a near-certainty into a real contest.',
  cells: 2,
  published: 'far fewer deals winnable than standard FreeCell',
}
