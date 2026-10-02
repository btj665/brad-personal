// Ultimate Texas Hold'em — the table.
//
// Synchronous and deterministic, the same shape as the blackjack engine: one
// beat per step(), pauses only for the human. Every seat plays its own two hole
// cards against a shared five-card board and a shared dealer.

import { buildShoeCards } from '../engine/cards'
import { makeRng, randomSeed, type Rng } from '../engine/rng'
import { bestOf, compare, type Score } from '../poker/eval'
import type { Card } from '../engine/types'
import { DEFAULT_UTH, isRoyal, payKey, ratio } from './rules'
import { flopRaise, preflopRaise, riverRaise } from './strategy'
import type {
  Dealer,
  Phase,
  UthAction,
  UthHand,
  UthPayout,
  UthRules,
  UthSeat,
  Street,
} from './types'

export type Beat =
  | { type: 'shuffle' }
  | { type: 'bet'; seat: number; ante: number; trips: number }
  | { type: 'sitOut'; seat: number }
  | { type: 'deal' }
  | { type: 'decision'; seat: number; street: Street; action: UthAction }
  | { type: 'flop' }
  | { type: 'turnRiver' }
  | { type: 'reveal' }
  | { type: 'settle' }
  | { type: 'roundOver' }
  | { type: 'awaitBet'; seat: number }
  | { type: 'awaitDecision'; seat: number; street: Street; actions: UthAction[] }

export interface UthOptions {
  rules?: UthRules
  seed?: number
  humanSeat?: number
  humanName?: string
  humanBankroll?: number
  bots?: Array<{ name: string; bankroll: number }>
  /** Give the human a bot brain, for tests and the edge simulator. */
  humanBot?: boolean
}

export interface LogEntry {
  round: number
  text: string
}

const SEATS = 4

export class UthGame {
  rules: UthRules
  seed: number
  rng: Rng
  deck: Card[] = []
  seats: UthSeat[] = []
  dealer: Dealer = { cards: [], revealed: false }
  board: Card[] = []
  phase: Phase = 'betting'
  round = 0
  log: LogEntry[] = []
  version = 0

  readonly humanSeat: number
  humanBot: boolean

  private listeners = new Set<() => void>()
  private paidOut = false

