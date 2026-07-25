import { describe, expect, it } from 'vitest'

import { makeRng } from '../engine/rng'
import type { Card, Rank, Suit } from '../engine/types'
import { winningHold } from './autohold'
import { classifyDeuces, classifyStandard } from './classify'
import { VideoPokerGame } from './engine'
import { variantById } from './paytables'
import { solve } from './solver'

let uid = 0
function c(spec: string): Card {
  const suit = spec.slice(-1).toUpperCase() as Suit
  const rank = spec.slice(0, -1) as Rank
  return { uid: uid++, rank, suit }
}
const h = (s: string) => s.split(' ').map(c)

describe('Jacks or Better classification', () => {
  it('names every paying hand', () => {
    expect(classifyStandard(h('As Ks Qs Js 10s'))).toBe('royalFlush')
    expect(classifyStandard(h('9s 8s 7s 6s 5s'))).toBe('straightFlush')
    expect(classifyStandard(h('As Ah Ad Ac 5s'))).toBe('fourAces')
    expect(classifyStandard(h('3s 3h 3d 3c 9s'))).toBe('fourTwoThruFour')
    expect(classifyStandard(h('8s 8h 8d 8c 9s'))).toBe('fourFiveThruKing')
    expect(classifyStandard(h('As Ah Ad Ks Kh'))).toBe('fullHouse')
    expect(classifyStandard(h('As Ks 9s 5s 3s'))).toBe('flush')
    expect(classifyStandard(h('As Kh Qd Jc 10s'))).toBe('straight')
    expect(classifyStandard(h('8s 8h 8d Ks 2c'))).toBe('threeOfAKind')
    expect(classifyStandard(h('As Ah Ks Kh 2d'))).toBe('twoPair')
    expect(classifyStandard(h('Js Jh 8d 5c 2s'))).toBe('jacksOrBetter')
  })

  it('does not pay a low pair', () => {
    expect(classifyStandard(h('10s 10h 8d 5c 2s'))).toBe('nothing')
    expect(classifyStandard(h('9s 9h Kd 5c 2s'))).toBe('nothing')
  })

  it('reads the ace-low straight', () => {
    expect(classifyStandard(h('As 2h 3d 4c 5s'))).toBe('straight')
  })
})

describe('Deuces Wild classification', () => {
  it('separates natural and wild royals', () => {
    expect(classifyDeuces(h('As Ks Qs Js 10s'))).toBe('naturalRoyal')
    expect(classifyDeuces(h('As Ks Qs Js 2s'))).toBe('wildRoyal') // deuce fills the ten
  })

  it('names four deuces', () => {
    expect(classifyDeuces(h('2s 2h 2d 2c As'))).toBe('fourDeuces')
  })

  it('makes five of a kind with wilds', () => {
    expect(classifyDeuces(h('9s 9h 9d 2c 2s'))).toBe('fiveOfAKind')
    expect(classifyDeuces(h('As Ah 2d 2c 2s'))).toBe('fiveOfAKind')
  })

  it('completes a straight flush with a wild', () => {
    expect(classifyDeuces(h('7s 8s 9s 10s 2h'))).toBe('straightFlush')
  })

  it('promotes a lone pair to three of a kind with one wild', () => {
    expect(classifyDeuces(h('9s 9h Kd 5c 2s'))).toBe('threeOfAKind')
  })

  it('pays nothing below three of a kind', () => {
    expect(classifyDeuces(h('9s 8h Kd 5c 3s'))).toBe('nothing')
    expect(classifyDeuces(h('9s 9h Kd 5c 3s'))).toBe('nothing') // a bare pair, no wild
  })
})

describe('the solver', () => {
  const rng = makeRng(1)
  const job = variantById('jacks-9-6')

  it('holds a made flush', () => {
    const hand = h('As Ks 9s 5s 3s')
    const { best } = solve(hand, job, rng)
    expect(best.mask).toBe(0b11111) // keep all five
  })

  it('holds four to a royal over a made flush', () => {
    // A♠ K♠ Q♠ J♠ 9♠ is a flush, but four to the royal (drop the 9) is worth more.
    const hand = h('As Ks Qs Js 9s')
    const { best } = solve(hand, job, rng)
    const held = hand.filter((_, i) => best.mask & (1 << i)).map((x) => x.rank)
    expect(held.sort()).toEqual(['A', 'J', 'K', 'Q'])
  })

  it('breaks up a low pair to keep a single high card? no — keeps the pair', () => {
    // Pair of 5s vs a lone king: the pair is worth more; keep it.
    const hand = h('5s 5h Kd 9c 3s')
    const { best } = solve(hand, job, rng)
    const held = hand.filter((_, i) => best.mask & (1 << i)).map((x) => x.rank)
    expect(held.filter((r) => r === '5')).toHaveLength(2)
  })
})

