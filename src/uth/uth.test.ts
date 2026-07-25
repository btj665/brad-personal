import { describe, expect, it } from 'vitest'

import type { Card, Rank, Suit } from '../engine/types'
import { flopRaise, preflopRaise, riverRaise } from './strategy'
import { UthGame } from './engine'
import type { Beat } from './engine'

let uid = 0
function c(spec: string): Card {
  const suit = spec.slice(-1).toUpperCase() as Suit
  const rank = spec.slice(0, -1) as Rank
  return { uid: uid++, rank, suit }
}
const h = (s: string) => s.split(' ').map(c)

// --- preflop chart ---------------------------------------------------------

describe('preflop: raise 4x or check', () => {
  it('raises any ace', () => {
    expect(preflopRaise(h('As 2d'))).toBe(true)
    expect(preflopRaise(h('Ah Kh'))).toBe(true)
  })

  it('raises a pair of 3s or better, but checks deuces', () => {
    expect(preflopRaise(h('3s 3d'))).toBe(true)
    expect(preflopRaise(h('2s 2d'))).toBe(false)
    expect(preflopRaise(h('Ks Kd'))).toBe(true)
  })

  it('knows the king kickers: K2 suited, K5 offsuit', () => {
    expect(preflopRaise(h('Ks 2s'))).toBe(true) // suited
    expect(preflopRaise(h('Ks 2d'))).toBe(false) // offsuit K2
    expect(preflopRaise(h('Ks 5d'))).toBe(true) // offsuit K5
  })

  it('knows the queen and jack kickers', () => {
    expect(preflopRaise(h('Qs 6s'))).toBe(true) // Q6 suited
    expect(preflopRaise(h('Qs 5s'))).toBe(false)
    expect(preflopRaise(h('Qs 8d'))).toBe(true) // Q8 offsuit
    expect(preflopRaise(h('Js 8s'))).toBe(true) // J8 suited
    expect(preflopRaise(h('Js 10d'))).toBe(true) // JT offsuit
    expect(preflopRaise(h('Js 9d'))).toBe(false)
  })

  it('checks the junk', () => {
    expect(preflopRaise(h('7s 2d'))).toBe(false)
    expect(preflopRaise(h('10s 4d'))).toBe(false)
  })
})

// --- flop ------------------------------------------------------------------

describe('flop: raise 2x or check', () => {
  it('raises a hidden pair (a hole card pairs the board)', () => {
    expect(flopRaise(h('Ks 4d'), h('Kh 9c 2s'))).toBe(true)
  })

  it('raises a pocket pair', () => {
    expect(flopRaise(h('7s 7d'), h('Kh 9c 2s'))).toBe(true)
  })

  it('does not raise a pair sitting only on the board', () => {
    expect(flopRaise(h('7s 4d'), h('Kh Kc 2s'))).toBe(false)
  })

  it('raises four to a flush with a high hole card', () => {
    expect(flopRaise(h('Ks 4s'), h('9s 2s 7d'))).toBe(true) // four spades, Ks plays
    expect(flopRaise(h('5s 4s'), h('9s 2s 7d'))).toBe(false) // four spades, but low
  })

  it('checks nothing much', () => {
    expect(flopRaise(h('Ks 4d'), h('9h 7c 2s'))).toBe(false)
  })
})

// --- river -----------------------------------------------------------------

describe('river: raise 1x or fold', () => {
  it('raises a hidden pair', () => {
    expect(riverRaise(h('As 4d'), h('Ah 9c 2s 7d 3h'))).toBe(true)
  })

  it('folds when the hole cards do nothing', () => {
    expect(riverRaise(h('7s 4d'), h('Ah Kc 9s 5d 2h'))).toBe(false)
  })

  it('raises when the board itself is a straight it shares', () => {
    expect(riverRaise(h('2s 3d'), h('10h Jc Qs Kd Ah'))).toBe(true)
  })
})

// --- the table -------------------------------------------------------------

function autoGame(seed: number) {
  return new UthGame({
    seed,
    humanSeat: 1,
    humanBankroll: 1e9,
    humanBot: true,
    bots: [
      { name: 'A', bankroll: 1e9 },
      { name: 'B', bankroll: 1e9 },
      { name: 'C', bankroll: 1e9 },
    ],
  })
}

