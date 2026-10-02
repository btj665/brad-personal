import { describe, expect, it } from 'vitest'

import type { Card, Rank, Suit } from '../engine/types'
import { score5 } from '../poker/eval'
import { LetItRideGame } from './engine'
import { labelFor, netRatio, payKeyFor, settleAmount } from './rules'
import { adviseBet1, adviseBet2, letBet1Ride, letBet2Ride } from './strategy'

let uid = 0
function c(spec: string): Card {
  const suit = spec.slice(-1).toUpperCase() as Suit
  const rank = spec.slice(0, -1) as Rank
  return { uid: uid++, rank, suit }
}
const h = (s: string) => s.split(' ').map(c)
const key = (s: string) => payKeyFor(score5(h(s)))

describe('the pay table', () => {
  it('names every paying hand', () => {
    expect(key('As Ks Qs Js 10s')).toBe('royalFlush')
    expect(key('9s 8s 7s 6s 5s')).toBe('straightFlush')
    expect(key('7s 7h 7d 7c 2s')).toBe('quads')
    expect(key('As Ah Ad Ks Kh')).toBe('fullHouse')
    expect(key('As Ks 9s 5s 3s')).toBe('flush')
    expect(key('As Kh Qd Jc 10s')).toBe('straight')
    expect(key('8s 8h 8d Ks 2c')).toBe('trips')
    expect(key('As Ah Ks Kh 9d')).toBe('twoPair')
    expect(key('10s 10h 8d 5c 2s')).toBe('tensOrBetter')
    expect(key('Js Jh 8d 5c 2s')).toBe('tensOrBetter')
  })

  it('pays a pair of tens but not a pair of nines', () => {
    expect(key('10s 10h 8d 5c 2s')).toBe('tensOrBetter')
    expect(key('9s 9h Ad 5c 2s')).toBeNull() // an ace kicker does not help
    expect(key('2s 2h Ad Kc Qs')).toBeNull()
  })

  it('loses on plain high cards', () => {
    expect(key('As Kh Qd Jc 9s')).toBeNull()
  })

  it('reads the ace-low straight, and its suited version as a straight flush', () => {
    expect(key('As 2h 3d 4c 5s')).toBe('straight')
    // The wheel is not a royal: ordinary poker ranking, so its top card is the 5.
    expect(key('As 2s 3s 4s 5s')).toBe('straightFlush')
  })

  it('separates the royal from every other straight flush', () => {
    expect(key('Ks Qs Js 10s 9s')).toBe('straightFlush')
    expect(labelFor('royalFlush')).toBe('Royal flush')
  })

  it('turns a hand into net units per riding bet', () => {
    expect(netRatio(score5(h('As Ks Qs Js 10s')))).toBe(1000)
    expect(netRatio(score5(h('Js Jh 8d 5c 2s')))).toBe(1)
    expect(netRatio(score5(h('9s 9h 8d 5c 2s')))).toBe(-1)
  })
})

describe('settlement', () => {
  const royal = score5(h('As Ks Qs Js 10s'))
  const tens = score5(h('10s 10h 8d 5c 2s'))
  const junk = score5(h('9s 8h 4d 5c 2s'))

  it('pays every bet still riding at the same odds', () => {
    // Three units of 5 on a royal: 15 back plus 15,000 in wins.
    expect(settleAmount(royal, 5, 3)).toBe(15015)
    // One unit riding, two pulled back: the two come home untouched.
    expect(settleAmount(royal, 5, 1)).toBe(10 + 5 * 1001)
  })

  it('returns only the pulled-back stakes on a loser', () => {
    expect(settleAmount(junk, 5, 3)).toBe(0)
    expect(settleAmount(junk, 5, 2)).toBe(5)
    expect(settleAmount(junk, 5, 1)).toBe(10)
  })

  it('breaks even on a pair of tens with everything riding', () => {
    expect(settleAmount(tens, 5, 3)).toBe(30) // 15 staked, 15 won
    expect(settleAmount(tens, 5, 1)).toBe(20) // 10 pulled + 5 staked + 5 won
  })
})

