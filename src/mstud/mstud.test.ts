import { describe, expect, it } from 'vitest'

import type { Card, Rank, Suit } from '../engine/types'
import { MStudGame, MAX_EXPOSURE } from './engine'
import { multiplierFor, payKeyFor, returnedFor } from './rules'
import {
  bestAction,
  canonical,
  chartAction,
  expectedMultiplier,
  holeCardEv,
  shapeOf,
  straightWindows,
} from './strategy'
import { score5 } from '../poker/eval'
import type { MStudAction, Street } from './types'

let uid = 0
function c(spec: string): Card {
  const suit = spec.slice(-1).toUpperCase() as Suit
  const rank = spec.slice(0, -1) as Rank
  return { uid: uid++, rank, suit }
}
const h = (s: string) => s.split(' ').map(c)

const key = (spec: string) => payKeyFor(score5(h(spec)))
const mult = (spec: string) => multiplierFor(score5(h(spec)))

// --- the pay table ---------------------------------------------------------

describe('the pay table, every row', () => {
  it('names each paying hand', () => {
    expect(key('As Ks Qs Js 10s')).toBe('royal')
    expect(key('9s 8s 7s 6s 5s')).toBe('straightFlush')
    expect(key('7s 7h 7d 7c 2s')).toBe('quads')
    expect(key('7s 7h 7d 4c 4s')).toBe('fullHouse')
    expect(key('As Js 9s 5s 3s')).toBe('flush')
    expect(key('9s 8h 7d 6c 5s')).toBe('straight')
    expect(key('7s 7h 7d 9c 2s')).toBe('trips')
    expect(key('7s 7h 4d 4c 2s')).toBe('twoPair')
    expect(key('Js Jh 9d 4c 2s')).toBe('highPair')
    expect(key('6s 6h 9d 4c 2s')).toBe('midPair')
  })

  it('pays the published odds off the total wagered', () => {
    expect(mult('As Ks Qs Js 10s')).toBe(500)
    expect(mult('9s 8s 7s 6s 5s')).toBe(100)
    expect(mult('7s 7h 7d 7c 2s')).toBe(40)
    expect(mult('7s 7h 7d 4c 4s')).toBe(10)
    expect(mult('As Js 9s 5s 3s')).toBe(6)
    expect(mult('9s 8h 7d 6c 5s')).toBe(4)
    expect(mult('7s 7h 7d 9c 2s')).toBe(3)
    expect(mult('7s 7h 4d 4c 2s')).toBe(2)
  })

  it('splits the pairs three ways: jacks up pay, 6s to 10s push, 2s to 5s lose', () => {
    expect(mult('Js Jh 9d 4c 2s')).toBe(1) // jacks or better
    expect(mult('As Ah 9d 4c 2s')).toBe(1)
    expect(mult('10s 10h 9d 4c 2s')).toBe(0) // push
    expect(mult('6s 6h 9d 4c 2s')).toBe(0)
    expect(mult('5s 5h 9d 4c 2s')).toBe(-1) // loses
    expect(mult('2s 2h 9d 4c 3s')).toBe(-1)
    expect(mult('As Kh 9d 4c 2s')).toBe(-1) // no pair at all
  })

  it('counts the wheel as a straight, not a royal', () => {
    expect(key('5s 4h 3d 2c As')).toBe('straight')
    expect(key('5s 4s 3s 2s As')).toBe('straightFlush')
  })

  it('applies the odds to the whole wager, not the ante', () => {
    // Ante 1 plus three 3x raises is ten units. A flush at 6:1 returns 70.
    expect(returnedFor(10, 6)).toBe(70)
    // A push hands back exactly what is out there.
    expect(returnedFor(7, 0)).toBe(7)
    // A loser hands back nothing.
    expect(returnedFor(7, -1)).toBe(0)
  })
})

// --- shapes ----------------------------------------------------------------

describe('hand shape helpers', () => {
  it('counts straight windows, wheel included', () => {
    expect(straightWindows([9, 8, 7, 6])).toBe(2) // open-ended
    expect(straightWindows([14, 13, 12, 11])).toBe(1) // only the royal window
    expect(straightWindows([14, 4, 3, 2])).toBe(1) // the wheel
    expect(straightWindows([13, 9, 4, 2])).toBe(0)
    expect(straightWindows([7, 7, 5, 4])).toBe(0) // a pair can't be a draw
  })

  it('sorts high, mid and low cards the way the pay table does', () => {
    const s = shapeOf(h('As 10h 5d'))
    expect(s.highs).toBe(1)
    expect(s.mids).toBe(1)
    expect(s.lows).toBe(1)
    expect(s.points).toBe(3)
  })

  it('collapses positions that differ only by suit', () => {
    expect(canonical(h('Ks Kh 5s 2d'))).toBe(canonical(h('Kh Ks 5h 2c')))
    expect(canonical(h('As Ks Qs'))).toBe(canonical(h('Ah Kh Qh')))
    expect(canonical(h('As Kh Qs'))).not.toBe(canonical(h('As Ks Qs')))
  })
})

