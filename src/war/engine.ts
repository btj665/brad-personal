// Casino War — the shortest game on the floor: one card each, high card wins,
// even money. Played that way it would be a coin flip, so the whole house edge
// lives in the tie rule: on a tie the player either buys half a loss or doubles
// up to win a single unit. Both branches are bad, which is the game.

import { buildShoeCards } from '../engine/cards'
import { makeRng, randomSeed, type Rng } from '../engine/rng'
import type { Card, Rank } from '../engine/types'
import { rankValue } from '../poker/eval'

/** Six decks is the standard shoe; the tie probability, and so the edge, moves
 *  with the deck count (more decks make ties slightly likelier). */
export const DECKS = 6

/** The Tie side bet. Ten to one against a ~7.4% event — the worst bet here. */
export const TIE_PAYS = 10

/** Cards buried before the war deal. Pure ceremony — three cards nobody sees
 *  can't shift anybody's odds — but the burn is part of the game, so it's dealt. */
export const BURN = 3

/** The cut card sits a quarter of the way from the back: 75% penetration. */
const CUT = Math.floor((DECKS * 52) / 4)

/** Published six-deck house edges, quoted per original wager the way the
 *  literature quotes them. `war` is what you get going to war on every tie. */
export const HOUSE_EDGE = { war: 0.0288, surrender: 0.037, tie: 0.1865 } as const

export type Phase = 'bet' | 'tie' | 'settled'

export type WarOutcome =
  | 'win' // first card higher
  | 'lose' // first card lower
  | 'surrender' // tied, took half back
  | 'warWin' // tied, went to war, second card higher or equal
  | 'warLose' // tied, went to war, second card lower

export const OUTCOME_NAME: Record<WarOutcome, string> = {
  win: 'High card',
  lose: 'Dealer high',
  surrender: 'Surrendered',
  warWin: 'Won the war',
  warLose: 'Lost the war',
}

export interface WarRound {
  n: number
  /** The original wager. The war raise is always exactly this much again. */
  bet: number
  tieBet: number
  raise: number
  /** [first card] or [first, war card]. */
  player: Card[]
  dealer: Card[]
  burn: Card[]
  tied: boolean
  outcome: WarOutcome | null
  /** Every chip that left the bankroll this round. */
  wagered: number
  /** Chips handed back on the main bet and raise: 0, half, 2x or 3x the bet. */
  returned: number
  /** Chips handed back on the Tie side bet. */
  tieReturned: number
}

/** Rank alone decides it, ace high, suits irrelevant — so this is the poker
 *  rank value (A=14) and nothing else. */
export function warValue(rank: Rank): number {
  return rankValue(rank)
}

/** >0 when `a` outranks `b`, 0 when they tie. */
export function compareCards(a: Card, b: Card): number {
  return warValue(a.rank) - warValue(b.rank)
}

export class WarGame {
  seed: number
  rng: Rng
  shoe: Card[] = []
  phase: Phase = 'bet'
  bankroll: number
  /** The working wager, carried between rounds like a chip left on the spot. */
  bet: number
  tieBet = 0
  hand: WarRound | null = null
  history: WarRound[] = []
  round = 0
  version = 0

  private listeners = new Set<() => void>()

