import { describe, expect, it } from 'vitest'

import type { Card, Rank, Suit } from '../engine/types'
import { score5 } from '../poker/eval'
import { CaribbeanGame, resolveHand, UP_INDEX } from './engine'
import {
  breakEvenMeter,
  DEFAULT_CARIBBEAN,
  dealerQualifies,
  HAND_COUNTS,
  PAY_ORDER,
  payKey,
  progressiveReturn,
  progressiveWin,
  TOTAL_HANDS,
} from './rules'
import { shouldRaise } from './strategy'

let uid = 0
function c(spec: string): Card {
  const suit = spec.slice(-1).toUpperCase() as Suit
  const rank = spec.slice(0, -1) as Rank
  return { uid: uid++, rank, suit }
}
const h = (s: string) => s.split(' ').map(c)

const ANTE = 10
const RAISE = ANTE * 2

/** A dealer hand that opens (ace-king high) and loses to everything below. */
const OPENS_AND_LOSES = 'Ah Kh 8d 5c 3s'

function play(player: string, dealer: string, progressive = 0) {
  return resolveHand({
    player: h(player),
    dealer: h(dealer),
    ante: ANTE,
    raise: RAISE,
    progressive,
    folded: false,
  })
}

// --- the Raise schedule ----------------------------------------------------

describe('the Raise pays its schedule when the player beats a qualified dealer', () => {
  const cases: Array<[name: string, hand: string, odds: number]> = [
    ['pair or less', 'As Ks Qd 7h 2c', 1],
    ['two pair', 'As Ad Ks Kc 9h', 2],
    ['three of a kind', '7s 7d 7h 4c 2s', 3],
    ['straight', '9s 8s 7d 6c 5d', 4],
    ['flush', 'As Js 9s 6s 4s', 5],
    ['full house', '9s 9d 9c 2s 2d', 7],
    ['four of a kind', '9s 9d 9c 9h 2s', 20],
    ['straight flush', '9s 8s 7s 6s 5s', 50],
    ['royal flush', 'As Ks Qs Js 10s', 100],
  ]

  for (const [name, hand, odds] of cases) {
    it(`pays ${odds}:1 on ${name}`, () => {
      const s = play(hand, OPENS_AND_LOSES)
      expect(s.qualifies).toBe(true)
      expect(s.result).toBe('win')
      expect(s.antePay).toBe(ANTE * 2)
      expect(s.raisePay).toBe(RAISE + RAISE * odds)
      expect(s.net).toBe(ANTE + RAISE * odds)
    })
  }

  it('sorts a royal onto its own row, above an ordinary straight flush', () => {
    expect(payKey(score5(h('As Ks Qs Js 10s'), {}))).toBe('royal')
    expect(payKey(score5(h('9s 8s 7s 6s 5s'), {}))).toBe('straightFlush')
  })

  it('prices a winning high card the same as a pair', () => {
    expect(DEFAULT_CARIBBEAN.raisePay[payKey(score5(h('As Ks Qd 7h 2c'), {}))]).toBe(1)
    expect(DEFAULT_CARIBBEAN.raisePay[payKey(score5(h('7s 7d Qd 9h 2c'), {}))]).toBe(1)
  })
})

// --- the qualifying rule --------------------------------------------------

describe('the dealer qualifies on ace-king or better', () => {
  const q = (spec: string) => {
    const cards = h(spec)
    return dealerQualifies(cards, score5(cards, {}))
  }

  it('opens on a bare ace-king, whatever the rags', () => {
    expect(q('Ah Kd 4c 3s 2h')).toBe(true)
  })

  it('does not open on ace-queen', () => {
    expect(q('Ah Qd Jc 10s 8h')).toBe(false)
  })

  it('does not open on king-queen', () => {
    expect(q('Kh Qd Jc 9s 8h')).toBe(false)
  })

  it('opens on the smallest pair', () => {
    expect(q('2h 2d 7c 5s 3h')).toBe(true)
  })

  it('does not open on ace high alone, nor king high alone', () => {
    expect(q('Ah Qd 9c 5s 3h')).toBe(false)
    expect(q('Kh Jd 9c 5s 3h')).toBe(false)
  })

  it('opens on anything that is a hand at all', () => {
    expect(q('9s 8s 7s 6s 5s')).toBe(true)
    expect(q('2s 3d 4c 5h 6s')).toBe(true)
  })
})

// --- settlement paths -----------------------------------------------------

