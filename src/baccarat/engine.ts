// Baccarat (punto banco) — the table.
//
// One beat per step(), the same shape as the Pai Gow and UTH engines, except
// that this game never waits on a human once the cards are moving: the tableau
// plays both hands. The state machine exists so the deal can be *watched* — the
// whole entertainment of baccarat is the reveal, and a coup that resolved in one
// call would be a number appearing out of nowhere.
//
// The player's entire agency is which of the five spots the chips land on.

import { buildShoeCards } from '../engine/cards'
import { makeRng, randomSeed, type Rng } from '../engine/rng'
import type { Card } from '../engine/types'
import {
  BET_NAMES,
  bankerDrawsAfterStand,
  bankerDrawsAgainstThird,
  cardPoints,
  DEFAULT_BACCARAT,
  isNatural,
  playerDraws,
  ratio,
} from './rules'
import type {
  BaccaratHand,
  BaccaratRules,
  BetName,
  Phase,
  RoundResult,
  Side,
  Wagers,
  Winner,
} from './types'

/** One visible event. The shoe's own shuffle isn't one of these: it happens
 *  inside `deal()`, before a single card is exposed. */
export type Beat =
  | { type: 'card'; side: Side; card: Card; third: boolean }
  | { type: 'natural'; side: Side; total: number }
  | { type: 'stand'; side: Side; total: number }
  | { type: 'settle' }
  | { type: 'roundOver' }
  | { type: 'awaitBet' }

export interface LogEntry {
  round: number
  text: string
}

export interface BaccaratOptions {
  rules?: BaccaratRules
  seed?: number
  bankroll?: number
}

export function noWagers(): Wagers {
  return { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 }
}

export class BaccaratGame {
  rules: BaccaratRules
  seed: number
  rng: Rng
  deck: Card[] = []
  bankroll: number
  phase: Phase = 'betting'
  round = 0
  chip: number

  player: BaccaratHand = emptyHand()
  banker: BaccaratHand = emptyHand()
  /** Chips on the layout: live during a coup, cleared when it is paid. */
  wagers: Wagers = noWagers()
  lastResult: RoundResult | null = null
  /** The bead plate, oldest first. Nobody at a baccarat table can do without it. */
  results: RoundResult[] = []
  log: LogEntry[] = []
  /** True from the shuffle until the coup after it is dealt — drives the banner. */
  freshShoe = true
  version = 0

  private listeners = new Set<() => void>()
  private lastWagers: Wagers | null = null
  private paidOut = false
  private cardsDealt = 0

