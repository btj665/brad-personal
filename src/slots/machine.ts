// Playing a machine.
//
// One spin resolves completely — including every cascade in a chain and every
// free game it bought — into a list of `Step`s. The UI walks that list on a
// timer to animate it; the tests and the return simulator read the total off the
// end of it. Same code either way, and no clock in here.

import { makeRng, randomSeed, type Rng } from '../engine/rng'
import { evaluate, findSymbol, windowOf } from './evaluate'
import type { Machine, SpinResult, Step, SymbolId, Win } from './types'

export type Phase = 'idle' | 'complete'

/** A fresh symbol off a reel, drawn with the strip's own frequencies — which is
 *  what keeps a cascade refill distributed exactly like a fresh spin, and so
 *  keeps the base-game arithmetic in `rtp.ts` meaningful. */
function drawFrom(strip: SymbolId[], rng: Rng): SymbolId {
  return strip[rng.int(strip.length)]
}

function randomStops(machine: Machine, rng: Rng): number[] {
  return machine.strips.map((strip) => rng.int(strip.length))
}

/** Replace every reel that shows `id` with a full column of it. */
function expandWilds(window: SymbolId[][], id: SymbolId): SymbolId[][] {
  return window.map((col) => (col.includes(id) ? col.map(() => id) : col))
}

/** Drop the winning cells out and let the column fall into the gap, refilling
 *  from the top. Reel-major storage makes this a per-column operation, which is
 *  exactly how the cabinet does it. */
function cascadeOnce(
  window: SymbolId[][],
  wins: Win[],
  machine: Machine,
  rng: Rng,
): SymbolId[][] {
  const doomed = new Set<string>()
  for (const win of wins) for (const [reel, row] of win.cells) doomed.add(`${reel},${row}`)

  return window.map((col, reel) => {
    const survivors = col.filter((_, row) => !doomed.has(`${reel},${row}`))
    const missing = col.length - survivors.length
    const fresh: SymbolId[] = []
    for (let i = 0; i < missing; i++) fresh.push(drawFrom(machine.strips[reel], rng))
    // Survivors fall to the bottom; the new symbols sit above them.
    return [...fresh, ...survivors]
  })
}

function multiplierForChain(machine: Machine, chain: number): number {
  if (machine.feature.kind !== 'cascade') return 1
  const table = machine.feature.multipliers
  return table[Math.min(chain, table.length - 1)]
}

/** Resolve one paid spin all the way to the end. */
export function resolveSpin(
  machine: Machine,
  coinsPerLine: number,
  rng: Rng,
): SpinResult {
  const staked = coinsPerLine * machine.lines.length
  const steps: Step[] = []
  let paid = 0
  let freeSpinsAwarded = 0

  const playScreen = (free: boolean, extraMultiplier: number): void => {
    let window = windowOf(machine.strips, randomStops(machine, rng), machine.rows)

    if (free && machine.feature.kind === 'freeSpins' && machine.feature.expandingWild) {
      window = expandWilds(window, machine.feature.expandingWild)
    }

    let chain = 0
    for (;;) {
      const wins = evaluate(window, machine, coinsPerLine, staked)
      const multiplier = multiplierForChain(machine, chain) * extraMultiplier
      const stepPaid = wins.reduce((sum, w) => sum + w.paid, 0) * multiplier
      paid += stepPaid
      steps.push({ window, wins, multiplier, paid: stepPaid, free, spun: chain === 0 })

      if (machine.feature.kind !== 'cascade' || wins.length === 0) break
      chain++
      window = cascadeOnce(window, wins, machine, rng)
      // A long enough chain buys the free games, once per spin.
      if (chain === machine.feature.freeSpinsAt && !free) {
        freeSpinsAwarded += machine.feature.freeSpins
      }
    }
  }

  playScreen(false, 1)

  // Scatter-triggered free games, counted off the paid screen only.
  if (machine.feature.kind === 'freeSpins') {
    const trigger = findSymbol(steps[0].window, machine.feature.trigger).length
    if (trigger >= machine.feature.triggerCount) freeSpinsAwarded += machine.feature.spins
  }

  if (freeSpinsAwarded > 0) {
    const extra = machine.feature.kind === 'freeSpins' ? machine.feature.multiplier : 1
    for (let i = 0; i < freeSpinsAwarded; i++) playScreen(true, extra)
  }

  return { steps, freeSpinsAwarded, staked, paid }
}

export class SlotGame {
  machine: Machine
  seed: number
  rng: Rng
  bankroll: number
  coinsPerLine = 1
  phase: Phase = 'idle'
  result: SpinResult | null = null
  round = 0
  version = 0

  private listeners = new Set<() => void>()

  constructor(opts: { machine: Machine; seed?: number; bankroll?: number }) {
    this.machine = opts.machine
    this.seed = opts.seed ?? randomSeed()
    this.rng = makeRng(this.seed)
    this.bankroll = opts.bankroll ?? 500
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

  totalBet(): number {
    return this.coinsPerLine * this.machine.lines.length
  }

  setCoinsPerLine(n: number): void {
    this.coinsPerLine = Math.max(1, Math.min(5, n))
    this.touch()
  }

  setMachine(machine: Machine): void {
    this.machine = machine
    this.result = null
    this.phase = 'idle'
    this.touch()
  }

  canSpin(): boolean {
    return this.bankroll >= this.totalBet()
  }

  spin(): void {
    if (!this.canSpin()) return
    const result = resolveSpin(this.machine, this.coinsPerLine, this.rng)
    this.bankroll -= result.staked
    this.bankroll += result.paid
    this.result = result
    this.round++
    this.phase = 'complete'
    this.touch()
  }
}
