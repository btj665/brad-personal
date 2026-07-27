// Solitaire, as data.
//
// There are several hundred named patience games and they are overwhelmingly the
// same machine with different settings: how many piles, what may sit on what,
// how many cards move at once, what an empty column accepts, and what the stock
// does. So a variant here is a *specification* rather than an implementation, and
// `game.ts` is the one engine that plays all of them. Adding a game is adding a
// record to `variants/`; it is not adding code.
//
// The games this cannot express are the ones whose goal isn't "build foundations
// from a tableau" at all — pairing games like Pyramid, the wholly positional ones
// like Montana, Accordion's collapsing row. Those are noted in `variants/` rather
// than bent into a shape that doesn't fit them.

import type { Card, Rank } from '../engine/types'

export type PileKind =
  /** The columns you actually play in. */
  | 'tableau'
  /** Where the game is won: usually ace to king in a suit. */
  | 'foundation'
  /** The undealt remainder. */
  | 'stock'
  /** What the stock turns up. */
  | 'waste'
  /** A FreeCell hole: holds exactly one card, any card. */
  | 'cell'
  /** A dealt-out heap you may take from but rarely add to. */
  | 'reserve'

export interface PileCard {
  card: Card
  faceUp: boolean
}

export interface Pile {
  id: string
  kind: PileKind
  /** Index within its kind, so `tableau-3` is the fourth column. */
  index: number
  cards: PileCard[]
}

// ---------------------------------------------------------------- building

/** What may be placed on what. Every tableau rule in the catalogue is one of
 *  these plus a direction. */
export type Match =
  /** Klondike: red on black, black on red. */
  | 'alternateColour'
  /** Spider, Baker's Game, Russian Solitaire. */
  | 'sameSuit'
  /** Spider's easy mode, Yukon: rank alone decides. */
  | 'anySuit'
  | 'sameColour'
  /** Nothing may be built here at all. */
  | 'none'

export interface Build {
  /** 'down' is king-on-queen; 'up' is the foundation direction. */
  direction: 'up' | 'down'
  match: Match
  /** Ace on king and king on ace. Rare, and off by default. */
  wrap: boolean
}

/** How many cards may be lifted as a unit.
 *
 *  `freeCell` is the formula every FreeCell-like game uses: with `f` free cells
 *  and `e` empty columns you may move `(f + 1) × 2^e` cards — which is not a rule
 *  of the game so much as a shorthand for how many single-card moves you could
 *  have made by hand. */
export type Lift =
  | 'one'
  | 'anyFaceUp'
  /** A run that is itself correctly built. */
  | 'sequence'
  | 'freeCell'

/** What an empty tableau column accepts. */
export type EmptyRule = 'any' | 'kingOnly' | 'none' | 'baseRank'

export type StockKind =
  | 'none'
  /** Turn cards to a waste pile. */
  | 'waste'
  /** Spider: deal one card straight onto every column. */
  | 'tableau'

export interface Variant {
  id: string
  label: string
  /** The family it belongs to, for grouping on screen. */
  family: string
  blurb: string
  /** How it plays, in a sentence or two. */
  note: string

  decks: 1 | 2
  /** Ranks removed before dealing, if any — some games play a short deck. */
  strip?: Rank[]

  tableau: {
    piles: number
    /** Cards dealt to each pile. A single number means every pile gets that
     *  many; an array gives each pile its own count. */
    deal: number | number[]
    /** How many of each pile's cards are face down. Klondike is "all but the
     *  last"; FreeCell is none. */
    faceDown: 'allButLast' | 'none' | number
  }

  foundations: {
    piles: number
    /** Ace-low games start at A; Spider discards down from K. Canfield-likes take
     *  whatever the deal turned up. */
    base: Rank | 'dealt'
    build: Build
  }

  cells: number

  reserve?: {
    piles: number
    /** Cards in each reserve pile. */
    cards: number
    faceUp: boolean
  }

  stock: {
    kind: StockKind
    /** Cards turned per click. */
    draw: number
    /** How many times the waste may be turned back. -1 is unlimited. */
    redeals: number
  }

  /** Tableau building. */
  build: Build
  lift: Lift
  empty: EmptyRule

  /** Foundations may be played back down into the tableau. Off in most games. */
  foundationToTableau: boolean

  /** Measured solvability, as a fraction, filled in by `npm run sol:solve`.
   *  Null where the solver can't reach a verdict often enough to be worth
   *  quoting. */
  solvable: number | null
  /** What the literature says, where it says anything. */
  published?: string
}

// ---------------------------------------------------------------- moves

export interface Move {
  from: string
  to: string
  /** How many cards off the top of `from`. */
  count: number
}

/** Turning the stock is a move too, so undo can walk back through it. */
export type Action = Move | { from: 'stock'; to: 'waste'; count: number } | { from: 'redeal'; to: 'stock'; count: 0 }

export interface Deal {
  variant: Variant
  seed: number
  piles: Pile[]
}
