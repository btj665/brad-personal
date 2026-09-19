// Nova Ways — a 243-ways cabinet whose base game AND feature are both exact.
//
// The all-ways return factorizes (see `exactWaysReturn` and the machine header),
// and the free games are ten more spins of the same strips at a flat 3×, so they
// have a closed form too. Every figure below is enumerated; the simulation at the
// end is a cross-check against those figures, never the measurement.

import { describe, expect, it } from 'vitest'

import { makeRng } from '../../engine/rng'
import { scatterWins, wayWins } from '../evaluate'
import { resolveSpin } from '../machine'
import {
  exactBaseReturn,
  exactScatterReturn,
  exactWaysReturn,
  screenCountDistribution,
  simulateReturn,
} from '../rtp'
import type { Machine, SymbolId } from '../types'
import { WAYS } from './ways'

/** The ways pays alone, enumerated: Σ over symbols and run lengths of the per-way
 *  pay times the expected ways times the chance the run breaks there, all over the
 *  25-coin ways cost. */
const WAYS_RETURN = 0.829461
/** The galaxy ladder, exactly enumerable like any scatter. Deliberately small —
 *  its job is to trigger, not to pay the machine. */
const SCATTER_RETURN = 0.009424
const BASE_RETURN = 0.838884

/** Three galaxies or more, once in 249 spins. A single galaxy a reel on five
 *  short strips, so this is a 3-of-5 convolution of the per-reel chance, exact. */
const P_TRIGGER = 0.00401008
/** The round lays p·spins·multiplier of extra return on top of the base, and
 *  because a free spin is distributed exactly like a paid one this is exact, not
 *  measured: 0.00401008 · 10 · 3. */
const FEATURE_FACTOR = P_TRIGGER * 10 * 3
const TOTAL_RETURN = BASE_RETURN * (1 + FEATURE_FACTOR)

/** Build a window from rows written out as strings, top row first, returned
 *  reel-major (`window[reel][row]`) exactly as the evaluator wants it. */
function screen(...rows: string[]): SymbolId[][] {
  const grid = rows.map((r) => r.trim().split(/\s+/))
  const reels = grid[0].length
  return Array.from({ length: reels }, (_, reel) => grid.map((row) => row[reel]))
}

const winFor = (wins: ReturnType<typeof wayWins>, id: SymbolId) => wins.find((w) => w.symbol === id)

describe('Nova Ways — the cabinet', () => {
  it('is a five-reel, three-row, 243-ways machine priced at 25 coins a spin', () => {
    expect(WAYS.strips).toHaveLength(5)
    expect(WAYS.rows).toBe(3)
    expect(WAYS.ways).toBe(true)
    // No paylines: the machine pays by adjacency, and `stakeUnits` reads the price
    // off `waysCost` rather than off a line count.
    expect(WAYS.lines).toEqual([])
    expect(WAYS.waysCost).toBe(25)
    // Three rows on five reels is 3⁵ ways bought at once.
    expect(Math.pow(WAYS.rows, WAYS.strips.length)).toBe(243)
    // The strip lengths fall out of the column sums.
    expect(WAYS.strips.map((s) => s.length)).toEqual([36, 38, 39, 41, 42])
  })

  it('triggers ten free games on three galaxies, at triple pay', () => {
    const feature = WAYS.feature
    if (feature.kind !== 'freeSpins') throw new Error('Nova Ways buys free games')
    expect(feature.trigger).toBe('SC')
    expect(feature.triggerCount).toBe(3)
    expect(feature.spins).toBe(10)
    expect(feature.multiplier).toBe(3)
    // No expanding wild: that is the whole reason the round stays enumerable, an
    // expanded reel no longer being distributed like a spun one.
    expect(feature.expandingWild).toBeUndefined()
  })
})

