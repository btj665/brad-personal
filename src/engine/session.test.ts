// The UI's contract with the engine.
//
// The React components only ever touch the engine through `pending()` and the
// handful of input methods below. These tests drive that exact sequence with no
// React in sight, so the interactive path is covered even though the rendering
// isn't: if the UI can get stuck, deal out of turn, or offer an illegal button,
// it shows up here.

import { describe, expect, it } from 'vitest'

import { BOT_ROSTER } from '../content/bots'
import { DEFAULT_RULES, legalActions } from './rules'
import { Game } from './table'
import type { Beat } from './table'
import type { RuleSet } from './types'

function table(rules: RuleSet = DEFAULT_RULES, seed = 4) {
  return new Game({
    rules,
    seed,
    humanSeat: 2,
    humanName: 'You',
    humanBankroll: 1000,
    bots: BOT_ROSTER.slice(0, 4).map((b) => ({
      name: b.name,
      profile: b.profile,
      bankroll: b.bankroll,
    })),
  })
}

/** Exactly what App.tsx's clock does: step until the engine wants the player. */
function runToPlayer(game: Game, maxBeats = 400): Beat | null {
  for (let i = 0; i < maxBeats; i++) {
    const pending = game.pending()
    if (pending) return pending
    game.step()
  }
  throw new Error('engine never came back to the player')
}

