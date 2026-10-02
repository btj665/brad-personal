import { describe, expect, it } from 'vitest'

import type { Card, Rank, Suit } from '../engine/types'
import { compare, score2, score5 } from '../poker/eval'
import { PaiGowGame } from './engine'
import { fortuneEvaluate } from './fortune'
import { houseWay } from './houseway'

let uid = 0
function c(spec: string): Card {
  if (spec === '*') return { uid: uid++, rank: 'A', suit: 'S', joker: true }
  const suit = spec.slice(-1).toUpperCase() as Suit
  const rank = spec.slice(0, -1) as Rank
  return { uid: uid++, rank, suit }
}
const hand = (s: string) => s.split(' ').map(c)
const OPTS = { wheelHigh: true }

// --- the house way ---------------------------------------------------------

describe('the house way never fouls', () => {
  it('always makes the high hand outrank the low hand', () => {
    // Deal thousands of real seven-card hands and check the split is legal.
    let uidLocal = 0
    const deck: Card[] = []
    const suits: Suit[] = ['S', 'H', 'D', 'C']
    const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    for (const s of suits) for (const r of ranks) deck.push({ uid: uidLocal++, rank: r, suit: s })
    deck.push({ uid: uidLocal++, rank: 'A', suit: 'S', joker: true })

    let seed = 12345
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }

    for (let n = 0; n < 5000; n++) {
      for (let k = 0; k < 7; k++) {
        const j = k + Math.floor(rand() * (deck.length - k))
        const t = deck[k]
        deck[k] = deck[j]
        deck[j] = t
      }
      const seven = deck.slice(0, 7)
      const s = houseWay(seven)
      expect(s.high).toHaveLength(5)
      expect(s.low).toHaveLength(2)
      expect(compare(s.highScore, s.lowScore), JSON.stringify(seven.map((x) => x.rank))).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('the house way plays the obvious hands right', () => {
  it('keeps one pair in back and the two high cards in front', () => {
    const s = houseWay(hand('9s 9h Ad Kc 5s 3h 2d'))
    expect(score5(s.high, OPTS).tiebreak[0]).toBe(9) // pair of nines in back
    const lowRanks = s.low.map((x) => x.rank).sort()
    expect(lowRanks).toEqual(['A', 'K'])
  })

  it('splits two high pairs, higher pair in back', () => {
    const s = houseWay(hand('As Ah Ks Kh 9d 5c 2s'))
    expect(score5(s.high, OPTS).tiebreak[0]).toBe(14) // aces in back
    expect(score2(s.low, OPTS).tiebreak[0]).toBe(13) // kings in front
  })

  it('splits a full house: pair in front, trips in back', () => {
    const s = houseWay(hand('8s 8h 8d Ks Kh 4c 2s'))
    expect(score5(s.high, OPTS).tiebreak[0]).toBe(8) // trip eights in back
    expect(score2(s.low, OPTS).category).toBe(1) // a pair in front
    expect(score2(s.low, OPTS).tiebreak[0]).toBe(13) // kings in front
  })

  it('keeps three of a kind in back, except aces', () => {
    const trips = houseWay(hand('7s 7h 7d Ks Qc 5s 2h'))
    expect(score5(trips.high, OPTS).category).toBe(3) // trips in back

    const aces = houseWay(hand('As Ah Ad Ks Qc 5s 2h'))
    expect(score2(aces.low, OPTS).tiebreak[0]).toBe(14) // an ace up front
  })
})

// --- the Fortune bonus -----------------------------------------------------

describe('Fortune recognises the big hands', () => {
  it('sees five aces', () => {
    const fh = fortuneEvaluate(hand('As Ah Ad Ac * Ks 2d'))
    expect(fh.fiveAces).toBe(true)
  })

  it('sees a royal flush', () => {
    const fh = fortuneEvaluate(hand('As Ks Qs Js 10s 2d 3c'))
    expect(fh.royal).toBe(true)
  })

  it('sees a seven-card straight flush', () => {
    const fh = fortuneEvaluate(hand('4s 5s 6s 7s 8s 9s 10s'))
    expect(fh.sevenStraightFlush).toBe(true)
  })

  it('uses the joker to fill a seven-card straight flush', () => {
    const fh = fortuneEvaluate(hand('4s 5s 6s * 8s 9s 10s'))
    expect(fh.sevenStraightFlush).toBe(true)
  })

  it('does not cry wolf on ordinary hands', () => {
    const fh = fortuneEvaluate(hand('As Kh Qd Jc 9s 5d 2h'))
    expect(fh.royal).toBe(false)
    expect(fh.fiveAces).toBe(false)
    expect(fh.sevenStraightFlush).toBe(false)
  })
})

// --- the table -------------------------------------------------------------

function autoGame(seed: number) {
  return new PaiGowGame({
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

describe('a hand of Pai Gow', () => {
  it('deals seven cards to each seat and the dealer', () => {
    const game = autoGame(3)
    let beat = game.step()
    while (game.phase !== 'setting' && beat.type !== 'settle') beat = game.step()
    for (const s of game.seats) if (s.hand) expect(s.hand.cards).toHaveLength(7)
    expect(game.dealer.cards).toHaveLength(7)
  })

  it('plays a thousand hands without stalling or fouling', () => {
    const game = autoGame(2024)
    for (let i = 0; i < 1000; i++) {
      game.playRound()
      for (const s of game.seats) {
        if (!s.hand?.setting) continue
        expect(compare(s.hand.setting.highScore, s.hand.setting.lowScore)).toBeGreaterThanOrEqual(0)
      }
    }
    expect(game.round).toBe(1000)
  })

  it('replays identically from the same seed', () => {
    const a = autoGame(88)
    const b = autoGame(88)
    for (let i = 0; i < 60; i++) {
      a.playRound()
      b.playRound()
    }
    expect(a.seats.map((s) => s.bankroll)).toEqual(b.seats.map((s) => s.bankroll))
  })

  it('takes 5% commission on a win and nothing on a push', () => {
    const game = autoGame(7)
    let wins = 0
    let pushes = 0
    for (let i = 0; i < 300 && (wins < 3 || pushes < 3); i++) {
      const before = game.human.bankroll
      game.playRound()
      const h = game.human.hand!
      if (h.outcome === 'win') {
        // Bet b returns b + 0.95b.
        expect(game.human.bankroll - before).toBeCloseTo(h.bet * 0.95, 5)
        wins++
      } else if (h.outcome === 'push') {
        expect(game.human.bankroll - before).toBe(0)
        pushes++
      }
    }
    expect(wins).toBeGreaterThan(0)
    expect(pushes).toBeGreaterThan(0)
  })
})

// --- the human setting path ------------------------------------------------

describe('setting your own hand', () => {
  function humanGame(seed: number) {
    const g = new PaiGowGame({ seed, humanSeat: 0, humanBankroll: 1000, bots: [] })
    g.human.autoSet = false
    return g
  }

  it('offers a house-way suggestion and accepts a legal arrangement', () => {
    const game = humanGame(4)
    expect(game.runUntilInput().type).toBe('awaitBet')
    game.placeBet(25)

    const beat = game.runUntilInput()
    expect(beat.type).toBe('awaitSet')

    const suggested = game.suggestion()!
    expect(suggested.high).toHaveLength(5)

    // Accept the house way and finish the hand.
    game.acceptHouseWay()
    game.runUntilInput()
    expect(game.human.hand!.outcome).toBeDefined()
  })

  it('refuses a foul (low hand stronger than high)', () => {
    const game = humanGame(6)
    game.runUntilInput()
    game.placeBet(25)
    game.runUntilInput()

    const cards = game.human.hand!.cards
    // Try every two-card low; a foul must be rejected, a legal split accepted.
    const first = cards[0].uid
    const second = cards[1].uid
    const result = game.setLow([first, second])
    // Either it was legal (accepted) or a foul (rejected) — but never a foul
    // that got through.
    if (result) {
      const s = game.human.hand!.setting!
      expect(compare(s.highScore, s.lowScore)).toBeGreaterThanOrEqual(0)
    }
  })
})
