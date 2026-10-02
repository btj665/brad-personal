// Keno. Mark one to ten spots on a ticket of eighty numbers, the house calls
// twenty, you get paid on how many of your spots were among them.
//
// There are no cards and no dealer here, so the engine is thinner than the table
// games: the whole round is one draw. The one piece of ceremony is that a keno
// board lights its twenty balls one at a time, so `draw()` settles nothing —
// it fixes all twenty numbers up front (they are already determined by the seed)
// and then `revealNext()` walks the board forward, settling on the twentieth.
// Keeping the draw whole and the reveal separate means the animation can be
// skipped, slowed, or dropped entirely without changing a single outcome.

import { makeRng, randomSeed, type Rng } from '../engine/rng'
import { BALLS, DRAWN, MAX_PICKS, MIN_PICKS } from './odds'
import { DEFAULT_PAYTABLE, payFor, paytableById, type Paytable } from './paytables'

export type Phase = 'pick' | 'drawing' | 'complete'

export interface KenoResult {
  round: number
  /** The spots on the ticket, ascending. */
  picks: number[]
  /** All twenty called numbers, in the order they came out. */
  drawn: number[]
  /** The spots that were called, ascending. */
  caught: number[]
  staked: number
  /** Stake plus winnings — zero on a losing ticket, since keno takes the stake. */
  returned: number
  /** Pay per unit staked from the rate card. */
  odds: number
}

export interface KenoOptions {
  paytableId?: string
  seed?: number
  bankroll?: number
  bet?: number
}

export class KenoGame {
  table: Paytable
  seed: number
  rng: Rng
  bankroll: number
  phase: Phase = 'pick'
  /** The marked spots, ascending. */
  picks: number[] = []
  bet: number
  last: KenoResult | null = null
  round = 0
  version = 0

  /** All twenty called numbers in draw order. Fixed by `draw()` — the screen
   *  must read `called()` instead, or the board gives the game away. */
  private drawn: number[] = []
  private revealed = 0
  /** Held from draw() to settlement so the accounting cannot drift. */
  private staked = 0

  private listeners = new Set<() => void>()

  constructor(opts: KenoOptions = {}) {
    this.table = paytableById(opts.paytableId ?? DEFAULT_PAYTABLE.id)
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bankroll = opts.bankroll ?? 1000
    this.bet = opts.bet ?? 5
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

  /** The numbers on the board so far. */
  called(): number[] {
    return this.drawn.slice(0, this.revealed)
  }

  /** How many balls are out. */
  get callCount(): number {
    return this.revealed
  }

  /** Marked spots that have already been called — for lighting the board live,
   *  before the ticket is settled. */
  caughtSoFar(): number[] {
    const out = new Set(this.drawn.slice(0, this.revealed))
    return this.picks.filter((n) => out.has(n))
  }

  setPaytable(id: string): void {
    if (this.phase === 'drawing') return
    this.table = paytableById(id)
    this.touch()
  }

  setBet(amount: number): void {
    if (this.phase === 'drawing') return
    this.bet = Math.max(1, Math.floor(amount))
    this.touch()
  }

  /** Mark or unmark a spot. A ticket holds at most ten. */
  togglePick(n: number): void {
    if (this.phase === 'drawing') return
    if (n < 1 || n > BALLS || !Number.isInteger(n)) return
    if (this.phase === 'complete') this.reset()
    const at = this.picks.indexOf(n)
    if (at >= 0) this.picks.splice(at, 1)
    else if (this.picks.length < MAX_PICKS) this.picks.push(n)
    else return // a full ticket ignores the click rather than silently swapping
    this.picks.sort((a, b) => a - b)
    this.touch()
  }

  clearPicks(): void {
    if (this.phase === 'drawing') return
    this.reset()
    this.picks = []
    this.touch()
  }

  /** Let the house mark the ticket. Defaults to the count already on it, so
   *  "quick pick" after a hand-marked six-spot gives another six-spot. */
  quickPick(count?: number): void {
    if (this.phase === 'drawing') return
    this.reset()
    const want = Math.max(MIN_PICKS, Math.min(MAX_PICKS, count ?? (this.picks.length || 4)))
    this.picks = this.pull(want).sort((a, b) => a - b)
    this.touch()
  }

  canDraw(): boolean {
    return this.phase === 'pick' && this.picks.length >= MIN_PICKS && this.bankroll >= this.bet
  }

  /** Take the stake and fix the twenty numbers. Nothing is revealed yet. */
  draw(): void {
    if (!this.canDraw()) return
    this.staked = this.bet
    this.bankroll -= this.staked
    this.round++
    this.drawn = this.pull(DRAWN)
    this.revealed = 0
    this.last = null
    this.phase = 'drawing'
    this.touch()
  }

  /** Light one more ball. Settles the ticket on the twentieth. Returns the
   *  number that came out, or null if there was nothing to reveal. */
  revealNext(): number | null {
    if (this.phase !== 'drawing') return null
    const n = this.drawn[this.revealed]
    this.revealed++
    if (this.revealed >= DRAWN) this.settle()
    else this.touch()
    return n
  }

  /** Skip the ceremony. */
  revealAll(): void {
    if (this.phase !== 'drawing') return
    this.revealed = DRAWN
    this.settle()
  }

  /** Clear the board for another ticket, keeping the marked spots. */
  next(): void {
    if (this.phase === 'drawing') return
    this.reset()
    this.touch()
  }

  private settle(): void {
    const out = new Set(this.drawn)
    const caught = this.picks.filter((n) => out.has(n))
    const odds = payFor(this.table, this.picks.length, caught.length)
    const returned = odds * this.staked
    this.bankroll += returned

    this.last = {
      round: this.round,
      picks: [...this.picks],
      drawn: [...this.drawn],
      caught,
      staked: this.staked,
      returned,
      odds,
    }
    this.staked = 0
    this.phase = 'complete'
    this.touch()
  }

  private reset(): void {
    this.drawn = []
    this.revealed = 0
    this.last = null
    this.phase = 'pick'
  }

  /** `count` distinct balls from the rack of eighty. A partial Fisher-Yates over
   *  a fresh rack, so the draw is uniform and consumes a fixed number of rng
   *  steps — the seed has to replay the same way every time. */
  private pull(count: number): number[] {
    const rack: number[] = []
    for (let n = 1; n <= BALLS; n++) rack.push(n)
    for (let i = 0; i < count; i++) {
      const j = i + this.rng.int(BALLS - i)
      const t = rack[i]
      rack[i] = rack[j]
      rack[j] = t
    }
    return rack.slice(0, count)
  }
}
