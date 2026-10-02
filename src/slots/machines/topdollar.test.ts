// High Roller, and the second cabinet in this directory whose whole price is a
// closed form.
//
// Three reels of thirty-two stops, five lines, no cascade and no free games, so
// `exactBaseReturn` is the entire screen game. The banker on the top box is exact
// too, but for a subtler reason than the wheel next door: the offer round has a
// genuinely optimal line — take a call when it beats the average value of holding
// out, pass it otherwise — and under that line its expected award is a backward
// induction over the offer pool, not a sample. The trigger is a rational number
// off the strips, the two multiply, and the machine has no error bar anywhere in
// it. The simulations below are cross-checks against the exact figures, never the
// measurement.
//
//   trigger      3 phones on screen  =  (6/32)³ = 27/4096 = 1 in 151.7 spins
//   pool mean    830 / 100 weight    =  8.30 × the total stake
//   offer (opt)  backward induction  =  19.44949 × the total stake
//   the feature  27/4096 × 19.44949  =  0.128207 of the return, exactly
//   the lines    enumerated          =  0.791870
//   ------------------------------------------------------------------------
//   the machine                         0.920077 against a target of 0.92

import { describe, expect, it } from 'vitest'

import { makeRng, type Rng } from '../../engine/rng'
import { offerStageValues, offerValue, playBonus } from '../bonus'
import { lineWins } from '../evaluate'
import { resolveSpin } from '../machine'
import { exactBaseReturn, exactLineReturn, screenCountDistribution } from '../rtp'
import type { Bonus, SymbolId } from '../types'
import { TOPDOLLAR } from './topdollar'

/** The line pays alone, enumerated — the base game in full, since there is no
 *  cascade and no free game to feed a screen back into itself. */
const LINE_RETURN = 0.7918701171875

/** The trigger: three phones, one to a reel because the two on each strip sit
 *  more than three rows apart, so it is (6/32)³ and not a convolution. */
const TRIGGER = 27 / 4096

/** The offer under optimal stopping: pool mean 8.30, lifted to this by holding
 *  out for the big calls. Recomputed from scratch in the tests below, both
 *  against a small hand-checkable pool and against this cabinet's own. */
const OFFER_VALUE = 19.44949

const FEATURE_RETURN = TRIGGER * OFFER_VALUE

/** Build a window from rows written out as strings, top row first. */
function screen(...rows: string[]): SymbolId[][] {
  const grid = rows.map((r) => r.trim().split(/\s+/))
  const reels = grid[0].length
  return Array.from({ length: reels }, (_, reel) => grid.map((row) => row[reel]))
}

function offer(): Extract<Bonus, { kind: 'offer' }> {
  const bonus = TOPDOLLAR.bonus
  if (bonus?.kind !== 'offer') throw new Error('High Roller is an offer machine')
  return bonus
}

const count = (reel: number, id: SymbolId): number =>
  TOPDOLLAR.strips[reel].filter((s) => s === id).length

const CELLS = TOPDOLLAR.strips.length * TOPDOLLAR.rows

/** Pool weight and mean, needed by more than one test. */
function poolStats(bonus: Extract<Bonus, { kind: 'offer' }>): { weight: number; mean: number } {
  const weight = bonus.pool.reduce((a, o) => a + o.weight, 0)
  const mean = bonus.pool.reduce((a, o) => a + o.value * o.weight, 0) / weight
  return { weight, mean }
}

/** One weighted draw from a pool off a stream — a copy of the private helper in
 *  bonus.ts, so the tests can build offer sequences of their own to reason about
 *  the strategy without reaching into the module. */
function draw(bonus: Extract<Bonus, { kind: 'offer' }>, rng: Rng): number {
  const total = bonus.pool.reduce((a, o) => a + o.weight, 0)
  let roll = rng.next() * total
  for (const o of bonus.pool) {
    roll -= o.weight
    if (roll <= 0) return o.value
  }
  return bonus.pool[bonus.pool.length - 1].value
}

/** The value of the optimal round, computed a different way than `bonus.ts` does
 *  it — a plain recursion instead of the filled stage array — so the two are a
 *  cross-check on each other rather than the same arithmetic run twice. The value
 *  of a round with `n` calls left is the mean when `n` is one, and otherwise the
 *  expected `max(this call, value of one fewer call)`. */
function optimalByRecursion(bonus: Extract<Bonus, { kind: 'offer' }>, n: number): number {
  const { weight, mean } = poolStats(bonus)
  if (n === 1) return mean
  const cont = optimalByRecursion(bonus, n - 1)
  let sum = 0
  for (const o of bonus.pool) sum += o.weight * Math.max(o.value, cont)
  return sum / weight
}

