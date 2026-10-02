import { describe, expect, it } from 'vitest'

import { BOT_ROSTER } from '../content/bots'
import { PRESETS, presetById } from '../content/presets'
import { evaluate, isBlackjack, isCharlie, isSplittable, makeHand } from './hand'
import { DEFAULT_RULES, canDouble, canSplit, canSurrender, legalActions } from './rules'
import { makeRng } from './rng'
import { Shoe } from './shoe'
import { Game } from './table'
import type { Card, Rank, RuleSet, Seat, Suit } from './types'

// --- helpers ---------------------------------------------------------------

let uid = 0
function card(rank: Rank, suit: Suit = 'S'): Card {
  return { uid: uid++, rank, suit }
}

function hand(ranks: Rank[], opts = {}) {
  return makeHand('t', ranks.map((r) => card(r)), 10, opts)
}

function seat(bankroll = 1000): Seat {
  return {
    index: 0,
    name: 'T',
    bot: null,
    bankroll,
    baseBet: 10,
    hands: [],
    insurance: 0,
    tookEvenMoney: false,
    insuranceDecided: false,
    earlySurrenderDecided: false,
    sittingOut: false,
    busted: false,
  }
}

/** A five-handed table of bots, so rounds play themselves. */
function autoGame(rules: RuleSet, seed: number) {
  return new Game({
    rules,
    seed,
    humanSeat: 2,
    humanBankroll: 1_000_000,
    humanBot: BOT_ROSTER[0].profile,
    bots: BOT_ROSTER.slice(1, 5).map((b) => ({ ...b, bankroll: 1_000_000 })),
  })
}

/** A heads-up game against a stacked shoe. `order` is the order the cards come
 *  OUT of the shoe, so you can write the board exactly as it will be dealt:
 *  player, dealer-up, player, dealer-hole, then every hit in sequence. */
function stacked(rules: RuleSet, order: Rank[], opts: { auto?: boolean } = {}) {
  const game = new Game({
    rules,
    seed: 1,
    humanSeat: 0,
    humanBankroll: 1000,
    humanBot: opts.auto === false ? null : BOT_ROSTER[0].profile,
    bots: [],
  })
  // The shoe draws with pop(), i.e. from the end of the array.
  game.shoe.cards = order
    .slice()
    .reverse()
    .map((r) => card(r))
  return game
}

// --- hand evaluation -------------------------------------------------------

describe('hand evaluation', () => {
  it('counts an ace as 11 until the hand would bust', () => {
    expect(evaluate([card('A'), card('9')])).toEqual({ total: 20, soft: true, busted: false })
    expect(evaluate([card('A'), card('9'), card('5')])).toEqual({
      total: 15,
      soft: false,
      busted: false,
    })
  })

  it('demotes only as many aces as it has to', () => {
    expect(evaluate([card('A'), card('A')])).toEqual({ total: 12, soft: true, busted: false })
    expect(evaluate([card('A'), card('A'), card('9')])).toEqual({
      total: 21,
      soft: true,
      busted: false,
    })
    expect(evaluate([card('A'), card('A'), card('A'), card('8')])).toEqual({
      total: 21,
      soft: true,
      busted: false,
    })
  })

  it('busts when it must', () => {
    expect(evaluate([card('K'), card('Q'), card('5')]).busted).toBe(true)
  })

  it('calls 21 on two cards a blackjack, but not 21 after a split', () => {
    expect(isBlackjack(hand(['A', 'K']))).toBe(true)
    expect(isBlackjack(hand(['A', 'K'], { fromSplit: true }))).toBe(false)
    expect(isBlackjack(hand(['7', '7', '7']))).toBe(false)
  })

  it('recognises a Charlie only when the house offers one', () => {
    const five = hand(['2', '2', '3', '4', '2']) // 13 on five cards
    expect(isCharlie(five, { ...DEFAULT_RULES, charlie: 5 })).toBe(true)
    expect(isCharlie(five, { ...DEFAULT_RULES, charlie: 6 })).toBe(false)
    expect(isCharlie(five, { ...DEFAULT_RULES, charlie: null })).toBe(false)
  })
})

// --- splitting -------------------------------------------------------------

