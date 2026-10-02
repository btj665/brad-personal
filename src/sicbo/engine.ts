// Sic Bo. Chips go on the layout, the dice shake, everything settles at once.
// There is no decision after the bet and no state that carries between rounds,
// so the whole engine is: the chips on the felt, and the last three dice.

import { makeRng, randomSeed, type Rng } from '../engine/rng'
import { type Bet, type Face, type Roll, settleBet, totalOf } from './bets'

export type Phase = 'betting' | 'result'

export interface PlacedBet {
  bet: Bet
  amount: number
}

export interface ShakeResult {
  roll: Roll
  total: number
  /** Total returned across all bets (stake plus winnings). */
  returned: number
  /** Total staked, winners and losers together. */
  staked: number
  /** Keys of the spots that won, for highlighting the felt. */
  winners: string[]
}

export class SicBoGame {
  seed: number
  rng: Rng
  bankroll: number
  phase: Phase = 'betting'
  /** Chips on the felt, keyed by bet key. */
  bets = new Map<string, PlacedBet>()
  lastResult: ShakeResult | null = null
  /** Recent totals, newest first — the board every Sic Bo table displays. */
  history: Roll[] = []
  chip: number
  round = 0
  version = 0

  private listeners = new Set<() => void>()
  private lastBets: Map<string, PlacedBet> | null = null

  constructor(opts: { seed?: number; bankroll?: number } = {}) {
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bankroll = opts.bankroll ?? 500
    this.chip = 5
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getVersion = (): number => this.version
  private touch() {
    this.version++
    for (const fn of this.listeners) fn()
  }

  setChip(value: number): void {
    this.chip = value
    this.touch()
  }

  get staked(): number {
    let n = 0
    for (const { amount } of this.bets.values()) n += amount
    return n
  }

  /** Drop the current chip value onto a spot. */
  place(bet: Bet): void {
    if (this.phase !== 'betting') return
    if (this.chip > this.bankroll - this.staked) return
    const existing = this.bets.get(bet.key)
    this.bets.set(bet.key, { bet, amount: (existing?.amount ?? 0) + this.chip })
    this.touch()
  }

  removeBet(key: string): void {
    if (this.phase !== 'betting') return
    this.bets.delete(key)
    this.touch()
  }

  clearBets(): void {
    if (this.phase !== 'betting') return
    this.bets.clear()
    this.touch()
  }

  /** Re-place the exact bets from the last shake, if the bankroll covers them. */
  rebet(): void {
    if (this.phase !== 'betting' || !this.lastBets) return
    let total = 0
    for (const b of this.lastBets.values()) total += b.amount
    if (total > this.bankroll) return
    this.bets = new Map(this.lastBets)
    this.touch()
  }

  canShake(): boolean {
    return this.phase === 'betting' && this.bets.size > 0
  }

  private die(): Face {
    return (this.rng.int(6) + 1) as Face
  }

  /** Shake the three dice and settle every spot on the felt. */
  shake(): Roll {
    if (!this.canShake()) return this.lastResult?.roll ?? { a: 1, b: 1, c: 1 }
    const roll: Roll = { a: this.die(), b: this.die(), c: this.die() }

    // Take the stakes, then pay the winners.
    const staked = this.staked
    this.bankroll -= staked

    let returned = 0
    const winners: string[] = []
    for (const [key, { bet, amount }] of this.bets) {
      const back = settleBet(bet, roll, amount)
      returned += back
      if (back > 0) winners.push(key)
    }
    this.bankroll += returned

    this.lastResult = { roll, total: totalOf(roll), returned, staked, winners }
    this.history = [roll, ...this.history].slice(0, 14)
    this.lastBets = new Map(this.bets)
    this.round++
    this.phase = 'result'
    this.touch()
    return roll
  }

  /** Clear the felt for the next round. */
  next(): void {
    this.bets.clear()
    this.lastResult = null
    this.phase = 'betting'
    this.touch()
  }
}
