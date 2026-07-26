// Bars & Sevens, and the one cabinet in this directory whose whole return is a
// closed form.
//
// Three reels of thirty-two stops, one payline, no cascade and no free games, so
// `exactBaseReturn` is not a partial answer here — it is the entire screen game.
// And the wheel on the top box is exact too: every wedge is equally likely, so it
// is worth its own mean, and the two bonus symbols are far enough apart on the
// strip that no window can hold both, so the trigger is (6/32)³ = 27/4096 and not
// something that has to be convolved. Nothing about this machine's price needs a
// simulation, and the simulations below are cross-checks rather than measurements.

import { describe, expect, it } from 'vitest'

import { makeRng } from '../../engine/rng'
import { wheelValue } from '../bonus'
import { lineWins } from '../evaluate'
import { resolveSpin } from '../machine'
import { exactBaseReturn, exactHitFrequency, exactLineReturn, screenCountDistribution } from '../rtp'
import type { Bonus, Machine, SymbolId } from '../types'
import { BARS } from './bars'

/** The line pays alone, enumerated. Cut from 0.898376 to make room for the wheel. */
const LINE_RETURN = 0.764862

/** The wheel: 492 over 24 wedges, bought 27/4096 of the time. Both exact, so the
 *  product is exact and this cabinet has no error bar anywhere in it. */
const TRIGGER = 27 / 4096
const WHEEL_VALUE = 20.5
const WHEEL_RETURN = TRIGGER * WHEEL_VALUE

/** Build a window from rows written out as strings, top row first. */
function screen(...rows: string[]): SymbolId[][] {
  const grid = rows.map((r) => r.trim().split(/\s+/))
  const reels = grid[0].length
  return Array.from({ length: reels }, (_, reel) => grid.map((row) => row[reel]))
}

function wheel(): Extract<Bonus, { kind: 'wheel' }> {
  const bonus = BARS.bonus
  if (bonus?.kind !== 'wheel') throw new Error('Bars & Sevens is a wheel machine')
  return bonus
}

const count = (reel: number, id: SymbolId): number =>
  BARS.strips[reel].filter((s) => s === id).length

describe('the cabinet', () => {
  it('is three reels of thirty-two stops with one line through the middle', () => {
    expect(BARS.strips).toHaveLength(3)
    for (const strip of BARS.strips) expect(strip).toHaveLength(32)
    expect(BARS.rows).toBe(3)
    expect(BARS.lines).toEqual([[1, 1, 1]])
    expect(BARS.feature).toEqual({ kind: 'none' })
  })

  it('is mostly dead space, which is what sets the price', () => {
    // Thirteen blanks and two bonus symbols a reel: without that, three matching
    // symbols would land on nearly every screen and the strips would return three
    // and a half times the stake.
    for (let reel = 0; reel < 3; reel++) {
      expect(count(reel, '-')).toBe(13)
      expect(count(reel, 'BON')).toBe(2)
      expect((count(reel, '-') + count(reel, 'BON')) / 32).toBeGreaterThan(0.45)
    }
    const hit = exactHitFrequency(BARS)
    expect(hit).toBeGreaterThan(0.09)
    expect(hit).toBeLessThan(0.12)
  })

  it('pays a lone cherry on the first reel and nothing for a lone seven', () => {
    expect(lineWins(screen('- - -', 'C - -', '- - -'), BARS, 1)[0].paid).toBe(1)
    expect(lineWins(screen('- - -', '7 - -', '- - -'), BARS, 1)).toHaveLength(0)
  })

  it('doubles once per wild, so three wilds pay eight times the sevens', () => {
    expect(BARS.symbols.find((s) => s.id === 'W')?.multiplier).toBe(2)
    expect(lineWins(screen('- - -', '7 W 7', '- - -'), BARS, 1)[0].paid).toBe(100 * 2)
    expect(lineWins(screen('- - -', 'W W W', '- - -'), BARS, 1)[0].paid).toBe(100 * 8)
  })

  it('weighs a doubling wild twice over, which is most of what it costs', () => {
    // The trap this machine was built to demonstrate. A wild that doubles adds
    // itself to the odds *and* multiplies the pay, so a reel weighs a paying
    // symbol at (count + 2·wilds)/32. Read at (count + wilds)/32 instead and the
    // seven's three-of-a-kind looks a fifth cheaper than it is.
    const sevens = count(0, '7')
    const wilds = count(0, 'W')
    const right = Math.pow((sevens + 2 * wilds) / 32, 3)
    const wrong = Math.pow((sevens + wilds) / 32, 3)
    expect(right / wrong).toBeGreaterThan(1.5)

    const seven: Machine = { ...BARS, linePays: { '7': [0, 0, 0, 100] } }
    // Not exactly `right × 100` — three wilds pay as wilds-doubling-sevens at 800,
    // not at 100 — but the enumeration has to land above the naive figure.
    expect(exactLineReturn(seven)).toBeGreaterThan(wrong * 100)
  })
})

