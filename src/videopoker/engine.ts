// Video poker — a single player against a pay table. Deal five, hold any, draw,
// get paid. No table, no dealer, no other seats; the whole game is the math in
// classify.ts and solver.ts.

import { buildShoeCards } from '../engine/cards'
import { makeRng, randomSeed, type Rng } from '../engine/rng'
import type { Card } from '../engine/types'
import { winningHold } from './autohold'
import { classify, type PayCategory } from './classify'
import { payFor, variantById, type Variant } from './paytables'
import { optimalHold } from './solver'

export type Phase = 'bet' | 'dealt' | 'complete'

/** 'winners' pre-holds the cards of a dealt paying hand; 'optimal' pre-holds
 *  the solver's best play. Either way the player can still change the holds
 *  before drawing. */
export type AutoHoldMode = 'off' | 'winners' | 'optimal'

export interface VpHand {
  cards: Card[]
  held: boolean[]
  final: Card[] | null
  category: PayCategory | null
  bet: number
  won: number
}

export class VideoPokerGame {
  variant: Variant
  seed: number
  rng: Rng
  deck: Card[] = []
  phase: Phase = 'bet'
  bankroll: number
  /** Coins per bet. Five is a full bet, which unlocks the royal-flush bonus. */
  coins = 5
  /** Pre-hold cards on the deal. Applies from the next deal. */
  autoHold: AutoHoldMode = 'off'
  hand: VpHand | null = null
  /** The last completed hand, kept on screen while the next is dealt. */
  last: VpHand | null = null
  round = 0
  version = 0

  private listeners = new Set<() => void>()

  constructor(
    opts: { variantId?: string; seed?: number; bankroll?: number; autoHold?: AutoHoldMode } = {},
  ) {
    this.variant = variantById(opts.variantId ?? 'jacks-9-6')
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bankroll = opts.bankroll ?? 200
    this.autoHold = opts.autoHold ?? 'off'
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

  setVariant(id: string): void {
    if (this.phase === 'dealt') return // don't swap mid-hand
    this.variant = variantById(id)
    this.touch()
  }

  setCoins(n: number): void {
    if (this.phase === 'dealt') return
    this.coins = Math.max(1, Math.min(5, n))
    this.touch()
  }

  setAutoHold(mode: AutoHoldMode): void {
    this.autoHold = mode
    this.touch()
  }

  canDeal(): boolean {
    return this.phase !== 'dealt' && this.bankroll >= this.coins
  }

  /** Deal a fresh five. The bet is taken now. */
  deal(): void {
    if (!this.canDeal()) return
    this.bankroll -= this.coins
    this.shuffle()
    this.round++
    this.hand = {
      cards: this.deck.splice(0, 5),
      held: [false, false, false, false, false],
      final: null,
      category: null,
      bet: this.coins,
      won: 0,
    }
    if (this.autoHold === 'winners') {
      this.hand.held = winningHold(this.hand.cards, this.variant.family)
    } else if (this.autoHold === 'optimal') {
      this.hand.held = optimalHold(this.hand.cards, this.variant, this.rng)
    }
    this.last = null
    this.phase = 'dealt'
    this.touch()
  }

  toggleHold(i: number): void {
    if (this.phase !== 'dealt' || !this.hand) return
    this.hand.held[i] = !this.hand.held[i]
    this.touch()
  }

  /** What perfect play would hold, for the coach. */
  hint(): boolean[] {
    if (!this.hand) return []
    return optimalHold(this.hand.cards, this.variant, this.rng)
  }

  /** Replace the unheld cards and settle. */
  draw(): void {
    if (this.phase !== 'dealt' || !this.hand) return
    const h = this.hand
    const final = h.cards.map((c, i) => (h.held[i] ? c : this.deck.shift()!))
    const category = classify(final, this.variant.family)
    const pay = payFor(this.variant, category) * h.bet

    h.final = final
    h.category = category
    h.won = pay
    this.bankroll += pay

    this.last = h
    this.hand = null
    this.phase = 'complete'
    this.touch()
  }

  private shuffle(): void {
    this.deck = buildShoeCards(1)
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1)
      const t = this.deck[i]
      this.deck[i] = this.deck[j]
      this.deck[j] = t
    }
  }
}

export { makeRng }