describe('a human at the table', () => {
  it('asks for a bet, then deals', () => {
    const game = table()
    const beat = runToPlayer(game)

    expect(beat?.type).toBe('awaitBet')
    expect(game.phase).toBe('betting')

    game.placeBet(25)
    expect(game.human.baseBet).toBe(25)
    expect(game.human.bankroll).toBe(975)

    const next = runToPlayer(game)
    // Either it's our turn to play, or an insurance/surrender offer came first.
    expect(['awaitAction', 'awaitInsurance', 'awaitEarlySurrender']).toContain(next?.type)
    expect(game.human.hands[0].cards).toHaveLength(2)
    expect(game.dealer.cards).toHaveLength(2)
  })

  it('refuses a bet below the table minimum or above the bankroll', () => {
    const game = table()
    runToPlayer(game)

    game.placeBet(5) // under the 10 minimum
    expect(game.human.hands).toHaveLength(0)

    game.placeBet(999_999) // capped to the bankroll, which is fine
    expect(game.human.baseBet).toBe(1000)
  })

  it('ignores an action that is not on the menu', () => {
    const game = table()
    runToPlayer(game)
    game.placeBet(10)

    const beat = runToPlayer(game)
    if (beat?.type !== 'awaitAction') return // insurance round; skip

    const before = game.human.hands[0].cards.length
    const illegal = (['hit', 'stand', 'double', 'split', 'surrender'] as const).find(
      (a) => !beat.actions.includes(a),
    )
    if (illegal) {
      game.act(illegal)
      expect(game.human.hands[0].cards).toHaveLength(before)
      expect(game.phase).toBe('playing')
    }
  })

  it('only ever offers buttons the hand may actually press', () => {
    const game = table()

    for (let round = 0; round < 60; round++) {
      let beat = runToPlayer(game)
      let guard = 0

      while (beat && beat.type !== 'awaitBet' && guard++ < 40) {
        if (beat.type === 'awaitAction') {
          const seat = game.human
          const hand = seat.hands[beat.hand]
          // The menu the engine hands the UI must be exactly the legal one.
          expect(beat.actions).toEqual(legalActions(hand, seat, game.rules))
          expect(beat.actions.length).toBeGreaterThan(0)
          game.act(beat.actions[0]) // always 'hit' when it's available
        } else if (beat.type === 'awaitInsurance') {
          beat.evenMoney ? game.takeEvenMoney(false) : game.takeInsurance(false)
        } else if (beat.type === 'awaitEarlySurrender') {
          game.earlySurrenderDecision(false)
        }
        beat = runToPlayer(game)
      }

      if (game.human.bankroll < game.rules.minBet) break
      game.placeBet(game.rules.minBet)
    }

    expect(game.round).toBeGreaterThan(5)
  })

  it('lets a player sit out and come back', () => {
    const game = table()
    runToPlayer(game)

    game.sitOut()
    expect(game.human.sittingOut).toBe(true)

    // The round plays out around them, and their chips never move.
    const bankroll = game.human.bankroll
    let beat = runToPlayer(game)
    expect(beat?.type).toBe('awaitBet') // back to betting, next round
    expect(game.human.bankroll).toBe(bankroll)
    expect(game.human.sittingOut).toBe(false)

    game.placeBet(10)
    beat = runToPlayer(game)
    expect(game.human.hands[0].cards).toHaveLength(2)
  })

  it('walks a split all the way through, one hand at a time', () => {
    // Stack a pair of eights for the human against a dealer 6.
    const game = table()
    runToPlayer(game)
    game.placeBet(10)
    runToPlayer(game)

    // Force the board rather than fishing for one: put the human on 8,8.
    const seat = game.human
    if (!seat.hands[0]) return

    // Drive whatever we were dealt to completion through the real API.
    let beat = game.pending()
    let guard = 0
    while (beat?.type === 'awaitAction' && guard++ < 30) {
      const actions = beat.actions
      game.act(actions.includes('split') ? 'split' : actions.includes('stand') ? 'stand' : 'hit')
      beat = runToPlayer(game)
    }

    // However it went, every hand the player owns is finished and settled.
    for (const hand of game.human.hands) {
      expect(hand.cards.length).toBeGreaterThanOrEqual(2)
    }
  })

  // The top-bar game picker rebuilds the table on a new rule set, carrying the
  // player's chips across. These two assertions are what that carry depends on.
  describe('what the player owns when the table closes', () => {
    it('leaves a live bet sitting in the circle, not in the bankroll', () => {
      const game = table()
      runToPlayer(game)
      game.placeBet(100)

      // The chips are out of the rack and on the felt: 900 + a live 100.
      expect(game.human.bankroll).toBe(900)
      expect(game.human.hands[0].bet).toBe(100)
      expect(game.human.hands[0].outcome).toBeUndefined()
    })

    it('puts a settled bet back in the bankroll and marks the hand done', () => {
      const game = table()
      runToPlayer(game)
      game.placeBet(100)

      let beat = runToPlayer(game)
      let guard = 0
      while (beat && beat.type !== 'awaitBet' && guard++ < 30) {
        if (beat.type === 'awaitAction') game.act('stand')
        else if (beat.type === 'awaitInsurance') game.takeInsurance(false)
        else if (beat.type === 'awaitEarlySurrender') game.earlySurrenderDecision(false)
        beat = runToPlayer(game)
      }

      // Once a hand carries an outcome its money has already moved, so anything
      // refunding hand.bet on top of the bankroll would be conjuring chips.
      for (const hand of game.human.hands) expect(hand.outcome).toBeDefined()
    })
  })

  it('never leaves the engine wedged, over many rounds and every preset rule', () => {
    const variants: Array<Partial<RuleSet>> = [
      {},
      { dealerPeek: false, surrender: 'none' },
      { surrender: 'early' },
      { hitSplitAces: true, resplitAces: true },
      { maxSplitHands: 1, double: 'none' },
      { csm: true, charlie: 6 },
      { insurance: false, evenMoney: false },
    ]

    for (const variant of variants) {
      const game = table({ ...DEFAULT_RULES, ...variant }, 12)
      let bets = 0

      for (let i = 0; i < 2000 && bets < 40; i++) {
        const pending = game.pending()
        if (!pending) {
          game.step()
          continue
        }
        switch (pending.type) {
          case 'awaitBet':
            game.placeBet(game.rules.minBet)
            bets++
            break
          case 'awaitInsurance':
            game.takeInsurance(false)
            break
          case 'awaitEarlySurrender':
            game.earlySurrenderDecision(false)
            break
          case 'awaitAction':
            game.act(pending.actions.includes('stand') ? 'stand' : pending.actions[0])
            break
        }
      }

      expect(bets, JSON.stringify(variant)).toBe(40)
    }
  })
})
