import { describe, expect, it } from 'vitest'

import { makeRng } from '../../engine/rng'
import { lineWins, scatterWins } from '../evaluate'
import { resolveSpin } from '../machine'
import { exactBaseReturn, exactLineReturn, exactScatterReturn, screenCountDistribution } from '../rtp'
import type { Machine, SymbolId } from '../types'
import { LATESHOW } from './lateshow'

/** The base game, enumerated: lines 0.699854 + marquees 0.009118. The free games
 *  are not in here and cannot be — an expanded reel is no longer distributed
 *  like a spun one — so this is the figure that says the strips and the pay
 *  table are right, and the simulation below is what says the round is. */
const BASE_RETURN = 0.7090

/** Measured 0.961 ± 0.003 (two standard errors) pooled over sixteen independent
 *  streams of 1,500,000 spins, 0.262 of it out of the free games.
 *
 *  Per-spin return on this machine has a standard deviation of 7.3, so one
 *  stream of a few hundred thousand spins resolves the return to about a
 *  percentage point and no better. The run below is therefore a tripwire — it
 *  catches a strip or a pay edited by a symbol — and its band is deliberately
 *  three standard errors wide rather than tight enough to look authoritative. */
const FULL_RETURN = 0.96
const FREE_SHARE = 0.262

/** Build a window from rows written out as strings, top row first. */
function screen(...rows: string[]): SymbolId[][] {
  const grid = rows.map((r) => r.trim().split(/\s+/))
  const reels = grid[0].length
  return Array.from({ length: reels }, (_, reel) => grid.map((row) => row[reel]))
}

/** A three-stop strip is shown whole in a three-row window whatever the stop
 *  lands on, so its contents are fixed and only their order moves. That makes a
 *  machine whose every screen is known in advance, without reaching into the
 *  RNG or duplicating what `resolveSpin` does. */
function rigged(...strips: SymbolId[][]): Machine {
  return { ...LATESHOW, strips }
}

const A3 = ['A', 'A', 'A']
const BLANK = ['-', '-', '-']
/** Exactly one marquee on screen, in a row nobody chose. */
const ONE_MRQ = ['mrq', '-', '-']
const TWO_MRQ = ['mrq', 'mrq', '-']
const ONE_SPOT = ['spot', '-', '-']

describe('The Late Show — the marquees', () => {
  it('buys ten free games for three marquees anywhere, and nothing for two', () => {
    // Three aces on every line either way, so the only difference between the
    // two spins is the third marquee.
    const three = resolveSpin(rigged(A3, A3, A3, TWO_MRQ, ONE_MRQ), 1, makeRng(1))
    expect(three.freeSpinsAwarded).toBe(10)
    expect(three.steps.filter((s) => s.free)).toHaveLength(10)

    const two = resolveSpin(rigged(A3, A3, A3, ONE_MRQ, ONE_MRQ), 1, makeRng(1))
    expect(two.freeSpinsAwarded).toBe(0)
    expect(two.steps).toHaveLength(1)
  })

  it('counts them from anywhere on screen rather than along a line', () => {
    // Reels one, three and five, on three different rows: no payline visits all
    // of these cells, and the marquees pay anyway.
    const window = screen('mrq - - - -', '- - - - -', '- - mrq - mrq')
    expect(scatterWins(window, LATESHOW, 25)[0].paid).toBe(2 * 25)
    expect(lineWins(window, LATESHOW, 1)).toHaveLength(0)

    // And the rigged reels above put their marquees wherever the stop falls,
    // which is a different set of rows on every seed — still ten free games.
    for (const seed of [3, 17, 91, 404]) {
      const r = resolveSpin(rigged(BLANK, BLANK, TWO_MRQ, BLANK, ONE_MRQ), 1, makeRng(seed))
      expect(r.freeSpinsAwarded).toBe(10)
    }
  })

  it('will not let a free game buy another free game', () => {
    // Every screen this machine can produce carries three marquees, the free
    // ones included. Ten is still ten, because `resolveSpin` reads the trigger
    // off the paid screen only.
    const r = resolveSpin(rigged(A3, A3, A3, TWO_MRQ, ONE_MRQ), 1, makeRng(9))
    expect(r.steps.filter((s) => s.free)).toHaveLength(10)
    for (const step of r.steps.slice(1)) {
      expect(step.window.flat().filter((id) => id === 'mrq')).toHaveLength(3)
    }
  })
})

describe('The Late Show — the spotlight', () => {
  it('takes its whole reel in a free game and only its own cell in the paid one', () => {
    const r = resolveSpin(rigged(ONE_SPOT, TWO_MRQ, BLANK, BLANK, ONE_MRQ), 1, makeRng(5))
    expect(r.freeSpinsAwarded).toBe(10)

    const [paidStep, ...free] = r.steps
    expect(paidStep.free).toBe(false)
    expect(paidStep.window[0].filter((id) => id === 'spot')).toHaveLength(1)

    for (const step of free) {
      expect(step.free).toBe(true)
      expect(step.window[0]).toEqual(['spot', 'spot', 'spot'])
      // Reels the spotlight never reaches are left exactly as they stopped.
      expect(step.window[2]).toEqual(BLANK)
    }
  })

  it('leaves a reel alone when no spotlight lands on it', () => {
    const r = resolveSpin(rigged(A3, A3, A3, TWO_MRQ, ONE_MRQ), 1, makeRng(11))
    for (const step of r.steps) expect(step.window[0]).toEqual(A3)
  })
})

