// The table. A synchronous, deterministic state machine.
//
// The engine never sleeps and never schedules anything: it advances exactly one
// beat per `step()` call and hands back a Beat describing what happened. The UI
// calls `step()` on a timer to get casino pacing; the tests and the simulator
// call it in a tight loop. Same code, same results, from the same seed.

import { isTenValue } from './cards'
import { evaluate, isBlackjack, isBusted, isCharlie, isResolved, makeHand } from './hand'
import { makeRng, randomSeed, type Rng } from './rng'
import {
  DEFAULT_RULES,
  blackjackWinnings,
  isFreeDouble,
  isFreeSplit,
  legalActions,
  ratio,
  spanishBonus,
  wagerUnit,
} from './rules'
import { Shoe } from './shoe'
import { botAction, botBet, botInsurance } from './strategy/bot'
import { Counter } from './strategy/count'
import type {
  Action,
  BotProfile,
  Card,
  Dealer,
  Hand,
  Outcome,
  Phase,
  RuleSet,
  Seat,
  Turn,
} from './types'

export type Beat =
  | { type: 'shuffle' }
  | { type: 'bet'; seat: number; amount: number }
  | { type: 'sitOut'; seat: number }
  | { type: 'deal'; seat: number | 'dealer'; hand: number; card: Card; faceDown: boolean }
  | { type: 'insurance'; seat: number; amount: number }
  | { type: 'evenMoney'; seat: number }
  | { type: 'peek'; blackjack: boolean }
  | { type: 'action'; seat: number; hand: number; action: Action }
  | { type: 'revealHole' }
  | { type: 'dealerDraw'; card: Card }
  | { type: 'settle' }
  | { type: 'roundOver' }
  // The engine is waiting on the human. It will keep returning these until the
  // corresponding method is called.
  | { type: 'awaitBet'; seat: number }
  | { type: 'awaitInsurance'; seat: number; evenMoney: boolean }
  | { type: 'awaitEarlySurrender'; seat: number }
  | { type: 'awaitAction'; seat: number; hand: number; actions: Action[] }

export interface GameOptions {
  rules?: RuleSet
  seed?: number
  /** Which chair the human sits in, 0 (first base) to 4 (third base). */
  humanSeat?: number
  humanName?: string
  humanBankroll?: number
  /** The other chairs. Fewer than four leaves empty seats. */
  bots?: Array<{ name: string; profile: BotProfile; bankroll: number }>
  /** Give the human a bot brain — used by the tests and the simulator to play
   *  full rounds without a UI. */
  humanBot?: BotProfile | null
}

export interface LogEntry {
  round: number
  text: string
}

export class Game {
  rules: RuleSet
  seed: number
  rng: Rng
  shoe: Shoe
  counter = new Counter()

  seats: Seat[] = []
  dealer: Dealer = { cards: [], holeRevealed: false }
  phase: Phase = 'betting'
  round = 0
  log: LogEntry[] = []
  /** Bumped on every mutation, so React can subscribe with useSyncExternalStore. */
  version = 0

  readonly humanSeat: number
  humanBot: BotProfile | null

  /** Cards still to come out during the deal, built once when dealing starts. */
  private dealQueue: Array<{ seat: number | 'dealer'; faceDown: boolean }> = []
  private holeCounted = false
  private pendingShuffle = false
  /** Guards the settled phase so a second step() can't pay the round twice. */
  private paidOut = false
  private listeners = new Set<() => void>()

  constructor(opts: GameOptions = {}) {
    this.rules = opts.rules ?? DEFAULT_RULES
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.shoe = new Shoe(this.rules, this.rng)
    this.humanSeat = opts.humanSeat ?? 2
    this.humanBot = opts.humanBot ?? null

    const bots = opts.bots ?? []
    let botIndex = 0
    for (let i = 0; i < 5; i++) {
      if (i === this.humanSeat) {
        this.seats.push(
          makeSeat(i, opts.humanName ?? 'You', null, opts.humanBankroll ?? 1000),
        )
      } else if (botIndex < bots.length) {
        const bot = bots[botIndex++]
        this.seats.push(makeSeat(i, bot.name, bot.profile, bot.bankroll))
      } else {
        // An empty chair: present, but never bets.
        const seat = makeSeat(i, '', null, 0)
        seat.busted = true
        seat.sittingOut = true
        this.seats.push(seat)
      }
    }
  }

