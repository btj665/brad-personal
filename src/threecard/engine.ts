// Three Card Poker — Ante/Play against the dealer, with Pair Plus on the side.
//
// One player, one dealer, one decision. Everything the player will ever know is
// on the table the instant the cards land, so the engine deals all six cards at
// once and simply withholds the dealer's three until the hand is decided: that
// is what the pit does, and it keeps the replay from a seed honest — the
// dealer's hand can't depend on what the player chose.
//
// The two bets barely interact. Pair Plus is a wager on the player's own three
// cards and resolves even when the player folds the Ante; the Ante bonus is
// paid on those same three cards but only if the player stayed in.

import { buildShoeCards } from '../engine/cards'
import { makeRng, randomSeed, type Rng } from '../engine/rng'
import type { Card } from '../engine/types'
import { compare3, score3, type Score3 } from '../poker/eval3'
import {
  anteBonusOdds,
  dealerQualifies,
  DEFAULT_TABLE,
  LIMITS,
  pairPlusOdds,
  shouldRaise,
  tableById,
  type PairPlusTable,
} from './rules'

export type Phase = 'bet' | 'decide' | 'complete'

/** How the Ante/Play matchup ended. `noQualify` is its own outcome because it
 *  is neither a win nor a push: the ante is paid and the Play bet is returned. */
export type Outcome = 'fold' | 'noQualify' | 'win' | 'lose' | 'push'

export interface TcpPayout {
  /** Money coming back on each wager, stake included. */
  ante: number
  play: number
  /** The Ante bonus is pure win — there is no stake behind it. */
  anteBonus: number
  pairPlus: number
  wagered: number
  returned: number
  net: number
  outcome: Outcome
  dealerQualified: boolean
}

export interface TcpHand {
  ante: number
  pairPlusBet: number
  /** Equal to the ante once made, 0 on a fold. */
  play: number
  player: Card[]
  dealer: Card[]
  playerScore: Score3
  dealerScore: Score3
  folded: boolean
  payout: TcpPayout | null
}

export interface LogEntry {
  round: number
  text: string
}

export interface TcpOptions {
  seed?: number
  bankroll?: number
  pairPlusTableId?: string
  ante?: number
  pairPlus?: number
}

/** Settle a decided hand. Pure and exported so the tests can rig a hand and
 *  walk every branch of the schedule without fighting the shuffle. */
export function settleHand(hand: TcpHand, table: PairPlusTable): TcpPayout {
  const wagered = hand.ante + hand.play + hand.pairPlusBet
  const qualified = dealerQualifies(hand.dealerScore)

  // Pair Plus never looks at the dealer, so it pays the same on a fold.
  const ppOdds = pairPlusOdds(table, hand.playerScore)
  const pairPlus = hand.pairPlusBet > 0 && ppOdds > 0 ? hand.pairPlusBet * (1 + ppOdds) : 0

  if (hand.folded) {
    const returned = pairPlus
    return {
      ante: 0,
      play: 0,
      anteBonus: 0,
      pairPlus,
      wagered,
      returned,
      net: returned - wagered,
      outcome: 'fold',
      dealerQualified: qualified,
    }
  }

  const anteBonus = hand.ante * anteBonusOdds(hand.playerScore)
  const cmp = compare3(hand.playerScore, hand.dealerScore)

  let ante: number
  let play: number
  let outcome: Outcome
  if (!qualified) {
    // Dealer short of queen high: the ante wins, the Play bet is handed back.
    ante = hand.ante * 2
    play = hand.play
    outcome = 'noQualify'
  } else if (cmp > 0) {
    ante = hand.ante * 2
    play = hand.play * 2
    outcome = 'win'
  } else if (cmp === 0) {
    // A dead heat needs all three ranks to match; both bets push.
    ante = hand.ante
    play = hand.play
    outcome = 'push'
  } else {
    ante = 0
    play = 0
    outcome = 'lose'
  }

  const returned = ante + play + anteBonus + pairPlus
  return {
    ante,
    play,
    anteBonus,
    pairPlus,
    wagered,
    returned,
    net: returned - wagered,
    outcome,
    dealerQualified: qualified,
  }
}

export class ThreeCardGame {
  seed: number
  rng: Rng
  deck: Card[] = []
  phase: Phase = 'bet'
  bankroll: number
  table: PairPlusTable
  /** The bets staged for the next deal. */
  ante: number
  pairPlus: number
  /** The denomination the chip buttons drop. */
  chip: number = LIMITS.chips[0]
  hand: TcpHand | null = null
  /** The settled hand, left on the felt while the next bet is made. */
  last: TcpHand | null = null
  round = 0
  log: LogEntry[] = []
  version = 0

  private listeners = new Set<() => void>()

