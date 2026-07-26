import { describe, expect, it } from 'vitest'

import { makeRng } from '../../engine/rng'
import { pickValue } from '../bonus'
import { resolveSpin } from '../machine'
import { exactBaseReturn, screenCountDistribution } from '../rtp'
import type { Bonus, Machine, SpinResult, Step } from '../types'
import { ROCKSLIDE } from './rockslide'

/** The first drop and nothing else: what Rockslide would return if a winning
 *  screen never crumbled and no boulder ever landed. `exactBaseReturn` enumerates
 *  this one exactly, and it is the figure that says the strips and the pay table
 *  are cut right. */
const FIRST_DROP = 0.447022

/** How much the tumble multiplies the first drop by: 1.926157 ± 0.002158 over
 *  24,000,000 spins in eight streams, measured with the first drop taken out of
 *  the sample because that part is enumerated and only adds noise.
 *
 *  A cascade feeds its own next screen, so there is no finite state space to walk
 *  and nothing here to enumerate. This number is measured or it is nothing, which
 *  is why it is quoted with an error bar and `FIRST_DROP` is not. */
const TUMBLE_LEVERAGE = 1.926157

/** The pick round, which unlike the tumble is exact: nine prizes totalling 78
 *  against three enders, so each prize is collected one time in four and the pool
 *  is worth 19.5 × the total stake. Bought once in 221 drops. */
const PICK_VALUE = 19.5
const PICK_RETURN = 0.088243

/** The whole machine: the first drop times the tumble, plus the pick. */
const MEASURED_RTP = FIRST_DROP * TUMBLE_LEVERAGE + PICK_RETURN

function pick(): Extract<Bonus, { kind: 'pick' }> {
  const bonus = ROCKSLIDE.bonus
  if (bonus?.kind !== 'pick') throw new Error('Rockslide is a pick machine')
  return bonus
}

/** Rockslide's own feature, wired to a screen small enough to write down.
 *
 *  Four of the five reels carry a one-stop strip, so they can only ever show one
 *  symbol and the opening window is known before the spin. Reel three alternates
 *  A and blank, which is the single coin-flip that decides whether the chain
 *  carries on — enough randomness for a chain to die, little enough that every
 *  screen in it can be asserted literally. The spread keeps ROCKSLIDE's `feature`
 *  and `rows`, so the ladder and the trigger under test are the real ones. It also
 *  keeps ROCKSLIDE's `bonus`, which cannot fire here because no strip in the rig
 *  carries a boulder — so these tests see the cascade on its own. */
const TUMBLE: Machine = {
  ...ROCKSLIDE,
  id: 'rockslide-tumble-rig',
  symbols: [
    { id: 'A', label: 'A' },
    { id: '-', label: '' },
  ],
  strips: [['A'], ['A'], ['A', '-'], ['-'], ['-']],
  lines: [[0, 0, 0, 0, 0]],
  linePays: { A: [0, 0, 0, 5] },
  scatterPays: undefined,
}

/** The paid screens: everything before the first free game. */
function baseSteps(result: SpinResult): Step[] {
  const cut = result.steps.findIndex((s) => s.free)
  return cut === -1 ? result.steps : result.steps.slice(0, cut)
}

/** How many screens were *dealt* rather than tumbled into. A step follows a
 *  cascade exactly when the step before it won, so a step whose predecessor won
 *  nothing is the start of a new game. */
function gamesDealt(steps: Step[], free: boolean): number {
  return steps.filter((s, i) => s.free === free && (i === 0 || steps[i - 1].wins.length === 0)).length
}

function chainLength(result: SpinResult): number {
  return baseSteps(result).length - 1
}

