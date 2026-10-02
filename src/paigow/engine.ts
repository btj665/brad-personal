// Pai Gow Poker — the table. Same shape as the other two engines: one beat per
// step(), pauses only for the human. The dealer always banks.

import { buildShoeCards } from '../engine/cards'
import { makeRng, randomSeed, type Rng } from '../engine/rng'
import { compare, score2, score5, type Score } from '../poker/eval'
import type { Card } from '../engine/types'
import { fortuneEvaluate } from './fortune'
import { houseWay } from './houseway'
import { DEFAULT_PAIGOW, fortuneKey, ratio } from './rules'
import type { Dealer, PaiGowOutcome, PaiGowRules, PaiGowSeat, Phase, Setting } from './types'

export type Beat =
  | { type: 'shuffle' }
  | { type: 'bet'; seat: number; amount: number; fortune: number }
  | { type: 'sitOut'; seat: number }
  | { type: 'deal' }
  | { type: 'set'; seat: number }
  | { type: 'reveal' }
  | { type: 'settle' }
  | { type: 'roundOver' }
  | { type: 'awaitBet'; seat: number }
  | { type: 'awaitSet'; seat: number }

export interface PaiGowOptions {
  rules?: PaiGowRules
  seed?: number
  humanSeat?: number
  humanName?: string
  humanBankroll?: number
  bots?: Array<{ name: string; bankroll: number }>
  humanBot?: boolean
}

export interface LogEntry {
  round: number
  text: string
}

const SEATS = 4

export class PaiGowGame {
  rules: PaiGowRules
  seed: number
  rng: Rng
  deck: Card[] = []
  seats: PaiGowSeat[] = []
  dealer: Dealer = { cards: [], setting: null, revealed: false }
  phase: Phase = 'betting'
  round = 0
  log: LogEntry[] = []
  version = 0

  readonly humanSeat: number
  humanBot: boolean

  private listeners = new Set<() => void>()
  private paidOut = false

  constructor(opts: PaiGowOptions = {}) {
    this.rules = opts.rules ?? DEFAULT_PAIGOW
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

  get human(): PaiGowSeat {
    return this.seats[this.humanSeat]
  }

  private isEmpty(s: PaiGowSeat): boolean {
    return s.name === ''
  }
  private inRound(s: PaiGowSeat): boolean {
    return !this.isEmpty(s) && s.hand !== null
  }
  private brain(s: PaiGowSeat): boolean {
    if (this.isEmpty(s) || s.sittingOut) return false
    return s.index === this.humanSeat ? this.humanBot : s.bot
  }

  // -------------------------------------------------------------- input

  placeBet(amount: number, fortune = 0): void {
    if (this.phase !== 'betting') return
    this.commitBet(this.human, amount, fortune)
    this.touch()
  }

  sitOut(): void {
    if (this.phase !== 'betting') return
    this.human.sittingOut = true
    this.touch()
  }

  /** The house way applied to the human's cards, offered as a suggestion. */
  suggestion(): Setting | null {
    const h = this.human.hand
    return h ? houseWay(h.cards) : null
  }

  /** Set the human's split by naming the two cards that go in the low hand. */
  setLow(lowUids: [number, number]): boolean {
    if (this.phase !== 'setting') return false
    const h = this.human.hand
    if (!h) return false
    const low = h.cards.filter((c) => lowUids.includes(c.uid))
    if (low.length !== 2) return false
    const high = h.cards.filter((c) => !lowUids.includes(c.uid))
    const s: Setting = {
      high,
      low,
      highScore: scoreHigh(high),
      lowScore: scoreLow(low),
    }
    if (compare(s.highScore, s.lowScore) < 0) return false // a foul; refuse it
    h.setting = s
    this.touch()
    return true
  }

  acceptHouseWay(): void {
    if (this.phase !== 'setting') return
    const h = this.human.hand
    if (!h) return
    h.setting = houseWay(h.cards)
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

  playRound(max = 200): void {
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
    if (this.phase === 'setting') {
      const seat = this.seats.find((s) => this.inRound(s) && !s.hand!.setting)
      if (seat && !this.brain(seat) && !seat.autoSet) return { type: 'awaitSet', seat: seat.index }
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
      case 'setting':
        return this.stepSetting()
      case 'reveal':
        return this.stepReveal()
      case 'settled':
        return this.stepSettled()
    }
  }

  private needsBet(s: PaiGowSeat): boolean {
    return !this.isEmpty(s) && !s.sittingOut && s.hand === null
  }

  private stepBetting(): Beat {
    for (const seat of this.seats) {
      if (!this.needsBet(seat)) continue
      if (!this.brain(seat)) return { type: 'awaitBet', seat: seat.index }

      const amount = this.botBet(seat)
      if (amount < this.rules.minBet) {
        seat.sittingOut = true
        return { type: 'sitOut', seat: seat.index }
      }
      this.commitBet(seat, amount, 0)
      return { type: 'bet', seat: seat.index, amount, fortune: 0 }
    }

    if (!this.seats.some((s) => this.inRound(s))) return this.endRound()
    this.beginDeal()
    return this.stepDeal()
  }

  private botBet(seat: PaiGowSeat): number {
    const want = seat.baseUnits * this.rules.minBet
    return want <= seat.bankroll ? Math.min(want, this.rules.maxBet) : 0
  }

  private commitBet(seat: PaiGowSeat, amount: number, fortune: number): void {
    const bet = Math.min(amount, this.rules.maxBet)
    seat.bankroll -= bet + fortune
    seat.hand = { bet, fortune, cards: [], setting: null }
    seat.sittingOut = false
  }

  private beginDeal(): void {
    this.phase = 'deal'
    this.round++
    this.shuffle()
    this.dealer = { cards: [], setting: null, revealed: false }
  }

  private shuffle(): void {
    this.deck = buildShoeCards(1)
    this.deck.push({ uid: 52, rank: 'A', suit: 'S', joker: true })
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1)
      const t = this.deck[i]
      this.deck[i] = this.deck[j]
      this.deck[j] = t
    }
  }