describe('Nova Ways — reading a screen the all-ways way', () => {
  it('multiplies the pay by the ways: 2·1·2 on a three-reel run pays four times', () => {
    // A on reels one, two, three with counts 2, 1, 2; reel four is all kings, so
    // the run is exactly three long. Ways = 2·1·2 = 4, and A pays 8 for three, so
    // the win is 8 · 4 = 32 at one coin a line.
    const win = winFor(wayWins(screen('A A A K K', 'A K A K K', 'K K K K K'), WAYS, 1), 'A')
    expect(win?.count).toBe(3)
    expect(win?.paid).toBe(WAYS.linePays.A[3] * 4)
    expect(win?.paid).toBe(7.5 * 4)
    // The highlight lights every matched cell — two on reel one, one on reel two,
    // two on reel three.
    expect(win?.cells).toHaveLength(5)
    // Coins per line scale the whole win linearly.
    const dbl = winFor(wayWins(screen('A A A K K', 'A K A K K', 'K K K K K'), WAYS, 2), 'A')
    expect(dbl?.paid).toBe(7.5 * 4 * 2)
  })

  it('stops the run at the first reel with no match', () => {
    // A on reels one and two (counts 2, 1), reel three all kings. Run of two, ways
    // 2·1 = 2, A pays 2 for two of a kind → 4. The kings beyond it never join it.
    const win = winFor(wayWins(screen('A A K K K', 'A K K K K', 'K K K K K'), WAYS, 1), 'A')
    expect(win?.count).toBe(2)
    expect(win?.paid).toBe(WAYS.linePays.A[2] * 2)
  })

  it('lets a wild extend the run and multiply the ways', () => {
    // Reel three carries only a wild: it extends the A run from two reels to three.
    const extended = winFor(wayWins(screen('A A W K K', 'A W T K K', 'T T T K K'), WAYS, 1), 'A')
    expect(extended?.count).toBe(3)
    // Ways 2·2·1 = 4 (the reel-two wild is counted as an A), pay 8 for three → 32.
    expect(extended?.paid).toBe(WAYS.linePays.A[3] * 4)

    // Same screen but reel three has no wild: the run is only two long.
    const shorter = winFor(wayWins(screen('A A T K K', 'A W T K K', 'T T T K K'), WAYS, 1), 'A')
    expect(shorter?.count).toBe(2)
    expect(shorter?.paid).toBe(WAYS.linePays.A[2] * 4)
  })

  it('pays every symbol independently and sums them, rather than taking a max', () => {
    // A and K both run two reels and then break on the all-tens reel three. Both
    // pay, and the machine owes the sum — the rule that keeps the return linear.
    const wins = wayWins(screen('A A T T T', 'K K T T T', 'T T T T T'), WAYS, 1)
    // A and K each run two reels with one way; the tens run all five. Three
    // separate wins, and the screen's total is their sum — no win is dropped or
    // maxed away.
    expect(wins).toHaveLength(3)
    expect(winFor(wins, 'A')?.paid).toBe(WAYS.linePays.A[2])
    expect(winFor(wins, 'K')?.paid).toBe(WAYS.linePays.K[2])
    expect(winFor(wins, 'T')?.count).toBe(5)
    const total = wins.reduce((sum, w) => sum + w.paid, 0)
    expect(total).toBe(
      WAYS.linePays.A[2] + WAYS.linePays.K[2] + (winFor(wins, 'T')?.paid ?? 0),
    )
  })

  it('pays nothing for a run that does not start on reel one', () => {
    // A on reels two and three but a wall of tens on reel one: leftmost alignment
    // means the run never starts, exactly as on a payline machine.
    expect(winFor(wayWins(screen('T A A T T', 'T A A T T', 'T T T T T'), WAYS, 1), 'A')).toBeUndefined()
  })

  it('never lets a scatter match, and blocks a run only when a reel is all scatter', () => {
    // Reel two is nothing but galaxies — no A and no wild — so it breaks the run,
    // leaving a run of one on reel one that does not pay.
    expect(winFor(wayWins(screen('A SC K K K', 'A SC K K K', 'K SC K K K'), WAYS, 1), 'A')).toBeUndefined()

    // A galaxy sharing reel one with an A does not break it: the reel still matches
    // on its A. The run is two long, and the highlight skips the scatter cell at
    // reel one, row two ([0, 1]).
    const win = winFor(wayWins(screen('A A K K K', 'SC A K K K', 'K K K K K'), WAYS, 1), 'A')
    expect(win?.count).toBe(2)
    expect(win?.cells).toContainEqual([0, 0])
    expect(win?.cells).not.toContainEqual([0, 1])
  })
})

