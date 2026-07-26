// Caribbean Stud Poker — one player, one dealer, one decision.
//
// The whole game is: post an ante, look at five cards, and either walk away or
// commit twice the ante against a dealer who only plays back with ace-king or
// better. No draw, no second decision, nothing to press an advantage with —
// which is why the edge is several times that of the games sitting either side
// of it on the floor. The player folds outright on about 48% of hands, and the
// Raise only earns its schedule on the hands where the dealer opens.
//
// Deterministic and clock-free like every other engine here: same seed, same
// shuffle, same hands, forever.

import { buildShoeCards } from '../engine/cards'
import { makeRng, randomSeed, type Rng } from '../engine/rng'
import type { Card } from '../engine/types'
import { compare, score5, type Score } from '../poker/eval'
import {
  DEFAULT_CARIBBEAN,
  dealerQualifies,
  payKey,
  progressiveWin,
  type CaribbeanRules,
  type PayKey,
} from './rules'

export type Phase = 'bet' | 'decide' | 'complete'
export type Result = 'fold' | 'win' | 'lose' | 'push'

/** The dealer's fifth card is the one turned face up; the other four stay down
 *  until the player has folded or raised. */
export const UP_INDEX = 4

export interface CaribbeanHand {
  ante: number
  /** Zero until the player raises, then exactly twice the ante. */
  raise: number
  /** The progressive stake — the flat side-bet cost, or zero. */
  progressive: number
  cards: Card[]
  score: Score
  folded: boolean
  /** Set once the hand is resolved. */
  settlement: Settlement | null
}

export interface DealerHand {
  cards: Card[]
  score: Score | null
  qualifies: boolean | null
  revealed: boolean
}

export interface Settlement {
  /** Everything handed back on the ante, the stake included. */
  antePay: number
  raisePay: number
  progressivePay: number
  /** Net across all three wagers, so it can be added straight to a bankroll
   *  delta and checked against it. */
  net: number
  result: Result
  playerScore: Score
  playerKey: PayKey
  dealerScore: Score
  qualifies: boolean
}

export interface ResolveArgs {
  player: Card[]
  dealer: Card[]
  ante: number
  /** Two units if the player raised, zero if he folded. */
  raise: number
  progressive: number
  folded: boolean
  rules?: CaribbeanRules
}

/** Settle one hand. Pure, and exported so the tests can drive exact five-card
 *  hands through it instead of hunting for seeds that produce them. */
export function resolveHand(args: ResolveArgs): Settlement {
  const rules = args.rules ?? DEFAULT_CARIBBEAN
  const playerScore = score5(args.player, {})
  const playerKey = payKey(playerScore)
  const dealerScore = score5(args.dealer, {})
  const qualifies = dealerQualifies(args.dealer, dealerScore)

  // The progressive is a bet on the player's own five cards. It resolves off the
  // dealer's hand entirely, and off the fold — the dealer still reads the hand.
  const progressivePay =
    args.progressive > 0 ? progressiveWin(rules.progressive, playerKey) : 0

  const staked = args.ante + args.raise + args.progressive

  if (args.folded) {
    // The ante is gone and there is no Raise to lose.
    return {
      antePay: 0,
      raisePay: 0,
      progressivePay,
      net: progressivePay - staked,
      result: 'fold',
      playerScore,
      playerKey,
      dealerScore,
      qualifies,
    }
  }

  const cmp = compare(playerScore, dealerScore)
  let antePay: number
  let raisePay: number

  if (!qualifies) {
    // Ante pays even money, Raise comes back untouched. The player's hand is
    // never even compared — which is most of where the 5% lives: the dealer
    // fails to open on nearly 44% of the hands the player raised into, and a
    // royal flush collects the same one unit as a pair of deuces.
    antePay = args.ante * 2
    raisePay = args.raise
  } else if (cmp > 0) {
    antePay = args.ante * 2
    raisePay = args.raise + args.raise * rules.raisePay[playerKey]
  } else if (cmp === 0) {
    // A dead-exact tie, down to the last kicker. Both wagers push.
    antePay = args.ante
    raisePay = args.raise
  } else {
    antePay = 0
    raisePay = 0
  }

  const main = antePay + raisePay
  const mainStaked = args.ante + args.raise
  const result: Result = main > mainStaked ? 'win' : main < mainStaked ? 'lose' : 'push'

  return {
    antePay,
    raisePay,
    progressivePay,
    net: antePay + raisePay + progressivePay - staked,
    result,
    playerScore,
    playerKey,
    dealerScore,
    qualifies,
  }
}

export interface LogEntry {
  round: number
  text: string
}