  private stepDeal(): Beat {
    for (const seat of this.seats) {
      if (this.inRound(seat)) seat.hand!.cards = this.deck.splice(0, 7)
    }
    this.dealer.cards = this.deck.splice(0, 7)
    this.phase = 'setting'
    this.say(`Round ${this.round}. Seven cards each.`)
    return { type: 'deal' }
  }

  private stepSetting(): Beat {
    // The dealer sets by the house way, always.
    if (!this.dealer.setting) this.dealer.setting = houseWay(this.dealer.cards)

    for (const seat of this.seats) {
      if (!this.inRound(seat) || seat.hand!.setting) continue
      const isHuman = seat.index === this.humanSeat && !this.brain(seat)
      if (isHuman && !seat.autoSet) return { type: 'awaitSet', seat: seat.index }
      // Bots, and a human on auto, take the house way.
      seat.hand!.setting = houseWay(seat.hand!.cards)
      return { type: 'set', seat: seat.index }
    }

    this.phase = 'reveal'
    return this.stepReveal()
  }

  private stepReveal(): Beat {
    this.dealer.revealed = true
    this.phase = 'settled'
    return { type: 'reveal' }
  }

  private stepSettled(): Beat {
    if (!this.paidOut) {
      this.settle()
      this.paidOut = true
      return { type: 'settle' }
    }
    return this.endRound()
  }

  private settle(): void {
    const dealer = this.dealer.setting!

    // Fortune envy scans everyone's big hands first, so a table hit pays around.
    const envyPool = this.collectEnvy()

    for (const seat of this.seats) {
      if (!this.inRound(seat)) continue
      const h = seat.hand!
      const s = h.setting!

      const highCmp = compare(s.highScore, dealer.highScore)
      const lowCmp = compare(s.lowScore, dealer.lowScore)
      // Ties (copies) go to the dealer.
      const wonHigh = highCmp > 0
      const wonLow = lowCmp > 0

      let outcome: PaiGowOutcome
      let returned = 0
      let commissionPaid = 0
      if (wonHigh && wonLow) {
        outcome = 'win'
        commissionPaid = h.bet * this.rules.commission
        returned = h.bet + (h.bet - commissionPaid)
      } else if (!wonHigh && !wonLow) {
        outcome = 'lose'
        returned = 0
      } else {
        outcome = 'push'
        returned = h.bet
      }

      h.outcome = outcome
      h.returned = returned
      h.commissionPaid = commissionPaid
      h.fortuneReturned = this.settleFortune(seat, envyPool)
      seat.bankroll += returned + h.fortuneReturned

      this.say(`${seat.name}: ${outcome}.`)
    }
  }

  /** Each seat's own Fortune win, plus any envy owed from other seats' big hands.
   *  `envyPool` maps a big-hand key to how many envy payouts it triggers. */
  private settleFortune(seat: PaiGowSeat, envyPool: Array<{ key: string; from: number }>): number {
    const h = seat.hand!
    if (h.fortune === 0) return 0

    const fh = fortuneEvaluate(h.cards)
    const key = fortuneKey(fh.score.category, fh)
    let total = 0

    if (key && this.rules.fortunePay[key]) {
      total += h.fortune + h.fortune * ratio(this.rules.fortunePay[key])
    }

    // Envy: if this seat bet at least the minimum, it collects on others' hits.
    if (h.fortune >= this.rules.fortuneEnvyMin) {
      for (const hit of envyPool) {
        if (hit.from === seat.index) continue
        total += this.rules.fortuneEnvy[hit.key] ?? 0
      }
    }
    return total
  }

  private collectEnvy(): Array<{ key: string; from: number }> {
    const hits: Array<{ key: string; from: number }> = []
    for (const seat of this.seats) {
      if (!this.inRound(seat) || seat.hand!.fortune === 0) continue
      const fh = fortuneEvaluate(seat.hand!.cards)
      const key = fortuneKey(fh.score.category, fh)
      if (key && this.rules.fortuneEnvy[key] != null) hits.push({ key, from: seat.index })
    }
    return hits
  }

  private endRound(): Beat {
    this.phase = 'betting'
    this.paidOut = false
    for (const seat of this.seats) {
      seat.hand = null
      if (!this.isEmpty(seat)) seat.sittingOut = false
    }
    this.dealer = { cards: [], setting: null, revealed: false }
    return { type: 'roundOver' }
  }

  private say(text: string): void {
    this.log.push({ round: this.round, text })
    if (this.log.length > 200) this.log.shift()
  }
}

function makeSeat(index: number, name: string, bot: boolean, bankroll: number): PaiGowSeat {
  return {
    index,
    name,
    bot,
    bankroll,
    hand: null,
    sittingOut: false,
    baseUnits: 1,
    autoSet: true,
  }
}

const OPTS = { wheelHigh: true }
function scoreHigh(cards: Card[]): Score {
  return score5(cards, OPTS)
}
function scoreLow(cards: Card[]): Score {
  return score2(cards, OPTS)
}