describe('the bonus symbol', () => {
  it('pays nothing, is not a scatter, and blocks a run like a blank', () => {
    expect(BARS.symbols.find((s) => s.id === 'BON')).toBeDefined()
    expect(BARS.symbols.find((s) => s.id === 'BON')?.scatter).toBeUndefined()
    expect(BARS.symbols.find((s) => s.id === 'BON')?.wild).toBeUndefined()
    expect(BARS.linePays.BON).toBeUndefined()
    expect(BARS.scatterPays).toBeUndefined()
    expect(lineWins(screen('- - -', 'C BON C', '- - -'), BARS, 1)[0].count).toBe(1)
    expect(lineWins(screen('- - -', '7 BON 7', '- - -'), BARS, 1)).toHaveLength(0)
  })

  it('cost nothing at the pay table, because it replaced two blanks', () => {
    const asBlanks: Machine = {
      ...BARS,
      strips: BARS.strips.map((strip) => strip.map((id) => (id === 'BON' ? '-' : id))),
    }
    expect(exactLineReturn(asBlanks)).toBeCloseTo(exactLineReturn(BARS), 12)
  })

  it('sits far enough apart on the strip that no window can hold two', () => {
    // Stops 7 and 30 of 32: twenty-three apart one way and nine the other, both
    // more than the three rows on the glass. So every reel shows one or none, and
    // "three on screen" is exactly "one on every reel".
    for (const strip of BARS.strips) {
      const at = strip.map((id, i) => (id === 'BON' ? i : -1)).filter((i) => i >= 0)
      expect(at).toEqual([7, 30])
      const gap = Math.min(at[1] - at[0], 32 - (at[1] - at[0]))
      expect(gap).toBeGreaterThanOrEqual(BARS.rows)
    }
    const dist = screenCountDistribution(BARS, 'BON')
    expect(dist.slice(4).every((p) => p === 0)).toBe(true)
    expect(dist[3]).toBeCloseTo(TRIGGER, 12)
  })
})

describe('the wheel', () => {
  it('is twenty-four equally likely wedges worth 20.5 stakes between them', () => {
    expect(wheel().wedges).toHaveLength(24)
    expect(wheel().wedges.reduce((a, b) => a + b, 0)).toBe(492)
    expect(wheelValue(wheel())).toBe(WHEEL_VALUE)
    expect(wheel().trigger).toBe('BON')
    expect(wheel().triggerCount).toBe(3)
  })

  it('is bought once in 152 spins, exactly', () => {
    const dist = screenCountDistribution(BARS, 'BON')
    const p = dist.slice(3).reduce((a, b) => a + b, 0)
    expect(p).toBeCloseTo(TRIGGER, 12)
    expect(1 / p).toBeCloseTo(151.7, 1)
  })

  it('pays the wedge it landed on, off the total stake', () => {
    const rng = makeRng(0xba25)
    let seen = 0
    for (let spin = 0; spin < 40_000 && seen < 30; spin++) {
      const result = resolveSpin(BARS, 4, rng)
      if (!result.bonus) continue
      seen++
      // One line, so the total stake is the coins per line.
      expect(result.bonus.paid).toBe(wheel().wedges[result.bonus.wedge ?? -1] * 4)
      expect(result.steps[0].window.flat().filter((id) => id === 'BON')).toHaveLength(3)
    }
    expect(seen).toBe(30)
  })
})

describe('the return', () => {
  it('is 0.7649 of lines plus 0.1351 of wheel, and both are exact', () => {
    expect(exactLineReturn(BARS)).toBeCloseTo(LINE_RETURN, 5)
    // No scatter on this cabinet, so the base figure is the lines and nothing else.
    expect(exactBaseReturn(BARS)).toBeCloseTo(exactLineReturn(BARS), 12)
    expect(WHEEL_RETURN).toBeCloseTo(0.135132, 6)

    expect(BARS.targetRtp).toBe(0.9)
    expect(Math.abs(LINE_RETURN + WHEEL_RETURN - BARS.targetRtp)).toBeLessThan(0.001)
    // The wheel is 15% of the machine, which is what the pay table paid for it.
    expect(WHEEL_RETURN / (LINE_RETURN + WHEEL_RETURN)).toBeCloseTo(0.15, 2)
  })

  it('agrees with a simulation of itself, screen and wheel separately', () => {
    // Both halves are enumerated, so this is a cross-check and not a measurement:
    // the screen part has to land on the exact figure and the wheel part on its
    // own. The wheel's 200× wedge lands once in 3641 spins and takes the per-spin
    // standard deviation to 10, so 600,000 spins pins the total only to ±0.013 —
    // the bands below are drawn accordingly, and the exact figures above are the
    // ones to trust.
    const SPINS = 600_000
    const rng = makeRng(20260726)
    let staked = 0
    let screens = 0
    let wheels = 0
    let triggers = 0

    for (let spin = 0; spin < SPINS; spin++) {
      const result = resolveSpin(BARS, 1, rng)
      expect(result.steps).toHaveLength(1)
      expect(result.freeSpinsAwarded).toBe(0)
      staked += result.staked
      screens += result.steps[0].paid
      wheels += result.bonus?.paid ?? 0
      if (result.bonus) triggers++
      expect(result.paid).toBe(result.steps[0].paid + (result.bonus?.paid ?? 0))
    }

    expect(screens / staked).toBeCloseTo(LINE_RETURN, 2)
    expect(SPINS / triggers).toBeGreaterThan(140)
    expect(SPINS / triggers).toBeLessThan(165)
    expect(Math.abs(wheels / staked - WHEEL_RETURN)).toBeLessThan(0.04)
    expect(Math.abs((screens + wheels) / staked - BARS.targetRtp)).toBeLessThan(0.04)
  }, 60_000)
})
