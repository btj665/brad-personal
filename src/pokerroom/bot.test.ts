import { describe, expect, it } from 'vitest'

import { botTuning, pokerBrain, pokerDraw } from './bot'
import { PokerGame, type BotBrain } from './engine'
import { handOf } from './equity'
import { ranker } from './ranker'
import type { BotProfile, Options, Street } from './types'
import { HOLDEM } from './variants'

const TAG: BotProfile = { looseness: 0.4, aggression: 0.4, bluff: 0.08, quips: [] }

function botTable(seats: number, seed: number, brain?: BotBrain, profiles?: BotProfile[]): PokerGame {
  return new PokerGame({
    variant: HOLDEM,
    ranker,
    brain,
    botDraw: pokerDraw,
    seed,
    bigBlind: 20,
    buyIn: 1000,
    humanSeat: -1,
    seats,
    bots: Array.from({ length: seats }, (_, i) => ({ name: `B${i}`, profile: profiles?.[i] ?? TAG })),
  })
}

/** Hand the bot a hand-crafted spot: its hole cards, the board, the bet it faces,
 *  and the pot, then read back its action and the options it was given. */
function spot(hole: string, board: string, currentBet: number, pot: number, street: Street): { action: ReturnType<BotBrain>; opt: Options } {
  const g = botTable(3, 42)
  g.seats[0].cards = handOf(hole).map((c) => ({ card: c, faceUp: false }))
  g.seats[1].cards = handOf('9c8d').map((c) => ({ card: c, faceUp: false }))
  g.seats[0].streetCommitted = 0
  g.seats[0].canReopen = true
  g.currentBet = currentBet
  g.minRaise = 20
  g.pot = pot
  g.street = street
  g.board = board ? handOf(board) : []
  const opt = g.options(0)
  return { action: pokerBrain(g, g.seats[0], opt), opt }
}

describe('the bot — hand reading', () => {
  it('folds 72o preflop facing a raise', () => {
    expect(spot('7h2c', '', 60, 90, 'preflop').action.kind).toBe('fold')
  })

  it('plays aces — raises or re-raises', () => {
    expect(spot('AsAh', '', 60, 90, 'preflop').action.kind).toBe('raise')
  })

  it('never folds the nuts on the river', () => {
    // Broadway on a rainbow board — the stone nuts — against a pot-sized bet.
    const { action } = spot('10s10d', 'AdKcQsJh9c', 200, 600, 'river')
    expect(action.kind).not.toBe('fold')
  })

  it('folds when drawing dead to a big bet', () => {
    // No pair, no draw, worst kicker, board threatening a flush and a straight.
    expect(spot('3h4d', 'AsKsQsJs2h', 200, 600, 'river').action.kind).toBe('fold')
  })
})

describe('the bot — legality', () => {
  it('returns only legal actions across thousands of random spots', () => {
    const saved = { ...botTuning }
    botTuning.samples = 24
    botTuning.preflopSamples = 24
    try {
      let decisions = 0
      const audit: BotBrain = (g, s, opt) => {
        const a = pokerBrain(g, s, opt)
        decisions++
        if (a.kind === 'raise') expect(opt.canRaise).toBe(true)
        if (a.kind === 'bet') expect(opt.canBet).toBe(true)
        if (a.kind === 'check') expect(opt.canCheck).toBe(true)
        if (a.kind === 'bet' || a.kind === 'raise') {
          expect(a.to ?? -1).toBeGreaterThanOrEqual(opt.minTo)
          expect(a.to ?? Number.MAX_SAFE_INTEGER).toBeLessThanOrEqual(opt.maxTo)
        }
        return a
      }
      let seed = 1
      while (decisions < 2000) {
        const n = 3 + (seed % 4)
        const profiles = Array.from({ length: n }, (_, i) => ({
          looseness: ((seed * 7 + i * 13) % 100) / 100,
          aggression: ((seed * 11 + i * 5) % 100) / 100,
          bluff: ((seed * 3 + i) % 30) / 100,
          quips: [],
        }))
        const g = botTable(n, seed++, audit, profiles)
        for (let h = 0; h < 25 && g.seats.filter((x) => x.stack > 0).length >= 2; h++) {
          g.startHand()
          g.playOut()
        }
      }
      expect(decisions).toBeGreaterThanOrEqual(2000)
    } finally {
      Object.assign(botTuning, saved)
    }
  }, 60000)
})

describe('the bot — a full session', () => {
  it('conserves chips over 200 autonomous hands', () => {
    const saved = { ...botTuning }
    botTuning.samples = 40
    botTuning.preflopSamples = 40
    try {
      const g = botTable(5, 2024, pokerBrain, [
        { looseness: 0.2, aggression: 0.6, bluff: 0.05, quips: [] },
        { looseness: 0.6, aggression: 0.7, bluff: 0.15, quips: [] },
        { looseness: 0.3, aggression: 0.3, bluff: 0.03, quips: [] },
        { looseness: 0.5, aggression: 0.4, bluff: 0.1, quips: [] },
        { looseness: 0.4, aggression: 0.5, bluff: 0.08, quips: [] },
      ])
      const start = g.seats.reduce((a, s) => a + s.stack, 0)
      let hands = 0
      for (let h = 0; h < 200; h++) {
        if (g.seats.filter((s) => s.stack > 0).length < 2) break
        g.startHand()
        g.playOut()
        hands++
        expect(g.seats.reduce((a, s) => a + s.stack, 0)).toBe(start)
      }
      // The table actually played a real session, not a handful of walkovers.
      expect(hands).toBeGreaterThan(20)
    } finally {
      Object.assign(botTuning, saved)
    }
  }, 60000)
})

describe('the bot — the draw', () => {
  const drawFrom = (hand: string): number[] => {
    const g = botTable(2, 1)
    g.seats[0].cards = handOf(hand).map((c) => ({ card: c, faceUp: false }))
    return pokerDraw(g, g.seats[0])
  }

  it('stands pat on a made flush', () => {
    expect(drawFrom('As9s7s4s2s')).toEqual([])
  })

  it('stands pat on a made straight', () => {
    expect(drawFrom('5h6d7s8c9h')).toEqual([])
  })

  it('keeps a pair and draws three', () => {
    // Kings in the first two slots, junk after.
    expect(drawFrom('KsKd7c2h9s').sort()).toEqual([2, 3, 4])
  })

  it('keeps four to a flush and draws one', () => {
    expect(drawFrom('AsKs9s4s2h')).toEqual([4])
  })

  it('keeps only the high card from air', () => {
    // Ace-high nothing: hold the ace, pitch the other four.
    expect(drawFrom('AsKd9h5c2s').sort()).toEqual([1, 2, 3, 4])
  })
})