export interface CaribbeanOptions {
  rules?: CaribbeanRules
  seed?: number
  bankroll?: number
  ante?: number
  progressive?: boolean
}

export class CaribbeanGame {
  rules: CaribbeanRules
  seed: number
  rng: Rng
  deck: Card[] = []
  phase: Phase = 'bet'
  bankroll: number
  /** The ante for the next hand. The Raise is always twice this. */
  ante: number
  /** Whether the next hand backs the progressive. */
  progressive = false
  hand: CaribbeanHand | null = null
  dealer: DealerHand = { cards: [], score: null, qualifies: null, revealed: false }
  round = 0
  log: LogEntry[] = []
  version = 0

  private listeners = new Set<() => void>()

  constructor(opts: CaribbeanOptions = {}) {
    this.rules = opts.rules ?? DEFAULT_CARIBBEAN
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bankroll = opts.bankroll ?? 1000
    this.ante = opts.ante ?? this.rules.minAnte
    this.progressive = opts.progressive ?? false
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

  setAnte(n: number): void {
    if (this.phase === 'decide') return // don't move the bet mid-hand
    this.ante = Math.max(this.rules.minAnte, Math.min(this.rules.maxAnte, n))
    this.touch()
  }

  toggleProgressive(): void {
    if (this.phase === 'decide') return
    this.progressive = !this.progressive
    this.touch()
  }

  /** What leaves the rack when the cards come out: the ante plus, at most, the
   *  side bet. The Raise is not committed yet. */
  get stakeOut(): number {
    return this.ante + (this.progressive ? this.rules.progressive.cost : 0)
  }

  canDeal(): boolean {
    // Never deal a hand the player can't afford to raise on: the whole point of
    // the game is that decision, and a table wouldn't seat him for less.
    return this.phase !== 'decide' && this.bankroll >= this.stakeOut + this.ante * 2
  }

  deal(): void {
    if (!this.canDeal()) return
    const side = this.progressive ? this.rules.progressive.cost : 0
    this.bankroll -= this.ante + side
    this.shuffle()
    this.round++

    const cards = this.deck.splice(0, 5)
    this.hand = {
      ante: this.ante,
      raise: 0,
      progressive: side,
      cards,
      score: score5(cards, {}),
      folded: false,
      settlement: null,
    }
    this.dealer = {
      cards: this.deck.splice(0, 5),
      score: null,
      qualifies: null,
      revealed: false,
    }
    this.phase = 'decide'
    this.say(`Round ${this.round}. Ante ${this.ante} out${side ? ` + ${side} progressive` : ''}.`)
    this.touch()
  }

  /** The one dealer card the player gets to see. */
  get upcard(): Card | null {
    return this.phase === 'bet' ? null : (this.dealer.cards[UP_INDEX] ?? null)
  }

  // -------------------------------------------------------------- decision

  fold(): void {
    if (this.phase !== 'decide' || !this.hand) return
    this.hand.folded = true
    this.say('Folds — the ante is taken.')
    this.settle()
  }

  raise(): void {
    if (this.phase !== 'decide' || !this.hand) return
    const amount = this.hand.ante * 2
    if (this.bankroll < amount) return
    this.bankroll -= amount
    this.hand.raise = amount
    this.say(`Raises ${amount}.`)
    this.settle()
  }

  private settle(): void {
    const h = this.hand!
    const s = resolveHand({
      player: h.cards,
      dealer: this.dealer.cards,
      ante: h.ante,
      raise: h.raise,
      progressive: h.progressive,
      folded: h.folded,
      rules: this.rules,
    })
    h.settlement = s
    this.dealer.score = s.dealerScore
    this.dealer.qualifies = s.qualifies
    // A live dealer would muck an unopened hand rather than show it. This is a
    // practice table, so the fold gets shown too — otherwise the player never
    // learns what the fold cost him.
    this.dealer.revealed = true

    this.bankroll += s.antePay + s.raisePay + s.progressivePay
    if (!h.folded) {
      this.say(
        s.qualifies
          ? `Dealer opens. ${s.result === 'win' ? 'Player wins' : s.result === 'lose' ? 'Dealer wins' : 'Push'}.`
          : 'Dealer does not qualify — ante pays, Raise pushes.',
      )
    }
    if (s.progressivePay > 0) this.say(`Progressive pays ${s.progressivePay.toLocaleString()}.`)

    this.phase = 'complete'
    this.touch()
  }

  /** Net across all three wagers on the hand on the table, or zero. */
  get netThisRound(): number {
    return this.hand?.settlement?.net ?? 0
  }

  // -------------------------------------------------------------- internals

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
    if (this.log.length > 120) this.log.shift()
  }
}