describe('auto-hold of a winning hand', () => {
  it('holds exactly the paying cards in the standard family', () => {
    // The one paying pair.
    expect(winningHold(h('Js Jh 8d 5c 3s'), 'standard')).toEqual([true, true, false, false, false])
    // Both pairs of two pair.
    expect(winningHold(h('As Ah Ks Kh 9d'), 'standard')).toEqual([true, true, true, true, false])
    // The trips, not the kickers.
    expect(winningHold(h('8s 8h 8d Ks 3c'), 'standard')).toEqual([true, true, true, false, false])
    // The quads; the kicker redraws free.
    expect(winningHold(h('9s 9h 9d 9c As'), 'standard')).toEqual([true, true, true, true, false])
    // Five-card hands keep all five.
    expect(winningHold(h('As Ks 9s 5s 3s'), 'standard')).toEqual([true, true, true, true, true])
    expect(winningHold(h('As Kh Qd Jc 10s'), 'standard')).toEqual([true, true, true, true, true])
    expect(winningHold(h('As Ah Ad Ks Kh'), 'standard')).toEqual([true, true, true, true, true])
  })

  it('holds nothing on a non-winner — even a low pair or a big draw', () => {
    expect(winningHold(h('9s 9h Kd 5c 3s'), 'standard')).toEqual(new Array(5).fill(false))
    expect(winningHold(h('As Ks Qs Js 9d'), 'standard')).toEqual(new Array(5).fill(false))
  })

  it('holds the deuces and the naturals they pay with', () => {
    // Four deuces: keep the deuces, redraw the fifth free.
    expect(winningHold(h('2s 2h 2d 2c As'), 'deuces')).toEqual([true, true, true, true, false])
    // A wild trips built on a natural pair: deuce + the pair.
    expect(winningHold(h('9s 9h 2d Kc 5s'), 'deuces')).toEqual([true, true, true, false, false])
    // Two deuces beside three unmatched naturals: the deuces alone are the
    // guaranteed trips; no single natural is part of the win.
    expect(winningHold(h('2s 2h Kd 9c 5s'), 'deuces')).toEqual([true, true, false, false, false])
    // Wild quads: deuces + the natural pair.
    expect(winningHold(h('2s 2h 9d 9c 5s'), 'deuces')).toEqual([true, true, true, true, false])
    // Five-card wild hands keep all five.
    expect(winningHold(h('9s 9h 9d 2c 2s'), 'deuces')).toEqual([true, true, true, true, true])
    expect(winningHold(h('7s 8s 9s 10s 2h'), 'deuces')).toEqual([true, true, true, true, true])
  })

  it('holds nothing in deuces below trips', () => {
    expect(winningHold(h('9s 9h Kd 5c 3s'), 'deuces')).toEqual(new Array(5).fill(false))
  })

  it('pre-holds on the deal when the game has autoHold on, and can be overridden', () => {
    const game = new VideoPokerGame({
      variantId: 'jacks-9-6',
      seed: 11,
      bankroll: 1000,
      autoHold: 'winners',
    })
    for (let i = 0; i < 50; i++) {
      if (!game.canDeal()) break
      game.deal()
      expect(game.hand!.held).toEqual(winningHold(game.hand!.cards, game.variant.family))
      game.toggleHold(0) // the player can still change any card
      expect(game.hand!.held[0]).toBe(!winningHold(game.hand!.cards, game.variant.family)[0])
      game.draw()
    }
  })

  it('pre-holds the optimal play when autoHold is optimal', { timeout: 30000 }, () => {
    const game = new VideoPokerGame({
      variantId: 'jacks-9-6',
      seed: 13,
      bankroll: 10000,
      autoHold: 'optimal',
    })
    // On a dealt paying hand the best hold keeps two-plus cards, whose EV the
    // solver computes exactly — so re-solving with any rng must agree. (On
    // garbage hands the best hold is a sampled estimate and near-ties can
    // legitimately land differently, so those aren't compared.)
    let compared = 0
    for (let i = 0; i < 30 && compared < 2; i++) {
      game.deal()
      expect(game.hand!.held).toHaveLength(5)
      if (classifyStandard(game.hand!.cards) !== 'nothing') {
        const { best } = solve(game.hand!.cards, game.variant, makeRng(99))
        const expected = game.hand!.cards.map((_, k) => Boolean(best.mask & (1 << k)))
        expect(game.hand!.held).toEqual(expected)
        compared++
      }
      game.draw()
    }
    expect(compared).toBeGreaterThan(0)
  })
})

describe('a game', () => {
  it('deals five, holds, draws and pays', () => {
    const game = new VideoPokerGame({ variantId: 'jacks-9-6', seed: 7, bankroll: 100 })
    expect(game.canDeal()).toBe(true)
    game.deal()
    expect(game.hand!.cards).toHaveLength(5)
    expect(game.bankroll).toBe(95) // five coins in

    game.hand!.held = [true, true, true, true, true] // stand pat
    game.draw()
    expect(game.phase).toBe('complete')
    expect(game.last!.final).toHaveLength(5)
  })

  it('never lets the bankroll leak chips it did not pay', () => {
    const game = new VideoPokerGame({ variantId: 'jacks-9-6', seed: 3, bankroll: 1000 })
    for (let i = 0; i < 300; i++) {
      if (!game.canDeal()) break
      const before = game.bankroll
      game.deal()
      // Random holds, then draw — the accounting must balance whatever we keep.
      game.hand!.held = game.hand!.cards.map((_, k) => (i + k) % 2 === 0)
      game.draw()
      expect(game.bankroll).toBe(before - game.last!.bet + game.last!.won)
    }
  })

  it('offers a hint that is a five-boolean hold', () => {
    const game = new VideoPokerGame({ variantId: 'jacks-9-6', seed: 9, bankroll: 100 })
    game.deal()
    const hint = game.hint()
    expect(hint).toHaveLength(5)
    expect(hint.every((b) => typeof b === 'boolean')).toBe(true)
  })
})