describe('The Late Show — the multiplier', () => {
  it('doubles a free game and pays the spin that bought it straight', () => {
    // Three aces on all twenty-five lines (20 each) plus the three marquees
    // (twice the 25-coin stake): 550 for the paid screen, 1100 for each of the
    // ten free ones.
    const r = resolveSpin(rigged(A3, A3, A3, TWO_MRQ, ONE_MRQ), 1, makeRng(2))

    const [paidStep, ...free] = r.steps
    expect(paidStep.multiplier).toBe(1)
    expect(paidStep.paid).toBe(25 * 20 + 2 * 25)

    for (const step of free) {
      expect(step.multiplier).toBe(2)
      expect(step.paid).toBe(2 * step.wins.reduce((sum, w) => sum + w.paid, 0))
      expect(step.paid).toBe(2 * (25 * 20 + 2 * 25))
    }
    expect(r.paid).toBe(550 + 10 * 1100)
  })
})

describe('The Late Show — reading a screen', () => {
  it('pays a run only when it starts on reel one', () => {
    expect(lineWins(screen('- - - - -', 'A A A - -', '- - - - -'), LATESHOW, 1)[0].paid).toBe(20)
    // The same three aces one reel to the right, with nothing on reel one.
    expect(lineWins(screen('- - - - -', '- A A A -', '- - - - -'), LATESHOW, 1)).toHaveLength(0)
  })

  it('substitutes the spotlight but never the marquee', () => {
    expect(lineWins(screen('- - - - -', 'A spot A - -', '- - - - -'), LATESHOW, 1)[0].paid).toBe(20)
    expect(lineWins(screen('- - - - -', 'A mrq A - -', '- - - - -'), LATESHOW, 1)).toHaveLength(0)
  })
})

describe('The Late Show — the return', () => {
  it('has a base game cut to the figure it claims', () => {
    expect(Math.abs(exactBaseReturn(LATESHOW) - BASE_RETURN)).toBeLessThan(0.004)
    // Well under the target: the round has to be given room to land in.
    expect(exactBaseReturn(LATESHOW)).toBeLessThan(LATESHOW.targetRtp - 0.2)
  })

  it('splits that base between the lines and the marquees', () => {
    expect(exactLineReturn(LATESHOW) + exactScatterReturn(LATESHOW)).toBeCloseTo(
      exactBaseReturn(LATESHOW),
      12,
    )
    // The marquee ladder is deliberately small — it is there so the screen that
    // buys the round is itself a win, not so it pays the machine.
    expect(exactScatterReturn(LATESHOW)).toBeLessThan(0.015)
  })

  it('buys the round about once in every two hundred and seventy spins', () => {
    const feature = LATESHOW.feature
    if (feature.kind !== 'freeSpins') throw new Error('The Late Show is a free-games machine')
    const dist = screenCountDistribution(LATESHOW, feature.trigger)
    const trigger = dist.slice(feature.triggerCount).reduce((a, b) => a + b, 0)
    expect(trigger).toBeGreaterThan(1 / 320)
    expect(trigger).toBeLessThan(1 / 220)
  })

  it(
    'measures out at its target once the free games are played',
    { timeout: 30_000 },
    () => {
      const spins = 300_000
      const rng = makeRng(42)
      let staked = 0
      let paid = 0
      let freePaid = 0
      let triggers = 0
      for (let i = 0; i < spins; i++) {
        const r = resolveSpin(LATESHOW, 1, rng)
        staked += r.staked
        paid += r.paid
        if (r.freeSpinsAwarded > 0) triggers++
        for (const step of r.steps) if (step.free) freePaid += step.paid
      }

      // A fortieth of the spins the reported figure was pooled over. At a
      // per-spin standard deviation of 7.3 that is a standard error of 0.013, so
      // the band is three of them — wide, and honestly so. Anything that moves
      // the return by the amount an edited strip would still trips it.
      expect(paid / staked).toBeGreaterThan(FULL_RETURN - 0.04)
      expect(paid / staked).toBeLessThan(FULL_RETURN + 0.04)

      // The base game is not sampled — it is enumerated — so the part of the
      // measurement that is not free games has to land on the exact figure.
      expect((paid - freePaid) / staked).toBeCloseTo(exactBaseReturn(LATESHOW), 1)

      // Better than a quarter of everything the machine pays comes out of ten
      // free games it hands out once in every two hundred and seventy spins.
      expect(freePaid / paid).toBeGreaterThan(FREE_SHARE - 0.03)
      expect(freePaid / paid).toBeLessThan(FREE_SHARE + 0.03)
      expect(spins / triggers).toBeGreaterThan(220)
      expect(spins / triggers).toBeLessThan(320)
    },
  )
})
