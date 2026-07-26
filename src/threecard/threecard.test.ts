import { describe, expect, it } from 'vitest'

import type { Card, Rank, Suit } from '../engine/types'
import { score3 } from '../poker/eval3'
import { settleHand, ThreeCardGame, type TcpHand } from './engine'
import {
  anteBonusOdds,
  dealerQualifies,
  pairPlusOdds,
  PAIR_PLUS_TABLES,
  shouldRaise,
  tableById,
} from './rules'

let uid = 0
function c(spec: string): Card {
  const suit = spec.slice(-1).toUpperCase() as Suit
  const rank = spec.slice(0, -1) as Rank
  return { uid: uid++, rank, suit }
}
const h = (s: string) => s.split(' ').map(c)

const MODERN = tableById('1-3-6-30-40')
const LEGACY = tableById('1-4-6-30-40')

/** A decided hand, for the settlement tests. */
function rig(opts: {
  player: string
  dealer: string
  ante?: number
  play?: number
  pairPlus?: number
  folded?: boolean
}): TcpHand {
  const player = h(opts.player)
  const dealer = h(opts.dealer)
  const ante = opts.ante ?? 10
  return {
    ante,
    pairPlusBet: opts.pairPlus ?? 0,
    play: opts.folded ? 0 : (opts.play ?? ante),
    player,
    dealer,
    playerScore: score3(player),
    dealerScore: score3(dealer),
    folded: opts.folded ?? false,
    payout: null,
  }
}

// --- the schedules ---------------------------------------------------------

describe('Ante bonus', () => {
  it('pays only straight, trips and straight flush', () => {
    expect(anteBonusOdds(score3(h('9s 8h 7d')))).toBe(1)
    expect(anteBonusOdds(score3(h('8s 8h 8d')))).toBe(4)
    expect(anteBonusOdds(score3(h('9s 8s 7s')))).toBe(5)
    // No bonus row for a flush or a pair, even though Pair Plus pays both.
    expect(anteBonusOdds(score3(h('Ks 9s 4s')))).toBe(0)
    expect(anteBonusOdds(score3(h('6s 6h Kd')))).toBe(0)
    expect(anteBonusOdds(score3(h('Ks 9h 4d')))).toBe(0)
  })
})

describe('Pair Plus paytables', () => {
  it('pays every category on the modern 1-3-6-30-40 table', () => {
    expect(pairPlusOdds(MODERN, score3(h('6s 6h Kd')))).toBe(1)
    expect(pairPlusOdds(MODERN, score3(h('Ks 9s 4s')))).toBe(3)
    expect(pairPlusOdds(MODERN, score3(h('9s 8h 7d')))).toBe(6)
    expect(pairPlusOdds(MODERN, score3(h('8s 8h 8d')))).toBe(30)
    expect(pairPlusOdds(MODERN, score3(h('9s 8s 7s')))).toBe(40)
    expect(pairPlusOdds(MODERN, score3(h('Ks 9h 4d')))).toBe(0)
  })

  it('differs from the legacy table on the flush row and nowhere else', () => {
    const hands = ['6s 6h Kd', 'Ks 9s 4s', '9s 8h 7d', '8s 8h 8d', '9s 8s 7s', 'Ks 9h 4d']
    const diffs = hands.filter(
      (spec) => pairPlusOdds(MODERN, score3(h(spec))) !== pairPlusOdds(LEGACY, score3(h(spec))),
    )
    expect(diffs).toEqual(['Ks 9s 4s'])
    expect(pairPlusOdds(LEGACY, score3(h('Ks 9s 4s')))).toBe(4)
  })

  it('records both published edges', () => {
    expect(PAIR_PLUS_TABLES.map((t) => t.edge)).toEqual([0.0728, 0.0232])
  })
})

// --- the two rules of play -------------------------------------------------

describe('dealer qualification', () => {
  it('needs queen high or better', () => {
    expect(dealerQualifies(score3(h('Qs 3h 2d')))).toBe(true) // the lowest qualifier
    expect(dealerQualifies(score3(h('Js 10h 8c')))).toBe(false) // jack high is one pip short
    expect(dealerQualifies(score3(h('Ks 4h 2d')))).toBe(true)
    expect(dealerQualifies(score3(h('2s 2h 3d')))).toBe(true) // any pair qualifies
    expect(dealerQualifies(score3(h('Js 4h 2d')))).toBe(false)
  })
})

