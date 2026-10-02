import { describe, expect, it } from 'vitest'

import { makeRng } from '../../engine/rng'
import { pickValue } from '../bonus'
import { lineWins, scatterWins } from '../evaluate'
import { resolveSpin } from '../machine'
import { exactBaseReturn, exactLineReturn, exactScatterReturn, screenCountDistribution } from '../rtp'
import type { Bonus, Machine, SymbolId } from '../types'
import { LATESHOW } from './lateshow'

/** The base game, enumerated: lines 0.642241 + marquees 0.009118. Neither the
 *  free games nor the doors are in here — the doors because they are not a screen
 *  pay at all, the free games because they cannot be enumerated, an expanded reel
 *  no longer being distributed like a spun one. This is the figure that says the
 *  strips and the pay table are right. */
const BASE_RETURN = 0.651358

/** How much the free games multiply the base game by: 1.355553 ± 0.003978 over
 *  24,000,000 spins in eight streams, measured with the paid screen taken out of
 *  the sample because that part is enumerated and only adds noise.
 *
 *  Per-spin return on this machine has a standard deviation near 7, so one stream
 *  of a few hundred thousand spins resolves the return to about a percentage point
 *  and no better. Anything below quoted from one stream is a tripwire, not a
 *  price. */
const FREE_LEVERAGE = 1.355553

/** The backstage round, which unlike the free games is exact: seven prizes
 *  totalling 41 against a single fire exit, so each prize is collected half the
 *  time. Bought once in 266 spins. */
const PICK_VALUE = 20.5
const PICK_RETURN = 0.077047

const FULL_RETURN = BASE_RETURN * FREE_LEVERAGE + PICK_RETURN
const FREE_SHARE = (BASE_RETURN * (FREE_LEVERAGE - 1)) / FULL_RETURN

function pick(): Extract<Bonus, { kind: 'pick' }> {
  const bonus = LATESHOW.bonus
  if (bonus?.kind !== 'pick') throw new Error('The Late Show is a pick machine')
  return bonus
}

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
    // Three aces on all twenty-five lines (18 each) plus the three marquees
    // (twice the 25-coin stake): 500 for the paid screen, 1000 for each of the
    // ten free ones.
    const r = resolveSpin(rigged(A3, A3, A3, TWO_MRQ, ONE_MRQ), 1, makeRng(2))

    const [paidStep, ...free] = r.steps
    expect(paidStep.multiplier).toBe(1)
    expect(paidStep.paid).toBe(25 * 18 + 2 * 25)

    for (const step of free) {
      expect(step.multiplier).toBe(2)
      expect(step.paid).toBe(2 * step.wins.reduce((sum, w) => sum + w.paid, 0))
      expect(step.paid).toBe(2 * (25 * 18 + 2 * 25))
    }
    // No door on any of these strips, so nothing is buying a pick round here.
    expect(r.bonus).toBeUndefined()
    expect(r.paid).toBe(500 + 10 * 1000)
  })
})

describe('The Late Show — the stage doors', () => {
  const ONE_BON = ['BON', '-', '-']

  it('buys the round for three doors anywhere, and nothing for two', () => {
    const three = resolveSpin(rigged(ONE_BON, ONE_BON, ONE_BON, BLANK, BLANK), 1, makeRng(4))
    expect(three.bonus?.kind).toBe('pick')
    // No marquee on these strips, so the doors bought the round on their own.
    expect(three.freeSpinsAwarded).toBe(0)

    const two = resolveSpin(rigged(ONE_BON, ONE_BON, BLANK, BLANK, BLANK), 1, makeRng(4))
    expect(two.bonus).toBeUndefined()
    expect(two.paid).toBe(0)
  })

  it('pays nothing on a line and never stands in for anything', () => {
    // A door between two aces breaks the run, exactly as a blank would.
    expect(lineWins(screen('- - - - -', 'A BON A - -', '- - - - -'), LATESHOW, 1)).toHaveLength(0)
    expect(LATESHOW.linePays.BON).toBeUndefined()
    expect(LATESHOW.scatterPays?.BON).toBeUndefined()
    expect(LATESHOW.symbols.find((s) => s.id === 'BON')?.scatter).toBeUndefined()
    expect(LATESHOW.symbols.find((s) => s.id === 'BON')?.wild).toBeUndefined()
  })

  it('is worth half its pool, because one door in eight is the fire exit', () => {
    expect(pick().prizes.reduce((a, b) => a + b, 0)).toBe(41)
    expect(pick().enders).toBe(1)
    expect(pickValue(pick())).toBe(PICK_VALUE)
    // The loosest board in the building: four and a half doors opened on average
    // out of eight, against Rockslide's 3.25 out of twelve.
    const board = pick().prizes.length + pick().enders
    expect((board + 1) / (pick().enders + 1)).toBeCloseTo(4.5, 10)
  })

  it('is bought once in 266 spins, exactly — the same rate as the marquees', () => {
    const doors = screenCountDistribution(LATESHOW, 'BON')
    const p = doors.slice(pick().triggerCount).reduce((a, b) => a + b, 0)
    expect(p).toBeCloseTo(0.00375838, 8)
    expect(p * PICK_VALUE).toBeCloseTo(PICK_RETURN, 6)

    // Both symbols sit one to a reel on the same five forty-stop strips, so the
    // two triggers are the same convolution of the same 3/40 and land on the same
    // number. That is arithmetic, not a copy-paste.
    const marquees = screenCountDistribution(LATESHOW, 'mrq')
    expect(marquees.slice(3).reduce((a, b) => a + b, 0)).toBeCloseTo(p, 12)
  })
})

