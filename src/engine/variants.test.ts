// Free Bet Blackjack and Spanish 21.
//
// Both are rule sets on the same engine, not engines of their own, so what needs
// covering here is the accounting rather than the dealing: a free wager that gets
// counted twice, or returned on a push, or deducted from the bankroll, is
// invisible until the house edge comes out wrong three hundred thousand rounds
// later. Every payout below is written as an explicit bankroll arithmetic so the
// leak has nowhere to hide.

import { describe, expect, it } from 'vitest'

import { BOT_ROSTER } from '../content/bots'
import { presetById } from '../content/presets'
import { canRescue, evaluate, makeHand } from './hand'
import {
  DEFAULT_RULES,
  canDouble,
  canSplit,
  canSurrender,
  isFreeDouble,
  isFreeSplit,
  legalActions,
  spanishBonus,
  wagerUnit,
} from './rules'
import { makeRng } from './rng'
import { Shoe } from './shoe'
import { basicStrategy } from './strategy/basic'
import { botAction } from './strategy/bot'
import { Game } from './table'
import type { Action, Card, Hand, Rank, RuleSet, Seat, Suit } from './types'

// --- helpers ---------------------------------------------------------------

let uid = 0
function card(rank: Rank, suit: Suit = 'S'): Card {
  return { uid: uid++, rank, suit }
}

