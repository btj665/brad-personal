// Craps. A pass-line game: come out, maybe set a point, then roll until the
// point repeats (pass wins) or a seven shows (pass loses). The engine tracks the
// chips on the layout and resolves them on each roll of the two dice.
//
// Implemented bets: pass / don't pass and come / don't come, each backable with
// true-odds; place bets on the box numbers; and the field. That is the spine of
// a real craps table.

import { makeRng, randomSeed, type Rng } from '../engine/rng'

export type Point = 4 | 5 | 6 | 8 | 9 | 10

export interface Roll {
  a: number
  b: number
  total: number
}

/** A flat bet that can carry an odds bet behind it. */
interface Backed {
  amount: number
  odds: number
}

export interface Bets {
  pass?: Backed
  dontPass?: Backed
  /** Come / don't-come bets that have traveled to a number. */
  come: Map<Point, Backed>
  dontCome: Map<Point, Backed>
  /** A come / don't-come flat bet waiting for the next roll to place it. */
  comeFlat: number
  dontComeFlat: number
  place: Map<Point, number>
  field: number
}

export type Phase = 'comeout' | 'point'

export interface Resolution {
  roll: Roll
  /** Net change to the bankroll from this roll. */
  net: number
  /** Human-readable notes about what resolved. */
  notes: string[]
  seizedOut: boolean
}

const POINTS: Point[] = [4, 5, 6, 8, 9, 10]
const isPoint = (n: number): n is Point => (POINTS as number[]).includes(n)

/** True-odds multiplier for a pass/come odds bet on a point. */
function passOddsMult(p: Point): number {
  if (p === 4 || p === 10) return 2 // 2:1
  if (p === 5 || p === 9) return 1.5 // 3:2
  return 1.2 // 6:5 on 6/8
}

/** Lay-odds multiplier for a don't bet (you lay the point, win less than even). */
function dontOddsMult(p: Point): number {
  if (p === 4 || p === 10) return 0.5 // 1:2
  if (p === 5 || p === 9) return 2 / 3 // 2:3
  return 5 / 6 // 5:6
}

/** Place-bet payout multiplier. */
function placeMult(p: Point): number {
  if (p === 4 || p === 10) return 9 / 5
  if (p === 5 || p === 9) return 7 / 5
  return 7 / 6 // 6/8
}

export class CrapsGame {
  seed: number
  rng: Rng
  bankroll: number
  phase: Phase = 'comeout'
  point: Point | null = null
  bets: Bets = emptyBets()
  lastRoll: Roll | null = null
  lastResolution: Resolution | null = null
  history: number[] = []
  /** How many times the dice have been thrown — a monotonic per-roll id. */
  rolls = 0
  chip = 5
  /** Odds multiple the table allows behind the line (3-4-5x is standard). */
  maxOdds = 3
  version = 0

  private listeners = new Set<() => void>()