describe('The Late Show — reading a screen', () => {
  it('pays a run only when it starts on reel one', () => {
    expect(lineWins(screen('- - - - -', 'A A A - -', '- - - - -'), LATESHOW, 1)[0].paid).toBe(18)
    // The same three aces one reel to the right, with nothing on reel one.
    expect(lineWins(screen('- - - - -', '- A A A -', '- - - - -'), LATESHOW, 1)).toHaveLength(0)
  })

  it('substitutes the spotlight but never the marquee', () => {
    expect(lineWins(screen('- - - - -', 'A spot A - -', '- - - - -'), LATESHOW, 1)[0].paid).toBe(18)
    expect(lineWins(screen('- - - - -', 'A mrq A - -', '- - - - -'), LATESHOW, 1)).toHaveLength(0)
  })
})

describe('The Late Show — the return', () => {
  it('has a base game cut to the figure it claims', () => {
    expect(exactBaseReturn(LATESHOW)).toBeCloseTo(BASE_RETURN, 5)
    // Well under the target: two rounds have to be given room to land in.
    expect(exactBaseReturn(LATESHOW)).toBeLessThan(LATESHOW.targetRtp - 0.25)
  })

  it('prices the whole machine as base × free games + doors', () => {
    expect(FULL_RETURN).toBeCloseTo(0.96, 3)
    expect(Math.abs(FULL_RETURN - LATESHOW.targetRtp)).toBeLessThan(0.004)
    // The doors are 8% of the machine and the free games 24%: two features, and
    // the base game is only two thirds of what this cabinet pays.
    expect(PICK_RETURN / FULL_RETURN).toBeCloseTo(0.080, 2)
    expect(FREE_SHARE).toBeCloseTo(0.241, 2)
  })

  it('cost the pay table 8% to add the doors, because the round multiplies them', () => {
    // The doors are worth 0.0770 of return, but the free games multiply every line
    // pay by 1.356, so buying them at the pay table only cost 0.0568 of base game.
    // That is the whole reason the table came down 8% rather than 12%.
    const oldTable: Machine = {
      ...LATESHOW,
      linePays: {
        mic: [0, 0, 0, 75, 325, 1500],
        mar: [0, 0, 0, 50, 250, 1000],
        sax: [0, 0, 0, 35, 160, 600],
        crt: [0, 0, 0, 30, 125, 500],
        A: [0, 0, 0, 20, 70, 260],
        K: [0, 0, 0, 15, 55, 200],
        Q: [0, 0, 0, 10, 40, 150],
        J: [0, 0, 0, 9, 35, 125],
        T: [0, 0, 0, 7, 30, 100],
      },
    }
    const scale = exactLineReturn(LATESHOW) / exactLineReturn(oldTable)
    expect(scale).toBeGreaterThan(0.91)
    expect(scale).toBeLessThan(0.93)
    const cut = (exactBaseReturn(oldTable) - exactBaseReturn(LATESHOW)) * FREE_LEVERAGE
    expect(cut).toBeCloseTo(PICK_RETURN, 2)
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
      let doorPaid = 0
      let triggers = 0
      let doors = 0
      for (let i = 0; i < spins; i++) {
        const r = resolveSpin(LATESHOW, 1, rng)
        staked += r.staked
        paid += r.paid
        doorPaid += r.bonus?.paid ?? 0
        if (r.freeSpinsAwarded > 0) triggers++
        if (r.bonus) doors++
        for (const step of r.steps) if (step.free) freePaid += step.paid
      }

      // A fortieth of the spins the reported figure was pooled over. At a
      // per-spin standard deviation near 7 that is a standard error of 0.013, so
      // the band is three of them — wide, and honestly so. Anything that moves
      // the return by the amount an edited strip would still trips it.
      expect(paid / staked).toBeGreaterThan(FULL_RETURN - 0.04)
      expect(paid / staked).toBeLessThan(FULL_RETURN + 0.04)

      // The paid screen is not sampled — it is enumerated — so the part of the
      // measurement that is neither free games nor doors has to land on it.
      expect((paid - freePaid - doorPaid) / staked).toBeCloseTo(exactBaseReturn(LATESHOW), 1)

      // Nearly a quarter of everything the machine pays comes out of ten free
      // games it hands out once in every two hundred and seventy spins, and
      // another twelfth out of the doors it hands out just as often.
      expect(freePaid / paid).toBeGreaterThan(FREE_SHARE - 0.03)
      expect(freePaid / paid).toBeLessThan(FREE_SHARE + 0.03)
      expect(doorPaid / paid).toBeGreaterThan(PICK_RETURN / FULL_RETURN - 0.03)
      expect(doorPaid / paid).toBeLessThan(PICK_RETURN / FULL_RETURN + 0.03)
      expect(spins / triggers).toBeGreaterThan(220)
      expect(spins / triggers).toBeLessThan(320)
      expect(spins / doors).toBeGreaterThan(220)
      expect(spins / doors).toBeLessThan(320)
    },
  )
})