describe('the bet 1 chart', () => {
  it('rides any paying hand', () => {
    expect(adviseBet1(h('10s 10h 4d')).clause).toBe(0)
    expect(adviseBet1(h('As Ah 4d')).clause).toBe(0)
    expect(adviseBet1(h('4s 4h 4d')).clause).toBe(0) // trips
  })

  it('pulls back a pair under tens', () => {
    expect(letBet1Ride(h('9s 9h Ad'))).toBe(false)
    expect(letBet1Ride(h('2s 2h Kd'))).toBe(false)
  })

  it('rides three to a royal, gapped or not', () => {
    expect(adviseBet1(h('As Ks Qs')).clause).toBe(1)
    expect(adviseBet1(h('10s Js As')).clause).toBe(1) // two gaps, still a royal draw
    expect(adviseBet1(h('10s Qs Ks')).clause).toBe(1)
    expect(letBet1Ride(h('As Kh Qs'))).toBe(false) // not suited
  })

  it('rides three suited in sequence, but not A-2-3 or 2-3-4', () => {
    expect(adviseBet1(h('4s 5s 6s')).clause).toBe(2)
    expect(adviseBet1(h('8s 9s 10s')).clause).toBe(2) // one high card, so a sequence not a royal
    expect(letBet1Ride(h('As 2s 3s'))).toBe(false)
    expect(letBet1Ride(h('2s 3s 4s'))).toBe(false)
    expect(letBet1Ride(h('3s 4s 5s'))).toBe(true) // the exceptions stop at 2-3-4
  })

  it('rides a one-gap straight flush draw only with a high card', () => {
    expect(adviseBet1(h('9s 10s Qs')).clause).toBe(3) // spans 9-Q, has the 10 and Q
    expect(adviseBet1(h('8s 9s Js')).clause).toBe(3) // spans 8-J, has the jack
    expect(letBet1Ride(h('5s 6s 8s'))).toBe(false) // spans four, no high card
  })

  it('rides a two-gap straight flush draw only with two high cards', () => {
    expect(adviseBet1(h('10s Js Ad')).ride).toBe(false) // two high cards but unsuited
    expect(adviseBet1(h('9s Js Ks')).clause).toBe(4) // spans 9-K, jack and king
    expect(letBet1Ride(h('9s 10s Ks'))).toBe(true) // spans 9-K, ten and king
    expect(letBet1Ride(h('8s 9s Qs'))).toBe(false) // spans 8-Q, only the queen
    expect(letBet1Ride(h('6s 8s 10s'))).toBe(false) // spans 6-10, only the ten
  })

  it('treats a low ace as a high card for the gapped draws', () => {
    // A-2-4 suited spans four ranks with the ace low, and the ace can still pair
    // into a paying hand, so the chart's one-high-card clause applies.
    expect(adviseBet1(h('As 2s 4s')).clause).toBe(3)
    expect(letBet1Ride(h('As 2s 5s'))).toBe(false) // spans five, one high card
  })

  it('pulls back plain junk', () => {
    expect(letBet1Ride(h('2s 7h Kd'))).toBe(false)
    expect(letBet1Ride(h('2s 7s Ks'))).toBe(false) // suited but nowhere near a straight
    expect(adviseBet1(h('2s 7h Kd')).clause).toBe(-1)
  })
})

describe('the bet 2 chart', () => {
  it('rides any paying hand', () => {
    expect(adviseBet2(h('10s 10h 4d 7c')).clause).toBe(0)
    expect(adviseBet2(h('4s 4h 9d 9c')).clause).toBe(0) // two pair
    expect(adviseBet2(h('4s 4h 4d 9c')).clause).toBe(0) // trips
    expect(adviseBet2(h('4s 4h 4d 4c')).clause).toBe(0) // quads
  })

  it('pulls back a pair under tens with nothing else going on', () => {
    expect(letBet2Ride(h('9s 9h 4d 2c'))).toBe(false)
  })

  it('rides four to a royal or straight flush', () => {
    expect(adviseBet2(h('As Ks Qs Js')).clause).toBe(1)
    expect(adviseBet2(h('5s 6s 7s 8s')).clause).toBe(1)
    expect(adviseBet2(h('5s 6s 7s 9s')).clause).toBe(1) // one gap, still a draw
  })

  it('rides any four to a flush', () => {
    expect(adviseBet2(h('2s 6s 9s Ks')).clause).toBe(2)
    expect(letBet2Ride(h('2s 6s 9s Kh'))).toBe(false)
  })

  it('rides four to an outside straight', () => {
    expect(adviseBet2(h('5s 6h 7d 8c')).clause).toBe(3)
    expect(adviseBet2(h('9s 10h Jd Qc')).clause).toBe(3)
  })

  it('treats A-2-3-4 and J-Q-K-A as inside straights', () => {
    // A-2-3-4 is open at one end only, and has one high card: pull it back.
    expect(letBet2Ride(h('As 2h 3d 4c'))).toBe(false)
    // J-Q-K-A is the same shape but all four cards are high: ride it.
    expect(adviseBet2(h('Js Qh Kd Ac')).clause).toBe(4)
  })

  it('rides an inside straight only when all four cards are ten or higher', () => {
    expect(adviseBet2(h('10s Jh Qd Ac')).clause).toBe(4)
    expect(adviseBet2(h('10s Qh Kd Ac')).clause).toBe(4)
    expect(letBet2Ride(h('5s 6h 7d 9c'))).toBe(false) // inside, no high cards
    expect(letBet2Ride(h('9s 10h Jd Kc'))).toBe(false) // inside, only three high
  })

  it('pulls back junk', () => {
    expect(adviseBet2(h('2s 5h 9d Kc')).clause).toBe(-1)
  })
})