describe('splitting', () => {
  it('splits identical ranks', () => {
    expect(isSplittable(hand(['8', '8']), DEFAULT_RULES)).toBe(true)
  })

  it('splits unlike tens only when the house allows it', () => {
    const kq = hand(['K', 'Q'])
    expect(isSplittable(kq, { ...DEFAULT_RULES, splitUnlikeTens: true })).toBe(true)
    expect(isSplittable(kq, { ...DEFAULT_RULES, splitUnlikeTens: false })).toBe(false)
  })

  it('stops at the table maximum', () => {
    const s = seat()
    s.hands = [hand(['8', '8']), hand(['8', '8']), hand(['8', '8']), hand(['8', '8'])]
    expect(canSplit(s.hands[0], s, DEFAULT_RULES)).toBe(false)
  })

  it('refuses to re-split aces unless the house allows it', () => {
    const s = seat()
    const aces = hand(['A', 'A'], { fromSplit: true, splitAces: true })
    s.hands = [aces]
    expect(canSplit(aces, s, { ...DEFAULT_RULES, resplitAces: false })).toBe(false)
    expect(canSplit(aces, s, { ...DEFAULT_RULES, resplitAces: true })).toBe(true)
  })

  it('will not split without the chips to back the new hand', () => {
    const s = seat(5)
    s.hands = [hand(['8', '8'])]
    expect(canSplit(s.hands[0], s, DEFAULT_RULES)).toBe(false)
  })
})

// --- doubling --------------------------------------------------------------

describe('doubling', () => {
  it('honours a 9-11 restriction, and treats soft hands as ineligible', () => {
    const rules: RuleSet = { ...DEFAULT_RULES, double: 'nine-eleven' }
    const s = seat()
    expect(canDouble(hand(['5', '5']), s, rules)).toBe(true) // hard 10
    expect(canDouble(hand(['4', '4']), s, rules)).toBe(false) // hard 8
    expect(canDouble(hand(['A', '9']), s, rules)).toBe(false) // soft 20
  })

  it('honours double-after-split', () => {
    const s = seat()
    const split = hand(['5', '5'], { fromSplit: true })
    expect(canDouble(split, s, { ...DEFAULT_RULES, doubleAfterSplit: true })).toBe(true)
    expect(canDouble(split, s, { ...DEFAULT_RULES, doubleAfterSplit: false })).toBe(false)
  })

  it('will not double a split ace unless the house allows it', () => {
    const s = seat()
    const ace = hand(['A', '5'], { fromSplit: true, splitAces: true })
    expect(canDouble(ace, s, DEFAULT_RULES)).toBe(false)
    expect(
      canDouble(ace, s, { ...DEFAULT_RULES, doubleOnSplitAces: true, hitSplitAces: true }),
    ).toBe(true)
  })

  it('will not double without the chips to match', () => {
    expect(canDouble(hand(['5', '6']), seat(5), DEFAULT_RULES)).toBe(false)
  })
})

// --- surrender -------------------------------------------------------------

describe('surrender', () => {
  it('is only offered on the first two cards', () => {
    expect(canSurrender(hand(['10', '6']), DEFAULT_RULES)).toBe(true)
    expect(canSurrender(hand(['10', '4', '2']), DEFAULT_RULES)).toBe(false)
  })

  it('is never offered on a natural', () => {
    expect(canSurrender(hand(['A', 'K']), DEFAULT_RULES)).toBe(false)
  })

  it('respects the after-split rule', () => {
    const split = hand(['10', '6'], { fromSplit: true })
    expect(canSurrender(split, DEFAULT_RULES)).toBe(false)
    expect(canSurrender(split, { ...DEFAULT_RULES, surrenderAfterSplit: true })).toBe(true)
  })
})

// --- legal actions ---------------------------------------------------------

describe('legal actions', () => {
  it('offers the full menu on a fresh pair', () => {
    const s = seat()
    const h = hand(['8', '8'])
    s.hands = [h]
    expect(legalActions(h, s, DEFAULT_RULES).sort()).toEqual(
      ['double', 'hit', 'split', 'stand', 'surrender'].sort(),
    )
  })

  it('offers nothing on a resolved hand', () => {
    const s = seat()
    expect(legalActions(hand(['K', 'Q', '5']), s, DEFAULT_RULES)).toEqual([]) // busted
    expect(legalActions(hand(['K', 'A']), s, DEFAULT_RULES)).toEqual([]) // 21
  })

  it('lets a frozen split ace stand or re-split, but never hit', () => {
    const rules: RuleSet = { ...DEFAULT_RULES, hitSplitAces: false, resplitAces: true }
    const s = seat()
    const aces = hand(['A', 'A'], { fromSplit: true, splitAces: true })
    s.hands = [aces]
    const actions = legalActions(aces, s, rules)
    expect(actions).toContain('split')
    expect(actions).toContain('stand')
    expect(actions).not.toContain('hit')
  })
})

