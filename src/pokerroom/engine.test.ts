import { describe, expect, it } from 'vitest'

import { PokerGame, type BotBrain } from './engine'
import { ranker } from './ranker'
import { HOLDEM } from './variants'
import type { BotProfile } from './types'

const P: BotProfile = { looseness: 0.5, aggression: 0.4, bluff: 0.1, quips: [] }

/** A rowdy brain that raises, calls and folds so hands reach every code path —
 *  side pots, all-ins, showdowns — driven only by the seeded rng so it replays. */
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

function newGame(seed: number, seats = 5) {
  return new PokerGame({
    variant: HOLDEM,
    ranker,
    brain: rowdyBrain(seed),
    seed,
    bigBlind: 20,
    buyIn: 1000,
    humanSeat: -1, // no human: fully autonomous
    seats,
    bots: Array.from({ length: seats }, (_, i) => ({ name: `Bot ${i}`, profile: P })),
  })
}

describe('the poker engine', () => {
  it('conserves chips across many autonomous hands', () => {
    const game = newGame(7, 5)
    const startTotal = game.seats.reduce((a, s) => a + s.stack, 0)
    for (let h = 0; h < 300; h++) {
      const playing = game.seats.filter((s) => s.stack > 0).length
      if (playing < 2) break
      game.startHand()
      game.playOut()
      // No chip is ever created or destroyed: stacks + nothing == the start.
      const total = game.seats.reduce((a, s) => a + s.stack, 0)
      expect(total).toBe(startTotal)
      // The pot is fully distributed — no stranded chips.
      const inStacks = game.seats.reduce((a, s) => a + s.stack, 0)
      expect(inStacks).toBe(startTotal)
    }
  })

  it('awards a walk to the last player standing when everyone folds', () => {
    const foldBrain: BotBrain = (_g, _s, opt) => (opt.canCheck ? { kind: 'check' } : { kind: 'fold' })
    const game = new PokerGame({
      variant: HOLDEM,
      ranker,
      brain: foldBrain,
      seed: 3,
      bigBlind: 20,
      buyIn: 1000,
      humanSeat: -1,
      seats: 4,
      bots: Array.from({ length: 4 }, (_, i) => ({ name: `Bot ${i}`, profile: P })),
    })
    const total = game.seats.reduce((a, s) => a + s.stack, 0)
    game.startHand()
    game.playOut()
    expect(game.seats.reduce((a, s) => a + s.stack, 0)).toBe(total)
    // Exactly one seat should have gained (the big blind, winning the small blind).
    const winners = game.seats.filter((s) => s.stack > 1000)
    expect(winners.length).toBe(1)
    expect(winners[0].stack).toBe(1010) // won the 10 small blind
  })

  it('reaches a showdown and names a hand', () => {
    const callBrain: BotBrain = (_g, _s, opt) => (opt.canCheck ? { kind: 'check' } : { kind: 'call' })
    const game = new PokerGame({
      variant: HOLDEM,
      ranker,
      brain: callBrain,
      seed: 11,
      humanSeat: -1,
      seats: 3,
      bots: Array.from({ length: 3 }, (_, i) => ({ name: `Bot ${i}`, profile: P })),
    })
    game.startHand()
    game.playOut()
    // Everyone called to the river, so at least two hands were shown and scored.
    const shown = game.seats.filter((s) => s.showdown)
    expect(shown.length).toBeGreaterThanOrEqual(2)
    expect(shown[0].showdown!.best.length).toBeGreaterThan(0)
    // Five community cards were dealt.
    expect(game.board.length).toBe(5)
  })

  it('never lets a seat wager more than its stack', () => {
    const game = newGame(99, 6)
    for (let h = 0; h < 200; h++) {
      if (game.seats.filter((s) => s.stack > 0).length < 2) break
      game.startHand()
      game.playOut()
      for (const s of game.seats) expect(s.stack).toBeGreaterThanOrEqual(0)
    }
  })

  it('replays identically from a seed', () => {
    const run = () => {
      const g = newGame(42, 5)
      for (let h = 0; h < 40; h++) {
        if (g.seats.filter((s) => s.stack > 0).length < 2) break
        g.startHand()
        g.playOut()
      }
      return g.seats.map((s) => s.stack)
    }
    expect(run()).toEqual(run())
  })
})