// --- the fifth-street arithmetic -------------------------------------------

describe('expected pay over the last card', () => {
  it('prices four to a royal by hand', () => {
    // 48 unseen: the 10 of spades is the royal, eight more spades are a flush,
    // three tens are a straight, twelve cards pair a high card, 24 are nothing.
    const want = (500 + 8 * 6 + 3 * 4 + 12 * 1 - 24) / 48
    expect(expectedMultiplier(h('As Ks Qs Js'))).toBeCloseTo(want, 12)
  })

  it('prices a made pair of aces by hand', () => {
    // two aces make trips, six cards pair a kicker into two pair, 40 leave a
    // pair of aces paying even money.
    const want = (2 * 3 + 6 * 2 + 40 * 1) / 48
    expect(expectedMultiplier(h('As Ad 7c 3h'))).toBeCloseTo(want, 12)
  })

  it('prices a pair of nines as a push with upside', () => {
    const want = (2 * 3 + 6 * 2 + 40 * 0) / 48
    expect(expectedMultiplier(h('9s 9d 2c 3h'))).toBeCloseTo(want, 12)
  })
})

// --- the charts ------------------------------------------------------------

const third = (spec: string): MStudAction =>
  chartAction({ street: 'third', hole: h(spec), board: [], wagered: 1 })

describe('third street chart', () => {
  it('raises 3x with any pair, deuces included', () => {
    expect(third('As Ad')).toBe('raise3')
    expect(third('7s 7d')).toBe('raise3')
    expect(third('2s 2d')).toBe('raise3')
  })

  it('raises 1x with a high card, however bad the kicker', () => {
    expect(third('As 2d')).toBe('raise1')
    expect(third('Js 3d')).toBe('raise1')
  })

  it('raises 1x with two cards 6 or better', () => {
    expect(third('10s 9d')).toBe('raise1')
    expect(third('7s 6d')).toBe('raise1')
  })

  it('folds a mid card with a low card, and two low cards', () => {
    expect(third('10s 5d')).toBe('fold')
    expect(third('7s 4d')).toBe('fold')
    expect(third('5s 3d')).toBe('fold')
    expect(third('7s 5s')).toBe('fold') // suited but not connected
  })

  it('makes the one exception for suited 6-5', () => {
    expect(third('6s 5s')).toBe('raise1')
    expect(third('6s 5d')).toBe('fold')
  })

  // The expectimax warms its memo on the first call, which is most of the cost
  // here; 169 hands then run off the cache. It lands just either side of the 5s
  // default depending on how loaded the machine is, so the budget is explicit
  // rather than left to chance.
  it('agrees with the solver on every one of the 169 starting hands', { timeout: 60_000 }, () => {
    const RANKS: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2']
    for (let i = 0; i < RANKS.length; i++) {
      for (let j = i; j < RANKS.length; j++) {
        for (const suited of [true, false]) {
          if (i === j && suited) continue // a pair can't be suited
          const hole = [
            { uid: uid++, rank: RANKS[i], suit: 'S' as Suit },
            { uid: uid++, rank: RANKS[j], suit: (suited ? 'S' : 'H') as Suit },
          ]
          const spot = { street: 'third' as Street, hole, board: [], wagered: 1 }
          expect(chartAction(spot), `${RANKS[i]}${RANKS[j]}${suited ? 's' : 'o'}`).toBe(
            bestAction(spot),
          )
        }
      }
    }
  })
})