describe('the cabinet', () => {
  it('is five reels of four rows with twenty traceable lines', () => {
    expect(ROCKSLIDE.strips).toHaveLength(5)
    expect(ROCKSLIDE.rows).toBe(4)
    expect(ROCKSLIDE.lines).toHaveLength(20)
    expect(new Set(ROCKSLIDE.lines.map((l) => l.join(''))).size).toBe(20)

    for (const line of ROCKSLIDE.lines) {
      expect(line).toHaveLength(5)
      for (const row of line) expect(row).toBeGreaterThanOrEqual(0)
      for (const row of line) expect(row).toBeLessThan(ROCKSLIDE.rows)
      // A payline a player can trace without lifting a finger: at most one row
      // of step between adjacent reels.
      for (let reel = 1; reel < line.length; reel++) {
        expect(Math.abs(line[reel] - line[reel - 1])).toBeLessThanOrEqual(1)
      }
    }
  })

  it('buys its free games with chain length, so it carries no scatter', () => {
    expect(ROCKSLIDE.symbols.some((s) => s.scatter)).toBe(false)
    expect(ROCKSLIDE.scatterPays).toBeUndefined()
    expect(ROCKSLIDE.feature).toEqual({
      kind: 'cascade',
      multipliers: [1, 2, 3, 5, 10],
      freeSpinsAt: 4,
      freeSpins: 8,
    })
  })

  it('keeps dead space frequent on every reel, which is what lets a chain die', () => {
    for (const strip of ROCKSLIDE.strips) {
      expect(strip).toHaveLength(50)
      // Blanks and boulders together. The boulder has no line pay, so as far as a
      // cascade is concerned it is a blank — which is exactly why trading one
      // blank a reel for one boulder left the tumble's arithmetic alone.
      const dead = strip.filter((id) => id === '-' || id === 'BON').length
      expect(dead).toBe(11)
      expect(dead / strip.length).toBeGreaterThan(0.2)
      expect(strip.filter((id) => id === 'BON')).toHaveLength(1)
    }
  })

  it('reads reel one thinnest on the symbols that pay most', () => {
    const count = (reel: number, id: string) => ROCKSLIDE.strips[reel].filter((s) => s === id).length
    for (const id of ['D', 'G']) {
      expect(count(0, id)).toBeLessThanOrEqual(count(4, id))
    }
    // Every paying symbol has to be reachable on every reel or its five-of-a-kind
    // is a pay table entry that can never be won.
    for (const id of Object.keys(ROCKSLIDE.linePays)) {
      for (let reel = 0; reel < 5; reel++) expect(count(reel, id)).toBeGreaterThan(0)
    }
  })
})

describe('the tumble', () => {
  // Seed 4 opens on this screen. Reel three shows A, blank, A, blank, so the top
  // row reads A A A - - : a run of three, and the only win on the board.
  const OPENING = [
    ['A', 'A', 'A', 'A'],
    ['A', 'A', 'A', 'A'],
    ['A', '-', 'A', '-'],
    ['-', '-', '-', '-'],
    ['-', '-', '-', '-'],
  ]

  it('crumbles exactly the winning cells and drops the rest to the floor', () => {
    const result = resolveSpin(TUMBLE, 1, makeRng(4))
    expect(result.steps[0].window).toEqual(OPENING)
    expect(result.steps[0].wins).toHaveLength(1)
    expect(result.steps[0].wins[0].count).toBe(3)
    expect(result.steps[0].wins[0].cells).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ])

    const after = result.steps[1].window
    // Reel three is the one that shows the mechanic. Its survivors were rows one
    // to three — blank, A, blank — and they are now sitting on the floor of the
    // column with one fresh symbol above them.
    expect(after[2]).toEqual(['-', '-', 'A', '-'])
    expect(after[2].slice(1)).toEqual(OPENING[2].slice(1))
    // Reels four and five lost nothing, so they are untouched.
    expect(after[3]).toEqual(OPENING[3])
    expect(after[4]).toEqual(OPENING[4])
    // Every column is back to full height — one cell out, one cell in.
    for (const col of after) expect(col).toHaveLength(TUMBLE.rows)
    // And the chain stopped, because the fresh symbol was a blank.
    expect(result.steps).toHaveLength(2)
    expect(result.steps[1].wins).toHaveLength(0)
  })

  it('leaves a losing screen alone: one step, no cascade', () => {
    // Seed 1 puts a blank on the top of reel three, so nothing lines up.
    const result = resolveSpin(TUMBLE, 1, makeRng(1))
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].window[2]).toEqual(['-', 'A', '-', 'A'])
    expect(result.steps[0].wins).toEqual([])
    expect(result.paid).toBe(0)
    expect(result.freeSpinsAwarded).toBe(0)
  })

  it('holds those three rules over every cascade of ten thousand real spins', () => {
    const rng = makeRng(31337)
    let cascades = 0

    for (let spin = 0; spin < 10_000; spin++) {
      const steps = resolveSpin(ROCKSLIDE, 1, rng).steps
      for (let i = 0; i + 1 < steps.length; i++) {
        // A screen only tumbles into the next one when it won; otherwise the next
        // step is a freshly dealt free game and the two are unrelated.
        if (steps[i].wins.length === 0) continue
        cascades++

        const doomed = new Set<string>()
        for (const win of steps[i].wins) for (const [reel, row] of win.cells) doomed.add(`${reel},${row}`)

        for (let reel = 0; reel < ROCKSLIDE.strips.length; reel++) {
          const before = steps[i].window[reel]
          const after = steps[i + 1].window[reel]
          const survivors = before.filter((_, row) => !doomed.has(`${reel},${row}`))
          const removed = before.length - survivors.length

          expect(after).toHaveLength(ROCKSLIDE.rows)
          expect(removed).toBe([...doomed].filter((k) => k.startsWith(`${reel},`)).length)
          expect(after.slice(removed)).toEqual(survivors)
        }
      }
    }

    expect(cascades).toBeGreaterThan(5_000)
  }, 30_000)
})

