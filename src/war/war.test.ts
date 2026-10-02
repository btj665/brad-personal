import { describe, expect, it } from 'vitest'

import { buildShoeCards } from '../engine/cards'
import type { Card, Rank, Suit } from '../engine/types'
import {
  BURN,
  compareCards,
  DECKS,
  HOUSE_EDGE,
  mainReturn,
  TIE_PAYS,
  warValue,
  WarGame,
  type WarOutcome,
} from './engine'

let uid = 0
function c(spec: string): Card {
  const suit = spec.slice(-1).toUpperCase() as Suit
  const rank = spec.slice(0, -1) as Rank
  return { uid: uid++, rank, suit }
}
const h = (s: string) => s.split(' ').map(c)

/** Set the next cards off the shoe, padded out to a full six decks so `deal`
 *  doesn't hit the cut card and reshuffle the stack away. */
function stack(g: WarGame, specs: string): void {
  const top = h(specs)
  const filler = buildShoeCards(DECKS).slice(0, DECKS * 52 - top.length)
  g.shoe = [...filler, ...[...top].reverse()] // draw() pops off the end
}

function game(bet = 10, tieBet = 0): WarGame {
  const g = new WarGame({ seed: 5, bankroll: 1000, bet })
  g.setTieBet(tieBet)
  return g
}

describe('ranking', () => {
  it('is ace high and ignores suit entirely', () => {
    expect(warValue('A')).toBeGreaterThan(warValue('K'))
    expect(warValue('K')).toBeGreaterThan(warValue('Q'))
    expect(warValue('2')).toBeLessThan(warValue('3'))
    expect(compareCards(c('As'), c('Ac'))).toBe(0)
    expect(compareCards(c('2s'), c('2h'))).toBe(0)
    // A♣ beats K♠: no suit hierarchy anywhere in this game.
    expect(compareCards(c('Ac'), c('Ks'))).toBeGreaterThan(0)
  })
})

describe('payouts by name', () => {
  it('pays the main bet 1:1 on a high card', () => {
    expect(mainReturn('win', 10, 0)).toBe(20)
  })

  it('returns nothing on a low card or a lost war', () => {
    expect(mainReturn('lose', 10, 0)).toBe(0)
    expect(mainReturn('warLose', 10, 10)).toBe(0)
  })

  it('gives back half the bet on a surrender', () => {
    expect(mainReturn('surrender', 10, 0)).toBe(5)
  })

  it('pays the raise 1:1 and pushes the original on a won war', () => {
    // Three units back on the two staked: net +1 unit.
    expect(mainReturn('warWin', 10, 10)).toBe(30)
  })
})

describe('a plain hand', () => {
  it('wins on the higher card', () => {
    const g = game()
    stack(g, 'Ks 7h')
    g.deal()
    expect(g.phase).toBe('settled')
    expect(g.hand!.outcome).toBe('win')
    expect(g.bankroll).toBe(1010)
  })

  it('loses on the lower card', () => {
    const g = game()
    stack(g, '7s Kh')
    g.deal()
    expect(g.hand!.outcome).toBe('lose')
    expect(g.bankroll).toBe(990)
  })
})

describe('the tie', () => {
  it('stops for the player instead of settling', () => {
    const g = game()
    stack(g, '9s 9h')
    g.deal()
    expect(g.phase).toBe('tie')
    expect(g.hand!.tied).toBe(true)
    expect(g.hand!.outcome).toBeNull()
    expect(g.bankroll).toBe(990) // only the original bet is out
  })

  it('surrenders for half the bet', () => {
    const g = game()
    stack(g, '9s 9h')
    g.deal()
    g.surrender()
    expect(g.hand!.outcome).toBe('surrender')
    expect(g.bankroll).toBe(995)
  })

  it('burns three and deals one more each on a war', () => {
    const g = game()
    stack(g, '9s 9h 2s 3s 4s Ks 7h')
    g.deal()
    g.goToWar()
    expect(g.hand!.burn).toHaveLength(BURN)
    expect(g.hand!.player).toHaveLength(2)
    expect(g.hand!.dealer).toHaveLength(2)
    expect(g.hand!.raise).toBe(10)
  })

  it('wins the war on a higher card, netting one unit on two at risk', () => {
    const g = game()
    stack(g, '9s 9h 2s 3s 4s Ks 7h')
    g.deal()
    g.goToWar()
    expect(g.hand!.outcome).toBe('warWin')
    expect(g.hand!.wagered).toBe(20)
    expect(g.hand!.returned).toBe(30)
    expect(g.bankroll).toBe(1010)
  })

  it('wins the war on an EQUAL card too — the one rule everyone gets wrong', () => {
    const g = game()
    stack(g, '9s 9h 2s 3s 4s Qs Qh')
    g.deal()
    g.goToWar()
    expect(g.hand!.outcome).toBe('warWin')
    expect(g.bankroll).toBe(1010) // still only +1 unit, not a push
  })

  it('loses both bets when the war card is lower', () => {
    const g = game()
    stack(g, '9s 9h 2s 3s 4s 5s Ah')
    g.deal()
    g.goToWar()
    expect(g.hand!.outcome).toBe('warLose')
    expect(g.bankroll).toBe(980)
  })

  it('refuses the war when the bankroll cannot cover the raise', () => {
    const g = new WarGame({ seed: 5, bankroll: 15, bet: 10 })
    stack(g, '9s 9h 2s 3s 4s Ks 7h')
    g.deal()
    expect(g.bankroll).toBe(5)
    expect(g.canGoToWar()).toBe(false)
    g.goToWar()
    expect(g.phase).toBe('tie') // nothing happened; surrender is the only way out
    g.surrender()
    expect(g.bankroll).toBe(10)
  })
})

