// Every type in the game. No React, no DOM.

export type Suit = 'S' | 'H' | 'D' | 'C'

export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

/** A physical card in the shoe. `uid` is unique across the whole shoe, so an
 *  8-deck game has eight distinct A♠ cards that React can key on.
 *
 *  `joker` marks the single wild card in a Pai Gow deck. Blackjack never deals
 *  one; its `rank`/`suit` are placeholders the poker evaluator ignores. */
export interface Card {
  uid: number
  rank: Rank
  suit: Suit
  joker?: boolean
}

// ---------------------------------------------------------------- rules

export type DoubleRule =
  | 'any'          // double on any two cards
  | 'nine-eleven'  // double on hard 9, 10, 11 only
  | 'ten-eleven'   // double on hard 10, 11 only
  | 'none'

export type SurrenderRule =
  | 'none'
  | 'late'   // only after the dealer has checked for blackjack
  | 'early'  // before the dealer checks — a big player-favourable rule

/** Payout expressed as a ratio, e.g. [3, 2] means "3 to 2". */
export type Ratio = [numerator: number, denominator: number]

export interface RuleSet {
  label: string

  // --- the shoe
  decks: number
  /** Fraction of the shoe dealt before the cut card comes out. 0.75 = 75%. */
  penetration: number
  /** Burn one card after each shuffle, as most casinos do. */
  burnCard: boolean
  /** Continuous shuffling machine: the shoe is reshuffled every round. */
  csm: boolean

  // --- the dealer
  /** H17 (true) vs S17 (false). H17 costs the player about 0.2%. */
  dealerHitsSoft17: boolean
  /** US hole-card game (true) vs European no-hole-card (false). */
  dealerPeek: boolean
  /** ENHC only: on a dealer blackjack the player loses the original bet only —
   *  split and double wagers are returned. This is the European standard. */
  originalBetsOnly: boolean
  /** Free-Bet style: a dealer total of 22 pushes against any live player hand. */
  dealerPush22: boolean

  // --- the payoffs
  blackjackPayout: Ratio
  insurancePayout: Ratio

  // --- player options
  double: DoubleRule
  doubleAfterSplit: boolean
  doubleOnSplitAces: boolean

  /** Total hands one seat may end up with. 4 is the casino norm; 1 = no split. */
  maxSplitHands: number
  resplitAces: boolean
  /** If false, split aces receive exactly one card each and stand. */
  hitSplitAces: boolean
  /** Allow splitting K-Q and other unlike ten-value pairs. */
  splitUnlikeTens: boolean

  surrender: SurrenderRule
  surrenderAfterSplit: boolean

  insurance: boolean
  /** Offer a blackjack holder even money against a dealer ace. */
  evenMoney: boolean

  /** N-card Charlie: a hand of N cards that hasn't busted wins immediately.
   *  null disables it. Casino norm is null (or 7 in a few places). */
  charlie: number | null

  // --- the table
  minBet: number
  maxBet: number
  chips: number[]
}

// ---------------------------------------------------------------- hands

export type Action = 'hit' | 'stand' | 'double' | 'split' | 'surrender'

export type Outcome =
  | 'blackjack'
  | 'win'
  | 'push'
  | 'lose'
  | 'bust'
  | 'surrender'
  | 'charlie'

export interface Hand {
  id: string
  cards: Card[]
  /** Chips currently at risk on this hand (doubled hands hold twice the base). */
  bet: number
  doubled: boolean
  /** True for every hand produced by a split, including the original half. */
  fromSplit: boolean
  /** True if this hand descends from a split of aces (one-card rule). */
  splitAces: boolean
  stood: boolean
  surrendered: boolean
  outcome?: Outcome
  /** Chips returned to the player at settlement: 0 on a loss, 2x bet on a win. */
  returned?: number
}

export interface Seat {
  index: number
  name: string
  /** null for the human. */
  bot: BotProfile | null
  bankroll: number
  /** The bet the player pushed out this round, before any double or split. */
  baseBet: number
  hands: Hand[]
  insurance: number
  insuranceReturned?: number
  tookEvenMoney: boolean
  /** Per-round: this seat has already answered the insurance / early-surrender
   *  offer, so the engine doesn't ask twice. */
  insuranceDecided: boolean
  earlySurrenderDecided: boolean
  /** A seat sits out a round rather than betting. */
  sittingOut: boolean
  /** Set when a player walks away broke. */
  busted: boolean
}

// ---------------------------------------------------------------- bots

export type BotStyle = 'basic' | 'counter' | 'cautious' | 'aggressive'

export interface BotProfile {
  style: BotStyle
  /** Flat wager as a multiple of the table minimum. */
  betUnits: number
  /** Counters raise this much at a high true count. */
  maxSpread: number
  /** How the bot talks about its own hands, for table chatter. */
  quips: string[]
}

// ---------------------------------------------------------------- table

export type Phase =
  | 'betting'
  | 'dealing'
  | 'insurance'
  | 'earlySurrender'
  | 'playing'
  | 'dealer'
  | 'settled'

export interface Dealer {
  cards: Card[]
  holeRevealed: boolean
}

/** Where the engine wants a decision from, or null when nobody is on the clock. */
export interface Turn {
  seat: number
  hand: number
}
