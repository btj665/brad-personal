import { describe, expect, it } from 'vitest'

import {
  ALL_ROLLS,
  anyTripleBet,
  bigBet,
  comboBet,
  COMBOS,
  doubleBet,
  edgeUnits,
  evenBet,
  faceCount,
  hitCount,
  houseEdge,
  LAYOUT,
  oddBet,
  oddsFor,
  publishedEdge,
  settleBet,
  singleBet,
  smallBet,
  totalBet,
  TOTAL_PAYOUT,
  TOTALS,
  tripleBet,
  type Bet,
  type Face,
  type Roll,
} from './bets'
import { SicBoGame } from './engine'

/** A roll from three digits: r('456'). */
function r(spec: string): Roll {
  const [a, b, c] = spec.split('').map(Number) as Face[]
  return { a, b, c }
}

describe('the dice', () => {
  it('has exactly 216 distinct rolls', () => {
    expect(ALL_ROLLS).toHaveLength(216)
    expect(new Set(ALL_ROLLS.map((x) => `${x.a}${x.b}${x.c}`)).size).toBe(216)
  })

  it('counts totals the way three dice do', () => {
    const tally = new Map<number, number>()
    for (const roll of ALL_ROLLS) {
      const t = roll.a + roll.b + roll.c
      tally.set(t, (tally.get(t) ?? 0) + 1)
    }
    // The classic three-dice curve, 3 through 18.
    expect([...Array(16).keys()].map((i) => tally.get(i + 3))).toEqual([
      1, 3, 6, 10, 15, 21, 25, 27, 27, 25, 21, 15, 10, 6, 3, 1,
    ])
  })

  it('counts faces', () => {
    expect(faceCount(r('444'), 4)).toBe(3)
    expect(faceCount(r('414'), 4)).toBe(2)
    expect(faceCount(r('123'), 4)).toBe(0)
  })
})

describe('the layout', () => {
  it('has all 52 spots, each with a unique key', () => {
    expect(LAYOUT).toHaveLength(4 + 1 + 6 + 6 + 14 + 15 + 6)
    expect(new Set(LAYOUT.map((b) => b.key)).size).toBe(LAYOUT.length)
  })

  it('has the fifteen two-dice combinations, distinct faces only', () => {
    expect(COMBOS).toHaveLength(15)
    expect(COMBOS.every(([a, b]) => a < b)).toBe(true)
    expect(() => comboBet(3, 3)).toThrow()
    // Order does not make a new spot.
    expect(comboBet(5, 2).key).toBe(comboBet(2, 5).key)
  })

  it('has a spot for every total 4–17 and prices them symmetrically', () => {
    expect(TOTALS).toHaveLength(14)
    for (const t of TOTALS) expect(TOTAL_PAYOUT[t]).toBe(TOTAL_PAYOUT[21 - t])
    expect(() => totalBet(3)).toThrow()
    expect(() => totalBet(18)).toThrow()
  })

  it('prints what each spot pays', () => {
    expect(tripleBet(4).pays).toBe('180:1')
    expect(anyTripleBet().pays).toBe('30:1')
    expect(totalBet(4).pays).toBe('60:1')
    expect(totalBet(10).pays).toBe('6:1')
  })
})

