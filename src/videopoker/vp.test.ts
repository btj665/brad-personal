import { describe, expect, it } from 'vitest'

import { makeRng } from '../engine/rng'
import type { Card, Rank, Suit } from '../engine/types'
import { winningHold } from './autohold'
import { classifyDeuces, classifyStandard } from './classify'
import { drawPools, HAND_COUNTS, VideoPokerGame } from './engine'
import { payFor, variantById } from './paytables'
import { exactDrawEV, solve } from './solver'

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

// --------------------------------------------------------------- multi-hand

/** Rank+suit, ignoring uid: two hands can legitimately hold the same card, so
 *  object identity is the wrong thing to compare. */
const key = (card: Card) => `${card.rank}${card.suit}`

describe('multi-hand decks', () => {
  it('gives every hand its own copy of the same 47 cards', () => {
    const game = new VideoPokerGame({ seed: 21, bankroll: 1000, hands: 10 })
    game.deal()
    const onScreen = new Set(game.hand!.cards.map(key))
    const pools = drawPools(game.deck, 10, makeRng(4))

    expect(pools).toHaveLength(10)
    const canon = pools[0].map(key).sort().join(' ')
    for (const pool of pools) {
      expect(pool).toHaveLength(47)
      // Nothing already face up can come back, not even into a later hand.
      expect(pool.some((c) => onScreen.has(key(c)))).toBe(false)
      // And it is the same 47 every time — the hands do not deal around each
      // other. This is the fact the whole return equivalence rests on.
      expect(pool.map(key).sort().join(' ')).toBe(canon)
    }
    // Same cards, independently shuffled.
    expect(pools[1].map(key).join(' ')).not.toBe(pools[0].map(key).join(' '))
  })

  it('draws independently, so one card can land in several hands at once', () => {
    const game = new VideoPokerGame({ seed: 55, bankroll: 1_000_000, hands: 10 })
    game.setCoins(1)
    let collided = 0
    for (let i = 0; i < 60; i++) {
      game.deal()
      game.hand!.held = [true, true, true, true, false] // exactly one card drawn
      game.draw()
      const replacements = game.last!.draws.map((d) => key(d.cards[4]))
      if (new Set(replacements).size < replacements.length) collided++
    }
    // Ten draws out of 47 cards: the birthday bound puts a repeat at ~64%, so
    // this is nowhere near a coin flip. A shared deck would make it impossible.
    expect(collided).toBeGreaterThan(25)
    expect(collided).toBeLessThan(60)
  })

  it('leaves hand 1 exactly as single-hand play dealt it', () => {
    for (const n of HAND_COUNTS) {
      const one = new VideoPokerGame({ seed: 77, bankroll: 100_000, autoHold: 'winners' })
      const many = new VideoPokerGame({ seed: 77, bankroll: 100_000, autoHold: 'winners', hands: n })
      one.deal()
      many.deal()
      expect(many.hand!.cards.map(key)).toEqual(one.hand!.cards.map(key))
      expect(many.hand!.held).toEqual(one.hand!.held)
      one.draw()
      many.draw()
      expect(many.last!.draws).toHaveLength(n)
      expect(many.last!.draws[0].cards.map(key)).toEqual(one.last!.draws[0].cards.map(key))
      expect(many.last!.final!.map(key)).toEqual(one.last!.final!.map(key))
    }
  })
})

describe('multi-hand betting', () => {
  it('offers only the hand counts a machine has, and locks them mid-deal', () => {
    const game = new VideoPokerGame({ seed: 1, bankroll: 1000 })
    expect(game.hands).toBe(1)
    game.setHands(3)
    expect(game.hands).toBe(3)
    game.setHands(7) // no seven-play machine exists; snap to the nearest
    expect(game.hands).toBe(5)
    game.setHands(0)
    expect(game.hands).toBe(1)
    game.setHands(10)
    game.deal()
    game.setHands(1)
    expect(game.hands).toBe(10)
    expect(game.hand!.hands).toBe(10)
  })

  it('takes N × coins up front and pays each hand on its own', () => {
    const variant = variantById('jacks-9-6')
    const game = new VideoPokerGame({ variantId: 'jacks-9-6', seed: 8, bankroll: 1000, hands: 5 })
    game.setCoins(5)
    expect(game.totalBet()).toBe(25)
    game.deal()
    expect(game.bankroll).toBe(975)
    expect(game.hand!.bet).toBe(25)
    expect(game.hand!.coins).toBe(5)
    game.draw()

    const settled = game.last!
    expect(settled.draws).toHaveLength(5)
    for (const d of settled.draws) expect(d.won).toBe(payFor(variant, d.category) * 5)
    expect(settled.won).toBe(settled.draws.reduce((s, d) => s + d.won, 0))
    expect(game.bankroll).toBe(1000 - 25 + settled.won)
  })

  it('will not deal a bet the bankroll cannot cover', () => {
    const game = new VideoPokerGame({ seed: 2, bankroll: 20, hands: 10 })
    game.setCoins(5)
    expect(game.totalBet()).toBe(50)
    expect(game.canDeal()).toBe(false)
    game.setHands(3) // fifteen coins fits
    expect(game.canDeal()).toBe(true)
  })

  it('never lets the bankroll leak chips across ten hands', () => {
    const game = new VideoPokerGame({ variantId: 'jacks-9-6', seed: 4, bankroll: 100_000, hands: 10 })
    game.setCoins(2)
    for (let i = 0; i < 200; i++) {
      if (!game.canDeal()) break
      const before = game.bankroll
      game.deal()
      game.hand!.held = game.hand!.cards.map((_, k) => (i + k) % 3 === 0)
      game.draw()
      expect(game.last!.bet).toBe(20)
      expect(game.bankroll).toBe(before - game.last!.bet + game.last!.won)
    }
  })
})