describe('the cabinet', () => {
  it('is three reels of thirty-two stops with five lines and no free game', () => {
    expect(TOPDOLLAR.strips).toHaveLength(3)
    for (const strip of TOPDOLLAR.strips) expect(strip).toHaveLength(32)
    expect(TOPDOLLAR.rows).toBe(3)
    expect(TOPDOLLAR.lines).toEqual([
      [1, 1, 1],
      [0, 0, 0],
      [2, 2, 2],
      [0, 1, 2],
      [2, 1, 0],
    ])
    expect(TOPDOLLAR.feature).toEqual({ kind: 'none' })
  })

  it('is mostly dead space, which is what leaves room for the price', () => {
    // Fourteen blanks and two phones a reel: the blanks are what stop three
    // matching symbols landing on nearly every screen.
    for (let reel = 0; reel < 3; reel++) {
      expect(count(reel, '-')).toBe(14)
      expect(count(reel, 'PH')).toBe(2)
    }
  })

  it('substitutes the wild, pays a lone chip, and pays nothing for a lone seven', () => {
    expect(TOPDOLLAR.symbols.find((s) => s.id === 'W')?.wild).toBe(true)
    // A wild finishing a run of sevens pays as three sevens.
    expect(lineWins(screen('- - -', '7 7 W', '- - -'), TOPDOLLAR, 1)[0].paid).toBe(60)
    // One chip on reel one pays; a lone seven does not.
    expect(lineWins(screen('- - -', 'CHP - -', '- - -'), TOPDOLLAR, 1)[0].paid).toBe(1)
    expect(lineWins(screen('- - -', '7 - -', '- - -'), TOPDOLLAR, 1)).toHaveLength(0)
  })
})

describe('the phone', () => {
  it('pays nothing, is not a scatter, and blocks a run like a blank', () => {
    const ph = TOPDOLLAR.symbols.find((s) => s.id === 'PH')
    expect(ph).toBeDefined()
    expect(ph?.scatter).toBeUndefined()
    expect(ph?.wild).toBeUndefined()
    expect(TOPDOLLAR.linePays.PH).toBeUndefined()
    expect(TOPDOLLAR.scatterPays).toBeUndefined()
    // A phone between two chips breaks the chip run at one, exactly like a blank.
    expect(lineWins(screen('- - -', 'CHP PH CHP', '- - -'), TOPDOLLAR, 1)[0].count).toBe(1)
  })

  it('sits far enough apart on the strip that no window can hold two', () => {
    // With both phones a strip more than three rows apart, each reel shows one or
    // none, so "three on screen" is exactly "one on every reel" and the trigger is
    // the clean cube (6/32)³ rather than a convolution over counts.
    for (const strip of TOPDOLLAR.strips) {
      const at = strip.map((id, i) => (id === 'PH' ? i : -1)).filter((i) => i >= 0)
      expect(at).toHaveLength(2)
      const gap = Math.min(at[1] - at[0], 32 - (at[1] - at[0]))
      expect(gap).toBeGreaterThanOrEqual(TOPDOLLAR.rows)
    }
    const dist = screenCountDistribution(TOPDOLLAR, 'PH')
    expect(dist.slice(4).every((p) => p === 0)).toBe(true)
    expect(dist[3]).toBeCloseTo(TRIGGER, 12)
  })

  it('buys the banker once in 151.7 spins, exactly', () => {
    const dist = screenCountDistribution(TOPDOLLAR, 'PH')
    const p = dist.slice(3).reduce((a, b) => a + b, 0)
    expect(p).toBeCloseTo(TRIGGER, 12)
    expect(1 / p).toBeCloseTo(151.7, 1)
  })
})