describe('the Tie side bet', () => {
  it('pays 10:1 on the first two cards tying', () => {
    const g = game(10, 5)
    stack(g, '9s 9h')
    g.deal()
    expect(g.hand!.tieReturned).toBe(5 * (TIE_PAYS + 1))
    g.surrender() // 5 back on the main bet, 55 on the side bet
    expect(g.bankroll).toBe(1000 - 15 + 5 + 55)
  })

  it('pays even when the player then surrenders or loses the war', () => {
    const g = game(10, 5)
    stack(g, '9s 9h 2s 3s 4s 5s Ah')
    g.deal()
    g.goToWar()
    expect(g.hand!.outcome).toBe('warLose')
    expect(g.hand!.tieReturned).toBe(55)
    expect(g.bankroll).toBe(1000 - 25 + 0 + 55)
  })

  it('loses whenever the first two cards do not tie', () => {
    const g = game(10, 5)
    stack(g, 'Ks 7h')
    g.deal()
    expect(g.hand!.tieReturned).toBe(0)
    expect(g.bankroll).toBe(1000 - 15 + 20)
  })
})

describe('the shoe', () => {
  it('never reshuffles inside a hand', () => {
    const g = game()
    stack(g, '9s 9h 2s 3s 4s Ks 7h')
    // Wind the shoe down to just past the cut card, keeping the stacked top.
    g.shoe = g.shoe.slice(-80)
    const before = g.shoe.length
    g.deal()
    g.goToWar()
    expect(g.shoe.length).toBe(before - 7) // 2 + 3 burn + 2, no reshuffle
  })

  it('replays identically from a seed', () => {
    const a = new WarGame({ seed: 12345, bankroll: 100_000, bet: 10 })
    const b = new WarGame({ seed: 12345, bankroll: 100_000, bet: 10 })
    for (let i = 0; i < 500; i++) {
      a.playRound('war')
      b.playRound('war')
    }
    expect(a.bankroll).toBe(b.bankroll)
    expect(a.round).toBe(b.round)
  })
})

describe('accounting', () => {
  it('moves the bankroll by exactly -wagered + returned, every round', () => {
    const g = new WarGame({ seed: 777, bankroll: 1_000_000, bet: 10 })
    g.setTieBet(2)
    const seen = new Set<WarOutcome>()
    for (let i = 0; i < 600; i++) {
      const before = g.bankroll
      // Alternate the tie answer so both branches get audited.
      const r = g.playRound(i % 2 === 0 ? 'war' : 'surrender')!
      expect(g.bankroll).toBe(before - r.wagered + r.returned + r.tieReturned)
      seen.add(r.outcome!)
    }
    // Six hundred rounds at a 7.4% tie rate: every branch shows up.
    expect(seen).toEqual(new Set(['win', 'lose', 'surrender', 'warWin', 'warLose']))
  })
})

describe('the house edge', () => {
  // Six decks, 312 cards. Exact probabilities, so these are equalities and not
  // simulation targets.
  const tie1 = 23 / 311
  // After a tie two cards of one rank are gone, so that rank has 22 left and the
  // other twelve have 24. The three burn cards are unseen and change nothing.
  const tie2 = (22 * 21 + 12 * 24 * 23) / (310 * 309)

  it('costs 3.70% to surrender every tie', () => {
    expect(tie1 * 0.5).toBeCloseTo(HOUSE_EDGE.surrender, 4)
  })

  it('costs 2.88% to go to war on every tie', () => {
    // Going to war: win 1 unit on higher-or-equal, lose 2 otherwise.
    const warNet = (1 + tie2) / 2 - 2 * ((1 - tie2) / 2)
    expect(-tie1 * warNet).toBeCloseTo(HOUSE_EDGE.war, 4)
  })

  it('makes war the better of the two bad options', () => {
    expect(HOUSE_EDGE.war).toBeLessThan(HOUSE_EDGE.surrender)
  })

  it('costs 18.65% on the Tie side bet', () => {
    expect(1 - tie1 * (TIE_PAYS + 1)).toBeCloseTo(HOUSE_EDGE.tie, 4)
  })

  it('lands on the published war edge when actually dealt', () => {
    const g = new WarGame({ seed: 0xbadbeef, bankroll: 1e12, bet: 1 })
    const rounds = 300_000
    let wagered = 0
    let net = 0
    for (let i = 0; i < rounds; i++) {
      const r = g.playRound('war')!
      wagered += r.bet // the edge is quoted per original wager
      net += r.returned - r.wagered
    }
    expect(-net / wagered).toBeCloseTo(HOUSE_EDGE.war, 2)
  })

  it('lands on the published surrender edge when actually dealt', () => {
    const g = new WarGame({ seed: 0x5eed, bankroll: 1e12, bet: 1 })
    const rounds = 300_000
    let net = 0
    for (let i = 0; i < rounds; i++) {
      const r = g.playRound('surrender')!
      net += r.returned - r.wagered
    }
    expect(-net / rounds).toBeCloseTo(HOUSE_EDGE.surrender, 2)
  })
})
