import { describe, expect, it } from 'vitest'

import { makeRng } from '../../engine/rng'
import { evaluate, lineWins, scatterWins } from '../evaluate'
import { resolveSpin } from '../machine'
import { exactBaseReturn, exactLineReturn, exactScatterReturn, screenCountDistribution } from '../rtp'
import type { Bonus, Machine, SymbolId } from '../types'
import { BELL } from './bell'

// --- helpers ---------------------------------------------------------------

const COINS_PER_LINE = 1
const TOTAL_STAKE = COINS_PER_LINE * BELL.lines.length

/** The enumerated part: thirty lines plus a ladder that now stops climbing at
 *  six bells because six bells buys a round instead. */
const BASE_RETURN = 0.853105

/** The round, measured. 30.1779 ± 0.0450 stakes over 3.2M rounds in eight
 *  streams, bought once in 312 spins, so 0.096808 of the machine — and there is
 *  no closed form for it, because every coin that lands buys the respins back.
 *  `bonus.test.ts` is what holds the 30.1779; this file holds what it adds up to. */
const HOLD_SPIN_VALUE = 30.1779
const HOLD_SPIN_RETURN = 0.096808

/** What the ladder paid for six bells and up before the round existed. The whole
 *  rebalance is the claim that this number did not change — it only stopped being
 *  a number on the glass. */
const OLD_TOP_LADDER = { 6: 24, 7: 100, 8: 300, 9: 1200, 10: 1200, 11: 1200, 12: 1200, 13: 1200, 14: 1200, 15: 1200 }

function holdSpin(): Extract<Bonus, { kind: 'holdSpin' }> {
  const bonus = BELL.bonus
  if (bonus?.kind !== 'holdSpin') throw new Error('Bell Ringer is a hold-and-spin machine')
  return bonus
}

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

  it('is steep to five, because those rungs have to carry themselves', () => {
    // Three, four and five bells pay and nothing else happens, so the count alone
    // has to be worth chasing.
    for (let n = 4; n <= 5; n++) expect(ladder[n]).toBeGreaterThanOrEqual(ladder[n - 1] * 2.5)
  })

  it('goes almost flat at six, because six is where the round starts', () => {
    // The kink is the design. Six bells pays 10 where five pays 9 — which looks
    // like an error and is the opposite of one, because the sixth bell also locks
    // the screen for a round worth thirty times the stake. Rising at all past six
    // is a courtesy; rising steeply would be paying twice for the same screen.
    expect(ladder[6]).toBeGreaterThan(ladder[5])
    expect(ladder[6]).toBeLessThan(ladder[5] * 1.5)
    for (let n = 7; n <= 9; n++) {
      expect(ladder[n]).toBeGreaterThan(ladder[n - 1])
      expect(ladder[n]).toBeLessThan(ladder[n - 1] * 4)
    }
  })

  it('tops out at a jackpot and bottoms out at less than the bet', () => {
    expect(ladder[3]).toBeLessThan(1)
    // Down from 1200. The jackpot moved into the round's full screen, which is
    // worth 300× on top of the coins and lands thirty times more often.
    expect(ladder[9]).toBe(200)
    expect(holdSpin().fullScreen).toBe(300)
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
  it('enumerates to a base well under the target, leaving the round room', () => {
    expect(BELL.targetRtp).toBe(0.95)
    const base = exactBaseReturn(BELL)
    // The figure itself, so a strip or ladder edit has to say what it changed it
    // to. It is exact: lines and a screen-count ladder, both enumerable.
    expect(base).toBeCloseTo(BASE_RETURN, 5)
    expect(base).toBeLessThan(BELL.targetRtp)
  })

  it('lands on its target once the round is added in', () => {
    const dist = screenCountDistribution(BELL, 'BL')
    const pTrigger = dist.slice(holdSpin().triggerCount).reduce((a, b) => a + b, 0)
    // Exactly enumerable even though the round it buys is not: the trigger is a
    // screen count, and `screenCountDistribution` convolves it across the reels.
    expect(pTrigger).toBeCloseTo(0.0032079, 7)
    expect(1 / pTrigger).toBeGreaterThan(300)
    expect(1 / pTrigger).toBeLessThan(325)

    expect(pTrigger * HOLD_SPIN_VALUE).toBeCloseTo(HOLD_SPIN_RETURN, 5)
    expect(Math.abs(exactBaseReturn(BELL) + HOLD_SPIN_RETURN - BELL.targetRtp)).toBeLessThan(0.004)
  })

  it('paid for the round out of the top of the ladder and nothing else', () => {
    // The rebalance, asserted rather than described. Six bells and up used to be
    // worth 0.1406 of the machine as a pay; it is now worth 0.0439 as a pay plus
    // 0.0968 as a round, and those come to the same thing. Nothing else moved.
    const old: Machine = { ...BELL, scatterPays: { BL: { 3: 0.5, 4: 2, 5: 9, ...OLD_TOP_LADDER } } }
    const flat: Machine = { ...BELL, scatterPays: { BL: { 3: 0.5, 4: 2, 5: 9 } } }

    const bellsOnly = exactScatterReturn(flat)
    const oldTop = exactScatterReturn(old) - bellsOnly
    const newTop = exactScatterReturn(BELL) - bellsOnly

    expect(oldTop).toBeCloseTo(0.140563, 5)
    expect(newTop).toBeCloseTo(0.043852, 5)
    expect(newTop + HOLD_SPIN_RETURN).toBeCloseTo(oldTop, 3)

    // And the rungs below the trigger are untouched, because five bells never
    // bought a round and has no reason to pay for one.
    expect(exactLineReturn(old)).toBeCloseTo(exactLineReturn(BELL), 12)
    expect(bellsOnly).toBeCloseTo(0.164614, 5)
  })

  it('splits three quarters into the lines and the rest into the ladder', () => {
    const line = exactLineReturn(BELL)
    const scatter = exactScatterReturn(BELL)
    expect(line + scatter).toBeCloseTo(exactBaseReturn(BELL), 10)

    expect(line).toBeCloseTo(0.6446, 3)
    expect(scatter).toBeCloseTo(0.2085, 3)

    // The ladder's share fell from two thirds-ish to a quarter of the enumerated
    // return, because a third of the ladder became a feature.
    const lineShare = line / (line + scatter)
    expect(lineShare).toBeGreaterThan(0.73)
    expect(lineShare).toBeLessThan(0.78)
  })

  it('puts almost none of the return in the jackpot rung', () => {
    // Nine or more bells happens about once in 127,000 spins, so even at 1200x it
    // carried under 1% of the machine and at 200x it carries a fifth of that —
    // the ladder is funded by the rungs a player actually reaches.
    const withoutTop: Machine = {
      ...BELL,
      scatterPays: { BL: { ...ladder, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0 } },
    }
    const jackpot = exactScatterReturn(BELL) - exactScatterReturn(withoutTop)
    expect(jackpot).toBeGreaterThan(0)
    expect(jackpot / exactBaseReturn(BELL)).toBeLessThan(0.005)
  })
})