  // -------------------------------------------------------------- subscription

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion = (): number => this.version

  private touch(): void {
    this.version++
    for (const fn of this.listeners) fn()
  }

  // -------------------------------------------------------------- accessors

  get human(): Seat {
    return this.seats[this.humanSeat]
  }

  /** An empty chair — nobody is sitting there at all. */
  isEmpty(seat: Seat): boolean {
    return seat.name === ''
  }

  /** A seat that is actually in the round. */
  private isLive(seat: Seat): boolean {
    return !this.isEmpty(seat) && !seat.sittingOut && seat.hands.length > 0
  }

  get upcard(): Card | null {
    return this.dealer.cards[0] ?? null
  }

  /** Whose hand is on the clock. Derived, never cached: a stale copy of this is
   *  how you end up rejecting the player's own input because a bot moved last. */
  get turn(): Turn | null {
    return this.phase === 'playing' ? this.nextTurn() : null
  }

  get trueCount(): number {
    return this.counter.true(this.shoe.decksRemaining)
  }

  /** The bot brain driving a seat, if any. The human seat may have one in tests. */
  private brainFor(seat: Seat): BotProfile | null {
    if (seat.index === this.humanSeat) return this.humanBot
    return seat.bot
  }

  private ctx() {
    return { rules: this.rules, trueCount: this.trueCount }
  }

  // -------------------------------------------------------------- human input

  placeBet(amount: number): void {
    if (this.phase !== 'betting') return
    const seat = this.human
    const bet = Math.min(amount, seat.bankroll, this.rules.maxBet)
    if (bet < this.rules.minBet) return
    this.commitBet(seat, bet)
    this.touch()
  }

  sitOut(): void {
    if (this.phase !== 'betting') return
    this.human.sittingOut = true
    this.say(`${this.human.name} sits this one out.`)
    this.touch()
  }

  takeInsurance(yes: boolean): void {
    if (this.phase !== 'insurance') return
    const seat = this.human
    if (seat.insuranceDecided) return
    this.decideInsurance(seat, yes)
    this.touch()
  }

  /** Even money is offered to a natural facing an ace; it is the same wager as
   *  insurance, settled immediately at 1:1. */
  takeEvenMoney(yes: boolean): void {
    if (this.phase !== 'insurance') return
    const seat = this.human
    if (seat.insuranceDecided) return
    seat.insuranceDecided = true
    if (yes) {
      seat.tookEvenMoney = true
      this.say(`${seat.name} takes even money.`)
    }
    this.touch()
  }

  earlySurrenderDecision(yes: boolean): void {
    if (this.phase !== 'earlySurrender') return
    const seat = this.human
    if (seat.earlySurrenderDecided) return
    seat.earlySurrenderDecided = true
    if (yes) {
      seat.hands[0].surrendered = true
      this.say(`${seat.name} surrenders early.`)
    }
    this.touch()
  }

  act(action: Action): void {
    const turn = this.turn
    if (!turn || turn.seat !== this.humanSeat) return

    const seat = this.seats[turn.seat]
    const hand = seat.hands[turn.hand]
    // A hand still owed its second card from a split isn't ready for a decision.
    if (hand.cards.length < 2) return
    if (!legalActions(hand, seat, this.rules).includes(action)) return

    this.applyAction(seat, hand, turn.hand, action)
    this.touch()
  }

  /** What the engine is waiting on, or null if it can advance on its own. */
  pending(): Beat | null {
    const beat = this.peekBeat()
    return beat && beat.type.startsWith('await') ? beat : null
  }