describe('fifth street chart', () => {
  const fifth = (spec: string, wagered: number): MStudAction => {
    const cards = h(spec)
    return chartAction({
      street: 'fifth',
      hole: cards.slice(0, 2),
      board: cards.slice(2),
      wagered,
    })
  }

  it('maxes out on a made paying hand', () => {
    expect(fifth('As Ad 7c 3h', 4)).toBe('raise3')
    expect(fifth('9s 9d 7c 3h', 4)).toBe('raise3') // a push pair is a free roll
    expect(fifth('9s 9d 7c 7h', 4)).toBe('raise3')
  })

  it('only puts one unit behind a pair of deuces', () => {
    expect(fifth('2s 2d 9c 3h', 4)).toBe('raise1')
  })

  it('maxes out on four to a flush and on four to an open straight', () => {
    expect(fifth('Ks Qs 7s 3s', 4)).toBe('raise3')
    expect(fifth('9s 8h 7d 6c', 4)).toBe('raise3')
  })

  it('takes one unit on a gutshot', () => {
    expect(fifth('Ks Qh Jd 9c', 4)).toBe('raise1')
  })

  it('folds a hand whose low cards outnumber its high ones', () => {
    expect(fifth('Ks 7h 3d 2c', 3)).toBe('fold')
    // ...but not once the pot is big enough that giving it up costs more.
    expect(fifth('Ks 7h 3d 2c', 7)).toBe('raise1')
  })

  it('agrees with the solver on a wide spread of positions', () => {
    const hands = [
      'As Ks Qs Js', '2s 3d 7c Kh', '9s 9d 2c 3h', '5s 5d Kc Qh', '10s 9h 8d 2c',
      '6s 5s 4s 3s', 'As 2h 3d 4c', 'Js 10h 4d 3c', 'Ks Kh Qd Qc', '7s 7h 7d 2c',
      'As Kh 9d 4c', '8s 7h 6d 2c', 'Qs Js 9s 4s', '4s 3h 2d Kc', '10s 10h 6d 5c',
    ]
    for (const spec of hands) {
      const cards = h(spec)
      for (const wagered of [3, 4, 5, 6, 7]) {
        const spot = {
          street: 'fifth' as Street,
          hole: cards.slice(0, 2),
          board: cards.slice(2),
          wagered,
        }
        expect(chartAction(spot), `${spec} @ ${wagered}`).toBe(bestAction(spot))
      }
    }
  })
})

describe('the solver', () => {
  it('never wants the 2x raise, because it never can', () => {
    // The value of a raise is convex in the amount wagered, so the best raise is
    // always an endpoint. Spot-check that across a spread of positions.
    const specs = ['As Ad', '2s 2d', 'Ks Qs', '10s 9d', 'As 2d', 'Js 3h', '9s 8s']
    for (const spec of specs) {
      expect(bestAction({ street: 'third', hole: h(spec), board: [], wagered: 1 })).not.toBe(
        'raise2',
      )
    }
  })

  it('knows a pocket pair is worth the whole ladder', () => {
    expect(holeCardEv(h('Js Jd'))).toBeGreaterThan(10)
    expect(holeCardEv(h('2s 2d'))).toBeGreaterThan(0)
  })

  it('knows the worst hands are worth exactly the ante and no more', () => {
    // Folding is -1 by definition, and the solver's floor is folding.
    expect(holeCardEv(h('9s 4d'))).toBe(-1)
    expect(holeCardEv(h('5s 3d'))).toBe(-1)
  })
})

// --- the table -------------------------------------------------------------

function table(seed: number, bankroll = 1e9): MStudGame {
  return new MStudGame({ seed, bankroll })
}

describe('a hand of Mississippi Stud', () => {
  it('deals two hole cards and three face-down community cards', () => {
    const game = table(11)
    game.deal(5)
    expect(game.hand!.hole).toHaveLength(2)
    expect(game.hand!.community).toHaveLength(3)
    expect(game.hand!.revealed).toBe(0)
    expect(game.shownBoard).toHaveLength(0)
    expect(game.phase).toBe('third')
  })

  it('turns one community card per decision', () => {
    const game = table(12)
    game.deal(5)
    game.decide('raise1')
    expect(game.phase).toBe('fourth')
    expect(game.shownBoard).toHaveLength(1)
    game.decide('raise1')
    expect(game.phase).toBe('fifth')
    expect(game.shownBoard).toHaveLength(2)
    game.decide('raise1')
    expect(game.phase).toBe('settled')
    expect(game.shownBoard).toHaveLength(3)
  })

  it('never deals from a deck it has already dealt from', () => {
    const game = table(13)
    game.deal(5)
    const all = [...game.hand!.hole, ...game.hand!.community]
    expect(new Set(all.map((x) => `${x.rank}${x.suit}`)).size).toBe(5)
  })

  it('takes the ante and each raise as it is made', () => {
    const game = table(14, 1000)
    game.deal(10)
    expect(game.bankroll).toBe(990)
    game.decide('raise3')
    expect(game.bankroll).toBe(960)
    expect(game.hand!.wagered).toBe(40)
    game.decide('raise1')
    expect(game.bankroll).toBe(950)
    expect(game.hand!.wagered).toBe(50)
  })

  it('will not take an ante it cannot back through the whole ladder', () => {
    expect(MAX_EXPOSURE).toBe(10)
    // An ante of 5 can grow to 50, so 40 chips isn't enough to sit down for it.
    expect(new MStudGame({ seed: 15, bankroll: 40 }).canDeal(5)).toBe(false)
    expect(new MStudGame({ seed: 15, bankroll: 50 }).canDeal(5)).toBe(true)
  })

  it('replays identically from the same seed', () => {
    const a = table(77)
    const b = table(77)
    for (let i = 0; i < 50; i++) {
      a.playRound(5)
      b.playRound(5)
    }
    expect(a.bankroll).toBe(b.bankroll)
    expect(a.last!.hole.map((x) => x.uid)).toEqual(b.last!.hole.map((x) => x.uid))
  })
})

