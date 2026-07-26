import { describe, expect, it } from 'vitest'

import { makeRng } from '../../engine/rng'
import { evaluate, lineWins, scatterWins } from '../evaluate'
import { resolveSpin } from '../machine'
import { exactBaseReturn, exactLineReturn, exactScatterReturn } from '../rtp'
import type { Machine, SymbolId } from '../types'
import { BELL } from './bell'

// --- helpers ---------------------------------------------------------------

const COINS_PER_LINE = 1
const TOTAL_STAKE = COINS_PER_LINE * BELL.lines.length

/** A screen of nothing. The blank has no pay schedule, so a window built on it
 *  wins exactly what the test puts into it and nothing else. */
function blankWindow(): SymbolId[][] {
  return BELL.strips.map(() => new Array<SymbolId>(BELL.rows).fill('-'))
}

function place(cells: Array<[number, number, SymbolId]>): SymbolId[][] {
  const window = blankWindow()
  for (const [reel, row, id] of cells) window[reel][row] = id
  return window
}

/** A window holding exactly `n` bells, dealt reel by reel. */
function bells(n: number): SymbolId[][] {
  const window = blankWindow()
  let left = n
  for (let reel = 0; reel < window.length && left > 0; reel++) {
    for (let row = 0; row < BELL.rows && left > 0; row++, left--) window[reel][row] = 'BL'
  }
  return window
}

const ladder = BELL.scatterPays?.BL ?? {}

// --- the ladder ------------------------------------------------------------

describe('the bell ladder', () => {
  it('pays every rung exactly what the table says', () => {
    const rungs = Object.keys(ladder).map(Number)
    expect(rungs).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])

    for (const count of rungs) {
      const wins = scatterWins(bells(count), BELL, TOTAL_STAKE)
      expect(wins).toHaveLength(1)
      expect(wins[0].count).toBe(count)
      expect(wins[0].paid).toBeCloseTo(ladder[count] * TOTAL_STAKE, 8)
    }
  })

  it('pays nothing for one or two bells', () => {
    for (const count of [0, 1, 2]) expect(scatterWins(bells(count), BELL, TOTAL_STAKE)).toEqual([])
  })

  it('is steep: every rung is worth several times the one below it', () => {
    for (let n = 4; n <= 9; n++) expect(ladder[n]).toBeGreaterThanOrEqual(ladder[n - 1] * 2.5)
  })

  it('tops out at a jackpot and bottoms out at less than the bet', () => {
    expect(ladder[3]).toBeLessThan(1)
    expect(ladder[9]).toBe(1200)
  })

  it('pays from anywhere — no line, no adjacency', () => {
    // Reels 0, 2 and 4, on three different rows: no two bells share a reel, no
    // two sit on adjacent reels, and no payline passes through all three.
    const window = place([
      [0, 0, 'BL'],
      [2, 2, 'BL'],
      [4, 1, 'BL'],
    ])
    for (const line of BELL.lines) {
      const onLine = line.filter((row, reel) => window[reel][row] === 'BL').length
      expect(onLine).toBeLessThan(3)
    }

    const wins = scatterWins(window, BELL, TOTAL_STAKE)
    expect(wins).toHaveLength(1)
    expect(wins[0].count).toBe(3)
    expect(wins[0].paid).toBeCloseTo(0.5 * TOTAL_STAKE, 8)
    expect(wins[0].line).toBe(-1)
  })

  it('quotes the ladder against the total stake, not the line', () => {
    const window = bells(5)
    const single = scatterWins(window, BELL, TOTAL_STAKE)[0].paid
    const double = scatterWins(window, BELL, TOTAL_STAKE * 2)[0].paid
    expect(double).toBeCloseTo(single * 2, 8)
  })

  it('never lets a bell stand in for a paying symbol', () => {
    // Three bells then two sevens: the sevens are a run of two and pay nothing,
    // and the bells pay only as a screen count.
    const window = place([
      [0, 1, 'BL'],
      [1, 1, 'BL'],
      [2, 1, 'BL'],
      [3, 1, '7'],
      [4, 1, '7'],
    ])
    expect(lineWins(window, BELL, COINS_PER_LINE)).toEqual([])
    expect(scatterWins(window, BELL, TOTAL_STAKE)[0].paid).toBeCloseTo(0.5 * TOTAL_STAKE, 8)
  })
})