  // -------------------------------------------------------------- the clock

  /** Advance the game by one beat. Safe to call in a loop; it will keep
   *  returning the same `await*` beat until the human answers. */
  step(): Beat {
    const beat = this.advance()
    this.touch()
    return beat
  }

  /** True once the round is paid and the table is waiting to be cleared. The
   *  hands are still on the felt, with their outcomes on them. */
  private isStop(beat: Beat): boolean {
    return beat.type.startsWith('await') || beat.type === 'settle' || beat.type === 'roundOver'
  }

  /** Run to the next point where a human decision is needed, or to the end of
   *  the round. Used by the tests, the simulator, and the UI. */
  runUntilInput(maxBeats = 500): Beat {
    let beat = this.advance()
    let n = 0
    while (!this.isStop(beat) && n++ < maxBeats) beat = this.advance()
    this.touch()
    return beat
  }

  /** Play a whole round with no human input, and stop with the settled hands
   *  still on the table. Requires a `humanBot`. The next call clears them. */
  playRound(maxBeats = 500): void {
    if (this.phase === 'settled') this.advance() // clear the previous round
    let n = 0
    for (;;) {
      const beat = this.advance()
      if (beat.type === 'settle' || beat.type === 'roundOver') break
      if (beat.type.startsWith('await')) {
        throw new Error(`playRound needs a humanBot: stuck on ${beat.type}`)
      }
      if (n++ > maxBeats) throw new Error('playRound did not terminate')
    }
    this.touch()
  }

  /** Non-mutating look at what the next beat would be. Only used by pending(). */
  private peekBeat(): Beat | null {
    switch (this.phase) {
      case 'betting': {
        const seat = this.seats.find((s) => this.needsBet(s))
        if (seat && !this.brainFor(seat)) return { type: 'awaitBet', seat: seat.index }
        return null
      }
      case 'insurance': {
        const seat = this.seats.find((s) => this.isLive(s) && !s.insuranceDecided)
        if (seat && !this.brainFor(seat)) {
          return {
            type: 'awaitInsurance',
            seat: seat.index,
            evenMoney: this.rules.evenMoney && isBlackjack(seat.hands[0]),
          }
        }
        return null
      }
      case 'earlySurrender': {
        const seat = this.seats.find((s) => this.isLive(s) && !s.earlySurrenderDecided)
        if (seat && !this.brainFor(seat)) {
          return { type: 'awaitEarlySurrender', seat: seat.index }
        }
        return null
      }
      case 'playing': {
        const turn = this.nextTurn()
        if (!turn) return null
        const seat = this.seats[turn.seat]
        const hand = seat.hands[turn.hand]
        // A freshly split hand is owed a card before anyone decides anything.
        if (hand.cards.length < 2) return null
        if (this.brainFor(seat)) return null
        return {
          type: 'awaitAction',
          seat: turn.seat,
          hand: turn.hand,
          actions: legalActions(hand, seat, this.rules),
        }
      }
      default:
        return null
    }
  }

  // -------------------------------------------------------------- the machine

  private advance(): Beat {
    switch (this.phase) {
      case 'betting':
        return this.stepBetting()
      case 'dealing':
        return this.stepDealing()
      case 'insurance':
        return this.stepInsurance()
      case 'earlySurrender':
        return this.stepEarlySurrender()
      case 'playing':
        return this.stepPlaying()
      case 'dealer':
        return this.stepDealer()
      case 'settled':
        return this.stepSettled()
    }
  }

  // --- betting

  private needsBet(seat: Seat): boolean {
    return !this.isEmpty(seat) && !seat.sittingOut && seat.hands.length === 0 && !seat.busted
  }

