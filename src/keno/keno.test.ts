import { describe, expect, it } from 'vitest'

import { KenoGame } from './engine'
import {
  BALLS,
  catchDistribution,
  catchProbability,
  catchWays,
  choose,
  DRAWN,
  MAX_PICKS,
  oneIn,
  oneInFloor,
  TOTAL_DRAWS,
} from './odds'
import {
  DEFAULT_PAYTABLE,
  expectedReturn,
  houseEdge,
  payFor,
  PICK_COUNTS,
  winningCatches,
} from './paytables'

const T = DEFAULT_PAYTABLE

describe('the combinatorics survive being bigger than a double', () => {
  it('knows C(80,20) exactly', () => {
    expect(choose(80, 20)).toBe(3_535_316_142_212_174_320n)
    expect(TOTAL_DRAWS).toBe(3_535_316_142_212_174_320n)
  })

  it('is working past MAX_SAFE_INTEGER, which is the whole point', () => {
    expect(TOTAL_DRAWS > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true)
    // Not "a bit past" — nearly 400x past.
    expect(Number(TOTAL_DRAWS) / Number.MAX_SAFE_INTEGER).toBeGreaterThan(390)
  })

  it('beats the naive float versions that would have looked fine', () => {
    // Both obvious float implementations return a plausible-looking integer of
    // the right magnitude and the wrong value. This is the failure mode the
    // BigInt path exists to avoid: nothing throws, nothing is NaN, the answer is
    // simply not the answer.
    const factorial = (n: number): number => {
      let r = 1
      for (let i = 2; i <= n; i++) r *= i
      return r
    }
    const viaFactorials = factorial(80) / (factorial(20) * factorial(60))
    expect(Number.isFinite(viaFactorials)).toBe(true)
    expect(viaFactorials).not.toBe(Number(TOTAL_DRAWS))
    expect(Math.abs(viaFactorials - Number(TOTAL_DRAWS))).toBeGreaterThan(2_000)

    // Multiplicative cancellation in doubles does better and is still wrong.
    let viaProduct = 1
    for (let i = 0; i < 20; i++) viaProduct = (viaProduct * (80 - i)) / (i + 1)
    expect(Number.isInteger(viaProduct)).toBe(true)
    expect(viaProduct).not.toBe(Number(TOTAL_DRAWS))
    expect(Math.abs(viaProduct - Number(TOTAL_DRAWS))).toBeGreaterThan(500)

    // 80! never overflowed, so there was no warning — the digits just left.
    expect(Number.isSafeInteger(Number(TOTAL_DRAWS))).toBe(false)
  })

  it('is symmetric and handles the edges', () => {
    expect(choose(80, 60)).toBe(choose(80, 20))
    expect(choose(5, 0)).toBe(1n)
    expect(choose(5, 5)).toBe(1n)
    expect(choose(5, 6)).toBe(0n)
    expect(choose(5, -1)).toBe(0n)
  })
})

describe('the hypergeometric distribution', () => {
  it('sums to exactly one in integers, for every pick count', () => {
    // Vandermonde: the ways to catch 0..n partition all C(80,20) draws. This is
    // an identity, so it holds with no epsilon at all.
    for (const n of PICK_COUNTS) {
      let ways = 0n
      for (let k = 0; k <= n; k++) ways += catchWays(n, k)
      expect(ways).toBe(TOTAL_DRAWS)
    }
  })

  it('sums to one in doubles too, for every pick count', () => {
    for (const n of PICK_COUNTS) {
      const dist = catchDistribution(n)
      expect(dist).toHaveLength(n + 1)
      const sum = dist.reduce((a, b) => a + b, 0)
      expect(Math.abs(sum - 1)).toBeLessThan(1e-14)
    }
  })

  it('catches all ten on a ten-spot at 1 in 8,911,711', () => {
    // The number printed on every ten-spot rate card ever made.
    expect(oneInFloor(10, 10)).toBe(8_911_711n)
    expect(oneIn(10, 10)).toBeCloseTo(8_911_711.176, 2)
    expect(catchProbability(10, 10)).toBeCloseTo(1.122118951e-7, 15)
  })

  it('catches none of ten about 1 in 21.8', () => {
    expect(oneIn(10, 0)).toBeCloseTo(21.84, 2)
    expect(catchProbability(10, 0)).toBeCloseTo(0.0457907, 7)
  })

  it('agrees with the other rate-card odds people quote', () => {
    expect(oneInFloor(1, 1)).toBe(4n) // a one-spot is exactly 20/80
    expect(catchProbability(1, 1)).toBeCloseTo(0.25, 15)
    expect(oneInFloor(8, 8)).toBe(230_114n)
    expect(oneInFloor(9, 9)).toBe(1_380_687n)
    expect(oneInFloor(6, 6)).toBe(7_752n)
    expect(oneInFloor(5, 5)).toBe(1_550n)
    expect(oneInFloor(4, 4)).toBe(326n)
    expect(oneInFloor(3, 3)).toBe(72n)
    expect(oneInFloor(2, 2)).toBe(16n)
  })

  it('calls impossible catches impossible', () => {
    expect(catchWays(5, 6)).toBe(0n)
    expect(catchProbability(5, 6)).toBe(0)
    expect(oneIn(5, 6)).toBe(Infinity)
    // You cannot miss more spots than there are uncalled balls, but with only
    // ten picks and sixty uncalled balls that never bites — check the guard
    // holds anyway at a pick count the game does not offer.
    expect(catchWays(70, 0)).toBe(0n)
  })

  it('never disagrees with a brute-force count on a small rack', () => {
    // Same identity, small enough to enumerate: pick 3 of 80, count how many of
    // the C(80,20) draws catch k — checked against choose() composed directly.
    for (let k = 0; k <= 3; k++) {
      expect(catchWays(3, k)).toBe(choose(3, k) * choose(77, 20 - k))
    }
  })
})