describe('Q-6-4 strategy', () => {
  it('raises on Q-6-4 and folds Q-6-3 — the cutoff is a hair', () => {
    expect(shouldRaise(score3(h('Qs 6h 4d')))).toBe(true)
    expect(shouldRaise(score3(h('Qs 6h 3d')))).toBe(false)
  })

  it('raises anything queen high with a better middle card', () => {
    expect(shouldRaise(score3(h('Qs 7h 2d')))).toBe(true)
    expect(shouldRaise(score3(h('Qs 5h 4d')))).toBe(false)
  })

  it('always raises king high, ace high, and any made hand', () => {
    expect(shouldRaise(score3(h('Ks 3h 2d')))).toBe(true)
    expect(shouldRaise(score3(h('As 3h 2d')))).toBe(true)
    expect(shouldRaise(score3(h('2s 2h 3d')))).toBe(true)
    expect(shouldRaise(score3(h('4s 3h 2d')))).toBe(true)
  })

  it('folds everything jack high and below', () => {
    expect(shouldRaise(score3(h('Js 10h 8d')))).toBe(false)
    expect(shouldRaise(score3(h('7s 5h 2d')))).toBe(false)
  })
})

// --- settlement ------------------------------------------------------------

describe('Ante/Play settlement', () => {
  it('pays the ante and returns the Play bet when the dealer does not qualify', () => {
    const p = settleHand(rig({ player: 'Ks 9h 4d', dealer: 'Js 8h 3d', ante: 10 }), MODERN)
    expect(p.outcome).toBe('noQualify')
    expect(p.dealerQualified).toBe(false)
    expect(p.ante).toBe(20) // stake plus 1:1
    expect(p.play).toBe(10) // pushed
    expect(p.net).toBe(10)
  })

  it('pays both bets 1:1 when the player beats a qualifying dealer', () => {
    const p = settleHand(rig({ player: 'As 9h 4d', dealer: 'Ks 8h 3d', ante: 10 }), MODERN)
    expect(p.outcome).toBe('win')
    expect(p.net).toBe(20)
  })

  it('takes both bets when the dealer wins', () => {
    const p = settleHand(rig({ player: 'Qs 9h 4d', dealer: 'Ks 8h 3d', ante: 10 }), MODERN)
    expect(p.outcome).toBe('lose')
    expect(p.returned).toBe(0)
    expect(p.net).toBe(-20)
  })

  it('pushes both bets on an exact tie', () => {
    const p = settleHand(rig({ player: 'Ks 9h 4d', dealer: 'Kh 9d 4s', ante: 10 }), MODERN)
    expect(p.outcome).toBe('push')
    expect(p.net).toBe(0)
  })

  it('loses only the ante on a fold', () => {
    const p = settleHand(rig({ player: '7s 5h 2d', dealer: 'As Kh Qd', ante: 10, folded: true }), MODERN)
    expect(p.outcome).toBe('fold')
    expect(p.wagered).toBe(10)
    expect(p.returned).toBe(0)
    expect(p.net).toBe(-10)
  })
})

describe('the Ante bonus is paid on the player’s hand alone', () => {
  it('pays even when the dealer wins', () => {
    // Player has a straight flush to the nine, the dealer a bigger one.
    const p = settleHand(rig({ player: '9s 8s 7s', dealer: 'Qh Kh Ah', ante: 10 }), MODERN)
    expect(p.outcome).toBe('lose')
    expect(p.anteBonus).toBe(50) // 5:1, pure win
    expect(p.net).toBe(30) // lost 20 on ante and Play, kept the bonus
  })

  it('pays when the dealer does not qualify', () => {
    const p = settleHand(rig({ player: '8s 8h 8d', dealer: 'Js 8c 3d', ante: 10 }), MODERN)
    expect(p.outcome).toBe('noQualify')
    expect(p.anteBonus).toBe(40) // 4:1 on trips
    expect(p.net).toBe(50)
  })

  it('is not paid on a fold — but nothing worth a bonus is ever folded', () => {
    const folded = rig({ player: '9s 8h 7d', dealer: 'As Kh Qd', ante: 10, folded: true })
    expect(settleHand(folded, MODERN).anteBonus).toBe(0)
    expect(shouldRaise(folded.playerScore)).toBe(true)
  })
})

describe('Pair Plus resolves on its own', () => {
  it('pays on a fold, because it never looks at the dealer', () => {
    // Contrived: a hand that folds Ante/Play but wins Pair Plus is impossible
    // with correct play, so fold a pair deliberately.
    const p = settleHand(rig({ player: '3s 3h 8d', dealer: 'As Kh Qd', ante: 10, pairPlus: 5, folded: true }), MODERN)
    expect(p.pairPlus).toBe(10) // stake plus 1:1
    expect(p.wagered).toBe(15)
    expect(p.net).toBe(-5)
  })

  it('loses on a high card even when the Ante/Play wins', () => {
    const p = settleHand(rig({ player: 'As 9h 4d', dealer: 'Js 8h 3d', ante: 10, pairPlus: 5 }), MODERN)
    expect(p.pairPlus).toBe(0)
    expect(p.outcome).toBe('noQualify')
    expect(p.net).toBe(10 - 5)
  })

  it('pays the flush differently on the two tables', () => {
    const hand = { player: 'Ks 9s 4s', dealer: '2h 3d 7c', ante: 10, pairPlus: 10 }
    expect(settleHand(rig(hand), MODERN).pairPlus).toBe(40) // 3:1
    expect(settleHand(rig(hand), LEGACY).pairPlus).toBe(50) // 4:1
  })
})