  constructor(opts: { seed?: number; bankroll?: number; bet?: number } = {}) {
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bankroll = opts.bankroll ?? 1000
    this.bet = opts.bet ?? 10
    this.shuffle()
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

  // -------------------------------------------------------------- betting

  setBet(n: number): void {
    if (this.phase === 'tie') return
    this.bet = Math.max(0, n)
    this.touch()
  }

  setTieBet(n: number): void {
    if (this.phase === 'tie') return
    this.tieBet = Math.max(0, n)
    this.touch()
  }

  canDeal(): boolean {
    return this.phase !== 'tie' && this.bet > 0 && this.bankroll >= this.bet + this.tieBet
  }

  /** How deep into the shoe we are, for the UI's shoe gauge. */
  get dealt(): number {
    return DECKS * 52 - this.shoe.length
  }

  // -------------------------------------------------------------- the round

  /** One card each. Anything but a tie settles on the spot. */
  deal(): void {
    if (!this.canDeal()) return

    // Reshuffle only between rounds. A war can want seven more cards and the
    // shoe must never run dry in the middle of one.
    if (this.shoe.length < CUT) this.shuffle()

    const bet = this.bet
    const tieBet = this.tieBet
    this.bankroll -= bet + tieBet
    this.round++

    const player = this.draw()
    const dealer = this.draw()
    const tied = compareCards(player, dealer) === 0

    this.hand = {
      n: this.round,
      bet,
      tieBet,
      raise: 0,
      player: [player],
      dealer: [dealer],
      burn: [],
      tied,
      outcome: null,
      wagered: bet + tieBet,
      returned: 0,
      // The Tie side bet is decided by the first two cards and nothing after,
      // so it is already resolved even though the main bet may not be.
      tieReturned: tied ? tieBet * (TIE_PAYS + 1) : 0,
    }

    if (tied) {
      this.phase = 'tie'
      this.touch()
      return
    }
    this.settle(compareCards(player, dealer) > 0 ? 'win' : 'lose')
  }

  /** The player must be able to cover an equal raise to go to war. */
  canGoToWar(): boolean {
    return this.phase === 'tie' && this.hand !== null && this.bankroll >= this.hand.bet
  }

  /** Forfeit half the bet and walk. Costs 0.5 units every tie — worse in the
   *  long run than the war, which is the one thing worth knowing about war. */
  surrender(): void {
    if (this.phase !== 'tie' || !this.hand) return
    this.settle('surrender')
  }

  /** Post a second bet equal to the first, burn three, one more card each.
   *  Higher *or equal* wins, but the win only pays on the raise — the original
   *  bet pushes. So two units are at risk to win one. */
  goToWar(): void {
    if (!this.canGoToWar() || !this.hand) return
    const h = this.hand
    this.bankroll -= h.bet
    h.raise = h.bet
    h.wagered += h.bet

    for (let i = 0; i < BURN; i++) h.burn.push(this.draw())
    const player = this.draw()
    const dealer = this.draw()
    h.player.push(player)
    h.dealer.push(dealer)

    this.settle(compareCards(player, dealer) >= 0 ? 'warWin' : 'warLose')
  }

  /** Clear the felt. The wager stays put, ready to go again. */
  next(): void {
    if (this.phase !== 'settled') return
    this.hand = null
    this.phase = 'bet'
    this.touch()
  }

  /** Deal, and answer any tie with `strategy`. What the edge script drives. */
  playRound(strategy: 'war' | 'surrender'): WarRound | null {
    if (!this.canDeal()) return null
    this.deal()
    if (this.phase === 'tie') {
      if (strategy === 'war' && this.canGoToWar()) this.goToWar()
      else this.surrender()
    }
    const settled = this.hand
    this.next()
    return settled
  }

  // -------------------------------------------------------------- internals

  private settle(outcome: WarOutcome): void {
    const h = this.hand!
    h.outcome = outcome
    h.returned = mainReturn(outcome, h.bet, h.raise)
    this.bankroll += h.returned + h.tieReturned
    this.phase = 'settled'
    this.history = [h, ...this.history].slice(0, 12)
    this.touch()
  }

  private draw(): Card {
    if (this.shoe.length === 0) this.shuffle()
    return this.shoe.pop()!
  }

  private shuffle(): void {
    this.shoe = buildShoeCards(DECKS)
    for (let i = this.shoe.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1)
      const t = this.shoe[i]
      this.shoe[i] = this.shoe[j]
      this.shoe[j] = t
    }
  }
}

/** Chips coming back on the main bet and the raise, by outcome. */
export function mainReturn(outcome: WarOutcome, bet: number, raise: number): number {
  switch (outcome) {
    case 'win':
      return bet * 2
    case 'lose':
    case 'warLose':
      return 0
    // Half the bet stays on the table. A real table takes it in chips, so the
    // house minimum is an even number; the engine keeps the exact half.
    case 'surrender':
      return bet / 2
    // The raise is paid 1:1 and the original bet pushes: 3x back on 2x staked.
    case 'warWin':
      return bet + raise * 2
  }
}
