// The poker table.
//
// One state machine plays every variant. A hand is: post the forced bets, then
// walk the variant's deal steps — dealing cards and running a betting round after
// each — until the cards run out or everyone but one has folded, then a showdown
// and the pots are awarded. Nothing here knows what Hold'em or Omaha is; it reads
// the shape of the hand off the `Variant` and the value of a hand off the
// injected ranker.
//
// It advances one Beat per `step()`, pausing only when it needs the human — the
// same clock every other table in this project runs on.

import { buildShoeCards } from '../engine/cards'
import { makeRng, randomSeed, type Rng } from '../engine/rng'
import type { Card } from '../engine/types'
import { splitPot } from './pots'
import type {
  Action,
  Beat,
  BotProfile,
  DealStep,
  HeldCard,
  Options,
  Seat,
  Street,
  Variant,
} from './types'

/** Ranks a seat's hand from its private cards and the board, per the variant.
 *  Injected so the engine has no dependency on the evaluator's shape and the
 *  bots and the engine score hands identically. */
export interface HandRanker {
  score(
    hole: Card[],
    board: Card[],
    variant: Variant,
  ): { rank: number; best: Card[]; name: string }
}

/** How a bot seat decides. Injected; the real brain lives in bot.ts, and a
 *  minimal one keeps the engine runnable and testable on its own. */
export type BotBrain = (game: PokerGame, seat: Seat, options: Options) => Action

/** What a bot discards in a draw game. Injected alongside the brain. */
export type BotDraw = (game: PokerGame, seat: Seat) => number[]

export interface PokerOptions {
  variant: Variant
  ranker: HandRanker
  brain?: BotBrain
  botDraw?: BotDraw
  seed?: number
  bigBlind?: number
  buyIn?: number
  humanSeat?: number
  humanName?: string
  seats?: number
  bots?: Array<{ name: string; profile: BotProfile }>
}

const DEFAULT_PROFILE: BotProfile = { looseness: 0.4, aggression: 0.3, bluff: 0.05, quips: [] }

export class PokerGame {
  variant: Variant
  ranker: HandRanker
  brain: BotBrain
  botDraw: BotDraw
  seed: number
  rng: Rng
  seats: Seat[] = []
  board: Card[] = []
  deck: Card[] = []
  button = -1
  hand = 0
  pot = 0
  bigBlind: number
  smallBlind: number
  currentBet = 0
  minRaise = 0
  street: Street = 'preflop'
  version = 0
  log: string[] = []

  private dealIndex = 0
  private toAct = -1
  private drawSeat = -1
  private drawn = new Set<number>()
  private queue: Beat[] = []
  private phase: 'idle' | 'betting' | 'draw' | 'showdown' | 'over' = 'idle'
  private listeners = new Set<() => void>()
  readonly humanSeat: number