// --- the engine ------------------------------------------------------------

describe('ThreeCardGame', () => {
  it('takes the ante and the side bet on the deal, and the Play bet on the raise', () => {
    const game = new ThreeCardGame({ seed: 7, bankroll: 1000, ante: 10, pairPlus: 5 })
    game.deal()
    expect(game.bankroll).toBe(985)
    expect(game.phase).toBe('decide')
    expect(game.hand!.player).toHaveLength(3)
    expect(game.hand!.dealer).toHaveLength(3)
    game.play()
    expect(game.hand).toBeNull()
    expect(game.phase).toBe('complete')
    expect(game.last!.play).toBe(10)
  })

  it('deals six distinct cards', () => {
    const game = new ThreeCardGame({ seed: 42, bankroll: 1000, ante: 10 })
    for (let i = 0; i < 200; i++) {
      game.playRound()
      const uids = new Set([...game.last!.player, ...game.last!.dealer].map((x) => x.uid))
      expect(uids.size).toBe(6)
    }
  })

  it('replays exactly from the seed', () => {
    const a = new ThreeCardGame({ seed: 99, bankroll: 5000, ante: 10, pairPlus: 5 })
    const b = new ThreeCardGame({ seed: 99, bankroll: 5000, ante: 10, pairPlus: 5 })
    for (let i = 0; i < 50; i++) {
      a.playRound()
      b.playRound()
    }
    expect(a.bankroll).toBe(b.bankroll)
    expect(a.log.map((l) => l.text)).toEqual(b.log.map((l) => l.text))
  })

  it('moves the bankroll by exactly -wagered + returned, every round', () => {
    const game = new ThreeCardGame({ seed: 2024, bankroll: 1_000_000, ante: 25, pairPlus: 5 })
    for (let i = 0; i < 500; i++) {
      const before = game.bankroll
      // Alternate between the strategy and a deliberate fold, so both branches
      // of the settlement are audited.
      game.deal()
      if (i % 3 === 0) game.fold()
      else if (game.hint()) game.play()
      else game.fold()
      const p = game.last!.payout!
      expect(game.bankroll).toBe(before - p.wagered + p.returned)
      expect(p.net).toBe(p.returned - p.wagered)
    }
  })

  it('never lets the bankroll go negative, even on a losing streak', () => {
    const game = new ThreeCardGame({ seed: 5, bankroll: 60, ante: 25 })
    for (let i = 0; i < 100; i++) {
      game.playRound()
      expect(game.bankroll).toBeGreaterThanOrEqual(0)
    }
  })

  it('refuses to deal below the table minimum or without the Play bet behind it', () => {
    const game = new ThreeCardGame({ seed: 1, bankroll: 8, ante: 5 })
    expect(game.canDeal()).toBe(false) // 8 cannot back a 5 ante twice
    game.addAnte(-5)
    expect(game.ante).toBe(0)
    expect(game.canDeal()).toBe(false)
  })

  it('clamps the staged bets to the table limits and the bankroll', () => {
    const game = new ThreeCardGame({ seed: 1, bankroll: 1000, ante: 5 })
    game.addAnte(10_000)
    expect(game.ante).toBe(500) // the table max
    game.addPairPlus(10_000)
    expect(game.pairPlus).toBe(0) // no room left behind a 500 ante
    game.clearBets()
    expect(game.ante).toBe(5)
    expect(game.pairPlus).toBe(0)
  })

  it('offers a hint only while a decision is live', () => {
    const game = new ThreeCardGame({ seed: 3, bankroll: 1000, ante: 10 })
    expect(game.hint()).toBeNull()
    game.deal()
    expect(typeof game.hint()).toBe('boolean')
    expect(game.hint()).toBe(shouldRaise(game.hand!.playerScore))
    game.fold()
    expect(game.hint()).toBeNull()
  })

  it('will not change the Pair Plus schedule mid-hand', () => {
    const game = new ThreeCardGame({ seed: 4, bankroll: 1000, ante: 10 })
    game.deal()
    game.setTable('1-4-6-30-40')
    expect(game.table.id).toBe('1-3-6-30-40')
    game.fold()
    game.setTable('1-4-6-30-40')
    expect(game.table.id).toBe('1-4-6-30-40')
  })

  it('lands near the published 3.37% ante edge over a long sample', () => {
    // The exact number is enumerated in scripts/threecard-edge.ts; this is only
    // a smoke test that the engine settles the way the enumeration assumes.
    const game = new ThreeCardGame({ seed: 0xace, bankroll: 1e9, ante: 5, pairPlus: 0 })
    let anteTotal = 0
    let net = 0
    for (let i = 0; i < 200_000; i++) {
      const before = game.bankroll
      game.playRound()
      anteTotal += game.last!.ante
      net += game.bankroll - before
    }
    const edge = -net / anteTotal
    expect(edge).toBeGreaterThan(0.02)
    expect(edge).toBeLessThan(0.05)
  })
})
