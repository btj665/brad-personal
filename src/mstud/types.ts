// Mississippi Stud — types.
//
// The player antes, gets two hole cards, and three community cards go out face
// down. Three times — before each community card is turned — the player either
// folds or raises 1x, 2x or 3x the ante. There is no dealer hand: the final five
// cards are paid straight off the pay table.
//
// The one rule that shapes everything: the pay table is applied to the TOTAL
// amount wagered, ante plus every raise. A pair of aces after three 3x raises
// returns even money on ten units, not on one. That is why the ladder is worth
// climbing and why folding hurts — a fold forfeits every chip already out.

import type { Card } from '../engine/types'
import type { Score } from '../poker/eval'

export type Street = 'third' | 'fourth' | 'fifth'

export type Phase = 'bet' | Street | 'settled'

/** 2x is legal at the table but never correct — see the note in strategy.ts. */
export type MStudAction = 'fold' | 'raise1' | 'raise2' | 'raise3'

export type PayKey =
  | 'royal'
  | 'straightFlush'
  | 'quads'
  | 'fullHouse'
  | 'flush'
  | 'straight'
  | 'trips'
  | 'twoPair'
  | 'highPair'
  | 'midPair'

export interface PayRow {
  key: PayKey
  label: string
  /** Units won per unit wagered. Zero means the hand pushes. */
  pay: number
}

export interface MStudRules {
  label: string
  paytable: PayRow[]
  minBet: number
  maxBet: number
  chips: number[]
}

export interface MStudHand {
  ante: number
  /** Raises actually made, in chips, by street. A folded street has no entry. */
  raises: Partial<Record<Street, number>>
  /** Ante plus every raise: the base the pay table is applied to. */
  wagered: number
  hole: Card[]
  /** Always three cards, dealt face down and turned one at a time. */
  community: Card[]
  /** How many community cards are face up: 0, 1, 2 or 3. */
  revealed: number
  folded: boolean
  foldedOn: Street | null
  /** Filled at settlement. A folded hand is still scored, for the log. */
  score?: Score
  payKey?: PayKey | null
  /** Chips handed back: zero on a loss, `wagered` on a push. */
  returned?: number
  net?: number
}

export interface LogEntry {
  round: number
  text: string
}