describe('settlement', () => {
  /** Force a specific five cards onto the table, so a payout can be checked
   *  against arithmetic rather than against whatever the shuffle produced. */
  function rigged(spec: string, ante: number): MStudGame {
    const game = table(1, 1e6)
    game.deal(ante)
    const cards = h(spec)
    game.hand!.hole = cards.slice(0, 2)
    game.hand!.community = cards.slice(2)
    return game
  }

  it('pays the odds on the total wagered, not on the ante', () => {
    // Ante 10, then 3x, 3x, 3x: 100 out. A flush pays 6:1 on all of it.
    const game = rigged('As Js 9s 5s 3s', 10)
    const before = game.bankroll
    game.decide('raise3')
    game.decide('raise3')
    game.decide('raise3')
    const hand = game.last!
    expect(hand.wagered).toBe(100)
    expect(hand.returned).toBe(700)
    expect(hand.net).toBe(600)
    expect(game.bankroll).toBe(before - 90 + 700)
  })

  it('pays the same hand far less when the ladder was smaller', () => {
    const game = rigged('As Js 9s 5s 3s', 10)
    game.decide('raise1')
    game.decide('raise1')
    game.decide('raise1')
    expect(game.last!.wagered).toBe(40)
    expect(game.last!.returned).toBe(280)
    expect(game.last!.net).toBe(240)
  })

  it('returns exactly the wager on a pair of 6s through 10s', () => {
    const game = rigged('8s 8h 4d 3c 2s', 10)
    game.decide('raise3')
    game.decide('raise2')
    game.decide('raise1')
    expect(game.last!.wagered).toBe(70)
    expect(game.last!.returned).toBe(70)
    expect(game.last!.net).toBe(0)
    expect(game.last!.payKey).toBe('midPair')
  })

  it('takes the whole wager on a pair of 5s', () => {
    const game = rigged('5s 5h 9d 3c 2s', 10)
    game.decide('raise3')
    game.decide('raise3')
    game.decide('raise3')
    expect(game.last!.wagered).toBe(100)
    expect(game.last!.returned).toBe(0)
    expect(game.last!.net).toBe(-100)
  })

  it('forfeits everything already out on a fold, whatever the cards were', () => {
    const game = rigged('As Ks Qs Js 10s', 10) // a royal, thrown away
    const afterAnte = game.bankroll
    game.decide('raise3')
    game.decide('fold')
    const hand = game.last!
    expect(hand.folded).toBe(true)
    expect(hand.foldedOn).toBe('fourth')
    expect(hand.wagered).toBe(40)
    expect(hand.returned).toBe(0)
    expect(hand.net).toBe(-40)
    // The ante was already gone; the fold gives up the 30 raised on top of it.
    expect(game.bankroll).toBe(afterAnte - 30)
    // The community cards still get turned, so the player can see the damage.
    expect(hand.revealed).toBe(3)
    expect(hand.payKey).toBe('royal')
  })

  it('pays a royal 500:1 on ten units', () => {
    const game = rigged('As Ks Qs Js 10s', 10)
    game.decide('raise3')
    game.decide('raise3')
    game.decide('raise3')
    expect(game.last!.wagered).toBe(100)
    expect(game.last!.returned).toBe(50_100)
  })
})

describe('accounting', () => {
  it('moves the bankroll by exactly -wagered + returned, every round', () => {
    const game = table(2024, 1e9)
    for (let i = 0; i < 400; i++) {
      const before = game.bankroll
      game.playRound(5)
      const hand = game.last!
      expect(game.bankroll).toBe(before - hand.wagered + hand.returned!)
      expect(hand.wagered).toBeGreaterThanOrEqual(hand.ante)
      expect(hand.wagered).toBeLessThanOrEqual(hand.ante * MAX_EXPOSURE)
    }
    expect(game.round).toBe(400)
  })

  it('holds the wager to the ante plus the raises actually made', () => {
    const game = table(99, 1e9)
    for (let i = 0; i < 200; i++) {
      game.playRound(5)
      const hand = game.last!
      const raises = Object.values(hand.raises).reduce((a, b) => a + b, 0)
      expect(hand.wagered).toBe(hand.ante + raises)
    }
  })

  it('runs the solver end to end without stalling', () => {
    const game = table(555, 1e9)
    for (let i = 0; i < 300; i++) game.playRound(5)
    expect(game.phase).toBe('settled')
    expect(game.last).not.toBeNull()
  })
})