describe('the offer', () => {
  it('is five calls drawn from a pool whose mean is 8.30 stakes', () => {
    expect(offer().offers).toBe(5)
    expect(offer().trigger).toBe('PH')
    expect(offer().triggerCount).toBe(3)
    const { weight, mean } = poolStats(offer())
    expect(weight).toBe(100)
    expect(mean).toBe(8.3)
  })

  it('prices the optimal line exactly, matching a hand-worked pool', () => {
    // A pool small enough to check by hand: 2 and 10 at even weight, three calls.
    // mean 6; with one call left the round is worth 6; with two, ½·max(2,6) +
    // ½·max(10,6) = ½·6 + ½·10 = 8; with three, ½·max(2,8) + ½·max(10,8) =
    // ½·8 + ½·10 = 9. So the round is worth 9, and passing the small call is right
    // at both early stages.
    const small: Extract<Bonus, { kind: 'offer' }> = {
      kind: 'offer',
      trigger: 'PH',
      triggerCount: 3,
      offers: 3,
      pool: [
        { value: 2, weight: 1 },
        { value: 10, weight: 1 },
      ],
    }
    expect(offerStageValues(small)).toEqual([9, 8, 6])
    expect(offerValue(small)).toBe(9)

    // And the same value from a full enumeration of the sample space: every one
    // of the 2³ sequences, each with probability ⅛, played through the optimal
    // thresholds. This is the identity `offerValue` claims, computed with nothing
    // it shares.
    const stage = [8, 6] // thresholds to beat at stages 0 and 1 (stage 2 forced)
    const values = [2, 10]
    let ev = 0
    for (const a of values)
      for (const b of values)
        for (const c of values) {
          const seq = [a, b, c]
          let taken = seq[2]
          if (a >= stage[0]) taken = a
          else if (b >= stage[1]) taken = b
          ev += (taken / 8)
        }
    expect(ev).toBe(9)
  })

  it('agrees with an independent recursion on this cabinet, to the last digit', () => {
    expect(offerValue(offer())).toBeCloseTo(OFFER_VALUE, 12)
    expect(optimalByRecursion(offer(), offer().offers)).toBeCloseTo(OFFER_VALUE, 12)
    // The stage array descends from the round's value to the pool's mean.
    const stage = offerStageValues(offer())
    expect(stage[0]).toBe(offerValue(offer()))
    expect(stage[stage.length - 1]).toBe(poolStats(offer()).mean)
    for (let i = 1; i < stage.length; i++) expect(stage[i]).toBeLessThan(stage[i - 1])
  })

  it('shows the calls in order, stops at the one taken, and never overpays', () => {
    const bonus = offer()
    const maxPool = Math.max(...bonus.pool.map((o) => o.value))
    const stage = offerStageValues(bonus)
    const stake = 3
    const rng = makeRng(0xca11)
    for (let i = 0; i < 400; i++) {
      const play = playBonus(bonus, stake, CELLS, 3, rng)
      expect(play.kind).toBe('offer')
      const reveals = play.reveals ?? []
      const missed = play.missed ?? []
      // Every call, shown or passed over, adds up to the whole run of five.
      expect(reveals.length + missed.length).toBe(bonus.offers)
      expect(reveals.length).toBeGreaterThanOrEqual(1)
      // The take is the last thing revealed, and it is what was paid.
      expect(play.paid).toBe(reveals[reveals.length - 1])
      // Nothing can pay more than the biggest call in the pool.
      expect(play.paid).toBeLessThanOrEqual(maxPool * stake)
      expect(play.paid).toBeGreaterThanOrEqual(Math.min(...bonus.pool.map((o) => o.value)) * stake)

      // It stopped exactly where the optimal rule says to: every passed call was
      // below the value of holding out, and the take (unless it was the forced
      // last) was at least that value.
      const taken = reveals.length - 1
      for (let j = 0; j < taken; j++) expect(reveals[j] / stake).toBeLessThan(stage[j + 1])
      if (taken < bonus.offers - 1) expect(reveals[taken] / stake).toBeGreaterThanOrEqual(stage[taken + 1])
    }
  })

  it('beats always-taking-the-first call and always-holding-to-the-last', () => {
    // Both naive lines are worth the pool mean: the first call is a fresh draw, and
    // so is the forced last one. Optimal play, by passing the small calls, is worth
    // more than either — checked over a long shared run of drawn sequences.
    const bonus = offer()
    const stage = offerStageValues(bonus)
    const { mean } = poolStats(bonus)
    const N = 500_000
    const rng = makeRng(0x0ffe)
    let optimal = 0
    let takeFirst = 0
    let holdLast = 0
    for (let i = 0; i < N; i++) {
      const seq = Array.from({ length: bonus.offers }, () => draw(bonus, rng))
      takeFirst += seq[0]
      holdLast += seq[bonus.offers - 1]
      let taken = seq[bonus.offers - 1]
      for (let j = 0; j < bonus.offers - 1; j++) {
        if (seq[j] >= stage[j + 1]) {
          taken = seq[j]
          break
        }
      }
      optimal += taken
    }
    const optMean = optimal / N
    const firstMean = takeFirst / N
    const lastMean = holdLast / N
    expect(optMean).toBeGreaterThan(firstMean)
    expect(optMean).toBeGreaterThan(lastMean)
    // The naive lines both hover at the pool mean; optimal is worth far more.
    expect(firstMean).toBeCloseTo(mean, 1)
    expect(lastMean).toBeCloseTo(mean, 1)
    expect(optMean).toBeCloseTo(OFFER_VALUE, 1)
  })

  it('scales the whole round with the stake and nothing else', () => {
    const a = playBonus(offer(), 1, CELLS, 3, makeRng(7))
    const b = playBonus(offer(), 40, CELLS, 3, makeRng(7))
    expect(b.paid).toBe(a.paid * 40)
    expect(b.reveals).toEqual((a.reveals ?? []).map((v) => v * 40))
    expect(b.missed).toEqual((a.missed ?? []).map((v) => v * 40))
  })
})