  constructor(opts: UthOptions = {}) {
    this.rules = opts.rules ?? DEFAULT_UTH
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.humanSeat = opts.humanSeat ?? 1
    this.humanBot = opts.humanBot ?? false

    const bots = opts.bots ?? []
    let bi = 0
    for (let i = 0; i < SEATS; i++) {
      if (i === this.humanSeat) {
        this.seats.push(makeSeat(i, opts.humanName ?? 'You', false, opts.humanBankroll ?? 1000))
      } else if (bi < bots.length) {
        const b = bots[bi++]
        this.seats.push(makeSeat(i, b.name, true, b.bankroll))
      } else {
        const s = makeSeat(i, '', true, 0)
        s.sittingOut = true
        this.seats.push(s)
      }
    }
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

  get human(): UthSeat {
    return this.seats[this.humanSeat]
  }

  private isEmpty(s: UthSeat): boolean {
    return s.name === ''
  }
  private inRound(s: UthSeat): boolean {
    return !this.isEmpty(s) && s.hand !== null
  }

  // -------------------------------------------------------------- input

  placeBet(ante: number, trips = 0): void {
    if (this.phase !== 'betting') return
    const seat = this.human
    this.commitBet(seat, ante, trips)
    this.touch()
  }

  sitOut(): void {
    if (this.phase !== 'betting') return
    this.human.sittingOut = true
    this.touch()
  }

  decide(action: UthAction): void {
    const beat = this.pending()
    if (beat?.type !== 'awaitDecision' || beat.seat !== this.humanSeat) return
    if (!beat.actions.includes(action)) return
    this.applyDecision(this.human, beat.street, action)
    this.touch()
  }

  pending(): Beat | null {
    const beat = this.peek()
    return beat && beat.type.startsWith('await') ? beat : null
  }

  // -------------------------------------------------------------- clock

  step(): Beat {
    const beat = this.advance()
    this.touch()
    return beat
  }

  runUntilInput(max = 200): Beat {
    let beat = this.advance()
    let n = 0
    while (!this.isStop(beat) && n++ < max) beat = this.advance()
    this.touch()
    return beat
  }

  playRound(max = 300): void {
    if (this.phase === 'settled') this.advance()
    let n = 0
    for (;;) {
      const beat = this.advance()
      if (beat.type === 'settle' || beat.type === 'roundOver') break
      if (beat.type.startsWith('await')) throw new Error(`playRound stuck on ${beat.type}`)
      if (n++ > max) throw new Error('playRound did not terminate')
    }
    this.touch()
  }

  private isStop(b: Beat): boolean {
    return b.type.startsWith('await') || b.type === 'settle' || b.type === 'roundOver'
  }

  private peek(): Beat | null {
    if (this.phase === 'betting') {
      const seat = this.seats.find((s) => this.needsBet(s))
      if (seat && !this.brain(seat)) return { type: 'awaitBet', seat: seat.index }
    }
    if (this.phase === 'preflop' || this.phase === 'flop' || this.phase === 'river') {
      const turn = this.nextDecision()
      if (turn && !this.brain(this.seats[turn.seat])) {
        return {
          type: 'awaitDecision',
          seat: turn.seat,
          street: turn.street,
          actions: this.legalActions(turn.street),
        }
      }
    }
    return null
  }

  // -------------------------------------------------------------- machine

  private advance(): Beat {
    switch (this.phase) {
      case 'betting':
        return this.stepBetting()
      case 'deal':
        return this.stepDeal()
      case 'preflop':
      case 'flop':
      case 'river':
        return this.stepStreet()
      case 'showdown':
        return this.stepShowdown()
      case 'settled':
        return this.stepSettled()
    }
  }

  private brain(seat: UthSeat): boolean {
    if (this.isEmpty(seat) || seat.sittingOut) return false
    return seat.index === this.humanSeat ? this.humanBot : seat.bot
  }

  private needsBet(s: UthSeat): boolean {
    return !this.isEmpty(s) && !s.sittingOut && s.hand === null
  }

  // --- betting

  private stepBetting(): Beat {
    for (const seat of this.seats) {
      if (!this.needsBet(seat)) continue
      if (!this.brain(seat)) return { type: 'awaitBet', seat: seat.index }

      const ante = this.botAnte(seat)
      if (ante < this.rules.minBet) {
        seat.sittingOut = true
        return { type: 'sitOut', seat: seat.index }
      }
      // The bots skip the Trips side bet: it carries a ~2% edge and a skilled
      // player wouldn't make it. (The human is free to.)
      this.commitBet(seat, ante, 0)
      return { type: 'bet', seat: seat.index, ante, trips: 0 }
    }

    if (!this.seats.some((s) => this.inRound(s))) return this.endRound()
    this.beginDeal()
    return this.stepDeal()
  }

  private botAnte(seat: UthSeat): number {
    const want = seat.baseUnits * this.rules.minBet
    // The ante and the blind are both posted, so a seat needs twice the ante,
    // plus a little slack, to sit down.
    return want * 2 <= seat.bankroll ? Math.min(want, this.rules.maxBet) : 0
  }

  private commitBet(seat: UthSeat, ante: number, trips: number): void {
    // The ante and the blind are always equal and both posted up front.
    const capped = Math.min(ante, this.rules.maxBet)
    seat.bankroll -= capped * 2 + trips
    seat.hand = {
      ante: capped,
      blind: capped,
      trips,
      play: 0,
      cards: [],
      folded: false,
      actedStreet: null,
    }
    seat.sittingOut = false
  }

  // --- deal

  private beginDeal(): void {
    this.phase = 'deal'
    this.round++
    this.shuffle()
    this.dealer = { cards: [], revealed: false }
    this.board = []
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

  private draw(): Card {
    if (this.deck.length === 0) this.shuffle()
    return this.deck.pop()!
  }

  private stepDeal(): Beat {
    for (const seat of this.seats) {
      if (this.inRound(seat)) seat.hand!.cards = [this.draw(), this.draw()]
    }
    this.dealer.cards = [this.draw(), this.draw()]
    // The five community cards are dealt now, face down, and revealed in stages.
    this.board = [this.draw(), this.draw(), this.draw(), this.draw(), this.draw()]

    this.phase = 'preflop'
    this.say(`Round ${this.round}. Cards out.`)
    return { type: 'deal' }
  }

  // --- the three decision streets

  private communityShown(): Card[] {
    if (this.phase === 'flop') return this.board.slice(0, 3)
    if (this.phase === 'river' || this.phase === 'showdown' || this.phase === 'settled') {
      return this.board
    }
    return []
  }

  get shownBoard(): Card[] {
    return this.communityShown()
  }

  private legalActions(street: Street): UthAction[] {
    if (street === 'preflop') return ['bet4', 'check']
    if (street === 'flop') return ['bet2', 'check']
    return ['bet1', 'fold']
  }

  /** The next seat owed a decision on the current street, or null. A seat that
   *  has already raised, or folded, is done for the whole hand. */
  private nextDecision(): { seat: number; street: Street } | null {
    const street = this.phase as Street
    for (const seat of this.seats) {
      if (!this.inRound(seat)) continue
      const h = seat.hand!
      if (h.folded || h.play > 0) continue // folded or already committed a raise
      if (h.actedStreet === street) continue // already checked on this street
      return { seat: seat.index, street }
    }
    return null
  }

  private stepStreet(): Beat {
    const turn = this.nextDecision()
    if (!turn) return this.advanceStreet()

    const seat = this.seats[turn.seat]
    if (!this.brain(seat)) {
      return {
        type: 'awaitDecision',
        seat: turn.seat,
        street: turn.street,
        actions: this.legalActions(turn.street),
      }
    }

    const action = this.botDecision(seat, turn.street)
    this.applyDecision(seat, turn.street, action)
    return { type: 'decision', seat: turn.seat, street: turn.street, action }
  }

  private botDecision(seat: UthSeat, street: Street): UthAction {
    const hole = seat.hand!.cards
    if (street === 'preflop') return preflopRaise(hole) ? 'bet4' : 'check'
    if (street === 'flop') return flopRaise(hole, this.board.slice(0, 3)) ? 'bet2' : 'check'
    return riverRaise(hole, this.board, this.rules) ? 'bet1' : 'fold'
  }

  private applyDecision(seat: UthSeat, street: Street, action: UthAction): void {
    const h = seat.hand!
    h.actedStreet = street
    const mult = action === 'bet4' ? 4 : action === 'bet2' ? 2 : action === 'bet1' ? 1 : 0

    if (action === 'fold') {
      h.folded = true
      this.say(`${seat.name} folds.`)
      return
    }
    if (mult > 0) {
      h.play = h.ante * mult
      seat.bankroll -= h.play
      this.say(`${seat.name} raises ${mult}x.`)
    } else {
      this.say(`${seat.name} checks.`)
    }
  }

  /** All seats have acted on this street: reveal the next cards, or go to the
   *  showdown when the river is done. */
  private advanceStreet(): Beat {
    if (this.phase === 'preflop') {
      this.phase = 'flop'
      return { type: 'flop' }
    }
    if (this.phase === 'flop') {
      this.phase = 'river'
      return { type: 'turnRiver' }
    }
    this.phase = 'showdown'
    return this.stepShowdown()
  }

  // --- showdown

  private stepShowdown(): Beat {
    this.dealer.revealed = true
    this.dealer.score = bestOf([...this.dealer.cards, ...this.board], {})
    // The dealer "opens" — the ante plays — on a pair or better.
    this.dealer.qualifies = this.dealer.score.category >= 1
    this.phase = 'settled'
    return { type: 'reveal' }
  }

  // --- settlement

  private stepSettled(): Beat {
    if (!this.paidOut) {
      this.settle()
      this.paidOut = true
      return { type: 'settle' }
    }
    return this.endRound()
  }

  private settle(): void {
    const dealer = this.dealer.score!
    const qualifies = this.dealer.qualifies!

    for (const seat of this.seats) {
      if (!this.inRound(seat)) continue
      const h = seat.hand!
      h.score = bestOf([...h.cards, ...this.board], {})

      const payout = this.settleHand(h, dealer, qualifies)
      h.payout = payout
      h.result = h.folded
        ? 'fold'
        : payout.ante + payout.play > h.ante + h.play
          ? 'win'
          : payout.ante + payout.play < h.ante + h.play
            ? 'lose'
            : 'push'
      seat.bankroll += payout.ante + payout.blind + payout.play + payout.trips
    }
  }

  private settleHand(h: UthHand, dealer: Score, qualifies: boolean): UthPayout {
    const player = h.score!
    const staked = h.ante + h.blind + h.play + h.trips

    // Trips always resolves, even on a fold: it's a bet on the player's own hand.
    const trips = this.settleTrips(h)

    if (h.folded) {
      // Ante, blind and play are all forfeited; only Trips can come back.
      return { ante: 0, blind: 0, play: 0, trips, net: trips - staked }
    }

    const cmp = compare(player, dealer)
    const win = cmp > 0
    const tie = cmp === 0

    // Play: always in action once made. 1:1 on a win, push on a tie.
    const play = win ? h.play * 2 : tie ? h.play : 0

    // Ante: plays only if the dealer opens. Pushes when the dealer doesn't.
    let ante: number
    if (!qualifies) ante = h.ante
    else ante = win ? h.ante * 2 : tie ? h.ante : 0

    // Blind: pays the bonus schedule on a win, but only on a straight or better;
    // a win with less than a straight pushes. Loses when the player loses.
    const blind = this.settleBlind(h, win, tie)

    const returned = ante + blind + play + trips
    return { ante, blind, play, trips, net: returned - staked }
  }

  private settleBlind(h: UthHand, win: boolean, tie: boolean): number {
    if (h.blind === 0) return 0
    if (tie) return h.blind // push
    if (!win) return 0 // lost

    const key = payKey(h.score!.category, isRoyal(h.score!.category, h.score!.tiebreak))
    const bonus = key && this.rules.blindPay[key]
    // A winning hand below a straight has no schedule entry: the blind pushes.
    if (!bonus) return h.blind
    return h.blind + h.blind * ratio(bonus)
  }

  private settleTrips(h: UthHand): number {
    if (h.trips === 0) return 0
    const key = payKey(h.score!.category, isRoyal(h.score!.category, h.score!.tiebreak))
    const bonus = key && this.rules.tripsPay[key]
    if (!bonus) return 0 // less than trips: lost
    return h.trips + h.trips * ratio(bonus)
  }

  // --- between rounds

  private endRound(): Beat {
    this.phase = 'betting'
    this.paidOut = false
    for (const seat of this.seats) {
      seat.hand = null
      if (!this.isEmpty(seat)) seat.sittingOut = false
    }
    this.dealer = { cards: [], revealed: false }
    this.board = []
    return { type: 'roundOver' }
  }

  private say(text: string): void {
    this.log.push({ round: this.round, text })
    if (this.log.length > 200) this.log.shift()
  }
}

function makeSeat(index: number, name: string, bot: boolean, bankroll: number): UthSeat {
  return {
    index,
    name,
    bot,
    bankroll,
    hand: null,
    sittingOut: false,
    baseUnits: 1,
  }
}