describe('a hand of UTH', () => {
  it('deals two hole cards to each seat, two to the dealer, five to the board', () => {
    const game = autoGame(3)
    let beat: Beat = game.step()
    while (game.phase !== 'preflop') beat = game.step()
    for (const s of game.seats) {
      if (s.hand) expect(s.hand.cards).toHaveLength(2)
    }
    expect(game.dealer.cards).toHaveLength(2)
    expect(game.board).toHaveLength(5)
    expect(beat).toBeDefined()
  })

  it('plays a thousand hands without stalling', () => {
    const game = autoGame(2024)
    for (let i = 0; i < 1000; i++) game.playRound()
    expect(game.round).toBe(1000)
  })

  it('replays identically from the same seed', () => {
    const a = autoGame(77)
    const b = autoGame(77)
    for (let i = 0; i < 60; i++) {
      a.playRound()
      b.playRound()
    }
    expect(a.seats.map((s) => s.bankroll)).toEqual(b.seats.map((s) => s.bankroll))
  })

  it('pushes the ante when the dealer fails to open', () => {
    // Search seeds for a settled hand where the dealer didn't qualify and the
    // player didn't fold, then check the ante came back.
    const game = autoGame(5)
    let checks = 0
    for (let i = 0; i < 400 && checks < 5; i++) {
      game.playRound()
      const h2 = game.human.hand!
      if (!game.dealer.qualifies && !h2.folded) {
        expect(h2.payout!.ante).toBe(h2.ante) // returned, not doubled or taken
        checks++
      }
    }
    expect(checks).toBeGreaterThan(0)
  })

  it('never lets a bet exceed the max or drop below the min once placed', () => {
    const game = autoGame(9)
    for (let i = 0; i < 200; i++) {
      game.playRound()
      const hand = game.human.hand!
      expect(hand.ante).toBeGreaterThanOrEqual(game.rules.minBet)
      expect(hand.ante).toBeLessThanOrEqual(game.rules.maxBet)
      expect(hand.blind).toBe(hand.ante)
    }
  })
})

describe('the human path', () => {
  function humanGame(seed: number) {
    return new UthGame({ seed, humanSeat: 0, humanBankroll: 1000, bots: [{ name: 'Bot', bankroll: 1000 }] })
  }

  it('asks for a bet, then walks the three streets', () => {
    const game = humanGame(4)
    expect(game.runUntilInput().type).toBe('awaitBet')

    game.placeBet(10, 5)
    expect(game.human.hand!.ante).toBe(10)
    expect(game.human.hand!.blind).toBe(10)
    expect(game.human.hand!.trips).toBe(5)
    expect(game.human.bankroll).toBe(1000 - 25)

    // Check every street through to the river, then fold or bet to finish.
    let beat = game.runUntilInput()
    let guard = 0
    while (beat.type === 'awaitDecision' && guard++ < 5) {
      const act = beat.actions.includes('check') ? 'check' : beat.actions[0]
      game.decide(act)
      beat = game.runUntilInput()
    }
    // The hand resolves: the dealer is shown and the hand carries a result.
    expect(beat.type).toBe('settle')
    expect(game.dealer.revealed).toBe(true)
    expect(game.human.hand!.result).toBeDefined()
  })

  it('only offers legal actions per street', () => {
    const game = humanGame(6)
    game.runUntilInput()
    game.placeBet(10)

    const seen = new Set<string>()
    let beat = game.runUntilInput()
    let guard = 0
    while (beat.type === 'awaitDecision' && guard++ < 6) {
      seen.add(beat.street)
      if (beat.street === 'preflop') expect(beat.actions.sort()).toEqual(['bet4', 'check'])
      if (beat.street === 'flop') expect(beat.actions.sort()).toEqual(['bet2', 'check'])
      if (beat.street === 'river') expect(beat.actions.sort()).toEqual(['bet1', 'fold'])
      game.decide(beat.actions.includes('check') ? 'check' : beat.actions[0])
      beat = game.runUntilInput()
    }
    expect(seen.size).toBeGreaterThan(0)
  })
})