  constructor(opts: BaccaratOptions = {}) {
    this.rules = opts.rules ?? DEFAULT_BACCARAT
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bankroll = opts.bankroll ?? 1000
    this.chip = this.rules.chips[0]
    this.shuffle()
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

  get staked(): number {
    let n = 0
    for (const name of BET_NAMES) n += this.wagers[name]
    return n
  }

  /** How much of the shoe is still to come, 0..1 — the cut-card indicator. */
  get shoeRemaining(): number {
    return this.deck.length / (this.rules.decks * 52)
  }

  setChip(value: number): void {
    this.chip = value
    this.touch()
  }

  place(name: BetName): void {
    if (this.phase !== 'betting') return
    if (this.chip > this.bankroll - this.staked) return
    if (this.wagers[name] + this.chip > this.rules.maxBet) return
    this.wagers[name] += this.chip
    this.touch()
  }

  /** Right-click a spot: take the whole bet back, the way you would in person. */
  removeBet(name: BetName): void {
    if (this.phase !== 'betting') return
    this.wagers[name] = 0
    this.touch()
  }

  clearBets(): void {
    if (this.phase !== 'betting') return
    this.wagers = noWagers()
    this.touch()
  }

  /** Put out the same chips as last coup, if the bankroll still covers them. */
  rebet(): void {
    if (this.phase !== 'betting' || !this.lastWagers) return
    let sum = 0
    for (const name of BET_NAMES) sum += this.lastWagers[name]
    if (sum > this.bankroll) return
    this.wagers = { ...this.lastWagers }
    this.touch()
  }

  canDeal(): boolean {
    return this.phase === 'betting' && this.staked >= this.rules.minBet
  }

  /** Take the stakes and start the coup. The cut card is checked here, never in
   *  the middle of a hand: a real shoe always finishes the coup it started. */
  deal(): boolean {
    if (!this.canDeal()) return false
    const cutoff = this.rules.decks * 52 * (1 - this.rules.penetration)
    if (this.deck.length <= cutoff) {
      this.shuffle()
      this.say('The cut card is out. New shoe.')
    } else {
      this.freshShoe = false
    }

    this.bankroll -= this.staked
    this.round++
    this.player = emptyHand()
    this.banker = emptyHand()
    this.cardsDealt = 0
    this.paidOut = false
    this.phase = 'deal'
    this.touch()
    return true
  }

  pending(): Beat | null {
    return this.phase === 'betting' ? { type: 'awaitBet' } : null
  }

  // -------------------------------------------------------------- clock

  step(): Beat {
    const beat = this.advance()
    this.touch()
    return beat
  }

  /** Run beats until the coup is paid. Used by tests and the edge script; throws
   *  rather than spin if it ever finds itself waiting for a bet. */
  playRound(max = 20): void {
    let n = 0
    for (;;) {
      const beat = this.advance()
      if (beat.type === 'settle') break
      if (beat.type === 'awaitBet') throw new Error('playRound: no chips on the layout')
      if (n++ > max) throw new Error('playRound did not terminate')
    }
    this.touch()
  }

  /** Finish the coup and come back round to the betting phase. */
  finishRound(max = 20): void {
    this.playRound(max)
    this.advance()
    this.touch()
  }

  private advance(): Beat {
    switch (this.phase) {
      case 'betting':
        return { type: 'awaitBet' }
      case 'deal':
        return this.stepDeal()
      case 'peek':
        return this.stepPeek()
      case 'player':
        return this.stepPlayer()
      case 'banker':
        return this.stepBanker()
      case 'settled':
        return this.stepSettled()
    }
  }

  // -------------------------------------------------------------- machine

  /** Two to the player, two to the banker, alternating, one card per beat. */
  private stepDeal(): Beat {
    const side: Side = this.cardsDealt % 2 === 0 ? 'player' : 'banker'
    const card = this.hit(side)
    this.cardsDealt++
    if (this.cardsDealt === 4) this.phase = 'peek'
    return { type: 'card', side, card, third: false }
  }

  private stepPeek(): Beat {
    const p = this.player.total
    const b = this.banker.total
    if (isNatural(p) || isNatural(b)) {
      // Both hands stand where they are, whichever side turned it over.
      const side: Side = isNatural(p) && p >= b ? 'player' : isNatural(b) ? 'banker' : 'player'
      const shown = side === 'player' ? p : b
      this.say(`Natural ${shown} — ${side === 'player' ? 'Player' : 'Banker'}. Both stand.`)
      this.phase = 'settled'
      return { type: 'natural', side, total: shown }
    }
    this.phase = 'player'
    return this.stepPlayer()
  }

  private stepPlayer(): Beat {
    this.phase = 'banker'
    if (!this.playerWouldDraw()) {
      this.say(`Player stands on ${this.player.total}.`)
      return { type: 'stand', side: 'player', total: this.player.total }
    }
    const card = this.hit('player')
    return { type: 'card', side: 'player', card, third: true }
  }

  private stepBanker(): Beat {
    this.phase = 'settled'
    if (!this.bankerWouldDraw()) {
      this.say(`Banker stands on ${this.banker.total}.`)
      return { type: 'stand', side: 'banker', total: this.banker.total }
    }
    const card = this.hit('banker')
    return { type: 'card', side: 'banker', card, third: true }
  }

  /** The player's tableau row, exposed so the screen can caption the beat. */
  playerWouldDraw(): boolean {
    return playerDraws(this.player.total)
  }

  /** The banker's tableau row, which depends on whether the player took a card
   *  and, if so, on that card's point value. */
  bankerWouldDraw(): boolean {
    const third = this.player.cards[2]
    if (!third) return bankerDrawsAfterStand(this.banker.total)
    return bankerDrawsAgainstThird(this.banker.total, cardPoints(third.rank))
  }

  private stepSettled(): Beat {
    if (!this.paidOut) {
      this.settle()
      this.paidOut = true
      return { type: 'settle' }
    }
    return this.endRound()
  }

  get winner(): Winner {
    const p = this.player.total
    const b = this.banker.total
    return p > b ? 'player' : b > p ? 'banker' : 'tie'
  }

  private settle(): void {
    const winner = this.winner
    const w = this.wagers
    const pays = this.rules.pays
    const returned = noWagers()

    if (winner === 'player') returned.player = w.player * (1 + ratio(pays.player))
    else if (winner === 'tie') returned.player = w.player // Player and Banker push

    if (winner === 'banker') {
      // The commission comes out of the winnings only; the stake returns whole.
      returned.banker = w.banker * (1 + ratio(pays.banker) * (1 - this.rules.commission))
    } else if (winner === 'tie') returned.banker = w.banker

    if (winner === 'tie') returned.tie = w.tie * (1 + ratio(pays.tie))

    if (this.player.pair) returned.playerPair = w.playerPair * (1 + ratio(pays.playerPair))
    if (this.banker.pair) returned.bankerPair = w.bankerPair * (1 + ratio(pays.bankerPair))

    let back = 0
    for (const name of BET_NAMES) back += returned[name]
    this.bankroll += back

    const result: RoundResult = {
      round: this.round,
      winner,
      playerTotal: this.player.total,
      bankerTotal: this.banker.total,
      playerPair: this.player.pair,
      bankerPair: this.banker.pair,
      natural: this.player.cards.length === 2 && this.banker.cards.length === 2 &&
        (isNatural(this.player.total) || isNatural(this.banker.total)),
      wagers: { ...w },
      returned,
      net: back - this.staked,
    }
    this.lastResult = result
    this.results.push(result)
    // Trimmed in batches: a shift() per coup would dominate the edge script.
    if (this.results.length > 160) this.results.splice(0, this.results.length - 120)

    this.say(
      `Player ${result.playerTotal}, Banker ${result.bankerTotal} — ` +
        `${winner === 'tie' ? 'tie' : winner === 'player' ? 'Player wins' : 'Banker wins'}.`,
    )
  }

  private endRound(): Beat {
    this.lastWagers = { ...this.wagers }
    this.wagers = noWagers()
    this.phase = 'betting'
    return { type: 'roundOver' }
  }

  // -------------------------------------------------------------- shoe

  private hit(side: Side): Card {
    const card = this.deck.pop()
    if (!card) throw new Error('the shoe ran dry mid-coup')
    const hand = side === 'player' ? this.player : this.banker
    hand.cards.push(card)
    // Sum modulo ten, kept running: (a + b) % 10 is the same as (a % 10 + b) % 10.
    hand.total = (hand.total + cardPoints(card.rank)) % 10
    if (hand.cards.length === 2) hand.pair = hand.cards[0].rank === hand.cards[1].rank
    return card
  }

  private shuffle(): void {
    this.deck = buildShoeCards(this.rules.decks)
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1)
      const t = this.deck[i]
      this.deck[i] = this.deck[j]
      this.deck[j] = t
    }
    this.freshShoe = true
  }

  private say(text: string): void {
    this.log.push({ round: this.round, text })
    if (this.log.length > 240) this.log.splice(0, this.log.length - 200)
  }
}

function emptyHand(): BaccaratHand {
  return { cards: [], total: 0, pair: false }
}
