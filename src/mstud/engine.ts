// Mississippi Stud — the table.
//
// A single player against a pay table, like video poker, but with a raise ladder
// like Ultimate Texas Hold'em. There is no dealer hand and nobody else at the
// table, so the engine has no ceremony to sequence: each decision the player
// makes turns the next community card, and the third one settles the hand.
//
// Pure and deterministic — same seed, same night.

import { buildShoeCards } from '../engine/cards'
import { makeRng, randomSeed, type Rng } from '../engine/rng'
import type { Card } from '../engine/types'
import { score5 } from '../poker/eval'
import { DEFAULT_MSTUD, multiplierFor, payKeyFor, payLabel, returnedFor } from './rules'
import { bestAction, raiseUnits } from './strategy'
import type { LogEntry, MStudAction, MStudHand, MStudRules, Phase, Street } from './types'

export { raiseUnits }

export interface MStudOptions {
  rules?: MStudRules
  seed?: number
  bankroll?: number
}

/** The streets in order, and which community card each one precedes. */
const STREETS: Street[] = ['third', 'fourth', 'fifth']

/** A player can end up with ten units out (ante plus three 3x raises), so the
 *  table won't take an ante it can't see backed. Nothing is more annoying than
 *  a ladder you can't finish climbing. */
export const MAX_EXPOSURE = 10

export class MStudGame {
  rules: MStudRules
  seed: number
  rng: Rng
  deck: Card[] = []
  phase: Phase = 'bet'
  bankroll: number
  /** The ante the player wants each round; remembered between hands. */
  ante: number
  hand: MStudHand | null = null
  /** The settled hand, kept on screen while the next one is set up. */
  last: MStudHand | null = null
  round = 0
  log: LogEntry[] = []
  version = 0

  private listeners = new Set<() => void>()

  constructor(opts: MStudOptions = {}) {
    this.rules = opts.rules ?? DEFAULT_MSTUD
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bankroll = opts.bankroll ?? 1000
    this.ante = this.rules.minBet
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

  setAnte(ante: number): void {
    if (this.phase !== 'bet' && this.phase !== 'settled') return
    this.ante = Math.max(this.rules.minBet, Math.min(this.rules.maxBet, ante))
    this.touch()
  }

  canDeal(ante = this.ante): boolean {
    if (this.phase === 'third' || this.phase === 'fourth' || this.phase === 'fifth') return false
    if (ante < this.rules.minBet || ante > this.rules.maxBet) return false
    return ante * MAX_EXPOSURE <= this.bankroll
  }

  /** Post the ante and put the cards out: two to the player, three face down. */
  deal(ante = this.ante): void {
    if (!this.canDeal(ante)) return
    this.ante = ante
    this.round++
    this.shuffle()
    this.bankroll -= ante
    this.hand = {
      ante,
      raises: {},
      wagered: ante,
      hole: [this.draw(), this.draw()],
      community: [this.draw(), this.draw(), this.draw()],
      revealed: 0,
      folded: false,
      foldedOn: null,
    }
    this.last = null
    this.phase = 'third'
    this.say(`Round ${this.round}. Ante ${ante}.`)
    this.touch()
  }

  // -------------------------------------------------------------- the ladder

  get street(): Street | null {
    return this.phase === 'third' || this.phase === 'fourth' || this.phase === 'fifth'
      ? this.phase
      : null
  }

  /** The community cards the player can see right now. */
  get shownBoard(): Card[] {
    const h = this.hand ?? this.last
    return h ? h.community.slice(0, h.revealed) : []
  }

  decide(action: MStudAction): void {
    const street = this.street
    if (!street || !this.hand) return
    const h = this.hand

    if (action === 'fold') {
      h.folded = true
      h.foldedOn = street
      // A fold forfeits the ante and every raise already made. The community
      // cards still get turned — the player is allowed to see what they missed.
      h.revealed = 3
      this.say(`Folds on ${street} street, forfeiting ${h.wagered}.`)
      this.settle()
      return
    }

    const units = raiseUnits(action)
    const chips = h.ante * units
    h.raises[street] = chips
    h.wagered += chips
    this.bankroll -= chips
    h.revealed = STREETS.indexOf(street) + 1
    this.say(`Raises ${units}x on ${street} street — ${h.wagered} out.`)

    if (street === 'fifth') {
      this.settle()
      return
    }
    this.phase = street === 'third' ? 'fourth' : 'fifth'
    this.touch()
  }

  /** What the exact solver would do here — the on-screen coach, and the hand the
   *  edge script's accounting check plays. */
  hint(): MStudAction | null {
    const street = this.street
    if (!street || !this.hand) return null
    const h = this.hand
    return bestAction({
      street,
      hole: h.hole,
      board: h.community.slice(0, STREETS.indexOf(street)),
      wagered: h.wagered / h.ante,
    })
  }

  /** Play a whole hand with the exact solver — the edge script's inner loop. */
  playRound(ante = this.ante): void {
    if (this.phase === 'settled') this.clear()
    this.deal(ante)
    if (!this.hand) return
    for (let guard = 0; guard < 4 && this.street; guard++) {
      const action = this.hint()
      if (!action) break
      this.decide(action)
    }
  }

  // -------------------------------------------------------------- settlement

  private settle(): void {
    const h = this.hand!
    h.score = score5([...h.hole, ...h.community])
    h.payKey = payKeyFor(h.score)

    // A fold pays nothing, whatever the cards turned out to be.
    const multiplier = h.folded ? -1 : multiplierFor(h.score)
    h.returned = h.folded ? 0 : returnedFor(h.wagered, multiplier)
    h.net = h.returned - h.wagered
    this.bankroll += h.returned

    if (!h.folded) {
      const label = payLabel(h.payKey)
      if (multiplier > 0) this.say(`${label} — pays ${multiplier}:1 on ${h.wagered}. +${h.net}`)
      else if (multiplier === 0) this.say(`${label} — push. ${h.wagered} back.`)
      else this.say(`${label}. Loses ${h.wagered}.`)
    }

    this.last = h
    this.hand = null
    this.phase = 'settled'
    this.touch()
  }

  /** Clear the settled hand and go back to the betting circle. */
  clear(): void {
    if (this.phase !== 'settled') return
    this.last = null
    this.phase = 'bet'
    this.touch()
  }

  // -------------------------------------------------------------- cards

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

  private say(text: string): void {
    this.log.push({ round: this.round, text })
    if (this.log.length > 200) this.log.shift()
  }
}