  private stepBetting(): Beat {
    // The cut card came out last round: shuffle before anyone bets. The counter
    // goes back to zero with the new shoe.
    if (this.pendingShuffle) {
      this.pendingShuffle = false
      this.shoe.shuffle()
      this.counter.reset()
      this.say('Shuffle. New shoe.')
      return { type: 'shuffle' }
    }

    for (const seat of this.seats) {
      if (!this.needsBet(seat)) continue

      const brain = this.brainFor(seat)
      if (!brain) return { type: 'awaitBet', seat: seat.index }

      const amount = botBet(brain, seat, this.ctx())
      if (amount < this.rules.minBet) {
        seat.sittingOut = true
        seat.busted = seat.bankroll < this.rules.minBet
        this.say(`${seat.name} is out.`)
        return { type: 'sitOut', seat: seat.index }
      }
      this.commitBet(seat, amount)
      return { type: 'bet', seat: seat.index, amount }
    }

    // Everyone has bet or passed. An empty table just rolls into the next round.
    if (!this.seats.some((s) => this.isLive(s))) return this.endRound()

    this.beginDeal()
    return this.stepDealing()
  }

  private commitBet(seat: Seat, amount: number): void {
    seat.bankroll -= amount
    seat.baseBet = amount
    seat.hands = [makeHand(`${seat.index}-0`, [], amount)]
    seat.sittingOut = false
  }

  // --- dealing

  private beginDeal(): void {
    this.phase = 'dealing'
    this.round++
    this.dealer = { cards: [], holeRevealed: false }
    this.holeCounted = false
    this.dealQueue = []

    const live = this.seats.filter((s) => this.isLive(s))

    // First pass: one card face up to every player, then the dealer's upcard.
    for (const seat of live) this.dealQueue.push({ seat: seat.index, faceDown: false })
    this.dealQueue.push({ seat: 'dealer', faceDown: false })

    // Second pass: a second card to every player. In a hole-card game the dealer
    // takes one face down; in a European game the dealer takes nothing at all
    // until the players are finished.
    for (const seat of live) this.dealQueue.push({ seat: seat.index, faceDown: false })
    if (this.rules.dealerPeek) this.dealQueue.push({ seat: 'dealer', faceDown: true })
  }

  private stepDealing(): Beat {
    const next = this.dealQueue.shift()
    if (next) {
      const card = this.draw(!next.faceDown)
      if (next.seat === 'dealer') {
        this.dealer.cards.push(card)
      } else {
        this.seats[next.seat].hands[0].cards.push(card)
      }
      return { type: 'deal', seat: next.seat, hand: 0, card, faceDown: next.faceDown }
    }

    // The deal is done. Insurance first, then early surrender, then the peek.
    if (this.insuranceOffered()) {
      this.phase = 'insurance'
      return this.stepInsurance()
    }
    return this.afterInsurance()
  }

  private insuranceOffered(): boolean {
    const up = this.upcard
    return !!up && up.rank === 'A' && this.rules.insurance && this.seats.some((s) => this.isLive(s))
  }

  private earlySurrenderOffered(): boolean {
    const up = this.upcard
    if (this.rules.surrender !== 'early' || !up) return false
    // Early surrender only means anything when the dealer might have a natural.
    return up.rank === 'A' || isTenValue(up)
  }

  // --- insurance

  private stepInsurance(): Beat {
    for (const seat of this.seats) {
      if (!this.isLive(seat) || seat.insuranceDecided) continue

      const brain = this.brainFor(seat)
      if (!brain) {
        return {
          type: 'awaitInsurance',
          seat: seat.index,
          evenMoney: this.rules.evenMoney && isBlackjack(seat.hands[0]),
        }
      }

      const wants = botInsurance(brain, this.ctx())
      if (this.rules.evenMoney && isBlackjack(seat.hands[0])) {
        seat.insuranceDecided = true
        if (wants) {
          seat.tookEvenMoney = true
          this.say(`${seat.name} takes even money.`)
          return { type: 'evenMoney', seat: seat.index }
        }
        continue
      }

      this.decideInsurance(seat, wants)
      if (wants) return { type: 'insurance', seat: seat.index, amount: seat.insurance }
    }

    return this.afterInsurance()
  }