// --- the shoe --------------------------------------------------------------

describe('the shoe', () => {
  it('holds 52 cards per deck, less the burn', () => {
    expect(new Shoe({ ...DEFAULT_RULES, decks: 6, burnCard: false }, makeRng(1)).cardsRemaining).toBe(
      312,
    )
    expect(new Shoe({ ...DEFAULT_RULES, decks: 6, burnCard: true }, makeRng(1)).cardsRemaining).toBe(
      311,
    )
  })

  it('gives every card a unique id, so a six-deck shoe holds six of each', () => {
    const shoe = new Shoe({ ...DEFAULT_RULES, decks: 6, burnCard: false }, makeRng(7))
    expect(new Set(shoe.cards.map((c) => c.uid)).size).toBe(312)
    expect(shoe.cards.filter((c) => c.rank === 'A' && c.suit === 'S')).toHaveLength(6)
  })

  it('flags the cut card at the penetration point', () => {
    const shoe = new Shoe(
      { ...DEFAULT_RULES, decks: 1, penetration: 0.5, burnCard: false },
      makeRng(3),
    )
    for (let i = 0; i < 25; i++) shoe.draw()
    expect(shoe.cutCardOut).toBe(false)
    shoe.draw() // the 26th card of 52
    expect(shoe.cutCardOut).toBe(true)
  })

  it('shuffles the same way from the same seed', () => {
    const a = new Shoe(DEFAULT_RULES, makeRng(42))
    const b = new Shoe(DEFAULT_RULES, makeRng(42))
    expect(a.cards.map((c) => c.uid)).toEqual(b.cards.map((c) => c.uid))
  })

  it('deals a single round from one shoe, however thin it gets', () => {
    // A one-deck shoe cut at 50% and five players will run the shoe down every
    // couple of rounds. No hand may ever end up short of cards.
    const game = autoGame({ ...DEFAULT_RULES, decks: 1, penetration: 0.5 }, 8)
    for (let i = 0; i < 60; i++) {
      game.playRound()
      for (const s of game.seats) {
        for (const h of s.hands) expect(h.cards.length).toBeGreaterThanOrEqual(2)
      }
    }
    expect(game.round).toBe(60)
  })
})

// --- payouts ---------------------------------------------------------------