describe('settlement pays the book', () => {
  it('pays small and big even money on their ranges', () => {
    expect(settleBet(smallBet(), r('124'), 10)).toBe(20) // total 7
    expect(settleBet(smallBet(), r('566'), 10)).toBe(0) // total 17
    expect(settleBet(bigBet(), r('566'), 10)).toBe(20)
    expect(settleBet(bigBet(), r('124'), 10)).toBe(0)
  })

  it('makes small, big, odd and even all lose to a triple', () => {
    // 222 is a 6 (small, even) and 333 a 9 (small, odd): the triple beats both.
    expect(oddsFor(smallBet(), r('222'))).toBe(0)
    expect(oddsFor(evenBet(), r('222'))).toBe(0)
    expect(oddsFor(smallBet(), r('333'))).toBe(0)
    expect(oddsFor(oddBet(), r('333'))).toBe(0)
    expect(oddsFor(bigBet(), r('444'))).toBe(0)
    expect(oddsFor(bigBet(), r('555'))).toBe(0)
    // 111 and 666 fall outside both ranges anyway, but odd/even still lose.
    expect(oddsFor(oddBet(), r('111'))).toBe(0)
    expect(oddsFor(evenBet(), r('666'))).toBe(0)
  })

  it('pays any triple 30:1 on all six, and a specific triple 180:1 on one', () => {
    for (const f of [1, 2, 3, 4, 5, 6] as Face[]) expect(settleBet(anyTripleBet(), r(`${f}${f}${f}`), 1)).toBe(31)
    expect(settleBet(anyTripleBet(), r('455'), 1)).toBe(0)
    expect(settleBet(tripleBet(4), r('444'), 1)).toBe(181)
    expect(settleBet(tripleBet(4), r('555'), 1)).toBe(0)
    expect(settleBet(tripleBet(4), r('445'), 1)).toBe(0)
  })

  it('pays a specific double 10:1, and a triple counts as a double too', () => {
    expect(settleBet(doubleBet(4), r('442'), 1)).toBe(11)
    expect(settleBet(doubleBet(4), r('444'), 1)).toBe(11)
    expect(settleBet(doubleBet(4), r('456'), 1)).toBe(0)
  })

  it('prices a single number by how often it shows', () => {
    expect(settleBet(singleBet(4), r('123'), 10)).toBe(0)
    expect(settleBet(singleBet(4), r('142'), 10)).toBe(20) // 1:1
    expect(settleBet(singleBet(4), r('414'), 10)).toBe(30) // 2:1
    expect(settleBet(singleBet(4), r('444'), 10)).toBe(40) // 3:1
  })

  it('pays a two-dice combination 5:1 when both faces show', () => {
    expect(settleBet(comboBet(2, 5), r('254'), 1)).toBe(6)
    expect(settleBet(comboBet(2, 5), r('525'), 1)).toBe(6)
    expect(settleBet(comboBet(2, 5), r('225'), 1)).toBe(6)
    expect(settleBet(comboBet(2, 5), r('222'), 1)).toBe(0)
    expect(settleBet(comboBet(2, 5), r('234'), 1)).toBe(0)
  })

  it('pays a total off the paytable, and triples do not spoil it', () => {
    expect(settleBet(totalBet(4), r('112'), 1)).toBe(61)
    expect(settleBet(totalBet(9), r('333'), 1)).toBe(7) // a total spot is not a Big/Small
    expect(settleBet(totalBet(9), r('444'), 1)).toBe(0)
  })
})

// Three dice have 216 outcomes, so these are counts and not estimates: a spot
// wins on `hitCount` rolls, and the house keeps `edgeUnits/216` of every unit
// staked on it. This table is the game's whole correctness story — if a future
// paytable edit moves a number, it breaks here first.
describe('exact house edge, enumerated over all 216 rolls', () => {
  const cases: Array<[string, Bet, number, number]> = [
    // label                       bet                hits  units the house keeps
    ['small', smallBet(), 105, 6],
    ['big', bigBet(), 105, 6],
    ['odd', oddBet(), 105, 6],
    ['even', evenBet(), 105, 6],
    ['any triple', anyTripleBet(), 6, 30],
    ['triple 4s', tripleBet(4), 1, 35],
    ['double 4s', doubleBet(4), 16, 40],
    ['single 4', singleBet(4), 91, 17],
    ['combo 2 & 5', comboBet(2, 5), 30, 36],
    ['total 4', totalBet(4), 3, 33],
    ['total 5', totalBet(5), 6, 30],
    ['total 6', totalBet(6), 10, 36],
    ['total 7', totalBet(7), 15, 21],
    ['total 8', totalBet(8), 21, 27],
    ['total 9', totalBet(9), 25, 41],
    ['total 10', totalBet(10), 27, 27],
  ]

  for (const [label, bet, hits, units] of cases) {
    it(`${label}: wins ${hits}/216, house keeps ${units}/216`, () => {
      expect(hitCount(bet)).toBe(hits)
      expect(edgeUnits(bet)).toBe(units)
      expect(houseEdge(bet)).toBeCloseTo(units / 216, 12)
    })
  }

  it('prices the totals symmetrically about 10.5', () => {
    for (const t of TOTALS) expect(edgeUnits(totalBet(t))).toBe(edgeUnits(totalBet(21 - t)))
  })

  it('gives every face the same edge on the single, double and triple spots', () => {
    for (const f of [1, 2, 3, 4, 5, 6] as Face[]) {
      expect(edgeUnits(singleBet(f))).toBe(17)
      expect(edgeUnits(doubleBet(f))).toBe(40)
      expect(edgeUnits(tripleBet(f))).toBe(35)
    }
    for (const [a, b] of COMBOS) expect(edgeUnits(comboBet(a, b))).toBe(36)
  })

  // Every spot on the layout, enumerated against its published figure. Two of
  // those figures are widely misquoted and were wrong in the spec this was built
  // from — 30.09% is a specific triple at 150:1, and 18.98% is the total-9/12
  // number — so the arithmetic is what decides, and this test is what stops the
  // wrong ones being pasted back in.
  it('matches the published sheet on every spot', () => {
    for (const bet of LAYOUT) {
      const mine = Math.round(houseEdge(bet) * 10000) / 100
      expect([bet.key, mine]).toEqual([bet.key, publishedEdge(bet)])
    }
  })

  it('leaves no spot on the layout free or better than the house', () => {
    for (const bet of LAYOUT) {
      expect(edgeUnits(bet)).toBeGreaterThan(0)
      expect(houseEdge(bet)).toBeLessThan(0.19)
    }
  })
})