  private decideInsurance(seat: Seat, yes: boolean): void {
    seat.insuranceDecided = true
    if (!yes) return
    const amount = Math.min(seat.baseBet / 2, seat.bankroll)
    if (amount <= 0) return
    seat.bankroll -= amount
    seat.insurance = amount
    this.say(`${seat.name} takes insurance for ${amount}.`)
  }

  private afterInsurance(): Beat {
    if (this.earlySurrenderOffered()) {
      this.phase = 'earlySurrender'
      return this.stepEarlySurrender()
    }
    return this.peekOrPlay()
  }

  // --- early surrender

  private stepEarlySurrender(): Beat {
    for (const seat of this.seats) {
      if (!this.isLive(seat) || seat.earlySurrenderDecided) continue

      const hand = seat.hands[0]
      // A natural is never surrendered, and neither is a hand the house won't
      // take back.
      if (isBlackjack(hand)) {
        seat.earlySurrenderDecided = true
        continue
      }

      const brain = this.brainFor(seat)
      if (!brain) return { type: 'awaitEarlySurrender', seat: seat.index }

      // The bots surrender early exactly when basic strategy would surrender
      // late. Early surrender is strictly the better of the two, so this never
      // costs them anything relative to waiting.
      const up = this.upcard!
      const wants = botAction(brain, hand, up, seat, this.ctx()) === 'surrender'
      seat.earlySurrenderDecided = true
      if (wants) {
        hand.surrendered = true
        this.say(`${seat.name} surrenders.`)
        return { type: 'action', seat: seat.index, hand: 0, action: 'surrender' }
      }
    }

    return this.peekOrPlay()
  }

  // --- the peek

  private peekOrPlay(): Beat {
    const up = this.upcard
    if (this.rules.dealerPeek && up && (up.rank === 'A' || isTenValue(up))) {
      const natural = evaluate(this.dealer.cards).total === 21
      if (natural) {
        this.revealHole()
        this.say('Dealer has blackjack.')
        this.phase = 'settled'
        return { type: 'peek', blackjack: true }
      }
      this.phase = 'playing'
      return { type: 'peek', blackjack: false }
    }

    this.phase = 'playing'
    return this.stepPlaying()
  }

  // --- playing

  /** The next hand owed a card or a decision, scanning first base to third. */
  private nextTurn(): Turn | null {
    for (const seat of this.seats) {
      if (!this.isLive(seat)) continue
      for (let h = 0; h < seat.hands.length; h++) {
        const hand = seat.hands[h]
        if (hand.surrendered) continue
        // A hand produced by a split is owed its second card.
        if (hand.cards.length < 2) return { seat: seat.index, hand: h }
        if (!isResolved(hand, this.rules)) return { seat: seat.index, hand: h }
      }
    }
    return null
  }

  private stepPlaying(): Beat {
    const turn = this.nextTurn()

    if (!turn) {
      this.phase = 'dealer'
      return this.stepDealer()
    }

    const seat = this.seats[turn.seat]
    const hand = seat.hands[turn.hand]

    // Owed a card from a split.
    if (hand.cards.length < 2) {
      const card = this.draw(true)
      hand.cards.push(card)
      this.settleSplitAce(seat, hand)
      return { type: 'deal', seat: seat.index, hand: turn.hand, card, faceDown: false }
    }

    const brain = this.brainFor(seat)
    if (!brain) {
      return {
        type: 'awaitAction',
        seat: turn.seat,
        hand: turn.hand,
        actions: legalActions(hand, seat, this.rules),
      }
    }

    const action = botAction(brain, hand, this.upcard!, seat, this.ctx())
    this.applyAction(seat, hand, turn.hand, action)
    return { type: 'action', seat: turn.seat, hand: turn.hand, action }
  }

