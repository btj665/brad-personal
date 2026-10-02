// Ultimate Texas Hold'em — types.
//
// The player posts an Ante and an equal Blind, plus an optional Trips side bet.
// Then they get one chance to raise 4x (before any community cards), a second
// chance to raise 2x (after the flop), and a last chance to raise 1x or fold
// (after the river). The dealer needs a pair or better to "open"; if they don't,
// the Ante pushes. The Blind pays a bonus schedule on a straight or better.

import type { Card } from '../engine/types'
import type { Score } from '../poker/eval'

export type Ratio = [number, number]

export interface PayRow {
  /** A poker category, named for the pay tables. */
  hand: string
  pay: Ratio
}

export interface UthRules {
  label: string
  /** Blind bonus: what a winning Blind pays for each hand rank, straight+. */
  blindPay: Record<string, Ratio>
  /** Trips side bet pay table, trips or better. */
  tripsPay: Record<string, Ratio>
  minBet: number
  maxBet: number
  chips: number[]
}

export type Street = 'preflop' | 'flop' | 'river'

/** The player's decision at each street. Raise sizes are multiples of the ante:
 *  4x preflop, 2x after the flop, 1x after the river, or fold at the river. */
export type UthAction = 'check' | 'bet4' | 'bet2' | 'bet1' | 'fold'

export type Phase =
  | 'betting'
  | 'deal'
  | 'preflop'
  | 'flop'
  | 'river'
  | 'showdown'
  | 'settled'

export interface UthHand {
  ante: number
  blind: number
  trips: number
  /** The play bet, once made: 4x, 2x or 1x the ante. Zero until then. */
  play: number
  cards: Card[]
  folded: boolean
  /** The last street this seat acted on. A check commits nothing, so without
   *  this the engine would keep asking the same seat to check forever. */
  actedStreet: Street | null
  /** Filled at showdown. */
  score?: Score
  result?: UthOutcome
  /** Chips returned at settlement, per line. */
  payout?: UthPayout
}

export interface UthPayout {
  ante: number
  blind: number
  play: number
  trips: number
  /** Net change to the bankroll for the whole hand, for display. */
  net: number
}

export type UthOutcome = 'win' | 'lose' | 'push' | 'fold'

export interface UthSeat {
  index: number
  name: string
  bot: boolean
  bankroll: number
  hand: UthHand | null
  sittingOut: boolean
  /** The bet the seat wants to make each round, in ante units of the minimum. */
  baseUnits: number
}

export interface Dealer {
  cards: Card[]
  /** Whether the dealer's hole cards are face up yet. */
  revealed: boolean
  score?: Score
  /** A pair or better: the dealer "opens" and the ante plays. */
  qualifies?: boolean
}