describe('multi-hand returns the same as one hand', () => {
  it('gives every hand the identical exact EV, bit for bit', () => {
    // The proof, not a measurement. For a fixed hold, the exact expected pay of a
    // hand is the average over every draw its pool allows; all N pools hold the
    // same 47 cards, so all N averages are the same number and the N-hand
    // expectation is exactly N times the one-hand expectation. Holding three
    // leaves C(47,2) = 1081 draws, small enough to enumerate for every hand.
    const variant = variantById('jacks-9-6')
    const rng = makeRng(31)
    let checked = 0

    for (let d = 0; d < 40; d++) {
      const game = new VideoPokerGame({ variantId: 'jacks-9-6', seed: 100 + d, bankroll: 1000, hands: 10 })
      game.deal()
      const dealt = game.hand!.cards
      const held = dealt.slice(0, 3)
      const pools = drawPools(game.deck, 10, rng)
      const evs = pools.map((pool) => exactDrawEV(held, pool, variant))

      expect(evs[0]).not.toBeNull()
      for (const ev of evs) expect(ev).toBe(evs[0])
      // So the ten-hand expectation is ten times the one-hand expectation. Only
      // approximately here, and only because adding the same double ten times is
      // not the same rounding as multiplying it by ten — the per-hand numbers
      // above are equal exactly.
      const total = evs.reduce<number>((s, ev) => s + (ev ?? 0), 0)
      expect(total).toBeCloseTo(10 * (evs[0] ?? 0), 12)
      checked++
    }
    expect(checked).toBe(40)
  })

  it('solves the deal once however many hands are lit', { timeout: 60000 }, () => {
    // The solver samples, so it draws on the rng. If Ten Play solved once per
    // drawn hand it would burn ten times as much of the stream; identical rng
    // state after the deal is proof that the hold is computed once, on the dealt
    // five, exactly as single-hand play computes it.
    const one = new VideoPokerGame({ seed: 41, bankroll: 100_000, autoHold: 'optimal' })
    const ten = new VideoPokerGame({ seed: 41, bankroll: 100_000, autoHold: 'optimal', hands: 10 })
    one.deal()
    ten.deal()
    expect(ten.rng.state()).toBe(one.rng.state())
    expect(ten.hand!.held).toEqual(one.hand!.held)
    expect(ten.hint()).toEqual(one.hint())
  })

  it('measures the same return at 1, 3, 5 and 10 hands, with a wider swing', () => {
    // One fixed cheap rule — auto-hold winners — played at every hand count off
    // the same list of seeds, so the deal and the holds are identical across the
    // runs and the only thing that varies is how many hands they feed.
    const DEALS = 6000
    const master = makeRng(0xf00d)
    const seeds = Array.from({ length: DEALS }, () => master.int(0x7fffffff))

    const runs = HAND_COUNTS.map((n) => {
      let sum = 0
      let sumSq = 0
      let netSum = 0
      let netSq = 0
      for (const seed of seeds) {
        const g = new VideoPokerGame({
          variantId: 'jacks-9-6',
          seed,
          bankroll: 1e9,
          autoHold: 'winners',
          hands: n,
        })
        g.setCoins(1)
        g.deal()
        g.draw()
        const l = g.last!
        const perCoin = l.won / l.bet
        sum += perCoin
        sumSq += perCoin * perCoin
        const net = l.won - l.bet
        netSum += net
        netSq += net * net
      }
      const mean = sum / DEALS
      const perCoinVar = sumSq / DEALS - mean * mean
      const netMean = netSum / DEALS
      return {
        n,
        ret: mean,
        se: Math.sqrt(perCoinVar / DEALS),
        perCoinSd: Math.sqrt(perCoinVar),
        netSd: Math.sqrt(netSq / DEALS - netMean * netMean),
      }
    })

    const base = runs[0]
    for (const r of runs.slice(1)) {
      // Four sigma, and generous at that: the runs share hand 1, so the real
      // error bar on the difference is narrower than this sum of variances.
      const tol = 4 * Math.sqrt(base.se * base.se + r.se * r.se)
      expect(Math.abs(r.ret - base.ret)).toBeLessThan(tol)
    }

    // What multi-hand actually moves. The swing on a single deal, counted in
    // coins, grows faster than the bet does, because the hands share their held
    // cards and so rise and fall together.
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].netSd).toBeGreaterThan(runs[i - 1].netSd * 1.3)
    }
    // Per coin wagered it goes the other way: N hands average out, so volatility
    // per coin falls towards the covariance floor. Both statements are true and
    // people conflate them.
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].perCoinSd).toBeLessThan(runs[i - 1].perCoinSd)
    }
  })
})