describe('the multiplier ladder', () => {
  it('climbs 1, 2, 3, 5, 10 in that order across a chain', () => {
    // Seed 3 tumbles five times off one drop.
    const result = resolveSpin(TUMBLE, 1, makeRng(3))
    expect(chainLength(result)).toBe(5)
    expect(baseSteps(result).map((s) => s.multiplier)).toEqual([1, 2, 3, 5, 10, 10])
  })

  it('holds at the last rung for chains longer than the ladder', () => {
    // Seed 739 gets to seven, two rungs past the end of the table.
    const result = resolveSpin(TUMBLE, 1, makeRng(739))
    expect(chainLength(result)).toBe(7)
    expect(baseSteps(result).map((s) => s.multiplier)).toEqual([1, 2, 3, 5, 10, 10, 10, 10])
  })

  it('pays each screen at the rung it landed on', () => {
    const result = resolveSpin(TUMBLE, 1, makeRng(3))
    for (const step of baseSteps(result)) {
      const raw = step.wins.reduce((sum, w) => sum + w.paid, 0)
      expect(step.paid).toBe(raw * step.multiplier)
    }
  })

  it('starts every real chain at 1x and never skips a rung', () => {
    const ladder = ROCKSLIDE.feature.kind === 'cascade' ? ROCKSLIDE.feature.multipliers : []
    const rng = makeRng(99)
    let longest = 0

    for (let spin = 0; spin < 30_000; spin++) {
      const result = resolveSpin(ROCKSLIDE, 1, rng)
      const seen = baseSteps(result).map((s) => s.multiplier)
      longest = Math.max(longest, seen.length - 1)
      expect(seen).toEqual(seen.map((_, i) => ladder[Math.min(i, ladder.length - 1)]))
    }

    // A test that never reached the top rung would not have tested the top rung.
    expect(longest).toBeGreaterThanOrEqual(ladder.length)
  }, 20_000)
})

