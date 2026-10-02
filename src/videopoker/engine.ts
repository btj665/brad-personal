// Video poker — a single player against a pay table. Deal five, hold any, draw,
// get paid. No table, no dealer, no other seats; the whole game is the math in
// classify.ts and solver.ts.
//
// Multi-hand (Triple Play, Five Play, Ten Play) is the same game played across N
// hands at once: ONE five-card deal, ONE set of holds, then N draws that each
// come off their own deck. See `drawPools` for why that leaves the return
// untouched and only moves the variance.

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

/** The machines that exist: single line, Triple Play, Five Play, Ten Play. */
export const HAND_COUNTS = [1, 3, 5, 10] as const
export type HandCount = (typeof HAND_COUNTS)[number]

/** One of the N hands, after the draw. */
export interface VpDraw {
  /** The final five: the held cards, plus this hand's own replacements. */
  cards: Card[]
  category: PayCategory
  won: number
}

export interface VpHand {
  cards: Card[]
  held: boolean[]
  /** Hand 1's final five. Single-hand play only ever has this one. */
  final: Card[] | null
  /** Hand 1's category. */
  category: PayCategory | null
  /** Coins on each hand. */
  coins: number
  /** How many hands this deal is played across. */
  hands: HandCount
  /** Everything committed on the deal: `coins × hands`. */
  bet: number
  /** Everything paid back, summed over all the hands. */
  won: number
  /** One entry per hand, hand 1 first. Empty until the draw. */
  draws: VpDraw[]
}

/** One draw pool per hand: each is the full 52 minus the five cards on screen.
 *
 *  This is the whole rule of multi-hand, and the one people get wrong. The hands
 *  do not share a deck and they do not deal around each other — each draws from
 *  its own copy of the same 47, so the identical replacement card can and does
 *  turn up in several hands at once. Because every pool holds exactly the same 47
 *  cards, every hand's draw has exactly the same distribution as a single-hand
 *  draw would, so the return per coin is unchanged however many hands are lit;
 *  only the spread moves.
 *
 *  `rest` is the deck the deal came off, already shuffled and already down to 47.
 *  Hand 1 takes it as it stands, which keeps one-hand play replaying bit-for-bit
 *  from its seed the way it always did. */
export function drawPools(rest: Card[], hands: number, rng: Rng): Card[][] {
  const pools: Card[][] = [rest]
  for (let n = 1; n < hands; n++) {
    const pool = rest.slice()
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(i + 1)
      const t = pool[i]
      pool[i] = pool[j]
      pool[j] = t
    }
    pools.push(pool)
  }
  return pools
}

export class VideoPokerGame {
  variant: Variant
  seed: number
  rng: Rng
  deck: Card[] = []
  phase: Phase = 'bet'
  bankroll: number
  /** Coins per hand. Five is a full bet, which unlocks the royal-flush bonus. */
  coins = 5
  /** Hands played per deal. The bet is `coins × hands`, which is the thing that
   *  catches people out on a real Ten Play machine. */
  hands: HandCount = 1
  /** Pre-hold cards on the deal. Applies from the next deal. */
  autoHold: AutoHoldMode = 'off'
  hand: VpHand | null = null
  /** The last completed hand, kept on screen while the next is dealt. */
  last: VpHand | null = null
  round = 0
  version = 0

  private listeners = new Set<() => void>()

  constructor(
    opts: {
      variantId?: string
      seed?: number
      bankroll?: number
      autoHold?: AutoHoldMode
      hands?: number
    } = {},
  ) {
    this.variant = variantById(opts.variantId ?? 'jacks-9-6')
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bankroll = opts.bankroll ?? 200
    this.autoHold = opts.autoHold ?? 'off'
    this.hands = nearestHandCount(opts.hands ?? 1)
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

  setHands(n: number): void {
    if (this.phase === 'dealt') return
    this.hands = nearestHandCount(n)
    this.touch()
  }

  setAutoHold(mode: AutoHoldMode): void {
    this.autoHold = mode
    this.touch()
  }

  /** Everything the next deal costs. Five Play at five coins is twenty-five. */
  totalBet(): number {
    return this.coins * this.hands
  }

  canDeal(): boolean {
    return this.phase !== 'dealt' && this.bankroll >= this.totalBet()
  }

  /** Deal a fresh five. The bet is taken now — all of it, every hand at once. */
  deal(): void {
    if (!this.canDeal()) return
    this.bankroll -= this.totalBet()
    this.shuffle()
    this.round++
    this.hand = {
      cards: this.deck.splice(0, 5),
      held: [false, false, false, false, false],
      final: null,
      category: null,
      coins: this.coins,
      hands: this.hands,
      bet: this.totalBet(),
      won: 0,
      draws: [],
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

  /** What perfect play would hold, for the coach. One solve per deal: the holds
   *  are chosen on the dealt five, so the answer does not depend on how many
   *  hands that five is about to be copied into. Ten Play costs no more to solve
   *  than one line. */
  hint(): boolean[] {
    if (!this.hand) return []
    return optimalHold(this.hand.cards, this.variant, this.rng)
  }

  /** Draw every hand and settle. Each hand replaces the unheld cards from its
   *  own deck, so two hands can pull the same card. */
  draw(): void {
    if (this.phase !== 'dealt' || !this.hand) return
    const h = this.hand
    const pools = drawPools(this.deck, h.hands, this.rng)

    h.draws = pools.map((pool) => {
      let next = 0
      const cards = h.cards.map((c, i) => (h.held[i] ? c : pool[next++]))
      const category = classify(cards, this.variant.family)
      return { cards, category, won: payFor(this.variant, category) * h.coins }
    })

    h.final = h.draws[0].cards
    h.category = h.draws[0].category
    h.won = h.draws.reduce((sum, d) => sum + d.won, 0)
    this.bankroll += h.won

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

/** Snap to a hand count a machine actually offers rather than rejecting the
 *  call, the way setCoins clamps to 1–5. */
function nearestHandCount(n: number): HandCount {
  let best: HandCount = HAND_COUNTS[0]
  for (const c of HAND_COUNTS) {
    if (Math.abs(c - n) < Math.abs(best - n)) best = c
  }
  return best
}

export { makeRng }
