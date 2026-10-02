// Baccarat (punto banco) — types.
//
// The only decision in the game is the bet. Once the cards are out, the tableau
// plays both hands, so nothing in here describes a player option: there isn't
// one. What the state machine buys us is the ceremony — one card per beat.

import type { Card } from '../engine/types'

export type Side = 'player' | 'banker'

export type Winner = Side | 'tie'

export type BetName = 'player' | 'banker' | 'tie' | 'playerPair' | 'bankerPair'

/** Payout expressed as a ratio, e.g. [8, 1] means "8 to 1". */
export type Ratio = [numerator: number, denominator: number]

/** Chips on each of the five spots. Every spot is always present, at zero. */
export type Wagers = Record<BetName, number>

export interface BaccaratRules {
  label: string
  decks: number
  /** Fraction of the shoe dealt before the cut card ends it. */
  penetration: number
  /** Skimmed off a winning Banker bet — never off the stake. 5% is universal,
   *  and it is the only thing standing between the Banker bet and a game the
   *  house would lose money on. */
  commission: number
  pays: Record<BetName, Ratio>
  minBet: number
  maxBet: number
  chips: number[]
}

/** One resolved coup, kept for the bead plate and the settlement readout. */
export interface RoundResult {
  round: number
  winner: Winner
  playerTotal: number
  bankerTotal: number
  playerPair: boolean
  bankerPair: boolean
  /** A two-card 8 or 9 on either side, which froze both hands where they stood. */
  natural: boolean
  wagers: Wagers
  /** Chips pushed back per spot: stake plus winnings, 0 on a loser. */
  returned: Wagers
  /** Change to the bankroll over the whole coup, all five spots together. */
  net: number
}

/** 'deal' runs out the first four cards, one per beat; 'peek' is the look for a
 *  natural; 'player' and 'banker' are the two tableau steps, which resolve
 *  themselves with no input from anybody. */
export type Phase = 'betting' | 'deal' | 'peek' | 'player' | 'banker' | 'settled'

export interface BaccaratHand {
  cards: Card[]
  total: number
  pair: boolean
}
