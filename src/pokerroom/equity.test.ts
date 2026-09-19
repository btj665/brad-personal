import { describe, expect, it } from 'vitest'

import { estimateEquity, handOf } from './equity'
import { HOLDEM } from './variants'

// The whole point of this room is that games are measured against a known truth.
// Poker's known truths are heads-up preflop equities, and these are the textbook
// numbers every solver and every published chart agrees on. The seeds are fixed
// so the Monte Carlo reads are deterministic; the tolerances are the sampling
// error left at the stated trial count.

// Enough trials to pin each number to well inside its tolerance; the standard
// error at 12k samples is under half a percent.
const SAMPLES = 12000
const SLOW = 20000

function headsUp(hero: string, villain: string, seed = 7): number {
  return estimateEquity({
    hero: handOf(hero),
    opponents: [handOf(villain)],
    variant: HOLDEM,
    samples: SAMPLES,
    seed,
  })
}

describe('Monte Carlo equity — the published heads-up numbers', () => {
  it('AA is ~82% over KK', () => {
    expect(headsUp('AsAh', 'KsKh')).toBeCloseTo(0.82, 1)
  }, SLOW)

  it('AKs vs 22 is the ~50/50 coin flip', () => {
    const e = headsUp('AsKs', '2c2d')
    expect(e).toBeGreaterThan(0.48)
    expect(e).toBeLessThan(0.52)
  }, SLOW)

  it('AKo is ~43% against QQ', () => {
    expect(headsUp('AsKh', 'QcQd')).toBeCloseTo(0.43, 1)
  }, SLOW)

  it('72o is ~12% against AA', () => {
    const e = headsUp('7h2c', 'AsAd')
    expect(e).toBeGreaterThan(0.1)
    expect(e).toBeLessThan(0.15)
  }, SLOW)
})

describe('Monte Carlo equity — structural truths', () => {
  it('chops a board that plays itself, from either seat', () => {
    // A royal flush on the board: nobody can do better than the community cards,
    // so hero and a random opponent always tie — a ~50% share.
    const e = estimateEquity({
      hero: handOf('2c3d'),
      board: handOf('AsKsQsJs10s'),
      variant: HOLDEM,
      numOpponents: 1,
      samples: 4000,
      seed: 5,
    })
    expect(e).toBeCloseTo(0.5, 1)
  })

  it('gives a made nut hand on the river equity 1.0 over a worse made hand', () => {
    // Broadway (the nut straight) against a pair of aces, board complete: there
    // are no cards left to come, so the hero wins every trial.
    const e = estimateEquity({
      hero: handOf('10s10d'),
      board: handOf('AdKcQsJh9c'),
      opponents: [handOf('As8h')],
      variant: HOLDEM,
      samples: 500,
      seed: 3,
    })
    expect(e).toBe(1)
  })

  it('gives a hand drawing dead a near-zero read', () => {
    // Four to a flush and four to broadway on the board, hero holding the worst
    // possible kicker and no piece of either draw.
    const e = estimateEquity({
      hero: handOf('3h4d'),
      board: handOf('AsKsQsJs2h'),
      variant: HOLDEM,
      numOpponents: 1,
      samples: 4000,
      seed: 9,
    })
    expect(e).toBeLessThan(0.05)
  })

  it('equity falls monotonically as more random opponents pile in', () => {
    const reads = [1, 2, 3, 4, 5].map((n) =>
      estimateEquity({ hero: handOf('AsKs'), variant: HOLDEM, numOpponents: n, samples: 4000, seed: 4 }),
    )
    for (let i = 1; i < reads.length; i++) expect(reads[i]).toBeLessThan(reads[i - 1])
    // And it's a real slide, not just noise: AKs against five is far worse than
    // against one.
    expect(reads[0] - reads[4]).toBeGreaterThan(0.25)
  }, SLOW)

  it('replays exactly from a seed', () => {
    const once = estimateEquity({ hero: handOf('AsAh'), opponents: [handOf('KsKh')], variant: HOLDEM, samples: 4000, seed: 123 })
    const twice = estimateEquity({ hero: handOf('AsAh'), opponents: [handOf('KsKh')], variant: HOLDEM, samples: 4000, seed: 123 })
    expect(once).toBe(twice)
  })
})
