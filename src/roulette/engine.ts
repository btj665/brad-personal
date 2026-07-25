// Roulette. Place chips on the layout, spin, settle. The only state is the chips
// on the felt and the last number that came up.

import { makeRng, randomSeed, type Rng } from '../engine/rng'
import { type Bet, type Pocket, settleBet } from './bets'
import { pockets, type Variant } from './wheel'

export type Phase = 'betting' | 'spinning' | 'result'

export interface PlacedBet {
  bet: Bet
  amount: number
}

export interface SpinResult {
  pocket: Pocket
  /** Total returned across all bets (stake + winnings). */
  returned: number
  /** Total staked on the losing and winning bets. */
  staked: number
  winners: string[]
}

export class RouletteGame {
  variant: Variant
  seed: number
  rng: Rng
  bankroll: number
  phase: Phase = 'betting'
  /** Chips on the felt, keyed by bet key. */
  bets = new Map<string, PlacedBet>()
  lastResult: SpinResult | null = null
  /** The recent numbers, newest first — the "board" every casino displays. */
  history: Pocket[] = []
  chip: number
  round = 0
  version = 0

  private listeners = new Set<() => void>()

  constructor(opts: { variant?: Variant; seed?: number; bankroll?: number } = {}) {
    this.variant = opts.variant ?? 'european'
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

  setVariant(v: Variant): void {
    if (this.phase === 'spinning') return
    this.variant = v
    this.clearBets()
    this.touch()
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

  /** Drop the current chip value onto a bet. */
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
    if (this.phase === 'spinning') return
    this.bets.clear()
    this.touch()
  }

  /** Re-place the exact bets from the last spin, if the bankroll covers them. */
  rebet(): void {
    if (this.phase !== 'betting' || !this.lastBets) return
    let total = 0
    for (const b of this.lastBets.values()) total += b.amount
    if (total > this.bankroll) return
    this.bets = new Map(this.lastBets)
    this.touch()
  }

  private lastBets: Map<string, PlacedBet> | null = null

  canSpin(): boolean {
    return this.phase === 'betting' && this.bets.size > 0
  }

  /** Spin the wheel and settle every bet. Returns the winning pocket. */
  spin(): Pocket {
    if (!this.canSpin()) return this.lastResult?.pocket ?? 0
    const ring = pockets(this.variant)
    const pocket = ring[this.rng.int(ring.length)]

    // Take the stakes, then pay the winners.
    const staked = this.staked
    this.bankroll -= staked

    let returned = 0
    const winners: string[] = []
    for (const [key, { bet, amount }] of this.bets) {
      const back = settleBet(bet, pocket, this.variant, amount)
      returned += back
      if (back > amount) winners.push(key)
    }
    this.bankroll += returned

    this.lastResult = { pocket, returned, staked, winners }
    this.history = [pocket, ...this.history].slice(0, 18)
    this.lastBets = new Map(this.bets)
    this.round++
    this.phase = 'result'
    this.touch()
    return pocket
  }

  /** Clear the felt for the next round. */
  next(): void {
    this.bets.clear()
    this.lastResult = null
    this.phase = 'betting'
    this.touch()
  }
}