  constructor(opts: { seed?: number; bankroll?: number; maxOdds?: number } = {}) {
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bankroll = opts.bankroll ?? 500
    this.maxOdds = opts.maxOdds ?? 3
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

  setChip(v: number): void {
    this.chip = v
    this.touch()
  }

  get atRisk(): number {
    const b = this.bets
    let n = b.comeFlat + b.dontComeFlat + b.field
    if (b.pass) n += b.pass.amount + b.pass.odds
    if (b.dontPass) n += b.dontPass.amount + b.dontPass.odds
    for (const v of b.come.values()) n += v.amount + v.odds
    for (const v of b.dontCome.values()) n += v.amount + v.odds
    for (const v of b.place.values()) n += v
    return n
  }

  private canAfford(amount: number): boolean {
    return amount <= this.bankroll
  }

  // ---- placing bets -------------------------------------------------------

  betPass(): void {
    if (this.phase !== 'comeout' || this.bets.pass || !this.canAfford(this.chip)) return
    this.bets.pass = { amount: this.chip, odds: 0 }
    this.bankroll -= this.chip
    this.touch()
  }

  betDontPass(): void {
    if (this.phase !== 'comeout' || this.bets.dontPass || !this.canAfford(this.chip)) return
    this.bets.dontPass = { amount: this.chip, odds: 0 }
    this.bankroll -= this.chip
    this.touch()
  }

  betCome(): void {
    if (this.phase !== 'point' || this.bets.comeFlat > 0 || !this.canAfford(this.chip)) return
    this.bets.comeFlat = this.chip
    this.bankroll -= this.chip
    this.touch()
  }

  betDontCome(): void {
    if (this.phase !== 'point' || this.bets.dontComeFlat > 0 || !this.canAfford(this.chip)) return
    this.bets.dontComeFlat = this.chip
    this.bankroll -= this.chip
    this.touch()
  }

  /** Back the pass line (or a come point) with an odds bet. */
  addOdds(target: 'pass' | 'dontPass' | Point): void {
    const b = this.bets
    if (target === 'pass' && b.pass && this.point) {
      const max = b.pass.amount * this.maxOdds
      const add = Math.min(this.chip, max - b.pass.odds)
      if (add > 0 && this.canAfford(add)) {
        b.pass.odds += add
        this.bankroll -= add
      }
    } else if (target === 'dontPass' && b.dontPass && this.point) {
      const add = this.chip
      if (this.canAfford(add)) {
        b.dontPass.odds += add
        this.bankroll -= add
      }
    } else if (typeof target === 'number' && b.come.has(target)) {
      const bet = b.come.get(target)!
      const add = Math.min(this.chip, bet.amount * this.maxOdds - bet.odds)
      if (add > 0 && this.canAfford(add)) {
        bet.odds += add
        this.bankroll -= add
      }
    }
    this.touch()
  }

  placeBet(n: Point): void {
    if (!this.canAfford(this.chip)) return
    this.bets.place.set(n, (this.bets.place.get(n) ?? 0) + this.chip)
    this.bankroll -= this.chip
    this.touch()
  }

  betField(): void {
    if (!this.canAfford(this.chip)) return
    this.bets.field += this.chip
    this.bankroll -= this.chip
    this.touch()
  }

  canRoll(): boolean {
    return this.atRisk > 0 || this.phase === 'point'
  }

  // ---- the roll -----------------------------------------------------------

  /** Roll the dice. `forced` injects a specific pair, for tests. */
  roll(forced?: [number, number]): Resolution {
    const a = forced ? forced[0] : this.rng.int(6) + 1
    const b = forced ? forced[1] : this.rng.int(6) + 1
    const roll: Roll = { a, b, total: a + b }
    const notes: string[] = []
    let net = 0
    let seizedOut = false

    // The field settles every roll, win or lose.
    net += this.settleField(roll, notes)

    if (this.phase === 'comeout') {
      net += this.settleComeOutLine(roll, notes)
    } else {
      const r = this.settlePointRoll(roll, notes)
      net += r.net
      seizedOut = r.seizedOut
    }

    // Come / don't-come flats and their points settle on every roll too.
    net += this.settleCome(roll, notes)

    // Place bets settle on the point phase (they are "off" on the come-out by
    // default, but here they stay working, which is the player's choice).
    net += this.settlePlace(roll, notes)

    this.bankroll += this.creditsThisRoll
    this.creditsThisRoll = 0

    this.rolls++
    this.lastRoll = roll
    this.lastResolution = { roll, net, notes, seizedOut }
    this.history = [roll.total, ...this.history].slice(0, 16)
    this.touch()
    return this.lastResolution
  }

  /** Winnings are accumulated here and paid to the bankroll at the end of the
   *  roll, so a bet's stake and its payout don't race. */
  private creditsThisRoll = 0
  private pay(amount: number): void {
    this.creditsThisRoll += amount
  }

  private settleField(roll: Roll, notes: string[]): number {
    const f = this.bets.field
    if (f === 0) return 0
    this.bets.field = 0
    const t = roll.total
    let mult = 0
    if (t === 2) mult = 2
    else if (t === 12) mult = 3
    else if ([3, 4, 9, 10, 11].includes(t)) mult = 1
    if (mult > 0) {
      this.pay(f + f * mult)
      notes.push(`Field wins on ${t}`)
      return f * mult
    }
    notes.push(`Field loses on ${t}`)
    return -f
  }

  private settleComeOutLine(roll: Roll, notes: string[]): number {
    let net = 0
    const t = roll.total
    const b = this.bets

    if (t === 7 || t === 11) {
      if (b.pass) {
        this.pay(b.pass.amount * 2)
        net += b.pass.amount
        notes.push(`Pass wins on ${t}`)
        b.pass = undefined
      }
      if (b.dontPass) {
        net -= b.dontPass.amount
        notes.push(`Don't pass loses on ${t}`)
        b.dontPass = undefined
      }
    } else if (t === 2 || t === 3) {
      if (b.pass) {
        net -= b.pass.amount
        notes.push(`Pass loses on ${t}`)
        b.pass = undefined
      }
      if (b.dontPass) {
        this.pay(b.dontPass.amount * 2)
        net += b.dontPass.amount
        notes.push(`Don't pass wins on ${t}`)
        b.dontPass = undefined
      }
    } else if (t === 12) {
      if (b.pass) {
        net -= b.pass.amount
        b.pass = undefined
      }
      // Twelve is barred for the don't: it pushes.
      if (b.dontPass) notes.push(`Don't pass pushes on 12`)
    } else {
      // A point is set.
      this.point = t as Point
      this.phase = 'point'
      notes.push(`Point is ${t}`)
    }
    return net
  }

  private settlePointRoll(roll: Roll, notes: string[]): { net: number; seizedOut: boolean } {
    let net = 0
    const t = roll.total
    const b = this.bets

    if (t === this.point) {
      if (b.pass) {
        this.pay(b.pass.amount * 2)
        net += b.pass.amount
        if (b.pass.odds) {
          const m = passOddsMult(this.point)
          this.pay(b.pass.odds + b.pass.odds * m)
          net += b.pass.odds * m
        }
        notes.push(`Pass wins — point ${t} made`)
        b.pass = undefined
      }
      if (b.dontPass) {
        net -= b.dontPass.amount + b.dontPass.odds
        notes.push(`Don't pass loses — point made`)
        b.dontPass = undefined
      }
      this.point = null
      this.phase = 'comeout'
      return { net, seizedOut: false }
    }

    if (t === 7) {
      // Seven out. The line, its odds, come points and place bets all fall.
      if (b.pass) {
        net -= b.pass.amount + b.pass.odds
        b.pass = undefined
      }
      if (b.dontPass) {
        this.pay(b.dontPass.amount * 2)
        net += b.dontPass.amount
        if (b.dontPass.odds) {
          const m = dontOddsMult(this.point!)
          this.pay(b.dontPass.odds + b.dontPass.odds * m)
          net += b.dontPass.odds * m
        }
        b.dontPass = undefined
      }
      // Come points lose; don't-come points win.
      for (const [pt, bet] of b.come) {
        net -= bet.amount + bet.odds
        void pt
      }
      b.come.clear()
      for (const [pt, bet] of b.dontCome) {
        this.pay(bet.amount * 2)
        net += bet.amount
        if (bet.odds) {
          const m = dontOddsMult(pt)
          this.pay(bet.odds + bet.odds * m)
          net += bet.odds * m
        }
      }
      b.dontCome.clear()
      // Place bets come down on a seven.
      for (const amt of b.place.values()) net -= amt
      b.place.clear()

      this.point = null
      this.phase = 'comeout'
      notes.push('Seven out')
      return { net, seizedOut: true }
    }

    return { net, seizedOut: false }
  }

  private settleCome(roll: Roll, notes: string[]): number {
    let net = 0
    const t = roll.total
    const b = this.bets

    // A come flat behaves like a pass line on this single roll.
    if (b.comeFlat > 0) {
      if (t === 7 || t === 11) {
        this.pay(b.comeFlat * 2)
        net += b.comeFlat
        notes.push(`Come wins on ${t}`)
        b.comeFlat = 0
      } else if (t === 2 || t === 3 || t === 12) {
        net -= b.comeFlat
        notes.push(`Come loses on ${t}`)
        b.comeFlat = 0
      } else if (isPoint(t)) {
        // It travels to its number (adding to any bet already there).
        const cur = b.come.get(t) ?? { amount: 0, odds: 0 }
        b.come.set(t, { amount: cur.amount + b.comeFlat, odds: cur.odds })
        b.comeFlat = 0
      }
    }
    // A don't-come flat is the mirror.
    if (b.dontComeFlat > 0) {
      if (t === 7 || t === 11) {
        net -= b.dontComeFlat
        b.dontComeFlat = 0
      } else if (t === 2 || t === 3) {
        this.pay(b.dontComeFlat * 2)
        net += b.dontComeFlat
        b.dontComeFlat = 0
      } else if (t === 12) {
        // pushes
      } else if (isPoint(t)) {
        const cur = b.dontCome.get(t) ?? { amount: 0, odds: 0 }
        b.dontCome.set(t, { amount: cur.amount + b.dontComeFlat, odds: cur.odds })
        b.dontComeFlat = 0
      }
    }

    // An established come point wins when its number repeats.
    if (isPoint(t) && b.come.has(t)) {
      const bet = b.come.get(t)!
      this.pay(bet.amount * 2)
      net += bet.amount
      if (bet.odds) {
        const m = passOddsMult(t)
        this.pay(bet.odds + bet.odds * m)
        net += bet.odds * m
      }
      b.come.delete(t)
      notes.push(`Come point ${t} repeats`)
    }
    // A don't-come point loses when its number repeats.
    if (isPoint(t) && b.dontCome.has(t)) {
      const bet = b.dontCome.get(t)!
      net -= bet.amount + bet.odds
      b.dontCome.delete(t)
    }

    return net
  }

  private settlePlace(roll: Roll, notes: string[]): number {
    let net = 0
    const t = roll.total
    if (this.phase === 'comeout') return 0 // place bets are off on the come-out
    if (isPoint(t) && this.bets.place.has(t)) {
      const amt = this.bets.place.get(t)!
      const win = amt * placeMult(t)
      // Only the winnings are paid; the bet itself stays working on the number.
      this.pay(win)
      net += win
      notes.push(`Place ${t} hits`)
    }
    return net
  }

  clearBets(): void {
    // Only removable while nothing is committed to a point.
    if (this.phase === 'point') return
    this.bankroll += this.atRisk
    this.bets = emptyBets()
    this.touch()
  }
}

function emptyBets(): Bets {
  return {
    come: new Map(),
    dontCome: new Map(),
    comeFlat: 0,
    dontComeFlat: 0,
    place: new Map(),
    field: 0,
  }
}
