// A real poker room: a table of players, blinds, betting rounds, a pot that can
// split into side pots when people are all-in for different amounts, and a
// showdown. One engine plays every variant — Hold'em, Omaha, Seven-Card Stud,
// Five-Card Draw — because they differ only in how cards are dealt, which cards
// make a hand, and how betting is sized. Those differences are the `Variant`
// record; the engine holds no game-specific rules of its own.

import type { Card } from '../engine/types'

// ---------------------------------------------------------------- variant

/** How bets are sized on a street. */
export type Limit =
  /** No cap: bet anything from the minimum up to your whole stack. */
  | 'noLimit'
  /** A raise may be at most the size of the pot after the call. */
  | 'potLimit'
  /** Bets and raises come in fixed increments (small early, big late), and the
   *  number of raises per street is capped. */
  | 'fixedLimit'

/** Where the forced money comes from before the cards. */
export type Forced =
  /** Small blind and big blind, posted by the two seats left of the button. */
  | 'blinds'
  /** Everyone antes, and the lowest up-card brings it in (stud). */
  | 'anteBringIn'

/** One dealing step of a hand: give everyone cards, or reveal community cards. */
export interface DealStep {
  /** 'hole' deals private cards; 'up' deals a face-up card each (stud);
   *  'community' turns shared cards; 'draw' is the discard-and-replace round. */
  kind: 'hole' | 'up' | 'community' | 'draw'
  /** How many cards this step deals — per player for hole/up, total for
   *  community. `draw` ignores it. */
  count: number
}

/** A betting round happens after each deal step except the first hole deal in a
 *  blind game (where the blinds already opened it). The array of `DealStep`s and
 *  the streets between them fully describe a variant's shape. */
export interface Variant {
  id: string
  label: string
  blurb: string
  note: string
  /** Community-card, stud, and draw games form a hand differently. */
  family: 'holdem' | 'omaha' | 'stud' | 'draw'
  limit: Limit
  forced: Forced
  /** The deal, in order. Betting happens after each step (and preflop, after the
   *  first hole step, driven by the blinds). */
  deal: DealStep[]
  /** Omaha: a hand must use exactly this many hole cards (2). 0 means "any", the
   *  Hold'em / Stud / Draw rule of best five of all available. */
  holeCardsUsed: number
  /** fixedLimit: the small-bet increment; the big bet (used on later streets) is
   *  twice it. Ignored otherwise. */
  smallBetStreets?: number
  /** Cap on raises per betting round in fixed-limit (classically 4: bet + 3). */
  raiseCap?: number
}

// ---------------------------------------------------------------- table

export interface HeldCard {
  card: Card
  /** Stud shows some cards; everything else a player holds is private. */
  faceUp: boolean
}

export interface Seat {
  index: number
  name: string
  /** null for the human. */
  bot: BotProfile | null
  /** Chips in front of the player, not counting what's in the pot. */
  stack: number
  cards: HeldCard[]
  /** Discarded in a draw game — kept for the log, not in play. */
  discarded: Card[]
  folded: boolean
  allIn: boolean
  /** Sat out this hand (broke, or chose to). */
  sittingOut: boolean
  /** Chips this seat has put in the pot this hand, total across streets. Drives
   *  the side-pot split. */
  committed: number
  /** Chips put in on the current street, for matching the bet. */
  streetCommitted: number
  /** Has acted since the last raise on this street — used to know when the round
   *  is closed. */
  actedThisStreet: boolean
  /** Engine-internal: may this seat still raise? A full raise reopens it for
   *  everyone else; a short all-in does not, so a seat facing one can only call. */
  canReopen: boolean
  /** Set at showdown, for the reveal and the award. */
  showdown?: HandShow
}

/** A pot layer: an amount and the seats eligible to win it. The main pot plus
 *  however many side pots the all-ins produced. */
export interface Pot {
  amount: number
  eligible: number[]
}

export interface BotProfile {
  /** Looser plays more hands; tighter folds more. 0..1. */
  looseness: number
  /** Aggression: how often a decision to continue becomes a raise. 0..1. */
  aggression: number
  /** A little bluffing, so they aren't pure calling stations. 0..1. */
  bluff: number
  quips: string[]
}

// ---------------------------------------------------------------- actions

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn'

export interface Action {
  kind: ActionKind
  /** For bet/raise: the total this seat's street commitment becomes (a "raise to"
   *  amount, not an increment). The engine validates it against the limit. */
  to?: number
}

/** What the human is allowed to do right now, handed to the UI so it never has to
 *  know the betting rules. */
export interface Options {
  seat: number
  canFold: boolean
  canCheck: boolean
  /** The chips needed to call (0 when checking is free). */
  callAmount: number
  canBet: boolean
  canRaise: boolean
  /** For a bet/raise: the smallest and largest legal "to" amount. */
  minTo: number
  maxTo: number
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | string

export interface HandShow {
  /** The five cards that play, best hand out of everything available. */
  best: Card[]
  /** A short name like "Full house, kings full of tens". */
  name: string
}

// ---------------------------------------------------------------- beats

/** The engine advances one beat per `step()`, the same shape as the other
 *  tables here: it pauses only when it needs the human, otherwise it plays the
 *  bots and the deal out under its own clock. */
export type Beat =
  | { type: 'handStart'; hand: number; button: number }
  | { type: 'post'; seat: number; amount: number; blind: 'small' | 'big' | 'ante' | 'bringIn' }
  | { type: 'deal'; step: DealStep }
  | { type: 'action'; seat: number; action: Action; total: number }
  | { type: 'street'; street: Street }
  | { type: 'showdown' }
  | { type: 'award'; seat: number; amount: number; pot: number }
  | { type: 'handOver' }
  | { type: 'awaitAction'; options: Options }
  | { type: 'awaitDraw'; seat: number }