  constructor(opts: PokerOptions) {
    this.variant = opts.variant
    this.ranker = opts.ranker
    this.brain = opts.brain ?? defaultBrain
    this.botDraw = opts.botDraw ?? (() => [])
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bigBlind = opts.bigBlind ?? 20
    this.smallBlind = Math.max(1, Math.floor(this.bigBlind / 2))
    this.humanSeat = opts.humanSeat ?? 0

    const n = opts.seats ?? Math.min(6, (opts.bots?.length ?? 4) + 1)
    const buyIn = opts.buyIn ?? this.bigBlind * 100
    const bots = opts.bots ?? []
    let bi = 0
    for (let i = 0; i < n; i++) {
      const human = i === this.humanSeat
      this.seats.push({
        index: i,
        name: human ? (opts.humanName ?? 'You') : (bots[bi]?.name ?? `Seat ${i}`),
        bot: human ? null : (bots[bi++]?.profile ?? DEFAULT_PROFILE),
        stack: buyIn,
        cards: [],
        discarded: [],
        folded: false,
        allIn: false,
        sittingOut: false,
        committed: 0,
        streetCommitted: 0,
        actedThisStreet: false,
        canReopen: false,
      })
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
  get human(): Seat {
    return this.seats[this.humanSeat]
  }
  private say(text: string) {
    this.log.push(text)
    if (this.log.length > 200) this.log.shift()
  }

  // -------------------------------------------------------------- helpers

  /** Seats still able to win the pot: dealt in and not folded. */
  private contenders(): Seat[] {
    return this.seats.filter((s) => !s.folded && !s.sittingOut && (s.cards.length > 0 || s.committed > 0))
  }
  /** Seats that can still put chips in: a contender who isn't all-in. */
  private canAct(s: Seat): boolean {
    return !s.folded && !s.allIn && !s.sittingOut && s.cards.length > 0
  }

  private shuffle() {
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

  private nextOccupied(from: number): number {
    for (let k = 1; k <= this.seats.length; k++) {
      const i = (from + k) % this.seats.length
      if (this.seats[i].stack > 0 && !this.seats[i].sittingOut) return i
    }
    return from
  }
  private nextIn(from: number): number {
    for (let k = 1; k <= this.seats.length; k++) {
      const i = (from + k) % this.seats.length
      if (this.canAct(this.seats[i])) return i
    }
    return -1
  }
  private seatsFromButton(): Seat[] {
    const out: Seat[] = []
    for (let k = 1; k <= this.seats.length; k++) out.push(this.seats[(this.button + k) % this.seats.length])
    return out
  }

  // -------------------------------------------------------------- the hand

  /** Begin a hand. Anyone who can't post is sat out. */
  startHand(): void {
    this.hand++
    this.board = []
    this.pot = 0
    this.dealIndex = 0
    this.log = []
    this.drawn.clear()
    this.shuffle()

    for (const s of this.seats) {
      s.cards = []
      s.discarded = []
      s.folded = false
      s.allIn = false
      s.committed = 0
      s.streetCommitted = 0
      s.actedThisStreet = false
      s.canReopen = false
      s.showdown = undefined
      s.sittingOut = s.stack <= 0
    }

    this.button = this.nextOccupied(this.button < 0 ? this.seats.length - 1 : this.button)
    this.queue = [{ type: 'handStart', hand: this.hand, button: this.button }]

    this.postForced()
    this.dealStep(this.variant.deal[0])
    this.dealIndex = 1
    this.street = this.streetName(0)
    this.openBetting(this.firstToActPreflop())
    this.phase = 'betting'
    this.touch()
  }

  private streetName(dealIdx: number): Street {
    if (this.variant.family === 'holdem' || this.variant.family === 'omaha') {
      return (['preflop', 'flop', 'turn', 'river'] as const)[dealIdx] ?? `street-${dealIdx}`
    }
    return dealIdx === 0 ? 'preflop' : `street-${dealIdx}`
  }

  private postForced(): void {
    if (this.variant.forced === 'blinds') {
      const sb = this.nextOccupied(this.button)
      const bb = this.nextOccupied(sb)
      this.postChips(this.seats[sb], this.smallBlind, 'small')
      this.postChips(this.seats[bb], this.bigBlind, 'big')
      this.currentBet = this.bigBlind
      this.minRaise = this.bigBlind
    } else {
      const ante = Math.max(1, Math.floor(this.smallBlind / 2))
      for (const s of this.seats) if (s.stack > 0 && !s.sittingOut) this.postChips(s, ante, 'ante')
      this.currentBet = 0
      this.minRaise = this.bigBlind
    }
  }

  private postChips(s: Seat, want: number, blind: 'small' | 'big' | 'ante' | 'bringIn'): void {
    const amt = Math.min(want, s.stack)
    s.stack -= amt
    s.committed += amt
    s.streetCommitted += amt
    this.pot += amt
    if (s.stack === 0) s.allIn = true
    this.queue.push({ type: 'post', seat: s.index, amount: amt, blind })
  }

  private dealStep(step: DealStep): void {
    if (step.kind === 'hole' || step.kind === 'up') {
      for (let c = 0; c < step.count; c++) {
        for (const s of this.seatsFromButton()) {
          if (s.folded || s.sittingOut || s.stack < 0) continue
          if (s.stack === 0 && s.committed === 0) continue
          s.cards.push({ card: this.draw(), faceUp: step.kind === 'up' })
        }
      }
    } else if (step.kind === 'community') {
      for (let c = 0; c < step.count; c++) this.board.push(this.draw())
    }
    this.queue.push({ type: 'deal', step })
  }

  private firstToActPreflop(): number {
    if (this.variant.forced === 'blinds') {
      const sb = this.nextOccupied(this.button)
      const bb = this.nextOccupied(sb)
      return this.nextIn(bb)
    }
    return this.nextIn(this.button)
  }

  // -------------------------------------------------------------- betting

  private openBetting(first: number): void {
    for (const s of this.seats) {
      if (this.canAct(s)) {
        s.actedThisStreet = false
        s.canReopen = true
      }
    }
    this.toAct = first >= 0 ? first : this.nextIn(this.button)
    this.queue.push({ type: 'street', street: this.street })
  }

  options(seat: number): Options {
    const s = this.seats[seat]
    const toCall = Math.max(0, this.currentBet - s.streetCommitted)
    const callAmount = Math.min(toCall, s.stack)
    const canCheck = toCall === 0
    const opening = this.currentBet === 0

    let minTo = 0
    let maxTo = 0
    if (s.stack > toCall) {
      const allInTo = s.streetCommitted + s.stack
      if (this.variant.limit === 'fixedLimit') {
        const size = this.betSize()
        minTo = maxTo = Math.min(this.currentBet + size, allInTo)
      } else if (this.variant.limit === 'potLimit') {
        const potAfterCall = this.pot + toCall
        minTo = Math.min(opening ? this.bigBlind : this.currentBet + this.minRaise, allInTo)
        maxTo = Math.min(this.currentBet + potAfterCall, allInTo)
      } else {
        minTo = Math.min(opening ? this.bigBlind : this.currentBet + this.minRaise, allInTo)
        maxTo = allInTo
      }
    }

    return {
      seat,
      canFold: toCall > 0,
      canCheck,
      callAmount,
      canBet: opening && s.stack > 0,
      canRaise: !opening && s.canReopen && s.stack > toCall,
      minTo,
      maxTo,
    }
  }

  private betSize(): number {
    const streets = this.variant.deal.length
    const early = this.dealIndex <= Math.ceil(streets / 2)
    return early ? this.bigBlind : this.bigBlind * 2
  }

  act(action: Action): void {
    if (this.phase !== 'betting' || this.toAct < 0) return
    if (this.toAct === this.humanSeat || this.seats[this.toAct].bot) {
      this.applyAction(this.seats[this.toAct], action)
      this.touch()
    }
  }

  private applyAction(s: Seat, action: Action): void {
    const opt = this.options(s.index)
    const toCall = Math.max(0, this.currentBet - s.streetCommitted)
    s.actedThisStreet = true

    if (action.kind === 'fold') {
      s.folded = true
      this.say(`${s.name} folds.`)
      this.queue.push({ type: 'action', seat: s.index, action, total: s.committed })
    } else if (action.kind === 'check' && opt.canCheck) {
      s.canReopen = false
      this.say(`${s.name} checks.`)
      this.queue.push({ type: 'action', seat: s.index, action, total: s.committed })
    } else if (action.kind === 'call' || action.kind === 'check') {
      const pay = Math.min(toCall, s.stack)
      this.commit(s, pay)
      s.canReopen = false
      this.say(pay > 0 ? `${s.name} calls ${pay}.` : `${s.name} checks.`)
      this.queue.push({ type: 'action', seat: s.index, action: { kind: 'call' }, total: s.committed })
    } else {
      // bet or raise, sized by `to`, clamped to legal.
      const wanted = action.to ?? opt.minTo
      const to = Math.max(opt.minTo, Math.min(wanted, opt.maxTo))
      const increment = to - this.currentBet
      const fullRaise = increment >= this.minRaise
      this.commit(s, to - s.streetCommitted)
      if (fullRaise) {
        this.minRaise = increment
        for (const other of this.seats) {
          if (other !== s && this.canAct(other)) {
            other.actedThisStreet = false
            other.canReopen = true
          }
        }
      }
      this.currentBet = Math.max(this.currentBet, s.streetCommitted)
      s.canReopen = false
      const bet = opt.canBet
      this.say(`${s.name} ${bet ? 'bets' : 'raises to'} ${s.streetCommitted}.`)
      this.queue.push({
        type: 'action',
        seat: s.index,
        action: { kind: bet ? 'bet' : 'raise', to: s.streetCommitted },
        total: s.committed,
      })
    }

    this.advanceAfterAction()
  }

  private commit(s: Seat, chips: number): void {
    const amt = Math.max(0, Math.min(chips, s.stack))
    s.stack -= amt
    s.committed += amt
    s.streetCommitted += amt
    this.pot += amt
    if (s.stack === 0) s.allIn = true
  }

  private needsToAct(s: Seat): boolean {
    return this.canAct(s) && (!s.actedThisStreet || s.streetCommitted < this.currentBet)
  }

  private advanceAfterAction(): void {
    if (this.contenders().length === 1) {
      this.endHand()
      return
    }
    const next = this.nextToAct(this.toAct)
    if (next >= 0) {
      this.toAct = next
      return
    }
    this.closeStreet()
  }

  private nextToAct(from: number): number {
    for (let k = 1; k <= this.seats.length; k++) {
      const i = (from + k) % this.seats.length
      if (this.needsToAct(this.seats[i])) return i
    }
    return -1
  }

  private closeStreet(): void {
    for (const s of this.seats) s.streetCommitted = 0
    this.currentBet = 0
    this.minRaise = this.bigBlind

    if (this.dealIndex >= this.variant.deal.length) {
      this.goToShowdown()
      return
    }

    const step = this.variant.deal[this.dealIndex]
    this.dealIndex++
    this.street = this.streetName(this.dealIndex - 1)

    if (step.kind === 'draw') {
      this.phase = 'draw'
      this.beginDraw()
      return
    }

    this.dealStep(step)

    // If at most one contender can still bet, run the rest out with no betting.
    const canStillBet = this.contenders().filter((s) => !s.allIn)
    if (canStillBet.length <= 1) {
      if (this.dealIndex < this.variant.deal.length) this.closeStreet()
      else this.goToShowdown()
      return
    }
    this.openBetting(this.nextIn(this.button))
    this.phase = 'betting'
  }

  // --- the draw round (five-card draw)

  private beginDraw(): void {
    this.drawn.clear()
    this.drawSeat = this.nextIn(this.button)
    this.pumpDraw()
  }
  private pumpDraw(): void {
    // Find the next contender who hasn't drawn yet.
    if (this.drawSeat < 0 || this.drawn.has(this.drawSeat) || !this.canAct(this.seats[this.drawSeat])) {
      this.drawSeat = this.nextUndrawn()
    }
    if (this.drawSeat < 0) {
      this.afterDraw()
      return
    }
    this.queue.push({ type: 'awaitDraw', seat: this.drawSeat })
  }
  private nextUndrawn(): number {
    for (const s of this.seatsFromButton()) {
      if (this.canAct(s) && !this.drawn.has(s.index)) return s.index
    }
    return -1
  }

  /** Discard these indices from the seat on the clock and draw replacements. */
  applyDraw(discardIdx: number[]): void {
    const s = this.seats[this.drawSeat]
    if (!s) return
    const keep: HeldCard[] = []
    for (let i = 0; i < s.cards.length; i++) {
      if (discardIdx.includes(i)) s.discarded.push(s.cards[i].card)
      else keep.push(s.cards[i])
    }
    const want = s.cards.length - keep.length
    for (let i = 0; i < want; i++) keep.push({ card: this.draw(), faceUp: false })
    s.cards = keep
    this.drawn.add(s.index)
    this.say(`${s.name} draws ${discardIdx.length}.`)
    this.drawSeat = this.nextUndrawn()
    if (this.drawSeat < 0) this.afterDraw()
    else this.pumpDraw()
    this.touch()
  }
  private afterDraw(): void {
    this.openBetting(this.nextIn(this.button))
    this.phase = 'betting'
  }

  // -------------------------------------------------------------- showdown

  private goToShowdown(): void {
    this.phase = 'showdown'
    this.queue.push({ type: 'showdown' })
    for (const s of this.contenders()) {
      const r = this.ranker.score(s.cards.map((c) => c.card), this.board, this.variant)
      s.showdown = { best: r.best, name: r.name }
    }
    this.awardPots()
    this.finish()
  }

  private endHand(): void {
    this.phase = 'showdown'
    this.awardPots()
    this.finish()
  }

  private awardPots(): void {
    const committed = new Map<number, number>()
    for (const s of this.seats) if (s.committed > 0) committed.set(s.index, s.committed)
    const foldedSet = new Set(this.seats.filter((s) => s.folded).map((s) => s.index))
    const { pots, refunds } = splitPot(committed, foldedSet)

    for (const [seat, amt] of refunds) {
      this.seats[seat].stack += amt
      if (amt > 0) this.say(`${this.seats[seat].name} takes back ${amt} uncalled.`)
    }

    pots.forEach((pot, i) => {
      const scored = pot.eligible
        .filter((idx) => !this.seats[idx].folded)
        .map((idx) => ({
          idx,
          rank: this.ranker.score(this.seats[idx].cards.map((c) => c.card), this.board, this.variant).rank,
        }))
      if (scored.length === 0) return
      const best = Math.max(...scored.map((x) => x.rank))
      const winners = scored.filter((x) => x.rank === best).map((x) => x.idx)
      const share = Math.floor(pot.amount / winners.length)
      let remainder = pot.amount - share * winners.length
      // Odd chip to the first winner left of the button, the house rule.
      for (const w of this.orderFromButton(winners)) {
        const give = share + (remainder > 0 ? 1 : 0)
        if (remainder > 0) remainder--
        this.seats[w].stack += give
        this.queue.push({ type: 'award', seat: w, amount: give, pot: i })
        this.say(`${this.seats[w].name} wins ${give}${pots.length > 1 ? ` (pot ${i + 1})` : ''}.`)
      }
    })
  }

  private orderFromButton(seatIdx: number[]): number[] {
    const set = new Set(seatIdx)
    return this.seatsFromButton().map((s) => s.index).filter((i) => set.has(i))
  }

  private finish(): void {
    this.queue.push({ type: 'handOver' })
    this.phase = 'over'
  }

  // -------------------------------------------------------------- clock

  pending(): Beat | null {
    if (this.queue.length > 0) return null
    if (this.phase === 'betting' && this.toAct === this.humanSeat && this.canAct(this.human)) {
      return { type: 'awaitAction', options: this.options(this.humanSeat) }
    }
    if (this.phase === 'draw' && this.drawSeat === this.humanSeat && this.canAct(this.human)) {
      return { type: 'awaitDraw', seat: this.humanSeat }
    }
    return null
  }

  /** Advance one beat: drain narration, play a bot, or surface the human's turn. */
  step(): Beat {
    if (this.queue.length > 0) {
      const b = this.queue.shift()!
      this.touch()
      return b
    }
    const pend = this.pending()
    if (pend) return pend

    if (this.phase === 'betting' && this.toAct >= 0) {
      const s = this.seats[this.toAct]
      if (s.bot && this.canAct(s)) {
        this.applyAction(s, this.brain(this, s, this.options(s.index)))
        return this.step()
      }
    }
    if (this.phase === 'draw' && this.drawSeat >= 0) {
      const s = this.seats[this.drawSeat]
      if (s.bot) {
        this.applyDraw(this.botDraw(this, s))
        return this.step()
      }
    }
    return { type: 'handOver' }
  }

  get over(): boolean {
    return this.phase === 'over'
  }

  /** Play a whole hand with no pauses — for the bot-vs-bot equity/accounting
   *  simulations. Throws if it stalls waiting on a human. */
  playOut(max = 2000): void {
    let n = 0
    while (!this.over && n++ < max) this.step()
    if (!this.over) throw new Error('hand did not terminate')
  }
}

/** A placeholder brain so the engine runs and tests on its own. Replaced by
 *  bot.ts, which plays real poker. */
const defaultBrain: BotBrain = (_game, seat, opt) => {
  if (opt.canCheck) return { kind: 'check' }
  if (opt.callAmount <= seat.stack * 0.15) return { kind: 'call' }
  return { kind: 'fold' }
}