describe('payouts', () => {
  it('pays a natural 3:2', () => {
    // Player A,K. Dealer 9,7 — the dealer never draws against a lone natural.
    const game = stacked(DEFAULT_RULES, ['A', '9', 'K', '7'])
    game.playRound()
    expect(game.human.hands[0].outcome).toBe('blackjack')
    expect(game.human.bankroll).toBe(1000 - 10 + 25) // 10 back, 15 won
  })

  it('pays a natural 6:5 when the felt says so', () => {
    const game = stacked({ ...DEFAULT_RULES, blackjackPayout: [6, 5] }, ['A', '9', 'K', '7'])
    game.playRound()
    expect(game.human.bankroll).toBe(1000 - 10 + 22) // 10 back, 12 won
  })

  it('pushes a natural against a dealer natural', () => {
    const game = stacked(DEFAULT_RULES, ['A', 'A', 'K', 'K'])
    game.playRound()
    expect(game.human.hands[0].outcome).toBe('push')
    expect(game.human.bankroll).toBe(1000)
  })

  it('returns half the bet on a surrender', () => {
    const game = stacked(DEFAULT_RULES, ['10', 'K', '6', '7']) // 16 v 10: surrender
    game.playRound()
    expect(game.human.hands[0].outcome).toBe('surrender')
    expect(game.human.bankroll).toBe(1000 - 10 + 5)
  })

  it('doubles the wager and takes exactly one card', () => {
    // 11 v 6: double. Dealer 6,10 draws a 9 and busts.
    const game = stacked(DEFAULT_RULES, ['5', '6', '6', '10', '10', '9'])
    game.playRound()
    const h = game.human.hands[0]
    expect(h.doubled).toBe(true)
    expect(h.bet).toBe(20)
    expect(h.cards).toHaveLength(3)
    expect(game.human.bankroll).toBe(1000 - 20 + 40)
  })

  it('splits into two independently-bet hands', () => {
    // 8,8 v 6: split. Each half draws a ten; the dealer busts.
    const game = stacked(DEFAULT_RULES, ['8', '6', '8', '10', '10', '10', '10'])
    game.playRound()
    expect(game.human.hands).toHaveLength(2)
    expect(game.human.hands.every((h) => h.cards.length === 2 && h.bet === 10)).toBe(true)
    expect(game.human.bankroll).toBe(1000 - 20 + 40)
  })

  it('pays a Charlie without reference to the dealer', () => {
    // 2,3 then 2,2,2 — five cards, unbusted, against a dealer 17.
    const game = stacked({ ...DEFAULT_RULES, charlie: 5 }, ['2', '10', '3', '7', '2', '2', '2'])
    game.playRound()
    const h = game.human.hands[0]
    expect(h.cards).toHaveLength(5)
    expect(h.outcome).toBe('charlie')
    expect(game.human.bankroll).toBe(1000 - 10 + 20)
  })

  it('stands on soft 17 under S17 and hits it under H17', () => {
    // Player 20. Dealer A,6 = soft 17, with a 4 waiting behind it.
    const board: Rank[] = ['10', 'A', '10', '6', '4']

    const s17 = stacked({ ...DEFAULT_RULES, dealerHitsSoft17: false }, board)
    s17.playRound()
    expect(s17.dealer.cards).toHaveLength(2)
    expect(s17.human.hands[0].outcome).toBe('win') // 20 beats 17

    const h17 = stacked({ ...DEFAULT_RULES, dealerHitsSoft17: true }, board)
    h17.playRound()
    expect(h17.dealer.cards).toHaveLength(3)
    expect(evaluate(h17.dealer.cards).total).toBe(21)
    expect(h17.human.hands[0].outcome).toBe('lose')
  })

  it('pushes a dealer 22 when the house plays that rule', () => {
    // Player stands on 20. Dealer 10,6 draws a 6 for 22.
    const board: Rank[] = ['10', '10', '10', '6', '6']

    const normal = stacked(DEFAULT_RULES, board)
    normal.playRound()
    expect(evaluate(normal.dealer.cards).total).toBe(22)
    expect(normal.human.hands[0].outcome).toBe('win') // an ordinary bust

    const push22 = stacked({ ...DEFAULT_RULES, dealerPush22: true }, board)
    push22.playRound()
    expect(push22.human.hands[0].outcome).toBe('push')
    expect(push22.human.bankroll).toBe(1000)
  })

  it('still pays a natural against a dealer 22, while the table pushes', () => {
    // A lone natural never makes the dealer draw, so this needs a second player
    // to keep the dealer working: seat 0 holds A,K and seat 1 stands on 20.
    // Dealer 10,6 draws a 6 for 22 — which pushes the 20 and pays the natural.
    const game = new Game({
      rules: { ...DEFAULT_RULES, dealerPush22: true },
      seed: 1,
      humanSeat: 0,
      humanBankroll: 1000,
      humanBot: BOT_ROSTER[0].profile,
      bots: [{ ...BOT_ROSTER[0], name: 'Other', bankroll: 1000 }],
    })
    const order: Rank[] = ['A', '10', '10', 'K', '10', '6', '6']
    game.shoe.cards = order
      .slice()
      .reverse()
      .map((r) => card(r))

    game.playRound()

    expect(evaluate(game.dealer.cards).total).toBe(22)
    expect(game.human.hands[0].outcome).toBe('blackjack')
    expect(game.seats[1].hands[0].outcome).toBe('push')
  })

  it('pays insurance 2:1 and still takes the hand', () => {
    // Player 10,6. Dealer A,K. Insurance exactly covers the loss — that is the
    // whole point of the bet, and why it is a bad one at a neutral count.
    const game = stacked(DEFAULT_RULES, ['10', 'A', '6', 'K'], { auto: false })

    expect(game.runUntilInput().type).toBe('awaitBet')
    game.placeBet(100)
    expect(game.runUntilInput().type).toBe('awaitInsurance')

    game.takeInsurance(true)
    game.runUntilInput()

    expect(game.human.hands[0].outcome).toBe('lose')
    expect(game.human.insuranceReturned).toBe(150) // 50 staked, paid 2:1
    expect(game.human.bankroll).toBe(1000) // -100 hand, -50 ins, +150 back
  })

  it('settles even money at 1:1 regardless of the hole card', () => {
    const game = stacked(DEFAULT_RULES, ['A', 'A', 'K', 'K'], { auto: false }) // both naturals

    game.runUntilInput()
    game.placeBet(100)
    const beat = game.runUntilInput()
    expect(beat.type).toBe('awaitInsurance')
    expect(beat.type === 'awaitInsurance' && beat.evenMoney).toBe(true)

    game.takeEvenMoney(true)
    game.runUntilInput()

    // Without even money this natural would have pushed against the dealer's.
    expect(game.human.bankroll).toBe(1100)
  })
})

