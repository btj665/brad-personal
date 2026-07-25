import { describe, expect, it } from 'vitest'

import {
  columnBet,
  dozenBet,
  outsideBet,
  PAYOUT,
  settleBet,
  straightBet,
  toplineBet,
} from './bets'
import { RouletteGame } from './engine'
import { AMERICAN_ORDER, colourOf, EUROPEAN_ORDER } from './wheel'

describe('the wheel', () => {
  it('colours the numbers the way a real layout does', () => {
    expect(colourOf(0)).toBe('green')
    expect(colourOf('00')).toBe('green')
    expect(colourOf(1)).toBe('red')
    expect(colourOf(2)).toBe('black')
    expect(colourOf(17)).toBe('black')
    expect(colourOf(36)).toBe('red')
  })

  it('has the right number of pockets', () => {
    expect(EUROPEAN_ORDER).toHaveLength(37) // 0–36
    expect(AMERICAN_ORDER).toHaveLength(38) // 0, 00, 1–36
    expect(new Set(EUROPEAN_ORDER).size).toBe(37)
    expect(new Set(AMERICAN_ORDER.map(String)).size).toBe(38)
  })

  it('splits red and black evenly', () => {
    const reds = Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => colourOf(n) === 'red')
    expect(reds).toHaveLength(18)
  })
})

describe('bets cover the right numbers', () => {
  it('dozens and columns each cover twelve', () => {
    expect(dozenBet(1).numbers).toHaveLength(12)
    expect(dozenBet(2).numbers[0]).toBe(13)
    expect(columnBet(1).numbers).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34])
    expect(columnBet(3).numbers).toContain(36)
  })

  it('red covers the eighteen reds', () => {
    expect(outsideBet('red').numbers).toHaveLength(18)
    expect(outsideBet('red').numbers.every((n) => colourOf(n) === 'red')).toBe(true)
  })

  it('the American top line covers five', () => {
    expect(toplineBet().numbers).toEqual([0, '00', 1, 2, 3])
  })
})

describe('settlement pays the book', () => {
  it('pays a straight-up 35 to 1', () => {
    expect(settleBet(straightBet(17), 17, 'european', 10)).toBe(10 * 36) // stake + 35
    expect(settleBet(straightBet(17), 18, 'european', 10)).toBe(0)
  })

  it('pays even money on red', () => {
    expect(settleBet(outsideBet('red'), 1, 'european', 10)).toBe(20)
    expect(settleBet(outsideBet('red'), 2, 'european', 10)).toBe(0)
  })

  it('applies la partage on the French wheel', () => {
    // Even-money bet, ball in zero: half the stake comes back.
    expect(settleBet(outsideBet('red'), 0, 'french', 10)).toBe(5)
    // On any other wheel, zero just loses.
    expect(settleBet(outsideBet('red'), 0, 'european', 10)).toBe(0)
    // La partage does not apply to a straight-up bet.
    expect(settleBet(straightBet(5), 0, 'french', 10)).toBe(0)
  })

  it('agrees with the payout table', () => {
    expect(PAYOUT.straight).toBe(35)
    expect(PAYOUT.corner).toBe(8)
    expect(PAYOUT.dozen).toBe(2)
  })
})

describe('a session', () => {
  function game() {
    return new RouletteGame({ variant: 'european', seed: 4, bankroll: 1000 })
  }

  it('takes chips, spins, and settles', () => {
    const g = game()
    g.setChip(25)
    g.place(outsideBet('red'))
    expect(g.staked).toBe(25)
    expect(g.canSpin()).toBe(true)

    const before = g.bankroll
    g.spin()
    expect(g.phase).toBe('result')
    // The result is consistent: bankroll moved by (returned − staked).
    const r = g.lastResult!
    expect(g.bankroll).toBe(before - r.staked + r.returned)
    expect(g.history[0]).toBe(r.pocket)
  })

  it('stacks repeated chips on the same spot', () => {
    const g = game()
    g.setChip(5)
    g.place(straightBet(7))
    g.place(straightBet(7))
    expect(g.bets.get('straight-7')!.amount).toBe(10)
  })

  it('never stakes more than the bankroll', () => {
    const g = new RouletteGame({ variant: 'european', seed: 1, bankroll: 20 })
    g.setChip(25)
    g.place(outsideBet('black')) // 25 > 20 bankroll, refused
    expect(g.staked).toBe(0)
  })

  it('replays identically from a seed', () => {
    const a = game()
    const b = game()
    for (let i = 0; i < 30; i++) {
      a.setChip(5); a.place(straightBet(1)); a.spin(); a.next()
      b.setChip(5); b.place(straightBet(1)); b.spin(); b.next()
    }
    expect(a.bankroll).toBe(b.bankroll)
    expect(a.history).toEqual(b.history)
  })
})
