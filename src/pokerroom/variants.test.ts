import { describe, expect, it } from 'vitest'

import { bestOf, Category, score5 } from '../poker/eval'
import type { Card } from '../engine/types'
import { PokerGame, type BotBrain, type BotDraw } from './engine'
import { ranker } from './ranker'
import type { BotProfile, Variant } from './types'
import {
  FIVE_DRAW,
  HOLDEM,
  LIMIT_HOLDEM,
  OMAHA_LIMIT,
  OMAHA_PL,
  SEVEN_STUD,
  VARIANTS,
} from './variants'

const P: BotProfile = { looseness: 0.5, aggression: 0.4, bluff: 0.1, quips: [] }

// A shoe-unique uid on every hand-built card, so tests can tell a hole card from
// a board card by identity.
let uid = 1000
function C(rank: Card['rank'], suit: Card['suit']): Card {
  return { uid: uid++, rank, suit }
}
/** How many of `cards` came from `source`, matched by uid. */
function drawnFrom(cards: Card[], source: Card[]): number {
  const ids = new Set(source.map((c) => c.uid))
  return cards.filter((c) => ids.has(c.uid)).length
}

/** The rowdy brain from engine.test: raises, bets, calls and folds off the seeded
 *  rng alone, so hands reach side pots, all-ins and showdowns and still replay. */
function rowdyBrain(seed: number): BotBrain {
  let s = seed
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  return (_g, seat, opt) => {
    const r = rnd()
    if (opt.canRaise && r < 0.25 && opt.maxTo > opt.minTo) {
      const to = Math.round(opt.minTo + rnd() * (opt.maxTo - opt.minTo))
      return { kind: 'raise', to }
    }
    if (opt.canBet && r < 0.3) return { kind: 'bet', to: opt.minTo }
    if (opt.canCheck) return { kind: 'check' }
    if (r < 0.7 && opt.callAmount <= seat.stack) return { kind: 'call' }
    return { kind: 'fold' }
  }
}

/** Discards nought to three off the top, seeded — enough to work the draw round
 *  without ever emptying a single-deck shoe. */
function rowdyDraw(seed: number): BotDraw {
  let s = seed
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  return () => {
    const n = Math.floor(rnd() * 4)
    return Array.from({ length: n }, (_, i) => i)
  }
}

/** A brain that only ever checks or calls, so every seat sees the river. Used to
 *  drive a hand all the way to showdown with the full board and full holdings. */
const callBrain: BotBrain = (_g, _s, opt) => (opt.canCheck ? { kind: 'check' } : { kind: 'call' })

function newGame(variant: Variant, seed: number, seats: number, brain: BotBrain, botDraw?: BotDraw) {
  return new PokerGame({
    variant,
    ranker,
    brain,
    botDraw,
    seed,
    bigBlind: 20,
    buyIn: 1000,
    humanSeat: -1, // no human: fully autonomous
    seats,
    bots: Array.from({ length: seats }, (_, i) => ({ name: `Bot ${i}`, profile: P })),
  })
}

// ---------------------------------------------------------------- the catalogue

describe('the variant catalogue', () => {
  it('lists Hold’em first and gives every game an id, label, blurb and note', () => {
    expect(VARIANTS[0]).toBe(HOLDEM)
    const ids = new Set<string>()
    for (const v of VARIANTS) {
      expect(v.label.length).toBeGreaterThan(0)
      expect(v.blurb.length).toBeGreaterThan(0)
      expect(v.note.length).toBeGreaterThan(0)
      expect(ids.has(v.id)).toBe(false) // ids are unique
      ids.add(v.id)
    }
  })

  it('sizes Omaha to four hole cards used exactly two at a time', () => {
    for (const v of [OMAHA_PL, OMAHA_LIMIT]) {
      expect(v.family).toBe('omaha')
      expect(v.holeCardsUsed).toBe(2)
      expect(v.deal[0]).toEqual({ kind: 'hole', count: 4 })
    }
  })
})

// ---------------------------------------------------------------- the ranker