// --- the European game -----------------------------------------------------

describe('no hole card', () => {
  const enhc: RuleSet = {
    ...DEFAULT_RULES,
    dealerPeek: false,
    surrender: 'none',
    originalBetsOnly: true,
  }

  it('leaves the dealer on one card until the players have finished', () => {
    const game = stacked(enhc, ['10', '10', '10', '5', '6'], { auto: false })
    game.runUntilInput()
    game.placeBet(10)
    game.runUntilInput()
    expect(game.phase).toBe('playing')
    expect(game.dealer.cards).toHaveLength(1)
  })

  it('takes only the original bet when the dealer draws a natural', () => {
    // Player doubles 11 into 20. The dealer then turns over a blackjack: under
    // original-bets-only the doubled half comes back.
    const game = stacked(enhc, ['5', '10', '6', '9', 'A'])
    game.playRound()

    expect(game.dealer.cards).toHaveLength(2)
    expect(evaluate(game.dealer.cards).total).toBe(21)
    expect(game.human.hands[0].doubled).toBe(true)
    expect(game.human.bankroll).toBe(990) // lost the original 10, got the 10 back
  })

  it('takes every wager when the house does not play original-bets-only', () => {
    const game = stacked({ ...enhc, originalBetsOnly: false }, ['5', '10', '6', '9', 'A'])
    game.playRound()
    expect(game.human.bankroll).toBe(980) // both halves of the doubled bet gone
  })

  it('still draws the second card against a lone player natural', () => {
    // The dealer has nothing to beat here — the player's natural is already
    // paid whatever the dealer makes. But the dealer must draw anyway, because
    // a dealer natural pushes it. Skipping the draw silently converts every one
    // of those pushes into a 3:2 win, and hands the player about a third of a
    // percent of the whole game.
    const game = stacked(enhc, ['A', 'A', 'K', 'K']) // player A,K — dealer A, then K
    game.playRound()

    expect(game.dealer.cards).toHaveLength(2)
    expect(game.human.hands[0].outcome).toBe('push')
    expect(game.human.bankroll).toBe(1000)
  })

  it('does not draw at all when every player has busted', () => {
    // Player hits 16 v 10 into a bust. There is nothing left to settle, so the
    // dealer never takes a second card.
    const game = stacked({ ...enhc, surrender: 'none' }, ['10', '10', '6', 'K'])
    game.playRound()

    expect(game.human.hands[0].outcome).toBe('bust')
    expect(game.dealer.cards).toHaveLength(1)
  })
})

// --- whole rounds ----------------------------------------------------------

describe('a full table', () => {
  it('plays a thousand rounds without stalling', () => {
    const game = autoGame(DEFAULT_RULES, 2024)
    for (let i = 0; i < 1000; i++) game.playRound()
    expect(game.round).toBe(1000)
  })

  it('replays identically from the same seed', () => {
    const a = autoGame(DEFAULT_RULES, 99)
    const b = autoGame(DEFAULT_RULES, 99)
    for (let i = 0; i < 50; i++) {
      a.playRound()
      b.playRound()
    }
    expect(a.seats.map((s) => s.bankroll)).toEqual(b.seats.map((s) => s.bankroll))
  })

  it('pays a round exactly once, however many times it is stepped', () => {
    const game = autoGame(DEFAULT_RULES, 17)
    let beat = game.step()
    while (beat.type !== 'settle') beat = game.step()

    const paid = game.seats.map((s) => s.bankroll)
    // The step that clears the table must not move a single chip.
    expect(game.step().type).toBe('roundOver')
    expect(game.seats.map((s) => s.bankroll)).toEqual(paid)
    expect(game.phase).toBe('betting')
  })

  it('plays every preset for a hundred rounds without throwing', () => {
    for (const preset of PRESETS) {
      const game = autoGame(preset.rules, 3)
      expect(() => {
        for (let i = 0; i < 100; i++) game.playRound()
      }, preset.id).not.toThrow()
    }
  })

  it('runs the European preset heads-up and hole-card-free', () => {
    const game = autoGame(presetById('european').rules, 4)
    for (let i = 0; i < 100; i++) game.playRound()
    expect(game.round).toBe(100)
  })
})
