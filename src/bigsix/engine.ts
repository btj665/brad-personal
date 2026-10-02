// Big Six. Put chips on a symbol, the operator spins, the clapper drags to a
// stop. There is no decision to make after the bet, no card composition, no
// dealer — the state is chips on the layout and where the wheel stopped.

import { makeRng, randomSeed, type Rng } from '../engine/rng'
import { payout, type Symbol6, TOTAL_STOPS, WHEEL } from './wheel'

export type Phase = 'betting' | 'result'

export interface SpinResult {
  /** Index into `WHEEL`, which is what the spin animation needs. */
  index: number
  landed: Symbol6
  staked: number
  /** Stakes plus winnings handed back across every bet on the layout. */
  returned: number
  winners: Symbol6[]
}

export class BigSixGame {
  seed: number
  rng: Rng
  bankroll: number
  phase: Phase = 'betting'
  /** Chips on the layout, at most one entry per symbol. */
  bets = new Map<Symbol6, number>()
  chip: number
  lastResult: SpinResult | null = null
  /** Recent stops, newest first — the board the operator keeps. */
  history: Symbol6[] = []
  round = 0
  version = 0

  private listeners = new Set<() => void>()
  private lastBets: Map<Symbol6, number> | null = null

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
    for (const amount of this.bets.values()) n += amount
    return n
  }

  place(symbol: Symbol6): void {
    if (this.phase !== 'betting') return
    if (this.chip > this.bankroll - this.staked) return
    this.bets.set(symbol, (this.bets.get(symbol) ?? 0) + this.chip)
    this.touch()
  }

  removeBet(symbol: Symbol6): void {
    if (this.phase !== 'betting') return
    this.bets.delete(symbol)
    this.touch()
  }

  clearBets(): void {
    if (this.phase !== 'betting') return
    this.bets.clear()
    this.touch()
  }

  /** Re-place the exact bets from the last spin, if the bankroll covers them. */
  rebet(): void {
    if (this.phase !== 'betting' || !this.lastBets) return
    let total = 0
    for (const amount of this.lastBets.values()) total += amount
    if (total > this.bankroll) return
    this.bets = new Map(this.lastBets)
    this.touch()
  }

  canSpin(): boolean {
    return this.phase === 'betting' && this.bets.size > 0
  }

  /** Spin, settle every bet, and return where it stopped. */
  spin(): SpinResult {
    if (!this.canSpin()) return this.lastResult ?? { index: 0, landed: WHEEL[0], staked: 0, returned: 0, winners: [] }

    const index = this.rng.int(TOTAL_STOPS)
    const landed = WHEEL[index]

    const staked = this.staked
    this.bankroll -= staked

    let returned = 0
    const winners: Symbol6[] = []
    for (const [symbol, amount] of this.bets) {
      const back = payout(symbol, landed, amount)
      returned += back
      if (back > 0) winners.push(symbol)
    }
    this.bankroll += returned

    this.lastResult = { index, landed, staked, returned, winners }
    this.history = [landed, ...this.history].slice(0, 16)
    this.lastBets = new Map(this.bets)
    this.round++
    this.phase = 'result'
    this.touch()
    return this.lastResult
  }

  /** Clear the layout for the next spin. */
  next(): void {
    this.bets.clear()
    this.lastResult = null
    this.phase = 'betting'
    this.touch()
  }
}