describe('the ranker names a hand the way a table would', () => {
  const name = (cards: Card[]) => ranker.score(cards, [], FIVE_DRAW).name

  it('names the leading rank, not just the category', () => {
    expect(name([C('K', 'C'), C('K', 'D'), C('K', 'S'), C('10', 'H'), C('10', 'C')])).toBe(
      'Full house, kings full of tens',
    )
    expect(name([C('A', 'H'), C('K', 'H'), C('9', 'H'), C('5', 'H'), C('2', 'H')])).toBe(
      'Flush, ace high',
    )
    expect(name([C('K', 'C'), C('K', 'D'), C('9', 'H'), C('5', 'S'), C('2', 'C')])).toBe(
      'Pair of kings',
    )
    expect(name([C('A', 'C'), C('A', 'D'), C('8', 'H'), C('8', 'S'), C('2', 'C')])).toBe(
      'Two pair, aces and eights',
    )
    expect(name([C('Q', 'C'), C('Q', 'D'), C('Q', 'H'), C('5', 'S'), C('2', 'C')])).toBe(
      'Three of a kind, queens',
    )
    expect(name([C('7', 'C'), C('7', 'D'), C('7', 'H'), C('7', 'S'), C('2', 'C')])).toBe(
      'Four of a kind, sevens',
    )
  })

  it('names straights by their high card, wheel included', () => {
    expect(name([C('2', 'C'), C('3', 'D'), C('4', 'H'), C('5', 'S'), C('6', 'C')])).toBe(
      'Straight, six high',
    )
    // The wheel is a five-high straight, never an ace-high one.
    expect(name([C('A', 'C'), C('2', 'D'), C('3', 'H'), C('4', 'S'), C('5', 'C')])).toBe(
      'Straight, five high',
    )
  })

  it('calls the ace-high straight flush a royal flush', () => {
    expect(name([C('A', 'H'), C('K', 'H'), C('Q', 'H'), C('J', 'H'), C('10', 'H')])).toBe(
      'Royal flush',
    )
    expect(name([C('9', 'S'), C('8', 'S'), C('7', 'S'), C('6', 'S'), C('5', 'S')])).toBe(
      'Straight flush, nine high',
    )
  })

  it('names a high-card hand by its top card', () => {
    expect(name([C('A', 'H'), C('K', 'D'), C('9', 'C'), C('5', 'S'), C('2', 'H')])).toBe('Ace high')
  })

  it('keeps rank monotonic with the evaluator: a flush outranks a straight', () => {
    const flush = ranker.score(
      [C('A', 'H'), C('K', 'H'), C('9', 'H'), C('5', 'H'), C('2', 'H')],
      [],
      FIVE_DRAW,
    )
    const straight = ranker.score(
      [C('2', 'C'), C('3', 'D'), C('4', 'H'), C('5', 'S'), C('6', 'C')],
      [],
      FIVE_DRAW,
    )
    expect(flush.rank).toBeGreaterThan(straight.rank)
  })
})

// ---------------------------------------------------------------- Omaha: exactly two

describe("Omaha's exactly-two rule (the one everyone gets wrong)", () => {
  it('refuses a flush off four board hearts when you hold only one', () => {
    // Four hearts on the board; the player has a single heart in hand. Naively
    // this is a flush; in Omaha you can never play more than two of your own, so
    // the best you can do here is the A-2-3-4-5 wheel.
    const hole = [C('J', 'H'), C('4', 'C'), C('5', 'D'), C('6', 'S')]
    const board = [C('A', 'H'), C('K', 'H'), C('Q', 'H'), C('2', 'H'), C('3', 'S')]

    // The naive "best five of nine" plays the flush.
    expect(bestOf([...hole, ...board]).category).toBe(Category.Flush)

    // Omaha does not.
    const res = ranker.score(hole, board, OMAHA_PL)
    const cat = score5(res.best).category
    expect(cat).not.toBe(Category.Flush)
    expect(cat).toBe(Category.Straight)
    expect(res.name).toBe('Straight, five high')
    // ...and it played exactly two from the hand and three from the board.
    expect(drawnFrom(res.best, hole)).toBe(2)
    expect(drawnFrom(res.best, board)).toBe(3)
  })

  it('refuses quads off four board kings — you can play at most three', () => {
    // All four kings are on the board. Naively that is four of a kind; in Omaha
    // you can only reach three of them, so a pocket pair makes a full house.
    const hole = [C('7', 'C'), C('7', 'H'), C('3', 'S'), C('4', 'D')]
    const board = [C('K', 'S'), C('K', 'H'), C('K', 'D'), C('K', 'C'), C('7', 'D')]

    expect(bestOf([...hole, ...board]).category).toBe(Category.Quads)

    const res = ranker.score(hole, board, OMAHA_PL)
    const cat = score5(res.best).category
    expect(cat).not.toBe(Category.Quads)
    expect(cat).toBe(Category.FullHouse)
    expect(res.name).toBe('Full house, kings full of sevens')
    expect(drawnFrom(res.best, hole)).toBe(2)
    expect(drawnFrom(res.best, board)).toBe(3)
  })

  it('allows the flush when you hold exactly two of the suit', () => {
    // The rule cuts both ways: hold two hearts and the board's three make a
    // flush — here the nuts, a royal.
    const hole = [C('J', 'H'), C('10', 'H'), C('4', 'C'), C('5', 'D')]
    const board = [C('A', 'H'), C('K', 'H'), C('Q', 'H'), C('2', 'H'), C('3', 'S')]

    const res = ranker.score(hole, board, OMAHA_PL)
    expect(score5(res.best).category).toBe(Category.StraightFlush)
    expect(res.name).toBe('Royal flush')
    expect(drawnFrom(res.best, hole)).toBe(2)
    expect(drawnFrom(res.best, board)).toBe(3)
  })

  it('never plays fewer than two hole cards either (no four-board straight)', () => {
    // A made straight sits on the board (2-3-4-5-6). A Hold'em player would just
    // play it; an Omaha player must swap in two of their own, so their straight
    // has to be built, not borrowed.
    const hole = [C('A', 'S'), C('7', 'D'), C('9', 'C'), C('J', 'H')]
    const board = [C('2', 'C'), C('3', 'D'), C('4', 'H'), C('5', 'S'), C('6', 'C')]

    expect(bestOf([...hole, ...board]).category).toBe(Category.Straight)

    const res = ranker.score(hole, board, OMAHA_PL)
    // The board straight cannot be played — no two hole cards extend it — and the
    // seat has no pair with the board, so the best real Omaha hand is ace high.
    expect(score5(res.best).category).toBe(Category.HighCard)
    expect(drawnFrom(res.best, hole)).toBe(2)
    expect(drawnFrom(res.best, board)).toBe(3)
  })
})