describe('a round', () => {
  it('posts three bets on the deal and walks two decisions', () => {
    const game = new LetItRideGame({ seed: 7, bankroll: 100, unit: 5 })
    expect(game.canDeal()).toBe(true)
    game.deal()
    expect(game.bankroll).toBe(85) // three units of five
    expect(game.phase).toBe('decision1')
    expect(game.round!.cards).toHaveLength(3)
    expect(game.round!.community).toHaveLength(2)
    expect(game.round!.revealed).toBe(0)
    expect(game.pendingBet()).toBe(0)

    game.decide('pull')
    expect(game.phase).toBe('decision2')
    expect(game.round!.revealed).toBe(1)
    expect(game.round!.riding).toEqual([false, true, true])
    expect(game.pendingBet()).toBe(1)

    game.decide('pull')
    expect(game.phase).toBe('complete')
    expect(game.last!.revealed).toBe(2)
    expect(game.last!.riding).toEqual([false, false, true])
    expect(game.pendingBet()).toBeNull()
  })

  it('never lets bet 3 come off the table', () => {
    const game = new LetItRideGame({ seed: 11, bankroll: 100, unit: 5 })
    game.deal()
    game.decide('pull')
    game.decide('pull')
    expect(game.last!.riding[2]).toBe(true)
    // Two pulled back out of three, so the worst case is one unit lost.
    expect(game.last!.net).toBeGreaterThanOrEqual(-5)
  })

  it('refuses a decision when none is pending', () => {
    const game = new LetItRideGame({ seed: 3, bankroll: 100, unit: 5 })
    game.decide('ride') // nothing dealt
    expect(game.phase).toBe('bet')
    expect(game.bankroll).toBe(100)
  })

  it('will not change the unit mid-hand', () => {
    const game = new LetItRideGame({ seed: 5, bankroll: 100, unit: 5 })
    game.deal()
    game.setUnit(25)
    expect(game.unit).toBe(5)
    game.decide('ride')
    game.decide('ride')
    game.setUnit(25)
    expect(game.unit).toBe(25)
  })

  it('replays identically from the same seed', () => {
    const play = () => {
      const g = new LetItRideGame({ seed: 0xbead, bankroll: 10_000, unit: 5 })
      for (let i = 0; i < 40; i++) g.playRound()
      return g.bankroll
    }
    expect(play()).toBe(play())
  })

  it('pays every riding bet the schedule, whatever survived', () => {
    const game = new LetItRideGame({ seed: 0xcafe, bankroll: 1e7, unit: 5 })
    for (let i = 0; i < 400; i++) {
      game.playRound()
      const r = game.last!
      const riding = r.riding.filter(Boolean).length
      expect(r.returned).toBe(settleAmount(r.score!, r.unit, riding))
      expect(r.payKey).toBe(payKeyFor(r.score!))
    }
  })

  it('never leaks a chip it did not pay', () => {
    const game = new LetItRideGame({ seed: 0x1234, bankroll: 20_000, unit: 5 })
    for (let i = 0; i < 400; i++) {
      if (!game.canDeal()) break
      const before = game.bankroll
      // Alternate the decisions so the accounting is exercised at 1, 2 and 3
      // bets still on the table.
      game.deal()
      game.decide(i % 2 === 0 ? 'ride' : 'pull')
      game.decide(i % 3 === 0 ? 'ride' : 'pull')
      const r = game.last!
      expect(game.bankroll).toBe(before - r.unit * 3 + r.returned)
      expect(r.net).toBe(r.returned - r.unit * 3)
    }
  })

  it('shows the coach only the cards the player can see', () => {
    const game = new LetItRideGame({ seed: 0x99, bankroll: 100, unit: 5 })
    game.deal()
    expect(game.visible()).toHaveLength(3)
    expect(game.advice()).toEqual(adviseBet1(game.round!.cards))
    game.decide('ride')
    expect(game.visible()).toHaveLength(4)
    expect(game.advice()).toEqual(adviseBet2(game.visible()))
    game.decide('ride')
    expect(game.advice()).toBeNull()
    expect(game.visible()).toHaveLength(5)
  })

  it('deals every card of the round from one deck, no repeats', () => {
    const game = new LetItRideGame({ seed: 0x77, bankroll: 1000, unit: 5 })
    for (let i = 0; i < 50; i++) {
      game.playRound()
      const r = game.last!
      const uids = new Set([...r.cards, ...r.community].map((x) => x.uid))
      expect(uids.size).toBe(5)
    }
  })
})