describe('the return', () => {
  it('is 0.7919 of lines plus 0.1282 of banker, and both are exact', () => {
    expect(exactLineReturn(TOPDOLLAR)).toBeCloseTo(LINE_RETURN, 10)
    // No scatter on this cabinet, so the base figure is the lines and nothing else.
    expect(exactBaseReturn(TOPDOLLAR)).toBeCloseTo(exactLineReturn(TOPDOLLAR), 12)
    expect(FEATURE_RETURN).toBeCloseTo(0.128207, 6)

    expect(TOPDOLLAR.targetRtp).toBe(0.92)
    expect(Math.abs(LINE_RETURN + FEATURE_RETURN - TOPDOLLAR.targetRtp)).toBeLessThan(0.001)
    // The banker is about 14% of the machine, taken out of the pay table.
    expect(FEATURE_RETURN / (LINE_RETURN + FEATURE_RETURN)).toBeCloseTo(0.14, 2)
  })

  it('agrees with a simulation of itself, screen and banker separately', () => {
    // Both halves are enumerated, so this is a cross-check and not a measurement:
    // the screen part has to land on the exact line figure and the banker part on
    // its offer value. The offer's 100× call turns up under optimal play about one
    // round in ten and takes the per-round standard deviation past 20, so even a
    // million rounds pin the banker's mean only to about ±0.03; the offer stream is
    // rarer still through full spins, so the band on the banker's contribution is
    // drawn wide, and the exact figures above are the ones to trust.
    const SPINS = 600_000
    const rng = makeRng(0x4a5c)
    let staked = 0
    let screens = 0
    let banker = 0
    let triggers = 0
    let maxOffer = 0

    for (let spin = 0; spin < SPINS; spin++) {
      const result = resolveSpin(TOPDOLLAR, 1, rng)
      expect(result.steps).toHaveLength(1)
      expect(result.freeSpinsAwarded).toBe(0)
      staked += result.staked
      screens += result.steps[0].paid
      banker += result.bonus?.paid ?? 0
      if (result.bonus) {
        triggers++
        maxOffer = Math.max(maxOffer, result.bonus.paid)
      }
      expect(result.paid).toBe(result.steps[0].paid + (result.bonus?.paid ?? 0))
    }

    expect(screens / staked).toBeCloseTo(LINE_RETURN, 2)
    expect(SPINS / triggers).toBeGreaterThan(120)
    expect(SPINS / triggers).toBeLessThan(190)
    // Banker's contribution to return, its own cross-check against 0.128207.
    expect(Math.abs(banker / staked - FEATURE_RETURN)).toBeLessThan(0.05)
    // A single offer round, off the total stake of five, cannot exceed 100 × 5.
    expect(maxOffer).toBeLessThanOrEqual(100 * 5)
    expect(Math.abs((screens + banker) / staked - TOPDOLLAR.targetRtp)).toBeLessThan(0.05)
  }, 60_000)

  it('converges to the offer value over many seeded rounds', () => {
    // The banker in isolation, played a million times off one stream. A cross-check
    // on `offerValue`, not a definition of it: the exact figure is 19.44949 and the
    // band here is the ±0.15 that a 100×-tailed round leaves after a million draws.
    const bonus = offer()
    const N = 1_000_000
    const rng = makeRng(0x0ffe12)
    let total = 0
    let maxPaid = 0
    for (let i = 0; i < N; i++) {
      const play = playBonus(bonus, 1, CELLS, 3, rng)
      total += play.paid
      maxPaid = Math.max(maxPaid, play.paid)
    }
    expect(maxPaid).toBeLessThanOrEqual(Math.max(...bonus.pool.map((o) => o.value)))
    expect(Math.abs(total / N - OFFER_VALUE)).toBeLessThan(0.15)
  }, 30_000)
})