// ---------------------------------------------------------------- the deal

describe('each variant deals the right shape', () => {
  const cases: Array<{ v: Variant; hole: number; board: number }> = [
    { v: HOLDEM, hole: 2, board: 5 },
    { v: LIMIT_HOLDEM, hole: 2, board: 5 },
    { v: OMAHA_PL, hole: 4, board: 5 },
    { v: OMAHA_LIMIT, hole: 4, board: 5 },
    { v: SEVEN_STUD, hole: 7, board: 0 },
    { v: FIVE_DRAW, hole: 5, board: 0 },
  ]

  for (const { v, hole, board } of cases) {
    it(`${v.label}: ${hole} cards a seat, ${board} on the board`, () => {
      // callBrain never folds, so every seat is a live contender at showdown.
      const game = newGame(v, 5, 5, callBrain)
      game.startHand()
      game.playOut()
      for (const s of game.seats) expect(s.cards.length).toBe(hole)
      expect(game.board.length).toBe(board)
    })
  }
})

// ---------------------------------------------------------------- accounting

describe('chip conservation per variant', () => {
  // Stud deals seven cards a seat, so it is kept to five seats to stay inside a
  // single 52-card shoe; the others have room for more.
  const cases: Array<{ v: Variant; seats: number; draw: boolean }> = [
    { v: HOLDEM, seats: 5, draw: false },
    { v: LIMIT_HOLDEM, seats: 5, draw: false },
    { v: OMAHA_PL, seats: 5, draw: false },
    { v: OMAHA_LIMIT, seats: 5, draw: false },
    { v: SEVEN_STUD, seats: 5, draw: false },
    { v: FIVE_DRAW, seats: 5, draw: true },
  ]

  for (const { v, seats, draw } of cases) {
    it(`${v.label}: no chip is created or destroyed over 100 hands`, () => {
      const game = newGame(v, 7, seats, rowdyBrain(v.id.length + 3), draw ? rowdyDraw(9) : undefined)
      const start = game.seats.reduce((a, s) => a + s.stack, 0)
      let played = 0
      for (let h = 0; h < 100; h++) {
        if (game.seats.filter((s) => s.stack > 0).length < 2) break
        game.startHand()
        game.playOut()
        expect(game.seats.reduce((a, s) => a + s.stack, 0)).toBe(start)
        played++
      }
      expect(played).toBeGreaterThan(0)
    })
  }

  it('replays identically from a seed for every variant', () => {
    for (const v of VARIANTS) {
      const run = () => {
        const g = newGame(v, 42, 5, rowdyBrain(5), rowdyDraw(2))
        for (let h = 0; h < 25; h++) {
          if (g.seats.filter((s) => s.stack > 0).length < 2) break
          g.startHand()
          g.playOut()
        }
        return g.seats.map((s) => s.stack)
      }
      expect(run()).toEqual(run())
    }
  })
})