  private applyAction(seat: Seat, hand: Hand, handIndex: number, action: Action): void {
    switch (action) {
      case 'hit': {
        hand.cards.push(this.draw(true))
        this.say(`${seat.name} hits — ${describe(hand)}.`)
        break
      }

      case 'stand': {
        hand.stood = true
        this.say(`${seat.name} stands on ${evaluate(hand.cards).total}.`)
        break
      }

      case 'double': {
        const amount = wagerUnit(hand)
        const free = isFreeDouble(hand, this.rules)
        // A free double never touches the bankroll: the house's chip sits beside
        // the player's and is only ever settled, never staked.
        if (free) hand.freeBet += amount
        else {
          seat.bankroll -= amount
          hand.bet += amount
        }
        hand.doubled = true
        hand.cards.push(this.draw(true))
        this.say(
          free
            ? `${seat.name} takes a free double — ${describe(hand)}.`
            : `${seat.name} doubles down — ${describe(hand)}.`,
        )
        break
      }

      case 'split': {
        // The second card slides across to start a new hand, which stays a
        // single card until it becomes the active hand — exactly as the dealer
        // does it.
        const amount = wagerUnit(hand)
        const free = isFreeSplit(hand, this.rules)
        if (!free) seat.bankroll -= amount

        const moved = hand.cards.pop()!
        const aces = hand.splitAces || hand.cards[0].rank === 'A'

        hand.fromSplit = true
        hand.splitAces = aces

        // On a free split the house backs the NEW hand, so it carries no money of
        // the player's at all. The original half keeps the wager it already had.
        const fresh = makeHand(`${seat.index}-${seat.hands.length}`, [moved], free ? 0 : amount, {
          fromSplit: true,
          splitAces: aces,
          freeBet: free ? amount : 0,
        })
        seat.hands.splice(handIndex + 1, 0, fresh)

        hand.cards.push(this.draw(true))
        this.settleSplitAce(seat, hand)
        this.say(free ? `${seat.name} free splits ${moved.rank}s.` : `${seat.name} splits ${moved.rank}s.`)
        break
      }

      case 'surrender': {
        hand.surrendered = true
        // Handing back a doubled hand is the rescue, not a surrender of a live
        // two-card hand, and it is worth saying so out loud at the table.
        this.say(hand.doubled ? `${seat.name} rescues the double.` : `${seat.name} surrenders.`)
        break
      }
    }

    if (isBusted(hand)) this.say(`${seat.name} busts with ${evaluate(hand.cards).total}.`)
    else if (isCharlie(hand, this.rules)) {
      this.say(`${seat.name} makes a ${hand.cards.length}-card Charlie.`)
    }
  }

  /** A split ace takes one card and stands — unless it drew another ace and the
   *  house allows re-splitting them, in which case the player still has a say. */
  private settleSplitAce(seat: Seat, hand: Hand): void {
    if (!hand.splitAces || this.rules.hitSplitAces) return
    const canResplit = legalActions(hand, seat, this.rules).includes('split')
    if (!canResplit) hand.stood = true
  }

  // --- the dealer's hand

  private stepDealer(): Beat {
    if (!this.dealer.holeRevealed) {
      // In a European game the dealer has no hole card and takes the second one
      // now. In a hole-card game it's already there, face down.
      if (!this.rules.dealerPeek && this.dealer.cards.length === 1) {
        if (this.anyUnresolved()) this.dealer.cards.push(this.draw(false))
      }
      this.revealHole()
      return { type: 'revealHole' }
    }

    if (this.anyToBeat() && this.dealerMustDraw()) {
      const card = this.draw(true)
      this.dealer.cards.push(card)
      return { type: 'dealerDraw', card }
    }

    const value = evaluate(this.dealer.cards)
    this.say(
      value.busted ? `Dealer busts with ${value.total}.` : `Dealer stands on ${value.total}.`,
    )
    this.phase = 'settled'
    return this.stepSettled()
  }

