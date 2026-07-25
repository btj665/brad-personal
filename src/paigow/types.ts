// Pai Gow Poker — types.
//
// Seven cards are split into a five-card "high" hand and a two-card "low" hand,
// with the rule that the high hand must outrank the low. Both of the player's
// hands must beat both of the dealer's to win; split the two and it's a push;
// lose or tie both (ties go to the dealer) and it's a loss. Wins pay even money
// less a 5% commission. The dealer always banks here.

import type { Card } from '../engine/types'
import type { Score } from '../poker/eval'

export type Ratio = [number, number]

export interface PaiGowRules {
  label: string
  /** House commission on a winning bet, as a fraction. 0.05 is universal. */
  commission: number
  /** The Fortune side bet pay table, trips or better. */
  fortunePay: Record<string, Ratio>
  /** Fortune needs a minimum bet to be eligible for the envy bonus. */
  fortuneEnvyMin: number
  /** Envy bonus paid to other Fortune bettors when someone hits big. */
  fortuneEnvy: Record<string, number>
  minBet: number
  maxBet: number
  chips: number[]
}

export type Phase = 'betting' | 'deal' | 'setting' | 'reveal' | 'settled'

/** A seven-card hand split into five (high) and two (low). */
export interface Setting {
  high: Card[]
  low: Card[]
  highScore: Score
  lowScore: Score
}

export type PaiGowOutcome = 'win' | 'push' | 'lose' | 'foul'

export interface PaiGowHand {
  bet: number
  fortune: number
  cards: Card[]
  setting: Setting | null
  outcome?: PaiGowOutcome
  /** Chips returned at settlement. */
  returned?: number
  commissionPaid?: number
  fortuneReturned?: number
}

export interface PaiGowSeat {
  index: number
  name: string
  bot: boolean
  bankroll: number
  hand: PaiGowHand | null
  sittingOut: boolean
  baseUnits: number
  /** The human can arrange their own cards; a bot always uses the house way. */
  autoSet: boolean
}

export interface Dealer {
  cards: Card[]
  setting: Setting | null
  revealed: boolean
}