describe('a session', () => {
  function game() {
    return new SicBoGame({ seed: 9, bankroll: 1000 })
  }

  it('takes chips, shakes, and settles', () => {
    const g = game()
    g.setChip(25)
    g.place(smallBet())
    expect(g.staked).toBe(25)
    expect(g.canShake()).toBe(true)

    const before = g.bankroll
    g.shake()
    expect(g.phase).toBe('result')
    const res = g.lastResult!
    expect(g.bankroll).toBe(before - res.staked + res.returned)
    expect(g.history[0]).toEqual(res.roll)
    expect(res.total).toBe(res.roll.a + res.roll.b + res.roll.c)
  })

  it('names the winning spots', () => {
    const g = game()
    g.setChip(5)
    g.place(smallBet())
    g.place(bigBet())
    g.shake()
    // Exactly one of small/big wins, unless the dice came up a triple.
    const res = g.lastResult!
    const triple = res.roll.a === res.roll.b && res.roll.b === res.roll.c
    expect(res.winners).toHaveLength(triple ? 0 : 1)
  })

  it('stacks repeated chips on the same spot', () => {
    const g = game()
    g.setChip(5)
    g.place(tripleBet(6))
    g.place(tripleBet(6))
    expect(g.bets.get('triple-6')!.amount).toBe(10)
  })

  it('never stakes more than the bankroll', () => {
    const g = new SicBoGame({ seed: 1, bankroll: 20 })
    g.setChip(25)
    g.place(smallBet())
    expect(g.staked).toBe(0)
    g.setChip(20)
    g.place(smallBet())
    g.place(bigBet()) // nothing left to cover it
    expect(g.staked).toBe(20)
  })

  it('locks the felt once the dice have landed', () => {
    const g = game()
    g.setChip(5)
    g.place(smallBet())
    g.shake()
    g.place(bigBet())
    g.removeBet('small')
    expect(g.bets.size).toBe(1)
    expect(g.bets.has('small')).toBe(true)
  })

  it('rebets the last round when the bankroll covers it', () => {
    const g = game()
    g.setChip(25)
    g.place(oddBet())
    g.shake()
    g.next()
    expect(g.bets.size).toBe(0)
    g.rebet()
    expect(g.bets.get('odd')!.amount).toBe(25)
  })

  it('moves the bankroll only by −wagered + returned', () => {
    const g = new SicBoGame({ seed: 314, bankroll: 100_000 })
    let wagered = 0
    let returned = 0
    const start = g.bankroll
    for (let i = 0; i < 400; i++) {
      g.setChip(5)
      g.place(smallBet())
      g.place(singleBet(((i % 6) + 1) as Face))
      g.place(totalBet((i % 14) + 4))
      g.place(anyTripleBet())
      wagered += g.staked
      g.shake()
      returned += g.lastResult!.returned
      g.next()
    }
    expect(g.bankroll).toBe(start - wagered + returned)
  })

  it('replays identically from a seed', () => {
    const a = game()
    const b = game()
    for (let i = 0; i < 40; i++) {
      a.setChip(5)
      a.place(bigBet())
      a.shake()
      a.next()
      b.setChip(5)
      b.place(bigBet())
      b.shake()
      b.next()
    }
    expect(a.bankroll).toBe(b.bankroll)
    expect(a.history).toEqual(b.history)
  })
})
