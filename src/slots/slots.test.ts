import { describe, expect, it } from 'vitest'

import { makeRng } from '../engine/rng'
import { evaluate, findSymbol, lineWins, scatterWins, windowOf } from './evaluate'
import { resolveSpin, SlotGame } from './machine'
import { BARS } from './machines/bars'
import { exactBaseReturn, exactLineReturn, screenCountDistribution, symbolProbabilities } from './rtp'
import { wheelValue } from './bonus'
import type { Machine } from './types'

/** A minimal five-reel machine built by hand, so the evaluator can be tested
 *  against screens whose answer is obvious by inspection. */
function toy(over: Partial<Machine> = {}): Machine {
  return {
    id: 'toy',
    label: 'Toy',
    blurb: '',
    note: '',
    symbols: [
      { id: 'W', label: 'W', wild: true },
      { id: 'S', label: 'S', scatter: true },
      { id: 'A', label: 'A' },
      { id: 'K', label: 'K' },
      { id: '-', label: '' },
    ],
    strips: [['A', 'K', '-'], ['A', 'K', '-'], ['A', 'K', '-'], ['A', 'K', '-'], ['A', 'K', '-']],
    rows: 3,
    lines: [[1, 1, 1, 1, 1]],
    linePays: { A: [0, 0, 0, 10, 50, 200], K: [0, 0, 0, 5, 20, 80] },
    feature: { kind: 'none' },
    targetRtp: 1,
    ...over,
  }
}

/** Build a window from rows written out as strings, top row first. */
function screen(...rows: string[]): string[][] {
  const grid = rows.map((r) => r.trim().split(/\s+/))
  const reels = grid[0].length
  return Array.from({ length: reels }, (_, reel) => grid.map((row) => row[reel]))
}

describe('reading a screen', () => {
  it('takes the window off the strip and wraps at the end', () => {
    const strips = [['a', 'b', 'c', 'd']]
    expect(windowOf(strips, [0], 3)).toEqual([['a', 'b', 'c']])
    expect(windowOf(strips, [3], 3)).toEqual([['d', 'a', 'b']])
  })

  it('pays a run only when it starts on the first reel', () => {
    const m = toy()
    const onLine = screen('- - - - -', 'A A A - -', '- - - - -')
    expect(lineWins(onLine, m, 1)[0].paid).toBe(10)

    // The same three aces, one reel to the right: nothing.
    const shifted = screen('- - - - -', '- A A A -', '- - - - -')
    expect(lineWins(shifted, m, 1)).toHaveLength(0)
  })

  it('substitutes a wild into a run', () => {
    const m = toy()
    const win = lineWins(screen('- - - - -', 'A W A - -', '- - - - -'), m, 1)[0]
    expect([win.symbol, win.count, win.paid]).toEqual(['A', 3, 10])
  })

  it('reads wilds as whichever symbol pays more', () => {
    // W W K K A: as kings that is a run of four (20); as aces only two, which
    // pays nothing. The machine owes the better of the two.
    const win = lineWins(screen('- - - - -', 'W W K K A', '- - - - -'), toy(), 1)[0]
    expect([win.symbol, win.count, win.paid]).toEqual(['K', 4, 20])
  })

  it('applies a multiplier wild once per wild in the run', () => {
    const m = toy({ symbols: [...toy().symbols.filter((s) => s.id !== 'W'), { id: 'W', label: 'W', wild: true, multiplier: 2 }] })
    // One wild doubles, two wilds quadruple.
    expect(lineWins(screen('- - - - -', 'A W A - -', '- - - - -'), m, 1)[0].paid).toBe(20)
    expect(lineWins(screen('- - - - -', 'A W W - -', '- - - - -'), m, 1)[0].paid).toBe(40)
  })

  it('never lets a scatter stand in for a line symbol', () => {
    expect(lineWins(screen('- - - - -', 'A S A - -', '- - - - -'), toy(), 1)).toHaveLength(0)
  })

  it('pays a scatter on count from anywhere on screen', () => {
    const m = toy({ scatterPays: { S: { 3: 2, 4: 10, 5: 50 } } })
    // Deliberately scattered: different rows, non-adjacent reels.
    const win = scatterWins(screen('S - - - S', '- - - - -', '- - S - -'), m, 10)[0]
    expect([win.count, win.paid]).toEqual([3, 20])
  })

  it('finds every instance of a symbol', () => {
    expect(findSymbol(screen('S - -', '- - S', '- - -'), 'S')).toEqual([
      [0, 0],
      [2, 1],
    ])
  })

  it('pays lines and scatters together', () => {
    const m = toy({ scatterPays: { S: { 3: 2 } } })
    const wins = evaluate(screen('S - - - -', 'A A A - -', 'S - S - -'), m, 1, 10)
    expect(wins.map((w) => w.kind).sort()).toEqual(['line', 'scatter'])
  })
})