describe('settlement', () => {
  const NO_OPEN = 'Qh Jd 9c 5s 2h' // queen high, no ace-king: does not qualify

  it('pays the ante 1:1 and pushes the Raise when the dealer folds', () => {
    const s = play('As Ks Qd 7h 2c', NO_OPEN)
    expect(s.qualifies).toBe(false)
    expect(s.antePay).toBe(ANTE * 2)
    expect(s.raisePay).toBe(RAISE) // pushed, not paid
    expect(s.net).toBe(ANTE)
  })

  it('still only pays one unit on a royal flush the dealer never had to face', () => {
    // The single most expensive rule in the game.
    const s = play('As Ks Qs Js 10s', NO_OPEN)
    expect(s.playerKey).toBe('royal')
    expect(s.net).toBe(ANTE)
  })

  it('takes both bets when the dealer wins', () => {
    const s = play('7s 7d Qd 9h 2c', 'Ah Ad Kh 8d 3s')
    expect(s.qualifies).toBe(true)
    expect(s.result).toBe('lose')
    expect(s.antePay).toBe(0)
    expect(s.raisePay).toBe(0)
    expect(s.net).toBe(-(ANTE + RAISE))
  })

  it('pushes both bets on an exact tie, kickers and all', () => {
    const s = play('As Ks Qd Jh 9c', 'Ah Kh Qs Js 9d')
    expect(s.qualifies).toBe(true)
    expect(s.result).toBe('push')
    expect(s.antePay).toBe(ANTE)
    expect(s.raisePay).toBe(RAISE)
    expect(s.net).toBe(0)
  })

  it('loses on a kicker rather than pushing', () => {
    const s = play('As Ks Qd Jh 8c', 'Ah Kh Qs Js 9d')
    expect(s.result).toBe('lose')
  })

  it('loses only the ante on a fold, and never the Raise', () => {
    const s = resolveHand({
      player: h('7s 4d 9c 2h 5s'),
      dealer: h('Ah Ad Kh 8d 3s'),
      ante: ANTE,
      raise: 0,
      progressive: 0,
      folded: true,
    })
    expect(s.result).toBe('fold')
    expect(s.antePay).toBe(0)
    expect(s.raisePay).toBe(0)
    expect(s.net).toBe(-ANTE)
  })
})

// --- the progressive ------------------------------------------------------

describe('the $1 progressive', () => {
  const p = DEFAULT_CARIBBEAN.progressive

  it('pays the whole meter on a royal and a tenth of it on a straight flush', () => {
    expect(progressiveWin(p, 'royal')).toBe(p.meter)
    expect(progressiveWin(p, 'straightFlush')).toBe(p.meter * 0.1)
  })

  it('pays flat amounts for quads, a full house and a flush', () => {
    expect(progressiveWin(p, 'quads')).toBe(500)
    expect(progressiveWin(p, 'fullHouse')).toBe(100)
    expect(progressiveWin(p, 'flush')).toBe(50)
  })

  it('pays nothing for a straight or below', () => {
    expect(progressiveWin(p, 'straight')).toBe(0)
    expect(progressiveWin(p, 'trips')).toBe(0)
    expect(progressiveWin(p, 'twoPair')).toBe(0)
    expect(progressiveWin(p, 'pairOrLess')).toBe(0)
  })

  it('resolves off the player’s own cards, even on a fold', () => {
    const s = resolveHand({
      player: h('As Js 9s 6s 4s'),
      dealer: h('Ah Ad Kh 8d 3c'),
      ante: ANTE,
      raise: 0,
      progressive: 1,
      folded: true,
    })
    expect(s.progressivePay).toBe(50)
    expect(s.net).toBe(50 - ANTE - 1)
  })

  it('is a losing bet at a $200,000 meter and a winning one above break-even', () => {
    expect(progressiveReturn(p)).toBeCloseTo(0.9472, 4)
    const meter = breakEvenMeter(p)
    expect(meter).toBeGreaterThan(218_000)
    expect(meter).toBeLessThan(218_100)
    expect(progressiveReturn({ ...p, meter })).toBeCloseTo(1, 9)
    expect(progressiveReturn({ ...p, meter: meter + 100_000 })).toBeGreaterThan(1)
  })

  it('is dreadful at a freshly seeded meter', () => {
    expect(progressiveReturn({ ...p, meter: 10_000 })).toBeLessThan(0.4)
  })
})

// --- the frequency table --------------------------------------------------

describe('the five-card frequency table', () => {
  it('accounts for every hand in the deck', () => {
    const total = PAY_ORDER.reduce((n, k) => n + HAND_COUNTS[k], 0)
    expect(total).toBe(TOTAL_HANDS)
  })
})

// --- strategy -------------------------------------------------------------

