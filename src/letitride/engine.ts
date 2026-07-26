// Let It Ride — three equal bets, three cards, two community cards.
//
// There is no dealer and nothing to beat. The whole game is two chances to take
// money back off the table before the final five cards are read against the pay
// table in rules.ts, so the engine is a three-state walk rather than the
// step()/Beat clock the dealer games need.
//
// Deterministic from the seed like every engine here: no clock, no Math.random.

import { buildShoeCards } from '../engine/cards'
import { makeRng, randomSeed, type Rng } from '../engine/rng'
import type { Card } from '../engine/types'
import { score5, type Score } from '../poker/eval'
import { payKeyFor, settleAmount, type PayKey } from './rules'
import { adviseBet1, adviseBet2, type Advice } from './strategy'

export type Phase = 'bet' | 'decision1' | 'decision2' | 'complete'
export type LirAction = 'ride' | 'pull'

export interface LirRound {
  n: number
  /** One of the three equal bets. The round costs three of these up front. */
  unit: number
  cards: Card[]
  community: Card[]
  /** Community cards turned face up so far: 0, then 1, then 2. */
  revealed: number
  /** Bets 1, 2 and 3. A bet goes false the moment it is pulled back; bet 3
   *  always stays true. */
  riding: boolean[]
  score: Score | null
  payKey: PayKey | null
  /** Chips handed back at the end: the pulled-back stakes, plus stake and win on
   *  every bet that was still out there. */
  returned: number
  net: number
}

export interface LirOptions {
  seed?: number
  bankroll?: number
  unit?: number
}

export class LetItRideGame {
  seed: number
  rng: Rng
  deck: Card[] = []
  phase: Phase = 'bet'
  bankroll: number
  unit: number
  round: LirRound | null = null
  /** The last settled round, kept on screen until the next deal. */
  last: LirRound | null = null
  rounds = 0
  version = 0

  private listeners = new Set<() => void>()

  constructor(opts: LirOptions = {}) {
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bankroll = opts.bankroll ?? 1000
    this.unit = opts.unit ?? 5
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

  setUnit(n: number): void {
    if (this.phase === 'decision1' || this.phase === 'decision2') return // not mid-hand
    this.unit = Math.max(1, n)
    this.touch()
  }

  canDeal(): boolean {
    return this.phase !== 'decision1' && this.phase !== 'decision2' && this.bankroll >= this.unit * 3
  }

  /** Deal three to the player and two community cards face down. All three bets
   *  are posted now — that is the only money the player can ever be asked for. */
  deal(): void {
    if (!this.canDeal()) return
    const unit = this.unit
    this.bankroll -= unit * 3
    this.shuffle()
    this.rounds++
    // The community cards come off the deck now and sit face down, exactly as
    // they're placed on a real layout, so no reveal can depend on how the player
    // decides.
    this.round = {
      n: this.rounds,
      unit,
      cards: this.deck.splice(0, 3),
      community: this.deck.splice(0, 2),
      revealed: 0,
      riding: [true, true, true],
      score: null,
      payKey: null,
      returned: 0,
      net: 0,
    }
    this.last = null
    this.phase = 'decision1'
    this.touch()
  }

  /** Which bet the player is being asked about: 0 for bet 1, 1 for bet 2, null
   *  when there is no decision pending. Bet 3 is never offered. */
  pendingBet(): number | null {
    if (this.phase === 'decision1') return 0
    if (this.phase === 'decision2') return 1
    return null
  }

  /** What the published chart says about the pending decision, for the coach. */
  advice(): Advice | null {
    const r = this.round
    if (!r) return null
    if (this.phase === 'decision1') return adviseBet1(r.cards)
    if (this.phase === 'decision2') return adviseBet2([...r.cards, r.community[0]])
    return null
  }

  /** The cards the chart is being read against right now — what the player can
   *  actually see. */
  visible(): Card[] {
    const r = this.round ?? this.last
    if (!r) return []
    return [...r.cards, ...r.community.slice(0, r.revealed)]
  }

  decide(action: LirAction): void {
    const r = this.round
    if (!r) return

    if (this.phase === 'decision1') {
      if (action === 'pull') r.riding[0] = false
      r.revealed = 1
      this.phase = 'decision2'
      this.touch()
      return
    }

    if (this.phase === 'decision2') {
      if (action === 'pull') r.riding[1] = false
      r.revealed = 2
      this.settle()
      this.touch()
    }
  }

  /** Play a whole round on the published charts. The edge script's cross-check
   *  and the tests use this; the screen never does. */
  playRound(): void {
    if (this.phase !== 'decision1' && this.phase !== 'decision2') this.deal()
    while (this.phase === 'decision1' || this.phase === 'decision2') {
      this.decide(this.advice()!.ride ? 'ride' : 'pull')
    }
  }

  private settle(): void {
    const r = this.round!
    r.score = score5([...r.cards, ...r.community])
    r.payKey = payKeyFor(r.score)
    // Every bet still on the table is paid the full schedule — three units on a
    // royal is 3,000 for one, which is the whole appeal of the game.
    const riding = r.riding.filter(Boolean).length
    r.returned = settleAmount(r.score, r.unit, riding)
    r.net = r.returned - r.unit * 3
    this.bankroll += r.returned

    this.last = r
    this.round = null
    this.phase = 'complete'
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