// --- lines -----------------------------------------------------------------

describe('the paylines', () => {
  it('has thirty distinct lines', () => {
    expect(BELL.lines).toHaveLength(30)
    expect(new Set(BELL.lines.map((l) => l.join(''))).size).toBe(30)
  })

  it('draws every line as a path a player could trace', () => {
    for (const line of BELL.lines) {
      expect(line).toHaveLength(BELL.strips.length)
      for (const row of line) expect(row).toBeGreaterThanOrEqual(0)
      for (const row of line) expect(row).toBeLessThan(BELL.rows)
      // A line that jumped two rows between adjacent reels would not be a line.
      for (let reel = 1; reel < line.length; reel++) {
        expect(Math.abs(line[reel] - line[reel - 1])).toBeLessThanOrEqual(1)
      }
    }
  })

  it('pays a run that starts on reel one', () => {
    const window = place([
      [0, 1, '7'],
      [1, 1, '7'],
      [2, 1, '7'],
    ])
    const win = lineWins(window, BELL, COINS_PER_LINE).find((w) => w.line === 0)
    expect(win?.symbol).toBe('7')
    expect(win?.count).toBe(3)
    expect(win?.paid).toBe(75 * COINS_PER_LINE)
  })

  it('pays nothing for the same run one reel to the right', () => {
    const window = place([
      [1, 1, '7'],
      [2, 1, '7'],
      [3, 1, '7'],
    ])
    expect(lineWins(window, BELL, COINS_PER_LINE)).toEqual([])
  })
})

// --- wilds -----------------------------------------------------------------

describe('the wild', () => {
  it('substitutes to complete a run', () => {
    const window = place([
      [0, 1, '7'],
      [1, 1, 'W'],
      [2, 1, '7'],
      [3, 1, '7'],
    ])
    const win = lineWins(window, BELL, COINS_PER_LINE).find((w) => w.line === 0)
    expect(win?.symbol).toBe('7')
    expect(win?.count).toBe(4)
    expect(win?.paid).toBe(400 * COINS_PER_LINE)
  })

  it('substitutes from reel one', () => {
    const window = place([
      [0, 1, 'W'],
      [1, 1, 'W'],
      [2, 1, 'D'],
      [3, 1, 'D'],
      [4, 1, 'D'],
    ])
    const win = lineWins(window, BELL, COINS_PER_LINE).find((w) => w.line === 0)
    expect(win?.symbol).toBe('D')
    expect(win?.count).toBe(5)
    expect(win?.paid).toBe(1000 * COINS_PER_LINE)
  })

  it('is paid as itself when that is worth more', () => {
    // Three wilds could be read as three tens (6) or as three wilds (100).
    const window = place([
      [0, 1, 'W'],
      [1, 1, 'W'],
      [2, 1, 'W'],
      [3, 1, 'T'],
    ])
    const win = lineWins(window, BELL, COINS_PER_LINE).find((w) => w.line === 0)
    expect(win?.symbol).toBe('W')
    expect(win?.paid).toBe(100 * COINS_PER_LINE)
  })

  it('carries no multiplier, so a win with two wilds pays the plain schedule', () => {
    // If the wild ever gains a multiplier this fails, which is the point: a
    // multiplying wild makes each reel weigh a symbol at (count + 2·wilds)/60
    // and the strips below would no longer be cut to 95%.
    expect(BELL.symbols.find((s) => s.id === 'W')?.multiplier).toBeUndefined()
    const window = place([
      [0, 1, 'W'],
      [1, 1, 'W'],
      [2, 1, 'BAR'],
      [3, 1, 'BAR'],
    ])
    const win = lineWins(window, BELL, COINS_PER_LINE).find((w) => w.line === 0)
    expect(win?.paid).toBe(150 * COINS_PER_LINE)
  })
})