describe('raise with any pair or better, or A-K-J-8-3 or better', () => {
  it('raises any pair, however small', () => {
    expect(shouldRaise(h('2s 2d 7c 5h 3s'))).toBe(true)
  })

  it('raises the threshold hand itself', () => {
    expect(shouldRaise(h('As Kd Jc 8h 3s'))).toBe(true)
  })

  it('raises one pip above the threshold on the last card', () => {
    expect(shouldRaise(h('As Kd Jc 8h 4s'))).toBe(true)
  })

  it('folds one pip below it', () => {
    expect(shouldRaise(h('As Kd Jc 8h 2s'))).toBe(false)
  })

  it('folds ace-king-jack with a bad fourth card', () => {
    expect(shouldRaise(h('As Kd Jc 7h 6s'))).toBe(false)
  })

  it('raises every ace-king-queen', () => {
    expect(shouldRaise(h('As Kd Qc 3h 2s'))).toBe(true)
  })

  it('folds ace-king-ten and below', () => {
    expect(shouldRaise(h('As Kd 10c 9h 8s'))).toBe(false)
  })

  it('folds ace-queen no matter how pretty', () => {
    expect(shouldRaise(h('As Qd Jc 10h 8s'))).toBe(false)
  })

  it('folds a hand with no ace', () => {
    expect(shouldRaise(h('Ks Qd Jc 9h 7s'))).toBe(false)
  })
})

// --- the table ------------------------------------------------------------

describe('a hand at the table', () => {
  it('deals five to the player and five to the dealer, one of them exposed', () => {
    const game = new CaribbeanGame({ seed: 7, bankroll: 1000, ante: 10 })
    expect(game.upcard).toBeNull()
    game.deal()
    expect(game.hand!.cards).toHaveLength(5)
    expect(game.dealer.cards).toHaveLength(5)
    expect(game.dealer.revealed).toBe(false)
    expect(game.upcard).toBe(game.dealer.cards[UP_INDEX])
    // Ten distinct cards off one deck.
    const uids = new Set([...game.hand!.cards, ...game.dealer.cards].map((k) => k.uid))
    expect(uids.size).toBe(10)
  })

  it('takes the ante on the deal and exactly twice it on the Raise', () => {
    const game = new CaribbeanGame({ seed: 11, bankroll: 1000, ante: 25 })
    game.deal()
    expect(game.bankroll).toBe(975)
    game.raise()
    expect(game.hand!.raise).toBe(50)
  })

  it('adds the flat side bet to the ante, not a multiple of it', () => {
    const game = new CaribbeanGame({ seed: 11, bankroll: 1000, ante: 25, progressive: true })
    expect(game.stakeOut).toBe(26)
    game.deal()
    expect(game.hand!.progressive).toBe(1)
  })

  it('shows the dealer’s hand once the decision is made', () => {
    const game = new CaribbeanGame({ seed: 3, bankroll: 1000, ante: 10 })
    game.deal()
    game.fold()
    expect(game.phase).toBe('complete')
    expect(game.dealer.revealed).toBe(true)
    expect(game.dealer.qualifies).not.toBeNull()
  })

  it('ignores a fold or a Raise outside the decision', () => {
    const game = new CaribbeanGame({ seed: 3, bankroll: 1000, ante: 10 })
    game.fold()
    expect(game.phase).toBe('bet')
    game.deal()
    game.raise()
    const after = game.bankroll
    game.raise()
    game.fold()
    expect(game.bankroll).toBe(after)
  })

  it('will not deal a hand the player cannot afford to raise on', () => {
    const game = new CaribbeanGame({ seed: 3, bankroll: 29, ante: 10 })
    expect(game.canDeal()).toBe(false)
    game.setAnte(5)
    expect(game.canDeal()).toBe(true)
  })

  it('replays identically from the same seed', () => {
    const run = (seed: number) => {
      const game = new CaribbeanGame({ seed, bankroll: 100_000, ante: 10, progressive: true })
      for (let i = 0; i < 80; i++) {
        game.deal()
        if (shouldRaise(game.hand!.cards, game.hand!.score)) game.raise()
        else game.fold()
      }
      return game.bankroll
    }
    expect(run(4242)).toBe(run(4242))
  })

  it('moves the bankroll by exactly −wagered + returned, every round', () => {
    const game = new CaribbeanGame({ seed: 90210, bankroll: 5_000_000, ante: 10, progressive: true })
    let expected = game.bankroll
    let wagered = 0
    let returned = 0

    for (let i = 0; i < 500; i++) {
      game.deal()
      const hand = game.hand!
      const raising = shouldRaise(hand.cards, hand.score)
      const staked = hand.ante + hand.progressive + (raising ? hand.ante * 2 : 0)

      if (raising) game.raise()
      else game.fold()

      const s = hand.settlement!
      const back = s.antePay + s.raisePay + s.progressivePay
      expect(s.net).toBe(back - staked)

      wagered += staked
      returned += back
      expected += back - staked
      expect(game.bankroll).toBe(expected)
    }

    expect(game.round).toBe(500)
    expect(game.bankroll).toBe(5_000_000 - wagered + returned)
  })
})