  /** Any hand whose fate is not already sealed. A natural counts: in a no-hole-
   *  card game it still needs to know whether the dealer draws one too, because
   *  a dealer natural pushes it. Leaving these out would quietly turn every one
   *  of those pushes into a 3:2 win. */
  private anyUnresolved(): boolean {
    return this.seats.some(
      (seat) => this.isLive(seat) && seat.hands.some((h) => !h.surrendered && !isBusted(h)),
    )
  }

  /** Any hand the dealer actually has to make a total against. A natural is
   *  already paid whatever the dealer draws to, so it doesn't keep them at it. */
  private anyToBeat(): boolean {
    return this.seats.some(
      (seat) =>
        this.isLive(seat) &&
        seat.hands.some((h) => !h.surrendered && !isBusted(h) && !isBlackjack(h)),
    )
  }

  private dealerMustDraw(): boolean {
    const { total, soft } = evaluate(this.dealer.cards)
    if (total < 17) return true
    return total === 17 && soft && this.rules.dealerHitsSoft17
  }

  private revealHole(): void {
    this.dealer.holeRevealed = true
    if (!this.holeCounted && this.dealer.cards.length > 1) {
      this.counter.see(this.dealer.cards[1])
      this.holeCounted = true
    }
  }

  // --- settlement

  private stepSettled(): Beat {
    if (!this.paidOut) {
      this.settle()
      this.paidOut = true
      return { type: 'settle' }
    }
    // The UI lingers here to show the outcomes; the next step clears the table.
    return this.endRound()
  }

  private settle(): void {
    const dealerValue = evaluate(this.dealer.cards)
    const dealerBJ = this.dealer.cards.length === 2 && dealerValue.total === 21
    // European no-hole-card: a dealer natural takes the player's original wager
    // and hands back the money they put up doubling and splitting.
    const obo = dealerBJ && !this.rules.dealerPeek && this.rules.originalBetsOnly

    for (const seat of this.seats) {
      if (!this.isLive(seat)) continue

      if (seat.insurance > 0) {
        const won = dealerBJ ? seat.insurance * ratio(this.rules.insurancePayout) : 0
        seat.insuranceReturned = dealerBJ ? seat.insurance + won : 0
        seat.bankroll += seat.insuranceReturned
      }

      // Under OBO the seat forfeits its original wager exactly once. A hand that
      // busted lost its own money before the dealer ever drew, so it consumes
      // that debt rather than being refunded for it.
      let owed = obo ? seat.baseBet : 0

      for (const hand of seat.hands) {
        const { outcome, returned, consumed } = this.settleHand(
          hand,
          seat,
          dealerValue,
          dealerBJ,
          obo,
          owed,
        )
        owed -= consumed
        hand.outcome = outcome
        hand.returned = returned
        seat.bankroll += returned

        if (outcome === 'win') {
          const bonus = spanishBonus(hand, this.rules)
          if (bonus) {
            this.say(`${seat.name} makes a ${bonus.name} — pays ${bonus.pay[0]}:${bonus.pay[1]}.`)
          }
        }
      }

      if (seat.bankroll < this.rules.minBet) seat.busted = true
    }
  }

