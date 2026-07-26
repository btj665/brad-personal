import { describe, expect, it } from 'vitest'

import type { Card, Rank, Suit } from '../engine/types'
import { Cat3, CAT3_NAME, compare3, handName, score3, strength3 } from './eval3'

let uid = 0
function c(spec: string): Card {
  const suit = spec.slice(-1).toUpperCase() as Suit
  const rank = spec.slice(0, -1) as Rank
  return { uid: uid++, rank, suit }
}
const h = (s: string) => s.split(' ').map(c)

describe('three-card categories', () => {
  it('names every category', () => {
    expect(score3(h('Qs Ks As')).category).toBe(Cat3.StraightFlush)
    expect(score3(h('8s 8h 8d')).category).toBe(Cat3.Trips)
    expect(score3(h('9s 8h 7d')).category).toBe(Cat3.Straight)
    expect(score3(h('Ks 9s 4s')).category).toBe(Cat3.Flush)
    expect(score3(h('6s 6h Kd')).category).toBe(Cat3.Pair)
    expect(score3(h('Ks 9h 4d')).category).toBe(Cat3.HighCard)
  })

  it('names them in three-card order, straight above flush', () => {
    expect(Object.values(CAT3_NAME)).toEqual([
      'High card',
      'Pair',
      'Flush',
      'Straight',
      'Three of a kind',
      'Straight flush',
    ])
  })

  it('ranks a straight above a flush — the whole point of the three-card order', () => {
    const straight = score3(h('4s 3h 2d')) // the second-lowest straight
    const flush = score3(h('As Ks Js')) // the best non-straight flush there is
    expect(compare3(straight, flush)).toBeGreaterThan(0)
  })

  it('ranks trips above a straight and a straight flush above trips', () => {
    expect(compare3(score3(h('2s 2h 2d')), score3(h('As Kh Qd')))).toBeGreaterThan(0)
    expect(compare3(score3(h('As 2s 3s')), score3(h('As Ah Ad')))).toBeGreaterThan(0)
  })

  it('ranks a pair above high card and orders inside each', () => {
    // A-K-J, not A-K-Q: with three cards Q-K-A is a straight.
    expect(compare3(score3(h('2s 2h 3d')), score3(h('As Kh Jd')))).toBeGreaterThan(0)
    // Same pair, better kicker.
    expect(compare3(score3(h('9s 9h Kd')), score3(h('9d 9c Qs')))).toBeGreaterThan(0)
    // High card runs down all three ranks.
    expect(compare3(score3(h('Ks 9h 5d')), score3(h('Kh 9d 4s')))).toBeGreaterThan(0)
  })
})

describe('three-card straights', () => {
  it('makes A-2-3 the lowest straight', () => {
    const wheel = score3(h('As 2h 3d'))
    expect(wheel.category).toBe(Cat3.Straight)
    expect(wheel.tiebreak).toEqual([3])
    expect(compare3(wheel, score3(h('4s 3h 2d')))).toBeLessThan(0)
  })

  it('makes Q-K-A the highest straight', () => {
    const broadway = score3(h('Qs Kh Ad'))
    expect(broadway.tiebreak).toEqual([14])
    expect(compare3(broadway, score3(h('Js Qh Kd')))).toBeGreaterThan(0)
  })

  it('does not read A-K-2 or Q-K-2 as a straight', () => {
    expect(score3(h('As Kh 2d')).category).toBe(Cat3.HighCard)
    expect(score3(h('Qs Kh 2d')).category).toBe(Cat3.HighCard)
  })

  it('reads a suited A-2-3 as a straight flush, not a flush', () => {
    expect(score3(h('As 2s 3s')).category).toBe(Cat3.StraightFlush)
  })
})

describe('exact hand frequencies', () => {
  it('matches the known three-card census over all 22,100 hands', () => {
    const deck: Card[] = []
    const suits: Suit[] = ['S', 'H', 'D', 'C']
    const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    let n = 0
    for (const s of suits) for (const r of ranks) deck.push({ uid: n++, rank: r, suit: s })

    const census = new Map<Cat3, number>()
    let hands = 0
    for (let a = 0; a < 52; a++) {
      for (let b = a + 1; b < 52; b++) {
        for (let d = b + 1; d < 52; d++) {
          const s = score3([deck[a], deck[b], deck[d]])
          census.set(s.category, (census.get(s.category) ?? 0) + 1)
          hands++
        }
      }
    }

    expect(hands).toBe(22100)
    expect(census.get(Cat3.StraightFlush)).toBe(48)
    expect(census.get(Cat3.Trips)).toBe(52)
    expect(census.get(Cat3.Straight)).toBe(720)
    expect(census.get(Cat3.Flush)).toBe(1096)
    expect(census.get(Cat3.Pair)).toBe(3744)
    expect(census.get(Cat3.HighCard)).toBe(16440)
  })
})

describe('strength3', () => {
  it('orders hands the same way compare3 does', () => {
    const samples = [
      'As Ks Qs', 'As 2s 3s', '5h 4h 3h',
      'As Ah Ad', '2s 2h 2d',
      'Qs Kh Ad', '9s 8h 7d', 'As 2h 3d',
      'As Ks Js', '4s 3s 2h',
      'As Ah Kd', '2s 2h 3d',
      'As Kh Qd', '2s 3h 5d',
    ].map((s) => score3(h(s)))

    for (const a of samples) {
      for (const b of samples) {
        expect(Math.sign(strength3(a) - strength3(b))).toBe(Math.sign(compare3(a, b)))
      }
    }
  })

  it('gives identical hands identical strength, so exact ties are ties', () => {
    expect(compare3(score3(h('As Kh 9d')), score3(h('Ah Kd 9s')))).toBe(0)
    expect(strength3(score3(h('As Kh 9d')))).toBe(strength3(score3(h('Ah Kd 9s'))))
  })
})

describe('handName', () => {
  it('reads the way a dealer would call it', () => {
    expect(handName(score3(h('Qs Ks As')))).toBe('Straight flush to A')
    expect(handName(score3(h('8s 8h 8d')))).toBe('Three 8s')
    expect(handName(score3(h('As 2h 3d')))).toBe('Straight to 3')
    expect(handName(score3(h('Ks 9s 4s')))).toBe('Flush, K high')
    expect(handName(score3(h('6s 6h Kd')))).toBe('Pair of 6s')
    expect(handName(score3(h('Qs 9h 4d')))).toBe('Q high')
  })
})

describe('score3 guards', () => {
  it('refuses anything that is not three cards', () => {
    expect(() => score3(h('As Ks'))).toThrow(/three cards/)
    expect(() => score3(h('As Ks Qs Js'))).toThrow(/three cards/)
  })
})