// --- the price of the machine ----------------------------------------------

describe('the return', () => {
  it('lands within 0.004 of the target the strips were cut to', () => {
    expect(BELL.targetRtp).toBe(0.95)
    const rtp = exactBaseReturn(BELL)
    expect(Math.abs(rtp - BELL.targetRtp)).toBeLessThan(0.004)
    // The figure itself, so a strip edit has to say what it changed it to.
    expect(rtp).toBeCloseTo(0.94982, 4)
  })

  it('splits roughly two thirds into the lines and the rest into the ladder', () => {
    const line = exactLineReturn(BELL)
    const scatter = exactScatterReturn(BELL)
    expect(line + scatter).toBeCloseTo(exactBaseReturn(BELL), 10)

    expect(line).toBeCloseTo(0.6446, 3)
    expect(scatter).toBeCloseTo(0.3052, 3)

    const lineShare = line / (line + scatter)
    expect(lineShare).toBeCloseTo(0.679, 2)
    expect(lineShare).toBeGreaterThan(0.6)
    expect(lineShare).toBeLessThan(0.75)
  })

  it('puts almost none of the return in the jackpot rung', () => {
    // Nine or more bells is worth 1200x and happens about once in 127,000
    // spins, so it carries under 1% of the machine — the ladder is funded by
    // the rungs a player actually reaches.
    const withoutTop: Machine = {
      ...BELL,
      scatterPays: { BL: { ...ladder, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0 } },
    }
    const jackpot = exactScatterReturn(BELL) - exactScatterReturn(withoutTop)
    expect(jackpot).toBeGreaterThan(0)
    expect(jackpot / exactBaseReturn(BELL)).toBeLessThan(0.01)
  })
})

describe('a simulated shift', () => {
  it('measures the return the strips were cut to', () => {
    // No feature, so nothing here can pay that the exact figure has not already
    // counted: measured and exact must agree up to sampling error. Over 200k
    // spins the standard error is about 0.012 — a heavy ladder and a 4000x top
    // line award make this a high-variance machine — so the tolerance is three
    // of those. The seed is fixed, so the test is deterministic.
    const rng = makeRng(20260726)
    const spins = 200_000
    let staked = 0
    let paid = 0
    let hits = 0

    for (let i = 0; i < spins; i++) {
      const result = resolveSpin(BELL, COINS_PER_LINE, rng)
      // `feature: 'none'` means one screen and no free games, ever.
      expect(result.steps).toHaveLength(1)
      expect(result.freeSpinsAwarded).toBe(0)
      staked += result.staked
      paid += result.paid
      if (result.steps[0].wins.length > 0) hits++
    }

    expect(staked).toBe(spins * TOTAL_STAKE)
    expect(Math.abs(paid / staked - exactBaseReturn(BELL))).toBeLessThan(0.04)

    // Roughly a third of spins pay something, which is what keeps a machine
    // this top-heavy playable.
    expect(hits / spins).toBeGreaterThan(0.28)
    expect(hits / spins).toBeLessThan(0.38)
  }, 60_000)

  it('agrees with the evaluator it was measured through', () => {
    const rng = makeRng(4242)
    for (let i = 0; i < 500; i++) {
      const result = resolveSpin(BELL, COINS_PER_LINE, rng)
      const step = result.steps[0]
      const wins = evaluate(step.window, BELL, COINS_PER_LINE, TOTAL_STAKE)
      expect(wins.reduce((sum, w) => sum + w.paid, 0)).toBeCloseTo(result.paid, 8)
    }
  })
})