describe('Nova Ways — the return', () => {
  it('enumerates the ways pays and the galaxy ladder exactly', () => {
    expect(exactWaysReturn(WAYS)).toBeCloseTo(WAYS_RETURN, 5)
    expect(exactScatterReturn(WAYS)).toBeCloseTo(SCATTER_RETURN, 5)
    // The base game is ways plus scatters and nothing else.
    expect(exactBaseReturn(WAYS)).toBeCloseTo(BASE_RETURN, 5)
    expect(exactBaseReturn(WAYS)).toBeCloseTo(exactWaysReturn(WAYS) + exactScatterReturn(WAYS), 12)
  })

  it('buys the free games once in about two hundred and fifty spins, exactly', () => {
    const dist = screenCountDistribution(WAYS, 'SC')
    const p = dist.slice(3).reduce((a, b) => a + b, 0)
    expect(p).toBeCloseTo(P_TRIGGER, 8)
    expect(1 / p).toBeCloseTo(249.4, 1)
    // One galaxy a reel, so the screen can never hold more than five.
    expect(dist.slice(6).every((x) => x === 0)).toBe(true)
  })

  it('lands the whole machine on its target as base × free games, all enumerated', () => {
    const dist = screenCountDistribution(WAYS, 'SC')
    const p = dist.slice(3).reduce((a, b) => a + b, 0)
    // A free spin is worth exactly 3× the base game and there are ten of them, so
    // the round is a closed form rather than a measured leverage.
    const featureFactor = p * 10 * 3
    expect(featureFactor).toBeCloseTo(FEATURE_FACTOR, 6)
    const total = exactBaseReturn(WAYS) * (1 + featureFactor)
    expect(total).toBeCloseTo(TOTAL_RETURN, 5)
    expect(Math.abs(total - WAYS.targetRtp)).toBeLessThan(0.001)
    // The round is a touch over a tenth of everything the cabinet pays.
    expect((total - exactBaseReturn(WAYS)) / total).toBeCloseTo(0.107, 2)
  })

  it('agrees with a simulation of the ways pays alone', () => {
    // A machine stripped of both the scatter ladder and the free games: what plays
    // is the ways pays and nothing else, so a simulation of it has to land on the
    // enumerated ways return. Cross-check, not measurement.
    const waysOnly: Machine = { ...WAYS, feature: { kind: 'none' }, scatterPays: undefined }
    const { rtp } = simulateReturn(waysOnly, 500_000, makeRng(0x0a17), (m, r) => resolveSpin(m, 1, r))
    // Per-spin standard deviation is near 3, so 500k spins pins this to ±0.005;
    // the band is several of those and still trips on an edited strip.
    expect(Math.abs(rtp - exactWaysReturn(WAYS))).toBeLessThan(0.02)
  })

  it(
    'agrees with a full simulation, free games included',
    { timeout: 60_000 },
    () => {
      const SPINS = 500_000
      const rng = makeRng(20260919)
      let staked = 0
      let paid = 0
      let freePaid = 0
      let triggers = 0

      for (let i = 0; i < SPINS; i++) {
        const result = resolveSpin(WAYS, 1, rng)
        staked += result.staked
        paid += result.paid
        if (result.freeSpinsAwarded > 0) triggers++
        for (const step of result.steps) if (step.free) freePaid += step.paid
        // One paid screen and, when the galaxies land, ten free ones.
        expect(result.steps.filter((s) => s.free)).toHaveLength(result.freeSpinsAwarded)
      }

      // Everything here is enumerated, so this is a cross-check: the played return
      // has to land on 0.9398, not merely somewhere plausible. Standard deviation
      // near 2.7 over 500k spins is a standard error under 0.004, so ±0.02 is over
      // five of them — wide enough to be honest, tight enough an edited strip trips.
      expect(Math.abs(paid / staked - TOTAL_RETURN)).toBeLessThan(0.02)
      // The paid screen is not sampled — it is enumerated — so the part of the
      // measurement that is not the free games has to sit on the base game.
      expect((paid - freePaid) / staked).toBeCloseTo(exactBaseReturn(WAYS), 1)
      // The round shows up at the enumerated rate and carries its enumerated share.
      expect(SPINS / triggers).toBeGreaterThan(220)
      expect(SPINS / triggers).toBeLessThan(285)
      expect(freePaid / paid).toBeGreaterThan(FEATURE_FACTOR / (1 + FEATURE_FACTOR) - 0.03)
      expect(freePaid / paid).toBeLessThan(FEATURE_FACTOR / (1 + FEATURE_FACTOR) + 0.03)
    },
  )
})

describe('Nova Ways — the galaxy also pays on a count', () => {
  it('pays the scatter ladder from anywhere on the screen', () => {
    // Three galaxies on three different reels and rows: no adjacency, no line, and
    // they pay two times the total stake anyway.
    const window = screen('SC K K K K', 'K K SC K K', 'K K K K SC')
    expect(scatterWins(window, WAYS, 25)[0].paid).toBe(WAYS.scatterPays!.SC[3] * 25)
  })
})