function hand(ranks: Rank[], opts: Partial<Hand> = {}): Hand {
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

/** A heads-up game against a stacked shoe. `order` is the order the cards come
 *  OUT of the shoe: player, dealer-up, player, dealer-hole, then every hit. */
function stacked(rules: RuleSet, order: Array<Rank | [Rank, Suit]>, opts: { auto?: boolean } = {}) {
  const game = new Game({
    rules,
    seed: 1,
    humanSeat: 0,
    humanBankroll: 1000,
    humanBot: opts.auto === false ? null : BOT_ROSTER[0].profile,
    bots: [],
  })
  game.shoe.cards = order
    .slice()
    .reverse()
    .map((spec) => (Array.isArray(spec) ? card(spec[0], spec[1]) : card(spec)))
  return game
}

/** Drive a heads-up game by hand, answering each prompt from a script. */
function play(game: Game, bet: number, script: string[]): void {
  game.runUntilInput()
  game.placeBet(bet)
  let guard = 0
  for (;;) {
    const beat = game.runUntilInput()
    if (beat.type === 'settle' || beat.type === 'roundOver' || beat.type === 'awaitBet') return
    if (guard++ > 40) throw new Error(`stuck on ${beat.type}`)
    if (beat.type === 'awaitInsurance') {
      beat.evenMoney ? game.takeEvenMoney(false) : game.takeInsurance(false)
    } else if (beat.type === 'awaitEarlySurrender') {
      game.earlySurrenderDecision(false)
    } else if (beat.type === 'awaitAction') {
      const next = script.shift()
      if (!next) throw new Error('script ran out')
      game.act(next as Action)
    }
  }
}

const FREE_BET = presetById('free-bet').rules
const SPANISH = presetById('spanish-21').rules

// ===========================================================================
// Free Bet Blackjack
// ===========================================================================

describe('Free Bet: which wagers the house pays for', () => {
  it('offers a free double on hard 9, 10 and 11 only', () => {
    expect(isFreeDouble(hand(['5', '4']), FREE_BET)).toBe(true)
    expect(isFreeDouble(hand(['5', '5']), FREE_BET)).toBe(true)
    expect(isFreeDouble(hand(['6', '5']), FREE_BET)).toBe(true)
    expect(isFreeDouble(hand(['5', '3']), FREE_BET)).toBe(false) // hard 8
    expect(isFreeDouble(hand(['10', '2']), FREE_BET)).toBe(false) // hard 12
  })

  it('never offers a free double on a soft total or a hand that has drawn', () => {
    // A,10 is 21 and A,9 is a soft 20 — neither is the hard 9-to-11 the sign says.
    expect(isFreeDouble(hand(['A', '9']), FREE_BET)).toBe(false)
    expect(isFreeDouble(hand(['A', '10']), FREE_BET)).toBe(false)
    // Hard 11 built from three cards pays for its own double.
    expect(isFreeDouble(hand(['4', '3', '4']), FREE_BET)).toBe(false)
  })

  it('offers a free split on every pair but ten-values', () => {
    expect(isFreeSplit(hand(['8', '8']), FREE_BET)).toBe(true)
    expect(isFreeSplit(hand(['A', 'A']), FREE_BET)).toBe(true)
    expect(isFreeSplit(hand(['10', '10']), FREE_BET)).toBe(false)
    expect(isFreeSplit(hand(['K', 'K']), FREE_BET)).toBe(false)
    expect(isFreeSplit(hand(['K', 'Q']), FREE_BET)).toBe(false)
    expect(isFreeSplit(hand(['9', '8']), FREE_BET)).toBe(false) // not a pair
  })

  it('is off entirely at an ordinary table', () => {
    expect(isFreeDouble(hand(['6', '5']), DEFAULT_RULES)).toBe(false)
    expect(isFreeSplit(hand(['8', '8']), DEFAULT_RULES)).toBe(false)
  })

  it('lets a broke player take a free double or split, and only a free one', () => {
    // Five chips left against a ten-chip hand: the house is putting these up.
    const broke = seat(5)
    broke.hands = [hand(['8', '8'])]
    expect(canSplit(broke.hands[0], broke, FREE_BET)).toBe(true)
    expect(canDouble(hand(['6', '5']), broke, FREE_BET)).toBe(true)
    // A ten-value pair is a paid split, so the empty rack does stop it.
    broke.hands = [hand(['K', 'K'])]
    expect(canSplit(broke.hands[0], broke, FREE_BET)).toBe(false)
    // And so does a paid double on a hard 12.
    expect(canDouble(hand(['10', '2']), broke, FREE_BET)).toBe(false)
  })
})

describe('Free Bet: the accounting on a free wager', () => {
  it('doubles for free without touching the bankroll, and pays both halves', () => {
    // 6,5 v 6: a free double. The double card is a 9 for 20; the dealer stands
    // on 17. The player risked 10 and is paid 20 — 10 of their own and 10 of the
    // house's.
    const game = stacked(FREE_BET, ['6', '6', '5', '10', '9', 'A'])
    game.playRound()

    const h = game.human.hands[0]
    expect(h.doubled).toBe(true)
    expect(h.bet).toBe(10) // the player's own stake never moved
    expect(h.freeBet).toBe(10)
    expect(evaluate(h.cards).total).toBe(20)
    expect(h.outcome).toBe('win')
    expect(h.returned).toBe(30) // 10 back, 10 won on it, 10 won on the free chip
    expect(game.human.bankroll).toBe(1000 - 10 + 30)
  })

  it('costs nothing when the free double loses', () => {
    // 6,5 v 10: free double into a 4 for 15. Dealer 10,7 stands on 17.
    const game = stacked(FREE_BET, ['6', '10', '5', '7', '4'])
    game.playRound()

    const h = game.human.hands[0]
    expect(h.freeBet).toBe(10)
    expect(h.outcome).toBe('lose')
    expect(h.returned).toBe(0)
    // Only the original ten is gone. The free chip cost nothing at all.
    expect(game.human.bankroll).toBe(990)
  })

  it('does NOT return the free chip on a push — the whole point of the rule', () => {
    // 6,5 v 10: free double into a 9 for 20. The dealer makes 20 as well.
    const game = stacked(FREE_BET, ['6', '10', '5', '10', '9'])
    game.playRound()

    const h = game.human.hands[0]
    expect(h.doubled).toBe(true)
    expect(h.freeBet).toBe(10)
    expect(evaluate(h.cards).total).toBe(20)
    expect(evaluate(game.dealer.cards).total).toBe(20)
    expect(h.outcome).toBe('push')
    // Ten of the player's own chips come back, and the free chip goes in the rack.
    // Returning it would hand the player 20 for a pushed hand.
    expect(h.returned).toBe(10)
    expect(game.human.bankroll).toBe(1000)
  })

  it('splits for free, putting the house behind the second hand only', () => {
    // 8,8 v 6: free split. Each half draws a ten for 18; the dealer makes 17.
    const game = stacked(FREE_BET, ['8', '6', '8', '10', '10', '10', 'A'])
    game.playRound()

    const [first, second] = game.human.hands
    expect(game.human.hands).toHaveLength(2)
    expect(first.bet).toBe(10)
    expect(first.freeBet).toBe(0)
    // The new hand carries no money of the player's at all.
    expect(second.bet).toBe(0)
    expect(second.freeBet).toBe(10)

    expect(first.returned).toBe(20) // stake back, matched
    expect(second.returned).toBe(10) // pure winnings on the house's chip
    expect(game.human.bankroll).toBe(1000 - 10 + 30)
  })

  it('never deducts a free split from the bankroll, however many times it splits', () => {
    // 8,8 v 6 → split; the first half draws another 8 and splits again.
    const game = stacked(FREE_BET, ['8', '6', '8', '10', '8', '10', '10', '10', 'A'])
    game.playRound()

    expect(game.human.hands.length).toBeGreaterThan(2)
    // Exactly one hand ever held the player's chips.
    const paid = game.human.hands.filter((h) => h.bet > 0)
    expect(paid).toHaveLength(1)
    expect(paid[0].bet).toBe(10)
    for (const h of game.human.hands) {
      if (h.bet === 0) expect(h.freeBet).toBe(10)
    }
  })

  it('sizes a later double off the free chip when the hand has no money of its own', () => {
    const free = makeHand('x', [card('6'), card('5')], 0, { freeBet: 25, fromSplit: true })
    expect(wagerUnit(free)).toBe(25)
    expect(wagerUnit(hand(['6', '5']))).toBe(10)
  })

  it('gives split aces one card each, free split or not', () => {
    const game = stacked(FREE_BET, ['A', '6', 'A', '10', '9', '8', 'A'])
    game.playRound()

    expect(game.human.hands).toHaveLength(2)
    for (const h of game.human.hands) {
      expect(h.cards).toHaveLength(2)
      expect(h.splitAces).toBe(true)
    }
  })
})

describe('Free Bet: the dealer 22', () => {
  it('pushes a free-doubled hand and pays the player nothing', () => {
    // Player free doubles 6,5 into a 9 for 20. Dealer 10,6 draws a 6 for 22.
    const game = stacked(FREE_BET, ['6', '10', '5', '6', '9', '6'])
    game.playRound()

    expect(evaluate(game.dealer.cards).total).toBe(22)
    expect(game.human.hands[0].outcome).toBe('push')
    expect(game.human.bankroll).toBe(1000)
  })

  it('still pays a player natural through it', () => {
    // A lone natural never makes the dealer draw, so a second seat holds the
    // dealer at it: seat 0 has A,K and seat 1 stands on 20.
    const game = new Game({
      rules: FREE_BET,
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
    expect(game.human.bankroll).toBe(1000 - 10 + 25)
    expect(game.seats[1].hands[0].outcome).toBe('push')
  })

  it('is an ordinary bust at 23 and over', () => {
    // Dealer 10,6 draws a 7 for 23.
    const game = stacked(FREE_BET, ['10', '10', '10', '6', '7'])
    game.playRound()
    expect(evaluate(game.dealer.cards).total).toBe(23)
    expect(game.human.hands[0].outcome).toBe('win')
  })
})

describe('Free Bet: the strategy takes every free wager', () => {
  /** Straight through the bot, so this covers the path the simulator uses. */
  function decide(ranks: Rank[], up: Rank, rules: RuleSet = FREE_BET) {
    const s = seat(1000)
    const h = hand(ranks)
    s.hands = [h]
    return { hand: h, action: botAction(BOT_ROSTER[0].profile, h, card(up), s, { rules, trueCount: 0 }) }
  }

  it('free doubles hard 9, 10 and 11 against every upcard, ace included', () => {
    for (const up of ['2', '6', '9', '10', 'A'] as Rank[]) {
      expect(decide(['5', '4'], up).action, `9 v ${up}`).toBe('double')
      expect(decide(['6', '4'], up).action, `10 v ${up}`).toBe('double')
      expect(decide(['6', '5'], up).action, `11 v ${up}`).toBe('double')
    }
    // Against a ten the ordinary chart would hit a 9 and a 10.
    expect(decide(['5', '4'], '10', DEFAULT_RULES).action).toBe('hit')
    expect(decide(['6', '4'], '10', DEFAULT_RULES).action).toBe('hit')
  })

  it('free splits every pair but tens, including the ones a normal chart refuses', () => {
    for (const up of ['2', '6', '9', '10', 'A'] as Rank[]) {
      expect(decide(['4', '4'], up).action, `4,4 v ${up}`).toBe('split')
      expect(decide(['9', '9'], up).action, `9,9 v ${up}`).toBe('split')
      expect(decide(['2', '2'], up).action, `2,2 v ${up}`).toBe('split')
    }
    // 9,9 against a ten is a stand on the ordinary chart, and 4,4 a hit.
    expect(decide(['9', '9'], '10', DEFAULT_RULES).action).toBe('stand')
    expect(decide(['4', '4'], '10', DEFAULT_RULES).action).toBe('hit')
  })

  it('plays 5,5 as a free double on hard 10 rather than a free split', () => {
    expect(decide(['5', '5'], '6').action).toBe('double')
  })

  it('still refuses to split tens, free game or not', () => {
    for (const up of ['5', '6', '10'] as Rank[]) {
      expect(decide(['10', '10'], up).action).toBe('stand')
      expect(decide(['K', 'Q'], up).action).toBe('stand')
    }
  })

  it('hits the five stiffs the pushing 22 turns over, and no others', () => {
    // 12 v 4,5,6 and 13 v 2,3 flip from stand to hit; 14-16 do not.
    expect(decide(['10', '2'], '4').action).toBe('hit')
    expect(decide(['10', '2'], '6').action).toBe('hit')
    expect(decide(['10', '3'], '2').action).toBe('hit')
    expect(decide(['10', '3'], '3').action).toBe('hit')
    expect(decide(['10', '4'], '2').action).toBe('stand')
    expect(decide(['10', '6'], '6').action).toBe('stand')

    // At an ordinary table every one of those is a stand.
    expect(decide(['10', '2'], '4', DEFAULT_RULES).action).toBe('stand')
    expect(decide(['10', '3'], '2', DEFAULT_RULES).action).toBe('stand')
  })
})

// ===========================================================================
// Spanish 21
// ===========================================================================

describe('Spanish 21: the 48-card deck', () => {
  it('pulls every rank-10 card and leaves the jacks, queens and kings', () => {
    const shoe = new Shoe({ ...SPANISH, decks: 6, burnCard: false }, makeRng(5))
    expect(shoe.cardsRemaining).toBe(288)
    expect(shoe.cards.filter((c) => c.rank === '10')).toHaveLength(0)
    expect(shoe.cards.filter((c) => c.rank === 'J')).toHaveLength(24)
    expect(shoe.cards.filter((c) => c.rank === 'Q')).toHaveLength(24)
    expect(shoe.cards.filter((c) => c.rank === 'K')).toHaveLength(24)
    // Still 12 ten-values per deck rather than 16.
    expect(shoe.cards.filter((c) => ['J', 'Q', 'K'].includes(c.rank))).toHaveLength(72)
  })

  it('leaves the shared French deck alone', () => {
    const shoe = new Shoe({ ...DEFAULT_RULES, decks: 6, burnCard: false }, makeRng(5))
    expect(shoe.cardsRemaining).toBe(312)
    expect(shoe.cards.filter((c) => c.rank === '10')).toHaveLength(24)
  })

  it('measures the cut card against 48 cards a deck, not 52', () => {
    const shoe = new Shoe(
      { ...SPANISH, decks: 1, penetration: 0.5, burnCard: false },
      makeRng(3),
    )
    for (let i = 0; i < 23; i++) shoe.draw()
    expect(shoe.cutCardOut).toBe(false)
    shoe.draw() // the 24th card of 48
    expect(shoe.cutCardOut).toBe(true)
    // And so does the decks-remaining figure the counter divides by.
    expect(shoe.decksRemaining).toBe(0.5)
  })
})

describe('Spanish 21: any player 21 wins', () => {
  it('beats a dealer 21 instead of pushing it', () => {
    // Player 7,7,7 = 21. Dealer J,A = 21 on two cards is a natural, so use
    // 5,6,J for a dealer 21 that is not.
    const game = stacked(SPANISH, ['7', '5', '7', '6', '7', 'J'], { auto: false })
    play(game, 10, ['hit', 'stand'])

    expect(evaluate(game.human.hands[0].cards).total).toBe(21)
    expect(evaluate(game.dealer.cards).total).toBe(21)
    expect(game.human.hands[0].outcome).toBe('win')
  })

  it('pays a player natural in full against a dealer natural', () => {
    const game = stacked(SPANISH, ['A', 'A', 'K', 'K'])
    game.playRound()

    expect(evaluate(game.dealer.cards).total).toBe(21)
    expect(game.human.hands[0].outcome).toBe('blackjack')
    expect(game.human.bankroll).toBe(1000 - 10 + 25) // 3:2, not a push
  })

  it('pushes both of those at an ordinary table', () => {
    const game = stacked({ ...SPANISH, player21Wins: false }, ['A', 'A', 'K', 'K'])
    game.playRound()
    expect(game.human.hands[0].outcome).toBe('push')
    expect(game.human.bankroll).toBe(1000)
  })

  it('wins a 21 through a dealer blackjack, which would otherwise take it', () => {
    // The dealer peeks and has A,K. The player's three-card 21 never gets to
    // act, so this is the two-card case: 10,J would be 20. Give the player a
    // natural instead and check the non-natural 21 path directly at settlement.
    const game = stacked({ ...SPANISH, dealerPeek: false, surrender: 'none' }, [
      '5', 'A', '7', '9', 'K',
    ], { auto: false })
    play(game, 10, ['hit', 'stand'])

    expect(evaluate(game.human.hands[0].cards).total).toBe(21)
    expect(evaluate(game.dealer.cards).total).toBe(21)
    expect(game.dealer.cards).toHaveLength(2) // a dealer natural
    expect(game.human.hands[0].outcome).toBe('win')
    expect(game.human.bankroll).toBe(1000 - 10 + 20)
  })
})

describe('Spanish 21: the bonus ladder', () => {
  const bonus = (ranks: Array<Rank | [Rank, Suit]>, opts: Partial<Hand> = {}) =>
    spanishBonus(
      makeHand('t', ranks.map((s) => (Array.isArray(s) ? card(s[0], s[1]) : card(s))), 10, opts),
      SPANISH,
    )

  it('pays a five-card 21 at 3:2', () => {
    expect(bonus(['2', '3', '4', '5', '7'])).toEqual({ name: 'five-card 21', pay: [3, 2] })
  })

  it('pays a six-card 21 at 2:1', () => {
    expect(bonus(['2', '2', '3', '4', '5', '5'])).toEqual({ name: 'six-card 21', pay: [2, 1] })
  })

  it('pays a seven-card 21 at 3:1, and anything longer the same', () => {
    expect(bonus(['2', '2', '2', '3', '3', '4', '5'])).toEqual({
      name: 'seven-card 21',
      pay: [3, 1],
    })
    expect(bonus(['A', '2', '2', '2', '2', '2', '3', '7'])).toEqual({
      name: 'seven-card 21',
      pay: [3, 1],
    })
  })

  it('pays 6-7-8 by suit: mixed 3:2, suited 2:1, spades 3:1', () => {
    expect(bonus([['6', 'H'], ['7', 'D'], ['8', 'C']])).toEqual({ name: '6-7-8', pay: [3, 2] })
    expect(bonus([['6', 'H'], ['7', 'H'], ['8', 'H']])).toEqual({
      name: 'suited 6-7-8',
      pay: [2, 1],
    })
    expect(bonus([['6', 'S'], ['7', 'S'], ['8', 'S']])).toEqual({
      name: '6-7-8 of spades',
      pay: [3, 1],
    })
  })

  it('pays 7-7-7 by suit the same way, in any order', () => {
    expect(bonus([['7', 'H'], ['7', 'D'], ['7', 'C']])).toEqual({ name: '7-7-7', pay: [3, 2] })
    expect(bonus([['7', 'D'], ['7', 'D'], ['7', 'D']])).toEqual({
      name: 'suited 7-7-7',
      pay: [2, 1],
    })
    expect(bonus([['7', 'S'], ['7', 'S'], ['7', 'S']])).toEqual({
      name: '7-7-7 of spades',
      pay: [3, 1],
    })
    // Order on the felt is whatever the shoe gave you.
    expect(bonus([['8', 'S'], ['6', 'S'], ['7', 'S']])?.pay).toEqual([3, 1])
  })

  it('pays nothing on a three or four-card 21 that is not one of the specials', () => {
    expect(bonus(['5', '6', 'J'])).toBe(null)
    expect(bonus(['2', '4', '6', '9'])).toBe(null)
  })

  it('pays nothing on a hand that is not 21', () => {
    expect(bonus(['2', '3', '4', '5', '6'])).toBe(null) // 20 on five cards
  })

  it('pays nothing on a doubled or split hand — the standard restriction', () => {
    expect(bonus(['2', '3', '4', '5', '7'], { doubled: true })).toBe(null)
    expect(bonus(['2', '3', '4', '5', '7'], { fromSplit: true })).toBe(null)
    expect(bonus([['7', 'S'], ['7', 'S'], ['7', 'S']], { fromSplit: true })).toBe(null)
  })

  it('pays nothing at a table that does not offer the ladder', () => {
    expect(
      spanishBonus(makeHand('t', ['2', '3', '4', '5', '7'].map((r) => card(r as Rank)), 10), {
        ...SPANISH,
        spanishBonuses: false,
      }),
    ).toBe(null)
  })

  it('settles a five-card 21 as even money plus the bonus on the base bet', () => {
    // 2,3 then 4,5,7 for 21 on five cards, against a dealer 20.
    const game = stacked(SPANISH, ['2', 'J', '3', 'Q', '4', '5', '7'], { auto: false })
    play(game, 10, ['hit', 'hit', 'hit'])

    const h = game.human.hands[0]
    expect(h.cards).toHaveLength(5)
    expect(evaluate(h.cards).total).toBe(21)
    expect(h.outcome).toBe('win')
    // 10 back, 10 for the win, 15 for the 3:2 bonus.
    expect(h.returned).toBe(35)
    expect(game.human.bankroll).toBe(1000 - 10 + 35)
  })

  it('settles 7-7-7 of spades at 3:1 on top of the win', () => {
    const order: Array<Rank | [Rank, Suit]> = [
      ['7', 'S'], ['J', 'H'], ['7', 'S'], ['Q', 'H'], ['7', 'S'],
    ]
    const game = stacked(SPANISH, order, { auto: false })
    play(game, 10, ['split', 'stand', 'stand'])
    // Splitting kills the bonus, so play it straight instead.
    const straight = stacked(SPANISH, order, { auto: false })
    play(straight, 10, ['hit'])

    const h = straight.human.hands[0]
    expect(h.cards).toHaveLength(3)
    expect(h.outcome).toBe('win')
    expect(h.returned).toBe(50) // 10 back, 10 won, 30 bonus
  })

  it('drops the bonus when the hand was split, even on a bonus shape', () => {
    const order: Array<Rank | [Rank, Suit]> = [
      ['7', 'S'], ['J', 'H'], ['7', 'S'], ['Q', 'H'], ['7', 'S'], ['7', 'S'],
    ]
    const game = stacked(SPANISH, order, { auto: false })
    play(game, 10, ['split', 'stand', 'stand'])

    for (const h of game.human.hands) {
      expect(h.fromSplit).toBe(true)
      expect(spanishBonus(h, SPANISH)).toBe(null)
    }
  })
})

describe('Spanish 21: doubling on any number of cards', () => {
  it('lets a three-card hand double, and only where the house allows it', () => {
    const s = seat()
    const three = hand(['4', '3', '4']) // hard 11 on three cards
    expect(canDouble(three, s, SPANISH)).toBe(true)
    expect(canDouble(three, s, DEFAULT_RULES)).toBe(false)
  })

  it('will not double a hand that has already doubled', () => {
    const s = seat()
    expect(canDouble(hand(['6', '5', '9'], { doubled: true }), s, SPANISH)).toBe(false)
  })

  it('takes exactly one card and stakes the original bet again', () => {
    // 4,3 v J: hit to 4,3,4 = 11, then double into a 9 for 20. Dealer stands 19.
    const game = stacked(SPANISH, ['4', 'J', '3', '9', '4', '9'], { auto: false })
    play(game, 10, ['hit', 'double', 'stand'])

    const h = game.human.hands[0]
    expect(h.doubled).toBe(true)
    expect(h.bet).toBe(20)
    expect(h.cards).toHaveLength(4)
    expect(evaluate(h.cards).total).toBe(20)
    expect(h.outcome).toBe('win')
    expect(game.human.bankroll).toBe(1000 - 20 + 40)
  })
})

describe('Spanish 21: double-down rescue', () => {
  it('keeps a doubled hand on the clock, offering only keep or hand back', () => {
    const s = seat()
    const doubled = hand(['9', '6', '2'], { doubled: true, bet: 20 })
    expect(canRescue(doubled, SPANISH)).toBe(true)
    expect(legalActions(doubled, s, SPANISH)).toEqual(['stand', 'surrender'])
    // No hit. A doubled hand takes no more cards, rescue or not.
    expect(legalActions(doubled, s, SPANISH)).not.toContain('hit')
  })

  it('is not offered where the house does not sell it', () => {
    const doubled = hand(['9', '6', '2'], { doubled: true, bet: 20 })
    expect(canRescue(doubled, DEFAULT_RULES)).toBe(false)
    expect(legalActions(doubled, seat(), DEFAULT_RULES)).toEqual([])
  })

  it('is not offered on a busted or 21 double, where it would be pointless', () => {
    expect(canRescue(hand(['9', '6', 'K'], { doubled: true }), SPANISH)).toBe(false)
    expect(canRescue(hand(['9', '6', '6'], { doubled: true }), SPANISH)).toBe(false)
  })

  it('is not offered on a free double, which has nothing at risk to rescue', () => {
    const free = makeHand('x', [card('6'), card('5'), card('4')], 10, {
      doubled: true,
      freeBet: 10,
    })
    expect(canRescue(free, { ...SPANISH, freeDouble: true })).toBe(false)
  })

  it('hands back the original bet and forfeits the doubled half', () => {
    // 9,6 v J: hit is what the chart wants, so double it by hand. The double card
    // is a 2 for 17 — a stiff-ish 17 against a jack, which the coarse rescue rule
    // buys back.
    const game = stacked(SPANISH, ['9', 'J', '4', '9', '2'], { auto: false })
    play(game, 10, ['double', 'surrender'])

    const h = game.human.hands[0]
    expect(h.doubled).toBe(true)
    expect(h.bet).toBe(20)
    expect(h.surrendered).toBe(true)
    expect(h.outcome).toBe('surrender')
    // 20 was staked; 10 comes back. The player is down the doubled half only.
    expect(h.returned).toBe(10)
    expect(game.human.bankroll).toBe(1000 - 20 + 10)
  })

  it('is the strategy play on a doubled stiff against a high card, not a low one', () => {
    const s = seat()
    const stiff = hand(['9', '4', '2'], { doubled: true, bet: 20 }) // hard 15
    s.hands = [stiff]
    expect(basicStrategy(stiff, card('K'), s, SPANISH)).toBe('surrender')
    expect(basicStrategy(stiff, card('A'), s, SPANISH)).toBe('surrender')
    expect(basicStrategy(stiff, card('5'), s, SPANISH)).toBe('stand')
    // A doubled 19 is never handed back.
    const made = hand(['9', '4', '6'], { doubled: true, bet: 20 })
    s.hands = [made]
    expect(basicStrategy(made, card('K'), s, SPANISH)).toBe('stand')
  })

  it('never leaves a bot with an illegal play on a doubled hand', () => {
    // The counter's deviations are all hit/stand/double/split, every one of which
    // is illegal on a doubled hand. Walk a Spanish table with all four styles.
    for (const character of BOT_ROSTER.slice(0, 4)) {
      const s = seat()
      for (const total of [12, 13, 14, 15, 16, 17, 19]) {
        const h = hand(['9', String(total - 9 - 2) as Rank, '2'], { doubled: true, bet: 20 })
        s.hands = [h]
        for (const up of ['2', '4', '6', '9', 'K', 'A'] as Rank[]) {
          for (const trueCount of [-4, 0, 4]) {
            const action = botAction(character.profile, h, card(up), s, {
              rules: SPANISH,
              trueCount,
            })
            expect(legalActions(h, s, SPANISH), `${character.name} ${total} v ${up}`).toContain(
              action,
            )
          }
        }
      }
    }
  })
})

describe('Spanish 21: surrender is still surrender', () => {
  it('is offered on two cards and refused on a natural', () => {
    expect(canSurrender(hand(['J', '6']), SPANISH)).toBe(true)
    expect(canSurrender(hand(['A', 'K']), SPANISH)).toBe(false)
    expect(canSurrender(hand(['J', '4', '2']), SPANISH)).toBe(false)
  })
})

// ===========================================================================
// The thing that actually matters
// ===========================================================================

describe('the bankroll only ever moves by -wagered + returned', () => {
  /** Play `rounds` and check the seat's chips against what the hands say happened.
   *  `hand.bet` is the player's own money and nothing else, so summing it is the
   *  whole debit; `hand.freeBet` must never appear in it. */
  function audit(rules: RuleSet, seed: number, rounds: number) {
    const game = new Game({
      rules,
      seed,
      humanSeat: 2,
      humanBankroll: 1_000_000,
      humanBot: BOT_ROSTER[0].profile,
      bots: BOT_ROSTER.slice(1, 5).map((b) => ({ ...b, bankroll: 1_000_000 })),
    })

    let freeBetsSeen = 0

    for (let i = 0; i < rounds; i++) {
      const before = game.seats.map((s) => s.bankroll)
      game.playRound()

      game.seats.forEach((s, index) => {
        if (s.hands.length === 0) {
          expect(s.bankroll, `seat ${index} sat out`).toBe(before[index])
          return
        }
        const wagered =
          s.hands.reduce((sum, h) => sum + h.bet, 0) + s.insurance
        const returned =
          s.hands.reduce((sum, h) => sum + (h.returned ?? 0), 0) + (s.insuranceReturned ?? 0)
        expect(s.bankroll, `seat ${index}, round ${i}`).toBe(before[index] - wagered + returned)

        for (const h of s.hands) {
          freeBetsSeen += h.freeBet > 0 ? 1 : 0
          expect(h.outcome, 'every hand settles').toBeDefined()
          // A pushed hand gets the player's own chips back and not one more.
          if (h.outcome === 'push') expect(h.returned).toBe(h.bet)
          // A free wager is never charged for.
          expect(h.freeBet).toBeGreaterThanOrEqual(0)
        }
      })
    }

    return freeBetsSeen
  }

  it('holds over 400 rounds of Free Bet, with free wagers all over the table', () => {
    const freeBets = audit(FREE_BET, 0xf3e, 400)
    // If this is zero the test proved nothing: the free wagers never happened.
    expect(freeBets).toBeGreaterThan(200)
  })

  it('holds over 400 rounds of Spanish 21, bonuses and rescues included', () => {
    audit(SPANISH, 0x21, 400)
  })

  it('holds for the reference game, unchanged', () => {
    audit(DEFAULT_RULES, 0xbeef, 200)
  })

  it('never lets a free wager leak into the bankroll on a push', () => {
    // The one leak that a house edge would hide: paying `bet + freeBet` on a
    // push. Over this many rounds a Free Bet table pushes thousands of hands.
    const game = new Game({
      rules: FREE_BET,
      seed: 0xabc,
      humanSeat: 0,
      humanBankroll: 1_000_000,
      humanBot: BOT_ROSTER[0].profile,
      bots: [],
    })
    let pushedFreeHands = 0
    for (let i = 0; i < 3000; i++) {
      game.playRound()
      for (const h of game.human.hands) {
        if (h.outcome === 'push' && h.freeBet > 0) {
          pushedFreeHands++
          expect(h.returned).toBe(h.bet)
        }
      }
    }
    expect(pushedFreeHands).toBeGreaterThan(50)
  })
})

describe('both variants run', () => {
  it('plays Free Bet for 500 rounds at a full table without stalling', () => {
    const game = new Game({
      rules: FREE_BET,
      seed: 7,
      humanSeat: 2,
      humanBankroll: 1_000_000,
      humanBot: BOT_ROSTER[0].profile,
      bots: BOT_ROSTER.slice(1, 5).map((b) => ({ ...b, bankroll: 1_000_000 })),
    })
    for (let i = 0; i < 500; i++) game.playRound()
    expect(game.round).toBe(500)
  })

  it('plays Spanish 21 for 500 rounds at a full table without stalling', () => {
    const game = new Game({
      rules: SPANISH,
      seed: 8,
      humanSeat: 2,
      humanBankroll: 1_000_000,
      humanBot: BOT_ROSTER[0].profile,
      bots: BOT_ROSTER.slice(1, 5).map((b) => ({ ...b, bankroll: 1_000_000 })),
    })
    for (let i = 0; i < 500; i++) game.playRound()
    expect(game.round).toBe(500)
  })

  it('replays both identically from the same seed', () => {
    for (const rules of [FREE_BET, SPANISH]) {
      const mk = () =>
        new Game({
          rules,
          seed: 4242,
          humanSeat: 0,
          humanBankroll: 100_000,
          humanBot: BOT_ROSTER[0].profile,
          bots: [],
        })
      const a = mk()
      const b = mk()
      for (let i = 0; i < 100; i++) {
        a.playRound()
        b.playRound()
      }
      expect(a.human.bankroll, rules.label).toBe(b.human.bankroll)
    }
  })

  it('never wedges the interactive path at either table', () => {
    for (const rules of [FREE_BET, SPANISH]) {
      const game = new Game({
        rules,
        seed: 31,
        humanSeat: 2,
        humanName: 'You',
        humanBankroll: 100_000,
        bots: BOT_ROSTER.slice(0, 4).map((b) => ({
          name: b.name,
          profile: b.profile,
          bankroll: b.bankroll,
        })),
      })
      let bets = 0
      for (let i = 0; i < 4000 && bets < 60; i++) {
        const pending = game.pending()
        if (!pending) {
          game.step()
          continue
        }
        switch (pending.type) {
          case 'awaitBet':
            game.placeBet(rules.minBet)
            bets++
            break
          case 'awaitInsurance':
            game.takeInsurance(false)
            break
          case 'awaitEarlySurrender':
            game.earlySurrenderDecision(false)
            break
          case 'awaitAction': {
            const seatNow = game.seats[pending.seat]
            const handNow = seatNow.hands[pending.hand]
            // The menu the engine offers must be exactly the legal one, on a
            // doubled rescue hand as much as anywhere else.
            expect(pending.actions).toEqual(legalActions(handNow, seatNow, game.rules))
            expect(pending.actions.length).toBeGreaterThan(0)
            game.act(pending.actions[0])
            break
          }
        }
      }
      expect(bets, rules.label).toBe(60)
    }
  })
})