describe('the free games', () => {
  it('pays nothing extra for a chain one short of the trigger', () => {
    const result = resolveSpin(TUMBLE, 1, makeRng(15))
    expect(chainLength(result)).toBe(3)
    expect(result.freeSpinsAwarded).toBe(0)
    expect(result.steps.some((s) => s.free)).toBe(false)
  })

  it('buys eight games with a chain of four, and plays all eight', () => {
    const result = resolveSpin(TUMBLE, 1, makeRng(27))
    expect(chainLength(result)).toBe(4)
    expect(result.freeSpinsAwarded).toBe(8)
    expect(gamesDealt(result.steps, true)).toBe(8)
    expect(gamesDealt(result.steps, false)).toBe(1)
  })

  it('awards once per spin, not once per cascade past the trigger', () => {
    // Seven cascades is three past the trigger. The award is still eight games.
    const result = resolveSpin(TUMBLE, 1, makeRng(739))
    expect(chainLength(result)).toBe(7)
    expect(result.freeSpinsAwarded).toBe(8)
    expect(gamesDealt(result.steps, true)).toBe(8)
  })

  it('never awards anything but nothing or eight, over thirty thousand spins', () => {
    const rng = makeRng(5150)
    const awards = new Set<number>()
    let triggers = 0

    for (let spin = 0; spin < 30_000; spin++) {
      const result = resolveSpin(ROCKSLIDE, 1, rng)
      awards.add(result.freeSpinsAwarded)
      if (result.freeSpinsAwarded > 0) triggers++
      expect(gamesDealt(result.steps, true)).toBe(result.freeSpinsAwarded)
      // The trigger and the chain have to agree in both directions.
      expect(chainLength(result) >= 4).toBe(result.freeSpinsAwarded > 0)
    }

    expect([...awards].sort((a, b) => a - b)).toEqual([0, 8])
    // Measured at 0.87% of spins over 12M; this window is loose enough not to
    // flake and tight enough to notice the feature going missing.
    expect(triggers / 30_000).toBeGreaterThan(0.004)
    expect(triggers / 30_000).toBeLessThan(0.016)
  }, 20_000)
})

describe('chains end', () => {
  it('never runs a spin away', () => {
    const rng = makeRng(777)
    let worstChain = 0
    let worstSpin = 0

    for (let spin = 0; spin < 50_000; spin++) {
      const result = resolveSpin(ROCKSLIDE, 1, rng)
      worstChain = Math.max(worstChain, chainLength(result))
      worstSpin = Math.max(worstSpin, result.steps.length)
    }

    // The longest base chain seen in 12M spins was nine, and the longest spin —
    // a chain plus eight free games, each with a chain of its own — was 32 steps.
    expect(worstChain).toBeLessThan(25)
    expect(worstSpin).toBeLessThan(200)
  }, 20_000)
})

describe('the boulders', () => {
  it('carries one a reel and buys the round with three on the first drop', () => {
    expect(pick().trigger).toBe('BON')
    expect(pick().triggerCount).toBe(3)
    // Not a scatter, not a wild, and not in the pay table: the evaluator has to
    // read it as a blocker or the whole "it cost nothing at the pay table"
    // argument in the file header collapses.
    expect(ROCKSLIDE.symbols.find((s) => s.id === 'BON')?.scatter).toBeUndefined()
    expect(ROCKSLIDE.linePays.BON).toBeUndefined()
    expect(ROCKSLIDE.scatterPays).toBeUndefined()
  })

  it('is bought once in 221 drops, exactly', () => {
    // One boulder on a fifty-stop reel shows in a four-row window 4 stops in 50,
    // so the screen count is a sum of five independent 0.08s and the trigger is a
    // closed form — no sampling anywhere in the price of this feature.
    const dist = screenCountDistribution(ROCKSLIDE, 'BON')
    const p = dist.slice(pick().triggerCount).reduce((a, b) => a + b, 0)
    expect(p).toBeCloseTo(0.00452526, 8)
    expect(1 / p).toBeGreaterThan(215)
    expect(1 / p).toBeLessThan(228)
    expect(p * PICK_VALUE).toBeCloseTo(PICK_RETURN, 6)
  })

  it('is worth a quarter of its pool, because three of the twelve are rock', () => {
    expect(pick().prizes.reduce((a, b) => a + b, 0)).toBe(78)
    expect(pick().enders).toBe(3)
    expect(pickValue(pick())).toBe(PICK_VALUE)
    // The board is a gamble rather than an annuity: (12 + 1)/(3 + 1) = 3.25
    // boulders opened on average, so two prizes collected out of nine.
    const board = pick().prizes.length + pick().enders
    expect((board + 1) / (pick().enders + 1)).toBeCloseTo(3.25, 10)
  })

  it('is awarded once a spin, off the first drop, however far the chain runs', () => {
    const rng = makeRng(0xb0d1e)
    let triggers = 0
    let deepChains = 0

    for (let spin = 0; spin < 60_000; spin++) {
      const result = resolveSpin(ROCKSLIDE, 1, rng)
      const onFirstDrop = result.steps[0].window.flat().filter((id) => id === 'BON').length
      expect(Boolean(result.bonus)).toBe(onFirstDrop >= pick().triggerCount)
      if (result.bonus) {
        triggers++
        expect(result.bonus.kind).toBe('pick')
        if (chainLength(result) > 0) deepChains++
      }
      const steps = result.steps.reduce((a, s) => a + s.paid, 0)
      expect(result.paid).toBeCloseTo(steps + (result.bonus?.paid ?? 0), 8)
    }

    expect(60_000 / triggers).toBeGreaterThan(180)
    expect(60_000 / triggers).toBeLessThan(280)
    // A boulder is dead rock, so a screen that buys the round can still tumble —
    // and it does, which is what makes "once a spin" a claim worth checking.
    expect(deepChains).toBeGreaterThan(50)
  }, 30_000)
})