  constructor(opts: TcpOptions = {}) {
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bankroll = opts.bankroll ?? 1000
    this.table = opts.pairPlusTableId ? tableById(opts.pairPlusTableId) : DEFAULT_TABLE
    this.ante = opts.ante ?? LIMITS.min
    this.pairPlus = opts.pairPlus ?? 0
  }

  // -------------------------------------------------------------- store

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

  setTable(id: string): void {
    if (this.phase === 'decide') return // don't move the schedule mid-hand
    this.table = tableById(id)
    this.touch()
  }

  setChip(value: number): void {
    this.chip = value
    this.touch()
  }

  addAnte(amount: number): void {
    if (this.phase === 'decide') return
    this.ante = this.clampAnte(this.ante + amount)
    this.touch()
  }

  addPairPlus(amount: number): void {
    if (this.phase === 'decide') return
    this.pairPlus = this.clampPairPlus(this.pairPlus + amount)
    this.touch()
  }

  /** Back down to the table minimum with no side bet. You cannot sit for less
   *  than the minimum, so "clear" means "reset to the smallest legal bet". */
  clearBets(): void {
    if (this.phase === 'decide') return
    this.ante = this.clampAnte(LIMITS.min)
    this.pairPlus = 0
    this.touch()
  }

  /** The table asks for twice the ante up front, because an ante you cannot
   *  back with the Play bet is an ante you cannot make. */
  private clampAnte(want: number): number {
    const room = Math.floor((this.bankroll - this.pairPlus) / 2)
    return Math.max(0, Math.min(want, LIMITS.max, room))
  }

  private clampPairPlus(want: number): number {
    const room = this.bankroll - this.ante * 2
    return Math.max(0, Math.min(want, LIMITS.max, room))
  }

  get staked(): number {
    return this.ante + this.pairPlus
  }

  canDeal(): boolean {
    if (this.phase === 'decide') return false
    if (this.ante < LIMITS.min) return false
    return this.bankroll >= this.ante * 2 + this.pairPlus
  }

  // -------------------------------------------------------------- play

  deal(): void {
    if (!this.canDeal()) return
    this.bankroll -= this.ante + this.pairPlus
    this.shuffle()
    this.round++

    const player = [this.deck.pop()!, this.deck.pop()!, this.deck.pop()!]
    const dealer = [this.deck.pop()!, this.deck.pop()!, this.deck.pop()!]
    this.hand = {
      ante: this.ante,
      pairPlusBet: this.pairPlus,
      play: 0,
      player,
      dealer,
      playerScore: score3(player),
      dealerScore: score3(dealer),
      folded: false,
      payout: null,
    }
    this.last = null
    this.phase = 'decide'
    this.say(`Round ${this.round}. Ante ${this.ante}${this.pairPlus ? `, Pair Plus ${this.pairPlus}` : ''}.`)
    this.touch()
  }

  fold(): void {
    if (this.phase !== 'decide' || !this.hand) return
    this.hand.folded = true
    this.say('Fold. The ante is dead.')
    this.settle()
  }

  /** Make the Play bet, always equal to the ante. */
  play(): void {
    if (this.phase !== 'decide' || !this.hand) return
    const h = this.hand
    if (this.bankroll < h.ante) return
    h.play = h.ante
    this.bankroll -= h.play
    this.say(`Play ${h.play}.`)
    this.settle()
  }

  /** What Q-6-4 says to do with the hand on the table. Drives the Coach hint. */
  hint(): boolean | null {
    if (this.phase !== 'decide' || !this.hand) return null
    return shouldRaise(this.hand.playerScore)
  }

  /** Deal and decide in one go, playing the Q-6-4 strategy. For tests and sims. */
  playRound(): void {
    this.deal()
    if (this.phase !== 'decide') return
    if (this.hint()) this.play()
    else this.fold()
  }

  private settle(): void {
    const h = this.hand!
    const payout = settleHand(h, this.table)
    h.payout = payout
    this.bankroll += payout.returned

    // The staged bets ride to the next hand. Cut them back if the bankroll can
    // no longer back them, so the screen never offers a deal it can't honour.
    this.ante = this.clampAnte(this.ante)
    this.pairPlus = this.clampPairPlus(this.pairPlus)

    this.say(this.describe(payout))
    this.last = h
    this.hand = null
    this.phase = 'complete'
    this.touch()
  }

  private describe(p: TcpPayout): string {
    const money = p.net >= 0 ? `+${p.net}` : `${p.net}`
    switch (p.outcome) {
      case 'fold':
        return `Folded. ${money}.`
      case 'noQualify':
        return `Dealer doesn't qualify — ante pays, Play returns. ${money}.`
      case 'win':
        return `Player wins. ${money}.`
      case 'push':
        return `Dead heat — both push. ${money}.`
      default:
        return `Dealer wins${p.anteBonus > 0 ? ', bonus pays anyway' : ''}. ${money}.`
    }
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

  private say(text: string): void {
    this.log.push({ round: this.round, text })
    if (this.log.length > 200) this.log.shift()
  }
}