describe('a simulated shift', () => {
  it('measures a screen return that the enumeration has already counted', () => {
    // `feature: 'none'` still means one screen and no free games, so everything
    // the *glass* pays is already in the exact figure: measured and enumerated
    // must agree up to sampling error, and the round is the only thing that can
    // sit outside them. Over 200k spins the standard error on the screen part is
    // about 0.012 — a heavy ladder and a 4000x top line award make this a
    // high-variance machine — so the tolerance is three of those.
    const rng = makeRng(20260726)
    const spins = 200_000
    let staked = 0
    let screens = 0
    let rounds = 0
    let triggers = 0
    let hits = 0

    for (let i = 0; i < spins; i++) {
      const result = resolveSpin(BELL, COINS_PER_LINE, rng)
      expect(result.steps).toHaveLength(1)
      expect(result.freeSpinsAwarded).toBe(0)
      staked += result.staked
      screens += result.steps[0].paid
      rounds += result.bonus?.paid ?? 0
      if (result.bonus) triggers++
      if (result.steps[0].wins.length > 0) hits++
      // The spin's total is the screen plus the round and nothing else.
      expect(result.paid).toBeCloseTo(result.steps[0].paid + (result.bonus?.paid ?? 0), 8)
    }

    expect(staked).toBe(spins * TOTAL_STAKE)
    expect(Math.abs(screens / staked - exactBaseReturn(BELL))).toBeLessThan(0.04)

    // The round, bought once in 312 spins. At 200k spins that is only ~640 rounds,
    // so its own return here is worth ±0.03 at best — the band is deliberately
    // loose and `bonus.test.ts` is where the round is actually priced.
    expect(spins / triggers).toBeGreaterThan(270)
    expect(spins / triggers).toBeLessThan(360)
    expect(rounds / staked).toBeGreaterThan(0.05)
    expect(rounds / staked).toBeLessThan(0.15)

    // Roughly a third of spins pay something, which is what keeps a machine
    // this top-heavy playable.
    expect(hits / spins).toBeGreaterThan(0.28)
    expect(hits / spins).toBeLessThan(0.38)
  }, 60_000)

  it('agrees with the evaluator it was measured through', () => {
    const rng = makeRng(4242)
    for (let i = 0; i < 2_000; i++) {
      const result = resolveSpin(BELL, COINS_PER_LINE, rng)
      const step = result.steps[0]
      const wins = evaluate(step.window, BELL, COINS_PER_LINE, TOTAL_STAKE)
      // The evaluator owes the screen; the round is not its business.
      expect(wins.reduce((sum, w) => sum + w.paid, 0)).toBeCloseTo(
        result.paid - (result.bonus?.paid ?? 0),
        8,
      )
    }
  })

  it('locks the bells that were on the screen, not a number of its own', () => {
    const rng = makeRng(0xbe115)
    let seen = 0
    for (let i = 0; i < 300_000 && seen < 40; i++) {
      const result = resolveSpin(BELL, COINS_PER_LINE, rng)
      if (!result.bonus) continue
      seen++
      const bells = result.steps[0].window.flat().filter((id) => id === 'BL').length
      expect(bells).toBeGreaterThanOrEqual(holdSpin().triggerCount)
      // The opening grid is those bells, already coins.
      const opening = (result.bonus.grids ?? [])[0]
      expect(opening.filter((c) => c !== null)).toHaveLength(bells)
    }
    expect(seen).toBe(40)
  }, 60_000)
})
