import { describe, expect, it } from 'vitest'

import { BigSixGame } from './engine'
import {
  enumerateEdge,
  houseEdge,
  LABEL,
  PAYS,
  payout,
  SECTION_SIZE,
  STOPS,
  SYMBOLS,
  TOTAL_STOPS,
  WHEEL,
  type Symbol6,
} from './wheel'

/** The published house edges, to two decimals of a percent. Big Six is the
 *  worst bet on a casino floor and these are why. */
const PUBLISHED: Record<Symbol6, number> = {
  '1': 0.1111,
  '2': 0.1667,
  '5': 0.2222,
  '10': 0.1852,
  '20': 0.2222,
  joker: 0.2407,
  logo: 0.2407,
}

describe('the wheel', () => {
  it('has fifty-four stops', () => {
    expect(TOTAL_STOPS).toBe(54)
    expect(WHEEL).toHaveLength(54)
  })

  it('carries the standard stop counts', () => {
    expect(STOPS).toEqual({ '1': 24, '2': 15, '5': 7, '10': 4, '20': 2, joker: 1, logo: 1 })
    const total = SYMBOLS.reduce((n, s) => n + STOPS[s], 0)
    expect(total).toBe(54)
  })

  it('has a ring that actually matches those counts', () => {
    for (const s of SYMBOLS) {
      expect(WHEEL.filter((x) => x === s)).toHaveLength(STOPS[s])
    }
  })

  it('is six peg-separated sections of nine', () => {
    expect(TOTAL_STOPS / SECTION_SIZE).toBe(6)
  })

  it('puts the joker and the logo dead opposite each other', () => {
    const joker = WHEEL.indexOf('joker')
    const logo = WHEEL.indexOf('logo')
    expect(Math.abs(joker - logo)).toBe(TOTAL_STOPS / 2)
  })

  it('pays each symbol its face value, and 40 for the two wilds', () => {
    expect(PAYS).toEqual({ '1': 1, '2': 2, '5': 5, '10': 10, '20': 20, joker: 40, logo: 40 })
    expect(LABEL['20']).toBe('$20')
  })
})

describe('payouts by name', () => {
  it('returns stake plus winnings on a hit', () => {
    expect(payout('1', '1', 10)).toBe(20) // 1:1
    expect(payout('2', '2', 10)).toBe(30) // 2:1
    expect(payout('5', '5', 10)).toBe(60) // 5:1
    expect(payout('10', '10', 10)).toBe(110) // 10:1
    expect(payout('20', '20', 10)).toBe(210) // 20:1
    expect(payout('joker', 'joker', 10)).toBe(410) // 40:1
    expect(payout('logo', 'logo', 10)).toBe(410) // 40:1
  })

  it('returns nothing on a miss, including the other 40:1 symbol', () => {
    expect(payout('1', '2', 10)).toBe(0)
    expect(payout('joker', 'logo', 10)).toBe(0)
    expect(payout('logo', 'joker', 10)).toBe(0)
  })
})

describe('the house edge, enumerated exactly', () => {
  // Fifty-four outcomes: no reason to ever simulate this game.
  it.each(SYMBOLS)('is right on %s', (symbol) => {
    expect(houseEdge(symbol)).toBeCloseTo(PUBLISHED[symbol], 4)
    // The closed form and a walk of all 54 stops must agree.
    expect(enumerateEdge(symbol)).toBeCloseTo(houseEdge(symbol), 12)
  })

  it('is exact in fifty-fourths', () => {
    // Every edge here is a whole number of stops over 54, which is why they come
    // out as those particular repeating decimals.
    expect(houseEdge('1') * 54).toBeCloseTo(6, 10)
    expect(houseEdge('2') * 54).toBeCloseTo(9, 10)
    expect(houseEdge('5') * 54).toBeCloseTo(12, 10)
    expect(houseEdge('10') * 54).toBeCloseTo(10, 10)
    expect(houseEdge('20') * 54).toBeCloseTo(12, 10)
    expect(houseEdge('joker') * 54).toBeCloseTo(13, 10)
    expect(houseEdge('logo') * 54).toBeCloseTo(13, 10)
  })

  it('never once favours the player', () => {
    for (const s of SYMBOLS) expect(houseEdge(s)).toBeGreaterThan(0.11)
  })

  it('makes the $1 the least bad and the 40:1 symbols the worst', () => {
    const ranked = [...SYMBOLS].sort((a, b) => houseEdge(a) - houseEdge(b))
    expect(ranked[0]).toBe('1')
    expect(ranked[ranked.length - 1]).toBe('logo')
    // Even the best bet on the wheel is worse than every bet in roulette.
    expect(houseEdge('1')).toBeGreaterThan(0.0526)
  })
})

describe('a session', () => {
  function game() {
    return new BigSixGame({ seed: 9, bankroll: 500 })
  }

  it('takes chips, spins, and settles', () => {
    const g = game()
    g.setChip(25)
    g.place('1')
    expect(g.staked).toBe(25)
    expect(g.canSpin()).toBe(true)

    const before = g.bankroll
    const r = g.spin()
    expect(g.phase).toBe('result')
    expect(g.bankroll).toBe(before - r.staked + r.returned)
    expect(WHEEL[r.index]).toBe(r.landed)
    expect(g.history[0]).toBe(r.landed)
  })

  it('stacks repeated chips on the same symbol', () => {
    const g = game()
    g.setChip(5)
    g.place('20')
    g.place('20')
    expect(g.bets.get('20')).toBe(10)
  })

  it('never stakes more than the bankroll', () => {
    const g = new BigSixGame({ seed: 1, bankroll: 20 })
    g.setChip(25)
    g.place('5')
    expect(g.staked).toBe(0)
  })

  it('replays identically from a seed', () => {
    const a = game()
    const b = game()
    for (let i = 0; i < 40; i++) {
      a.setChip(5); a.place('2'); a.spin(); a.next()
      b.setChip(5); b.place('2'); b.spin(); b.next()
    }
    expect(a.bankroll).toBe(b.bankroll)
    expect(a.history).toEqual(b.history)
  })

  it('moves the bankroll by exactly -staked + returned, every spin', () => {
    const g = new BigSixGame({ seed: 4321, bankroll: 1_000_000 })
    g.setChip(1)
    for (let i = 0; i < 400; i++) {
      // Spread chips around so several bets resolve each spin.
      g.place(SYMBOLS[i % SYMBOLS.length])
      g.place(SYMBOLS[(i + 3) % SYMBOLS.length])
      const before = g.bankroll
      const r = g.spin()
      expect(g.bankroll).toBe(before - r.staked + r.returned)
      // At most one symbol can win: the wheel stops on exactly one stop.
      expect(r.winners.length).toBeLessThanOrEqual(1)
      g.next()
    }
  })

  it('lands on every symbol over enough spins, in roughly the stop proportions', () => {
    const g = new BigSixGame({ seed: 2, bankroll: 1e9 })
    const seen = new Map<Symbol6, number>()
    const spins = 54_000
    for (let i = 0; i < spins; i++) {
      g.setChip(1)
      g.place('1')
      const r = g.spin()
      seen.set(r.landed, (seen.get(r.landed) ?? 0) + 1)
      g.next()
    }
    for (const s of SYMBOLS) {
      expect(seen.get(s)).toBeGreaterThan(0)
      expect((seen.get(s) ?? 0) / spins).toBeCloseTo(STOPS[s] / TOTAL_STOPS, 2)
    }
  })
})