describe('the exact return', () => {
  it('reads each reel’s marginals off its strip', () => {
    const p = symbolProbabilities(['a', 'a', 'b', 'c'])
    expect(p.get('a')).toBeCloseTo(0.5, 12)
    expect(p.get('b')).toBeCloseTo(0.25, 12)
  })

  it('convolves a scatter count across the reels', () => {
    // One reel, one row, half the strip scattered: 50/50 on zero or one.
    const m = toy({ strips: [['S', '-']], rows: 1, lines: [[0]] })
    const dist = screenCountDistribution(m, 'S')
    expect(dist[0]).toBeCloseTo(0.5, 12)
    expect(dist[1]).toBeCloseTo(0.5, 12)
    // Probabilities over the whole screen must account for every outcome.
    expect(dist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
  })

  it('computes a return that can be checked by hand', () => {
    // One reel of two symbols, a single one-cell line, an ace paying 10 for one:
    // half the spins pay ten, so the return is five.
    const m = toy({
      strips: [['A', '-']],
      rows: 1,
      lines: [[0]],
      linePays: { A: [0, 10] },
    })
    expect(exactLineReturn(m)).toBeCloseTo(5, 12)
  })
})

describe('Bars & Sevens', () => {
  it('is cut to the return it claims, reels plus wheel', () => {
    // This cabinet is the one whose whole price is a closed form. The wheel pays
    // its own mean because every wedge is equally likely, and the trigger is a
    // rational number off the strips — so the machine can be priced to the last
    // digit without a single spin being simulated.
    const wheel = BARS.bonus
    if (wheel?.kind !== 'wheel') throw new Error('Bars is meant to carry the wheel')

    const triggerChance = screenCountDistribution(BARS, wheel.trigger)
      .slice(wheel.triggerCount)
      .reduce((a, b) => a + b, 0)

    const fromWheel = triggerChance * wheelValue(wheel)
    expect(exactBaseReturn(BARS) + fromWheel).toBeCloseTo(BARS.targetRtp, 3)
  })

  it('has no scatter, so its whole reel return is in the lines', () => {
    expect(exactLineReturn(BARS)).toBeCloseTo(exactBaseReturn(BARS), 12)
  })

  it('pays a lone cherry on the first reel and nothing for a lone seven', () => {
    expect(lineWins(screen('- - -', 'C - -', '- - -'), BARS, 1)[0].paid).toBe(1)
    expect(lineWins(screen('- - -', '7 - -', '- - -'), BARS, 1)).toHaveLength(0)
  })

  it('pays three wilds as eight times the sevens', () => {
    // Each wild doubles, so three of them multiply the top line pay by eight.
    // Read the seven off the machine rather than repeating it — this assertion
    // rotted once already when the pay table was cut to make room for the wheel.
    const seven = BARS.linePays['7'][3]
    expect(lineWins(screen('- - -', 'W W W', '- - -'), BARS, 1)[0].paid).toBe(seven * 8)
  })

  it('agrees with a simulation of itself', () => {
    const rng = makeRng(24)
    let staked = 0
    let paid = 0
    let fromBonus = 0
    for (let i = 0; i < 300_000; i++) {
      const r = resolveSpin(BARS, 1, rng)
      staked += r.staked
      paid += r.paid
      fromBonus += r.bonus?.paid ?? 0
    }
    // The reels are enumerable and the wheel isn't part of that enumeration, so
    // strip the wheel back out and what's left has to be the exact figure. A
    // 300k-spin sample of a wheel that lands once in 152 spins is far too noisy
    // to check on its own; the closed form above is what pins that.
    expect((paid - fromBonus) / staked).toBeCloseTo(exactBaseReturn(BARS), 1)
  })
})

describe('a machine at the rail', () => {
  it('only ever moves the bankroll by what it staked and paid', () => {
    const game = new SlotGame({ machine: BARS, seed: 5, bankroll: 100_000 })
    for (let i = 0; i < 2_000; i++) {
      const before = game.bankroll
      game.spin()
      const r = game.result!
      expect(game.bankroll).toBe(before - r.staked + r.paid)
    }
  })

  it('stakes one coin per line per coin bet', () => {
    const game = new SlotGame({ machine: BARS, seed: 6, bankroll: 1000 })
    expect(game.totalBet()).toBe(BARS.lines.length)
    game.setCoinsPerLine(5)
    expect(game.totalBet()).toBe(5 * BARS.lines.length)
  })

  it('refuses a spin it cannot cover', () => {
    const game = new SlotGame({ machine: BARS, seed: 7, bankroll: 0 })
    expect(game.canSpin()).toBe(false)
    game.spin()
    expect(game.result).toBeNull()
  })

  it('replays exactly from its seed', () => {
    const runs = [0, 1].map(() => {
      const g = new SlotGame({ machine: BARS, seed: 99, bankroll: 10_000 })
      for (let i = 0; i < 50; i++) g.spin()
      return g.bankroll
    })
    expect(runs[0]).toBe(runs[1])
  })
})