describe('the return', () => {
  it('is cut to a first drop of 0.4470, well under the target', () => {
    expect(exactBaseReturn(ROCKSLIDE)).toBeCloseTo(FIRST_DROP, 4)
    expect(ROCKSLIDE.targetRtp).toBe(0.95)
    // Deliberately under half the target: the ladder roughly doubles it back and
    // the pick adds the last nine points.
    expect(exactBaseReturn(ROCKSLIDE)).toBeLessThan(0.5)
  })

  it('prices the whole machine as first drop × tumble + pick', () => {
    expect(MEASURED_RTP).toBeCloseTo(0.9493, 4)
    expect(Math.abs(MEASURED_RTP - ROCKSLIDE.targetRtp)).toBeLessThan(0.004)
    // Two thirds of the way from 0.447 to 0.95 is the tumble and the last ninth
    // is the pick, so neither one alone would get this cabinet to its target.
    expect(PICK_RETURN / MEASURED_RTP).toBeGreaterThan(0.08)
    expect(PICK_RETURN / MEASURED_RTP).toBeLessThan(0.10)
  })

  it('is worth about twice its first drop once the chain is counted', () => {
    // A cascading machine's return cannot be enumerated — each step feeds the
    // next — so measuring it is the only honest way to price it, and 400,000
    // spins is what fits inside a test. That buys an error bar near 0.005, so the
    // bands below are drawn about four of those wide: a test that flakes once a
    // month teaches nobody anything. The figure in `MEASURED_RTP` is the one to
    // trust; this is the check that it is still the truth.
    const SPINS = 400_000
    const rng = makeRng(20260726)
    let staked = 0
    let paid = 0
    let bonusPaid = 0
    let sumSq = 0

    for (let spin = 0; spin < SPINS; spin++) {
      const result = resolveSpin(ROCKSLIDE, 1, rng)
      staked += result.staked
      paid += result.paid
      bonusPaid += result.bonus?.paid ?? 0
      const net = (result.paid - result.staked) / result.staked
      sumSq += net * net
    }

    const rtp = paid / staked
    const stderr = Math.sqrt(Math.max(sumSq / SPINS - Math.pow(rtp - 1, 2), 0) / SPINS)

    expect(stderr).toBeLessThan(0.01)
    expect(rtp).toBeGreaterThan(0.93)
    expect(rtp).toBeLessThan(0.97)
    expect(Math.abs(rtp - MEASURED_RTP)).toBeLessThan(4 * stderr)
    // The pick's share of what the machine pays, which the closed form says is
    // 0.0882/0.9493 = 9.3%. Only ~1800 rounds land in 400k spins, so this band is
    // three standard errors of a very noisy quantity and nothing tighter.
    expect(bonusPaid / paid).toBeGreaterThan(0.06)
    expect(bonusPaid / paid).toBeLessThan(0.13)
    // The cascade is most of the machine: the first drop alone would be a
    // 45% cabinet, which nobody would sit at.
    expect((rtp - bonusPaid / staked) / exactBaseReturn(ROCKSLIDE)).toBeGreaterThan(1.7)
  }, 60_000)
})