  private settleHand(
    hand: Hand,
    seat: Seat,
    dealerValue: { total: number; busted: boolean },
    dealerBJ: boolean,
    obo: boolean,
    owed: number,
  ): { outcome: Outcome; returned: number; consumed: number } {
    const bet = hand.bet

    // A surrender, and Spanish 21's double-down rescue, both hand the house half
    // of what is on the hand. On a doubled hand half of it IS the original bet,
    // which is exactly what the rescue is meant to return.
    if (hand.surrendered) return { outcome: 'surrender', returned: bet / 2, consumed: 0 }

    const natural = isBlackjack(hand)

    // Even money was paid 1:1 the moment it was taken, whatever the dealer has.
    if (seat.tookEvenMoney && natural) {
      return { outcome: 'blackjack', returned: bet * 2, consumed: 0 }
    }

    if (natural) {
      // Spanish 21: the player's natural is paid in full even when the dealer
      // turns one over. Everywhere else that is a push.
      const beaten = dealerBJ && !this.rules.player21Wins
      return beaten
        ? { outcome: 'push', returned: bet, consumed: owed }
        : {
            outcome: 'blackjack',
            returned: bet + blackjackWinnings(bet, this.rules),
            consumed: 0,
          }
    }

    // A bust is lost on its own merits, before the dealer's hand matters at all.
    if (isBusted(hand)) return { outcome: 'bust', returned: 0, consumed: Math.min(owed, bet) }

    const total = evaluate(hand.cards).total

    // Spanish 21: a player 21 can neither be beaten nor pushed. This has to come
    // before the dealer-blackjack and dealer-22 branches, both of which would
    // otherwise take it.
    if (this.rules.player21Wins && total === 21) return this.payWin(hand)

    if (dealerBJ) {
      if (obo) {
        const forfeit = Math.min(owed, bet)
        return { outcome: 'lose', returned: bet - forfeit, consumed: forfeit }
      }
      return { outcome: 'lose', returned: 0, consumed: 0 }
    }

    if (isCharlie(hand, this.rules)) {
      return { outcome: 'charlie', returned: bet * 2 + hand.freeBet, consumed: 0 }
    }

    // Free Bet style: the dealer's 22 is not a bust, it's a push.
    if (this.rules.dealerPush22 && dealerValue.total === 22) {
      // Only the player's own chips come back. The free chip is the house's and
      // goes back in the rack — a push on a free double is worth nothing at all,
      // which is most of what pays for the rule.
      return { outcome: 'push', returned: bet, consumed: 0 }
    }

    if (dealerValue.busted) return this.payWin(hand)

    if (total > dealerValue.total) return this.payWin(hand)
    if (total < dealerValue.total) return { outcome: 'lose', returned: 0, consumed: 0 }
    return { outcome: 'push', returned: bet, consumed: 0 }
  }

  /** A won hand: the player's stake back, matched by the house, plus whatever the
   *  house's own free chip won alongside it, plus any Spanish bonus. */
  private payWin(hand: Hand): { outcome: Outcome; returned: number; consumed: number } {
    const bonus = spanishBonus(hand, this.rules)
    const extra = bonus ? hand.bet * ratio(bonus.pay) : 0
    return { outcome: 'win', returned: hand.bet * 2 + hand.freeBet + extra, consumed: 0 }
  }

  // --- between rounds

  private endRound(): Beat {
    this.phase = 'betting'
    this.paidOut = false
    if (this.shoe.cutCardOut || this.rules.csm) this.pendingShuffle = true

    for (const seat of this.seats) {
      seat.hands = []
      seat.baseBet = 0
      seat.insurance = 0
      seat.insuranceReturned = undefined
      seat.tookEvenMoney = false
      seat.insuranceDecided = false
      seat.earlySurrenderDecided = false
      if (!this.isEmpty(seat)) seat.sittingOut = false
    }
    this.dealer = { cards: [], holeRevealed: false }
    return { type: 'roundOver' }
  }

  // -------------------------------------------------------------- plumbing

  private draw(counted: boolean): Card {
    const card = this.shoe.draw()
    if (counted) this.counter.see(card)
    return card
  }

  private say(text: string): void {
    this.log.push({ round: this.round, text })
    if (this.log.length > 200) this.log.shift()
  }
}

function makeSeat(index: number, name: string, bot: BotProfile | null, bankroll: number): Seat {
  return {
    index,
    name,
    bot,
    bankroll,
    baseBet: 0,
    hands: [],
    insurance: 0,
    tookEvenMoney: false,
    insuranceDecided: false,
    earlySurrenderDecided: false,
    sittingOut: false,
    busted: false,
  }
}

function describe(hand: Hand): string {
  const { total, soft, busted } = evaluate(hand.cards)
  if (busted) return `${total}`
  return soft && total !== 21 ? `soft ${total}` : `${total}`
}