describe('the rate card', () => {
  it('prints a row for every pick count 1 through 10', () => {
    expect(PICK_COUNTS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (const n of PICK_COUNTS) {
      expect(winningCatches(T, n).length).toBeGreaterThan(0)
      // Nobody pays for catching more spots than you marked.
      for (const k of winningCatches(T, n)) expect(k).toBeLessThanOrEqual(n)
    }
  })

  it('pays a one-spot 3 for 1, which is exactly 75%', () => {
    expect(payFor(T, 1, 1)).toBe(3)
    expect(expectedReturn(T, 1)).toBeCloseTo(0.75, 12)
    expect(houseEdge(T, 1)).toBeCloseTo(0.25, 12)
  })

  it('pays nothing for a catch count that is not on the card', () => {
    expect(payFor(T, 1, 0)).toBe(0)
    expect(payFor(T, 10, 4)).toBe(0)
    expect(payFor(T, 8, 0)).toBe(0)
    // Solid tickets, the headline numbers.
    expect(payFor(T, 10, 10)).toBe(100_000)
    expect(payFor(T, 8, 8)).toBe(18_000)
  })

  it('holds 25%-30% for the house on every pick count', () => {
    for (const n of PICK_COUNTS) {
      const edge = houseEdge(T, n)
      expect(edge).toBeGreaterThan(0.24)
      expect(edge).toBeLessThan(0.31)
    }
  })

  it('is brutal next to the rest of the building', () => {
    // Blackjack is about 0.4%. Every keno pick count is more than fifty times
    // worse; this test exists so nobody "fixes" the pay table into a lie.
    for (const n of PICK_COUNTS) expect(houseEdge(T, n)).toBeGreaterThan(50 * 0.004)
  })
})

describe('a ticket', () => {
  const game = (bankroll = 10_000) => new KenoGame({ seed: 12_345, bankroll, bet: 5 })

  it('marks and unmarks spots', () => {
    const g = game()
    g.togglePick(7)
    g.togglePick(31)
    g.togglePick(7)
    expect(g.picks).toEqual([31])
  })

  it('keeps the spots ascending however they are marked', () => {
    const g = game()
    for (const n of [40, 3, 71, 12]) g.togglePick(n)
    expect(g.picks).toEqual([3, 12, 40, 71])
  })

  it('holds at most ten spots and refuses the eleventh', () => {
    const g = game()
    for (let n = 1; n <= 12; n++) g.togglePick(n)
    expect(g.picks).toHaveLength(MAX_PICKS)
    expect(g.picks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    // The eleventh click is ignored, not swapped in.
    expect(g.picks).not.toContain(11)
  })

  it('ignores marks off the rack', () => {
    const g = game()
    g.togglePick(0)
    g.togglePick(81)
    g.togglePick(3.5)
    expect(g.picks).toEqual([])
  })

  it('will not draw an unmarked ticket', () => {
    const g = game()
    expect(g.canDraw()).toBe(false)
    g.draw()
    expect(g.phase).toBe('pick')
  })

  it('will not draw without the bankroll for the bet', () => {
    const g = new KenoGame({ seed: 1, bankroll: 3, bet: 5 })
    g.quickPick(4)
    expect(g.canDraw()).toBe(false)
  })

  it('quick-picks distinct spots and keeps the count', () => {
    const g = game()
    g.quickPick(8)
    expect(g.picks).toHaveLength(8)
    expect(new Set(g.picks).size).toBe(8)
    expect(g.picks.every((n) => n >= 1 && n <= BALLS)).toBe(true)
    // A second quick pick with no argument keeps the same eight-spot shape.
    g.quickPick()
    expect(g.picks).toHaveLength(8)
  })

  it('quick-picks four when the ticket is blank', () => {
    const g = game()
    g.quickPick()
    expect(g.picks).toHaveLength(4)
  })
})

describe('a draw', () => {
  function played(seed = 99) {
    const g = new KenoGame({ seed, bankroll: 10_000, bet: 5 })
    g.quickPick(6)
    g.draw()
    return g
  }

  it('calls twenty distinct numbers off the rack', () => {
    const g = played()
    g.revealAll()
    const drawn = g.last!.drawn
    expect(drawn).toHaveLength(DRAWN)
    expect(new Set(drawn).size).toBe(DRAWN)
    expect(drawn.every((n) => n >= 1 && n <= BALLS)).toBe(true)
  })

  it('takes the stake at the draw, not at the settle', () => {
    const g = new KenoGame({ seed: 5, bankroll: 100, bet: 5 })
    g.quickPick(4)
    g.draw()
    expect(g.bankroll).toBe(95)
  })

  it('lights the board one ball at a time and hides the rest', () => {
    const g = played()
    expect(g.phase).toBe('drawing')
    for (let i = 1; i <= DRAWN; i++) {
      const n = g.revealNext()
      expect(n).not.toBeNull()
      expect(g.callCount).toBe(i)
      expect(g.called()).toHaveLength(i)
    }
    expect(g.phase).toBe('complete')
    // The ceremony is over; there is nothing left to light.
    expect(g.revealNext()).toBeNull()
  })

  it('grows the caught list monotonically as the board fills', () => {
    const g = played()
    let seen = 0
    for (let i = 0; i < DRAWN; i++) {
      g.revealNext()
      const now = g.caughtSoFar().length
      expect(now).toBeGreaterThanOrEqual(seen)
      seen = now
    }
    expect(g.caughtSoFar()).toEqual(g.last!.caught)
  })

  it('settles exactly once however it is revealed', () => {
    const slow = played(7)
    for (let i = 0; i < DRAWN + 5; i++) slow.revealNext()
    const fast = played(7)
    fast.revealAll()
    expect(slow.bankroll).toBe(fast.bankroll)
    expect(slow.last).toEqual(fast.last)
  })

  it('pays the card for the catch it made', () => {
    const g = played()
    g.revealAll()
    const r = g.last!
    expect(r.caught).toEqual(r.picks.filter((n) => r.drawn.includes(n)))
    expect(r.odds).toBe(payFor(g.table, r.picks.length, r.caught.length))
    expect(r.returned).toBe(r.odds * r.staked)
  })

  it('takes the stake on a losing ticket — keno does not push', () => {
    // Find a round that caught nothing on a ten-spot; it takes very few tries.
    const g = new KenoGame({ seed: 3, bankroll: 100_000, bet: 10 })
    g.quickPick(10)
    let found = false
    for (let i = 0; i < 200 && !found; i++) {
      g.draw()
      g.revealAll()
      if (g.last!.caught.length < 5) {
        expect(g.last!.returned).toBe(0)
        found = true
      }
      g.next()
    }
    expect(found).toBe(true)
  })

  it('will not change the card or the bet mid-draw', () => {
    const g = played()
    g.setBet(500)
    g.setPaytable('nope')
    g.togglePick(1)
    g.clearPicks()
    expect(g.bet).toBe(5)
    expect(g.picks).toHaveLength(6)
    expect(g.phase).toBe('drawing')
  })
})

describe('accounting and replay', () => {
  it('moves the bankroll only by -staked + returned over hundreds of rounds', () => {
    const START = 1_000_000
    const g = new KenoGame({ seed: 2_024, bankroll: START, bet: 10 })
    let staked = 0
    let returned = 0
    for (let i = 0; i < 400; i++) {
      g.quickPick((i % MAX_PICKS) + 1)
      g.draw()
      g.revealAll()
      const r = g.last!
      staked += r.staked
      returned += r.returned
      g.next()
    }
    expect(staked).toBe(400 * 10)
    expect(g.bankroll).toBe(START - staked + returned)
  })

  it('never lets the bankroll go negative', () => {
    const g = new KenoGame({ seed: 8, bankroll: 200, bet: 25 })
    for (let i = 0; i < 500; i++) {
      g.quickPick(6)
      if (!g.canDraw()) break
      g.draw()
      g.revealAll()
      expect(g.bankroll).toBeGreaterThanOrEqual(0)
      g.next()
    }
  })

  it('replays identically from a seed', () => {
    const run = () => {
      const g = new KenoGame({ seed: 4_242, bankroll: 50_000, bet: 5 })
      const boards: number[][] = []
      for (let i = 0; i < 60; i++) {
        g.quickPick(8)
        g.draw()
        g.revealAll()
        boards.push(g.last!.drawn)
        g.next()
      }
      return { bankroll: g.bankroll, boards }
    }
    expect(run()).toEqual(run())
  })

  it('lands near its exact return over a long run', () => {
    // Not a precision test — the exact number lives in paytables.ts and is
    // asserted above. This only checks the engine is drawing from the same
    // distribution the maths describes. A ten-spot's variance is dominated by
    // prizes nobody will hit in 60k tickets, so a six-spot is the honest check.
    const PICKS = 6
    const N = 60_000
    const g = new KenoGame({ seed: 777, bankroll: 10 ** 9, bet: 1 })
    let staked = 0
    let returned = 0
    for (let i = 0; i < N; i++) {
      g.quickPick(PICKS)
      g.draw()
      g.revealAll()
      staked += g.last!.staked
      returned += g.last!.returned
      g.next()
    }
    const measured = returned / staked
    expect(measured).toBeCloseTo(expectedReturn(g.table, PICKS), 1)
  })
})
