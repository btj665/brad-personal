import { describe, expect, it } from 'vitest'

import type { Card, Rank, Suit } from '../engine/types'
import { bestOf, Category, compare, score2, score5, type Score } from './eval'

let uid = 0
/** "Ah", "10s", "Kd" … and "*" for the joker. */
function c(spec: string): Card {
  if (spec === '*') return { uid: uid++, rank: 'A', suit: 'S', joker: true }
  const suit = spec.slice(-1).toUpperCase() as Suit
  const rank = spec.slice(0, -1) as Rank
  return { uid: uid++, rank, suit }
}
const hand = (specs: string) => specs.split(' ').map(c)

function cat(specs: string, opts = {}): Category {
  return score5(hand(specs), opts).category
}

describe('five-card categories', () => {
  it('names every category', () => {
    expect(cat('As Ks Qs Js 10s')).toBe(Category.StraightFlush)
    expect(cat('9s 8s 7s 6s 5s')).toBe(Category.StraightFlush)
    expect(cat('As Ah Ad Ac Ks')).toBe(Category.Quads)
    expect(cat('As Ah Ad Ks Kh')).toBe(Category.FullHouse)
    expect(cat('As Ks Qs Js 9s')).toBe(Category.Flush)
    expect(cat('As Kh Qd Jc 10s')).toBe(Category.Straight)
    expect(cat('As Ah Ad Ks Qh')).toBe(Category.Trips)
    expect(cat('As Ah Ks Kh Qd')).toBe(Category.TwoPair)
    expect(cat('As Ah Ks Qh Jd')).toBe(Category.Pair)
    expect(cat('As Kh Qd Jc 9s')).toBe(Category.HighCard)
  })

  it('orders the categories', () => {
    const ladder = [
      'As Kh Qd Jc 9s', // high card
      'As Ah Ks Qh Jd', // pair
      'As Ah Ks Kh Qd', // two pair
      'As Ah Ad Ks Qh', // trips
      'As Kh Qd Jc 10s', // straight
      'As Ks Qs Js 9s', // flush
      'As Ah Ad Ks Kh', // full house
      'As Ah Ad Ac Ks', // quads
      'As Ks Qs Js 10s', // straight flush
    ]
    for (let i = 1; i < ladder.length; i++) {
      expect(compare(score5(hand(ladder[i])), score5(hand(ladder[i - 1]))), ladder[i]).toBeGreaterThan(0)
    }
  })
})

describe('tiebreaks', () => {
  it('ranks two pair by the high pair, then the low, then the kicker', () => {
    const big = score5(hand('Ks Kh 3s 3h 2d'))
    const small = score5(hand('Qs Qh Js Jh Ad'))
    expect(compare(big, small)).toBeGreaterThan(0) // kings-up beats queens-up
  })

  it('ranks a flush by its cards, highest first', () => {
    const a = score5(hand('As Qs 9s 5s 3s'))
    const b = score5(hand('As Js 9s 5s 3s'))
    expect(compare(a, b)).toBeGreaterThan(0)
  })

  it('splits identical hands as a tie', () => {
    expect(compare(score5(hand('As Kh Qd Jc 9s')), score5(hand('Ah Ks Qh Jd 9h')))).toBe(0)
  })
})

describe('the wheel', () => {
  it('is the lowest straight in ordinary poker', () => {
    const wheel = score5(hand('As 5h 4d 3c 2s'))
    const sixHigh = score5(hand('6s 5h 4d 3c 2s'))
    expect(wheel.category).toBe(Category.Straight)
    expect(compare(sixHigh, wheel)).toBeGreaterThan(0)
  })

  it('is the second-highest straight in Pai Gow', () => {
    const opts = { wheelHigh: true }
    const wheel = score5(hand('As 5h 4d 3c 2s'), opts)
    const broadway = score5(hand('As Kh Qd Jc 10s'), opts)
    const kingHigh = score5(hand('Ks Qh Jd 10c 9s'), opts)

    expect(compare(broadway, wheel)).toBeGreaterThan(0) // A-high still beats it
    expect(compare(wheel, kingHigh)).toBeGreaterThan(0) // but it beats K-high
  })
})

describe('the joker', () => {
  const opts = { wheelHigh: true }

  it('completes a flush', () => {
    expect(cat('As Ks Qs Js *')).toBe(Category.StraightFlush) // it makes the royal
    expect(cat('As Ks Qs 9s *')).toBe(Category.Flush)
  })

  it('completes a straight', () => {
    expect(cat('9s 8h 7d 6c *')).toBe(Category.Straight) // fills for a 10 or a 5
  })

  it('acts as an ace for pairs and trips', () => {
    expect(cat('As Ah Ks Qh *')).toBe(Category.Trips) // three aces
    // As Kh 7d 2c *: the joker is an ace, pairing the ace already there. (With
    // no ace present it would just be ace-high — the joker pairs nothing on its
    // own.)
    const s = score5(hand('As Kh 7d 2c *'))
    expect(s.category).toBe(Category.Pair)
    expect(s.tiebreak[0]).toBe(14) // the pair is aces
  })

  it('may not pair a non-ace', () => {
    // K K Q J joker: the joker cannot make a third king or a pair of queens; the
    // best it can legally do is act as an ace kicker, leaving one pair of kings.
    expect(cat('Ks Kh Qd Jc *')).toBe(Category.Pair)
    expect(score5(hand('Ks Kh Qd Jc *')).tiebreak[0]).toBe(13) // kings, not aces
  })

  it('makes four aces from three plus the joker', () => {
    expect(cat('As Ah Ad Kc *')).toBe(Category.Quads)
  })

  it('takes the highest of its legal options', () => {
    // A A A K joker: quads (four aces) beats the trips it would otherwise be.
    const s = score5(hand('As Ah Ad Kc *'), opts)
    expect(s.category).toBe(Category.Quads)
    expect(s.usedJoker).toBe(true)
  })
})

describe('best of seven', () => {
  it('finds the straight flush hiding in seven cards', () => {
    const s = bestOf(hand('As Ks 2d 2h Qs Js 10s'))
    expect(s.category).toBe(Category.StraightFlush)
  })

  it('finds the best five with a joker among seven', () => {
    // Four spades to a royal plus the joker: it fills for the ace of spades.
    const s = bestOf(hand('2c 3d Ks Qs Js 10s *'))
    expect(s.category).toBe(Category.StraightFlush)
  })

  it('prefers quads over a flush when both are available', () => {
    const s = bestOf(hand('As Ah Ad Ac Ks Qs Js'))
    expect(s.category).toBe(Category.Quads)
  })
})

describe('two-card low hand', () => {
  it('ranks a pair over two singles', () => {
    expect(score2(hand('9s 9h')).category).toBe(Category.Pair)
    expect(score2(hand('As Kh')).category).toBe(Category.HighCard)
    expect(compare(score2(hand('2s 2h')), score2(hand('As Kh')))).toBeGreaterThan(0)
  })

  it('treats the joker as an ace', () => {
    const s = score2(hand('* Kh'))
    expect(s.category).toBe(Category.HighCard)
    expect(s.tiebreak).toEqual([14, 13])
  })

  it('orders two high cards correctly', () => {
    expect(compare(score2(hand('As Qh')), score2(hand('As Jh')))).toBeGreaterThan(0)
  })
})

// A hand for later reuse by the pai gow tests.
export function score(specs: string, opts = {}): Score {
  return score5(hand(specs), opts)
}
