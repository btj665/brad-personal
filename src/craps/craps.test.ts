import { describe, expect, it } from 'vitest'

import { CrapsGame } from './engine'

function game(bankroll = 1000) {
  return new CrapsGame({ seed: 1, bankroll })
}

describe('the pass line', () => {
  it('wins on a come-out 7', () => {
    const g = game()
    g.betPass()
    expect(g.bankroll).toBe(995) // 5 out
    g.roll([3, 4]) // seven
    expect(g.bankroll).toBe(1005) // 5 back + 5 won
    expect(g.phase).toBe('comeout')
  })

  it('loses on a come-out craps', () => {
    const g = game()
    g.betPass()
    g.roll([1, 1]) // snake eyes
    expect(g.bankroll).toBe(995)
    expect(g.phase).toBe('comeout')
  })

  it('sets a point, then wins when it repeats', () => {
    const g = game()
    g.betPass()
    g.roll([2, 4]) // point is 6
    expect(g.phase).toBe('point')
    expect(g.point).toBe(6)
    g.roll([5, 5]) // a ten, nothing
    expect(g.bankroll).toBe(995)
    g.roll([3, 3]) // point made
    expect(g.bankroll).toBe(1005)
    expect(g.phase).toBe('comeout')
  })

  it('loses the line when it sevens out', () => {
    const g = game()
    g.betPass()
    g.roll([2, 2]) // point 4
    g.roll([1, 6]) // seven out
    expect(g.bankroll).toBe(995)
    expect(g.lastResolution!.seizedOut).toBe(true)
    expect(g.phase).toBe('comeout')
  })
})

describe('pass odds pay true odds', () => {
  it('pays 2:1 behind a point of 4', () => {
    const g = game()
    g.betPass() // 5 on the line
    g.roll([1, 3]) // point 4
    g.addOdds('pass') // 5 in odds (3-4-5x allows it)
    expect(g.bankroll).toBe(990)
    g.roll([2, 2]) // point made
    // Line pays 5 (1:1) + odds pays 10 (2:1). Both stakes return.
    // returned = 10 (line) + 15 (odds 5 + 10). bankroll 990 + 25 = 1015.
    expect(g.bankroll).toBe(1015)
  })
})

describe("don't pass", () => {
  it('wins on a come-out craps 2 and pushes on 12', () => {
    const g = game()
    g.betDontPass()
    g.roll([1, 1]) // 2: don't wins
    expect(g.bankroll).toBe(1005)

    const g2 = game()
    g2.betDontPass()
    g2.roll([6, 6]) // 12: push, bet stays? No — resolved as push, bet returned.
    // 12 barred: the bet neither wins nor loses; it remains on the come-out.
    expect(g2.bankroll).toBe(995) // still out on the line
  })

  it('wins on a seven out', () => {
    const g = game()
    g.betDontPass()
    g.roll([2, 3]) // point 5
    g.roll([3, 4]) // seven out: don't pass wins
    expect(g.bankroll).toBe(1005)
  })
})

describe('the field', () => {
  it('pays double on the 2 and triple on the 12', () => {
    const two = game()
    two.betField()
    two.roll([1, 1])
    expect(two.bankroll).toBe(1010) // 5 back + 10

    const twelve = game()
    twelve.betField()
    twelve.roll([6, 6])
    expect(twelve.bankroll).toBe(1015) // 5 back + 15
  })

  it('loses on a 5, 6, 7 or 8', () => {
    const g = game()
    g.betField()
    g.roll([2, 3]) // 5
    expect(g.bankroll).toBe(995)
  })
})

describe('place bets', () => {
  it('pays 7:6 on the 6 during the point', () => {
    const g = game()
    g.betPass()
    g.roll([3, 1]) // point 4, now in point phase
    g.placeBet(6)
    expect(g.bankroll).toBe(990) // 5 line + 5 place
    g.roll([3, 3]) // a six
    // Place 6 pays 5 × 7/6 ≈ 5.833; the place bet stays up.
    expect(g.bankroll).toBeCloseTo(990 + (5 * 7) / 6, 5)
  })
})

describe('the edge holds up', () => {
  it('grinds the pass line toward about 1.4% over many rounds', () => {
    const g = new CrapsGame({ seed: 12345, bankroll: 1e9 })
    let staked = 0
    const start = g.bankroll
    for (let i = 0; i < 200000; i++) {
      g.setChip(1)
      g.betPass()
      staked += 1
      // Roll to a decision.
      let guard = 0
      while (g.bets.pass && guard++ < 200) g.roll()
    }
    const edge = (start - g.bankroll) / staked
    expect(edge).toBeGreaterThan(0.008)
    expect(edge).toBeLessThan(0.020) // 1.41% ± sampling
  })
})
