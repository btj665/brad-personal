import { describe, expect, it } from 'vitest'

import type { Card, Rank, Suit } from '../engine/types'
import { BaccaratGame, noWagers, type Beat } from './engine'
import {
  bankerDrawsAfterStand,
  bankerDrawsAgainstThird,
  cardPoints,
  DEFAULT_BACCARAT,
  isNatural,
  playerDraws,
  resolveCoup,
  tableauGrid,
  total,
} from './rules'
import type { BaccaratRules, Wagers } from './types'

let uid = 0
function c(spec: string): Card {
  const suit = spec.slice(-1).toUpperCase() as Suit
  const rank = spec.slice(0, -1) as Rank
  return { uid: uid++, rank, suit }
}
const h = (s: string) => s.split(' ').map(c)

/** Cards in dealing order — player, banker, player, banker, player's third,
 *  banker's third — reduced to the point values the tableau reads. */
const points = (spec: string) => h(spec).map((card) => cardPoints(card.rank))
const coup = (spec: string) => resolveCoup(points(spec))

/** A shoe that never reaches its cut card, so a test can stack it. */
const STACKED: BaccaratRules = { ...DEFAULT_BACCARAT, penetration: 1 }

/** Deal an exact set of cards and settle it. `spec` is in dealing order. */
function played(spec: string, wagers: Partial<Wagers> = { player: 10 }): BaccaratGame {
  const g = new BaccaratGame({ seed: 1, bankroll: 1000, rules: STACKED })
  Object.assign(g.wagers, wagers)
  g.deck = h(spec).reverse() // the engine deals off the end of the deck
  expect(g.deal()).toBe(true)
  g.playRound()
  return g
}

// The rank whose point value is v — a ten for 0, an ace for 1.
const RANK_OF: Record<number, string> = {
  0: '10', 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
}

describe('card values', () => {
  it('counts the ace as one and every ten-value card as nothing', () => {
    expect(cardPoints('A')).toBe(1)
    expect(cardPoints('10')).toBe(0)
    expect(cardPoints('J')).toBe(0)
    expect(cardPoints('Q')).toBe(0)
    expect(cardPoints('K')).toBe(0)
  })

  it('counts 2 through 9 at face value', () => {
    for (let v = 2; v <= 9; v++) expect(cardPoints(String(v) as Rank)).toBe(v)
  })

  it('totals modulo ten', () => {
    expect(total([7, 8])).toBe(5)
    expect(total([9, 9])).toBe(8)
    expect(total([5, 5])).toBe(0)
    expect(total([4, 3, 9])).toBe(6)
    expect(total([0, 0])).toBe(0)
  })

  it('calls a two-card 8 or 9 a natural and nothing else', () => {
    expect(isNatural(9)).toBe(true)
    expect(isNatural(8)).toBe(true)
    expect(isNatural(7)).toBe(false)
    expect(isNatural(0)).toBe(false)
  })
})

// ---------------------------------------------------------------- the tableau
//
// Every row asserted directly against the published drawing rules. This is the
// part of baccarat that gets implemented wrong, so it is spelled out cell by
// cell rather than derived from anything.

describe('the player’s row', () => {
  it('draws on 0 through 5', () => {
    for (let t = 0; t <= 5; t++) expect(playerDraws(t)).toBe(true)
  })
  it('stands on 6 and 7', () => {
    expect(playerDraws(6)).toBe(false)
    expect(playerDraws(7)).toBe(false)
  })
})

describe('the banker’s row when the player stood', () => {
  it('draws on 0 through 5 and stands on 6 and 7', () => {
    for (let t = 0; t <= 5; t++) expect(bankerDrawsAfterStand(t)).toBe(true)
    expect(bankerDrawsAfterStand(6)).toBe(false)
    expect(bankerDrawsAfterStand(7)).toBe(false)
  })
})

describe('the banker’s tableau against the player’s third card', () => {
  // Columns are the point value of the player's third card, 0 through 9.
  const ROWS: Record<number, string> = {
    0: 'DDDDDDDDDD',
    1: 'DDDDDDDDDD',
    2: 'DDDDDDDDDD',
    3: 'DDDDDDDDSD',
    4: 'SSDDDDDDSS',
    5: 'SSSSDDDDSS',
    6: 'SSSSSSDDSS',
    7: 'SSSSSSSSSS',
  }

  for (const [key, row] of Object.entries(ROWS)) {
    const bankerTotal = Number(key)
    it(`banker ${bankerTotal}: ${row}`, () => {
      for (let third = 0; third <= 9; third++) {
        expect(bankerDrawsAgainstThird(bankerTotal, third), `third = ${third}`).toBe(
          row[third] === 'D',
        )
      }
    })
  }

  it('reads a ten or a court as the zero column, not as a ten', () => {
    // Banker 4 stands against a 0 and draws against a 2 — a jack must land in
    // the first column, or the row shifts by one.
    expect(bankerDrawsAgainstThird(4, cardPoints('J'))).toBe(false)
    expect(bankerDrawsAgainstThird(3, cardPoints('K'))).toBe(true)
    expect(bankerDrawsAgainstThird(4, cardPoints('A'))).toBe(false)
    expect(bankerDrawsAgainstThird(4, cardPoints('2'))).toBe(true)
  })

  it('exposes the same grid for display', () => {
    const grid = tableauGrid()
    expect(grid).toHaveLength(8)
    grid.forEach((row, b) => {
      expect(row.map((d) => (d ? 'D' : 'S')).join('')).toBe(ROWS[b])
    })
  })
})

describe('the tableau walked with real cards', () => {
  it('stands both hands on a natural', () => {
    // Player A + 8 = 9. The banker's 7 never gets to draw.
    const r = coup('As Kh 8d 7c 5s 5h')
    expect(r.natural).toBe(true)
    expect(r.playerPoints).toHaveLength(2)
    expect(r.bankerPoints).toHaveLength(2)
    expect(r.playerTotal).toBe(9)
    expect(r.bankerTotal).toBe(7)
    expect(r.winner).toBe('player')
    expect(r.used).toBe(4)
  })

  it('stands both hands on a banker natural too', () => {
    const r = coup('2s 9h 3d 10c 5s 5h')
    expect(r.natural).toBe(true)
    expect(r.playerTotal).toBe(5)
    expect(r.bankerTotal).toBe(9)
    expect(r.winner).toBe('banker')
    expect(r.used).toBe(4)
  })

  it('lets the banker draw on 0–5 when the player stood', () => {
    // Player 2 + 4 = 6, stands. Banker 3 + 2 = 5, draws.
    const r = coup('2s 3h 4d 2c 9s')
    expect(r.playerPoints).toHaveLength(2)
    expect(r.bankerPoints).toHaveLength(3)
    expect(r.bankerTotal).toBe(4) // 5 + 9
    expect(r.winner).toBe('player')
    expect(r.used).toBe(5)
  })

  it('stands the banker on 6 and 7 when the player stood', () => {
    const r = coup('2s 3h 4d 4c 9s')
    expect(r.playerTotal).toBe(6)
    expect(r.bankerTotal).toBe(7)
    expect(r.bankerPoints).toHaveLength(2)
    expect(r.used).toBe(4)
  })

  it('takes the banker’s third card from the shoe after the player’s', () => {
    // Player 5 draws the 8s; the banker on 2 draws the very next card.
    const r = coup('2s Ah 3d As 8s 9h')
    expect(r.playerPoints).toEqual([2, 3, 8])
    expect(r.bankerPoints).toEqual([1, 1, 9])
    expect(r.used).toBe(6)
  })

  it('finds a tie', () => {
    // Player 5 draws an 8 for 3; the banker stands on 3 (his row stands vs an 8).
    const r = coup('2s Ah 3d 2c 8s 9h')
    expect(r.playerTotal).toBe(3)
    expect(r.bankerTotal).toBe(3)
    expect(r.bankerPoints).toHaveLength(2)
    expect(r.winner).toBe('tie')
  })

  // The whole 8 x 10 tableau again, this time through resolveCoup with cards
  // built to order: the player always draws, the banker's row is forced.
  for (let bankerTotal = 0; bankerTotal <= 7; bankerTotal++) {
    it(`draws or stands correctly on ${bankerTotal} against every third card`, () => {
      for (let third = 0; third <= 9; third++) {
        // Player 10 + J = 0, so he always draws; banker 10 + x = x.
        const spec = `10s 10d Jh ${RANK_OF[bankerTotal]}c ${RANK_OF[third]}s 9h`
        const r = coup(spec)
        expect(r.playerPoints).toHaveLength(3)
        expect(r.bankerPoints.length, `banker ${bankerTotal} vs ${third}`).toBe(
          bankerDrawsAgainstThird(bankerTotal, third) ? 3 : 2,
        )
      }
    })
  }
})

// ---------------------------------------------------------------- the table

describe('the payouts', () => {
  it('pays Player even money', () => {
    const g = played('9s 2h 10d 3c', { player: 10 })
    expect(g.lastResult!.winner).toBe('player')
    expect(g.lastResult!.returned.player).toBe(20)
    expect(g.bankroll).toBe(1010)
  })

  it('pays Banker even money less a 5% commission on the win', () => {
    const g = played('2s 9h 3d 10c', { banker: 100 })
    expect(g.lastResult!.winner).toBe('banker')
    expect(g.lastResult!.returned.banker).toBe(195) // stake back, plus 95 of 100
    expect(g.bankroll).toBe(1095)
  })

  it('pushes Player and Banker on a tie and pays the Tie bet 8:1', () => {
    const g = played('2s Ah 3d 2c 8s 9h', { player: 10, banker: 10, tie: 10 })
    const r = g.lastResult!
    expect(r.winner).toBe('tie')
    expect(r.returned.player).toBe(10)
    expect(r.returned.banker).toBe(10)
    expect(r.returned.tie).toBe(90)
    expect(g.bankroll).toBe(1000 - 30 + 110)
  })

  it('loses the Tie bet on a decision', () => {
    const g = played('9s 2h 10d 3c', { tie: 10 })
    expect(g.lastResult!.returned.tie).toBe(0)
    expect(g.bankroll).toBe(990)
  })

  it('pays either pair 11:1 off the first two cards of that side', () => {
    // Player 5-5, banker 7-7, dealt alternately.
    const g = played('5s 7h 5d 7c 2s Ah', { playerPair: 5, bankerPair: 5 })
    const r = g.lastResult!
    expect(r.playerPair).toBe(true)
    expect(r.bankerPair).toBe(true)
    expect(r.returned.playerPair).toBe(60)
    expect(r.returned.bankerPair).toBe(60)
  })

  it('does not pay a pair made by the third card', () => {
    // Player 2 then 3 then a second 2 — three cards holding a pair, no bet.
    const g = played('2s Ah 3d As 2h 9h', { playerPair: 5, bankerPair: 5 })
    expect(g.player.cards).toHaveLength(3)
    expect(g.lastResult!.playerPair).toBe(false)
    expect(g.lastResult!.returned.playerPair).toBe(0)
  })

  it('pays a pair even when that side loses the coup', () => {
    // Player K-K = 0, banker 4-5 = 9: a banker natural, and a losing player pair
    // bet still collects.
    const g = played('Ks 4h Kd 5c', { player: 10, playerPair: 10 })
    const r = g.lastResult!
    expect(r.winner).toBe('banker')
    expect(r.returned.player).toBe(0)
    expect(r.returned.playerPair).toBe(120)
  })

  it('pays a suited pair — same rank is all it asks', () => {
    const g = played('7s 2h 7s 3c 9s', { playerPair: 5 })
    expect(g.lastResult!.playerPair).toBe(true)
  })
})

describe('the deal as beats', () => {
  it('runs four cards, the peek, then the settlement', () => {
    const g = new BaccaratGame({ seed: 3, bankroll: 1000, rules: STACKED })
    g.wagers.player = 10
    g.deck = h('9s 2h 10d 3c').reverse()
    g.deal()

    const beats: Beat[] = []
    for (let i = 0; i < 7; i++) beats.push(g.step())
    expect(beats.map((b) => b.type)).toEqual([
      'card', 'card', 'card', 'card', 'natural', 'settle', 'roundOver',
    ])
    expect(beats.slice(0, 4).map((b) => (b.type === 'card' ? b.side : ''))).toEqual([
      'player', 'banker', 'player', 'banker',
    ])
    expect(g.phase).toBe('betting')
  })

  it('announces a stand and a third card in their own beats', () => {
    const g = new BaccaratGame({ seed: 3, bankroll: 1000, rules: STACKED })
    g.wagers.banker = 10
    // Player 6 stands; banker 5 draws.
    g.deck = h('2s 3h 4d 2c 9s').reverse()
    g.deal()
    const types: string[] = []
    for (let i = 0; i < 7; i++) types.push(g.step().type)
    expect(types).toEqual(['card', 'card', 'card', 'card', 'stand', 'card', 'settle'])
    expect(g.banker.cards).toHaveLength(3)
  })

  it('leaves the last coup on the felt while the next bets go down', () => {
    const g = played('9s 2h 10d 3c', { player: 10 })
    g.step() // roundOver
    expect(g.phase).toBe('betting')
    expect(g.player.cards).toHaveLength(2)
    expect(g.pending()).toEqual({ type: 'awaitBet' })
    expect(g.lastResult).not.toBeNull()
  })
})

describe('the layout', () => {
  const fresh = () => new BaccaratGame({ seed: 5, bankroll: 100 })

  it('stacks chips on a spot and takes them all back', () => {
    const g = fresh()
    g.setChip(25)
    g.place('banker')
    g.place('banker')
    expect(g.wagers.banker).toBe(50)
    expect(g.staked).toBe(50)
    g.removeBet('banker')
    expect(g.staked).toBe(0)
  })

  it('refuses chips the bankroll cannot cover', () => {
    const g = fresh()
    g.setChip(100)
    g.place('player')
    g.place('tie')
    expect(g.staked).toBe(100)
  })

  it('will not deal without the table minimum', () => {
    const g = fresh()
    expect(g.canDeal()).toBe(false)
    expect(g.deal()).toBe(false)
    g.place('tie')
    expect(g.canDeal()).toBe(true)
  })

  it('repeats the last coup’s chips', () => {
    const g = fresh()
    g.setChip(5)
    g.place('banker')
    g.place('bankerPair')
    g.deal()
    g.playRound()
    g.step() // roundOver
    expect(g.staked).toBe(0)
    g.rebet()
    expect(g.wagers).toEqual({ ...noWagers(), banker: 5, bankerPair: 5 })
  })

  it('locks the layout once the cards are out', () => {
    const g = fresh()
    g.place('player')
    g.deal()
    g.place('tie')
    g.clearBets()
    expect(g.wagers.tie).toBe(0)
    expect(g.wagers.player).toBe(5)
  })
})

// ---------------------------------------------------------------- the shoe

describe('the shoe', () => {
  function longRun(seed: number, rounds: number) {
    const g = new BaccaratGame({ seed, bankroll: 1e9 })
    let wagered = 0
    let returned = 0
    for (let i = 0; i < rounds; i++) {
      g.wagers = { player: 10, banker: 10, tie: 5, playerPair: 5, bankerPair: 5 }
      wagered += g.staked
      g.deal()
      g.finishRound()
      for (const v of Object.values(g.lastResult!.returned)) returned += v
    }
    return { g, wagered, returned }
  }

  it('moves the bankroll by exactly -wagered + returned', () => {
    const { g, wagered, returned } = longRun(0x5ace, 400)
    expect(g.bankroll).toBeCloseTo(1e9 - wagered + returned, 6)
  })

  it('deals a coup of four to six cards and reshuffles at the cut card', () => {
    const g = new BaccaratGame({ seed: 11, bankroll: 1e9 })
    let shuffles = 0
    for (let i = 0; i < 400; i++) {
      const before = g.deck.length
      g.wagers.player = 10
      g.deal()
      if (g.deck.length > before) shuffles++
      g.finishRound()
      const used = g.player.cards.length + g.banker.cards.length
      expect(used).toBeGreaterThanOrEqual(4)
      expect(used).toBeLessThanOrEqual(6)
    }
    expect(shuffles).toBeGreaterThan(3) // 400 coups is several 8-deck shoes
  })

  it('never draws the same physical card twice inside a shoe', () => {
    const g = new BaccaratGame({ seed: 12, bankroll: 1e9 })
    const seen = new Set<number>()
    for (let i = 0; i < 60; i++) {
      g.wagers.player = 10
      const before = g.deck.length
      g.deal()
      if (g.deck.length > before) seen.clear()
      g.finishRound()
      for (const card of [...g.player.cards, ...g.banker.cards]) {
        expect(seen.has(card.uid)).toBe(false)
        seen.add(card.uid)
      }
    }
  })

  it('replays exactly from its seed', () => {
    const a = longRun(0xbead, 60)
    const b = longRun(0xbead, 60)
    expect(a.g.results.map((r) => `${r.winner}${r.playerTotal}${r.bankerTotal}`)).toEqual(
      b.g.results.map((r) => `${r.winner}${r.playerTotal}${r.bankerTotal}`),
    )
    expect(a.g.bankroll).toBe(b.g.bankroll)
  })

  it('agrees with the reference tableau on every coup it deals', () => {
    // The engine deals a beat at a time; resolveCoup walks the same cards in one
    // pass. If the two ever disagree, one of them has drifted.
    const g = new BaccaratGame({ seed: 0xd1ce, bankroll: 1e9 })
    for (let i = 0; i < 800; i++) {
      g.wagers.banker = 10
      g.deal()
      g.playRound()
      const order = [
        g.player.cards[0], g.banker.cards[0], g.player.cards[1], g.banker.cards[1],
        g.player.cards[2], g.banker.cards[2],
      ].filter((card): card is Card => card !== undefined)
      // Pad so resolveCoup can look for a fifth or sixth card it will not use.
      const spec = [...order.map((card) => cardPoints(card.rank)), 0, 0]
      const r = resolveCoup(spec)
      expect(r.playerTotal).toBe(g.player.total)
      expect(r.bankerTotal).toBe(g.banker.total)
      expect(r.winner).toBe(g.winner)
      expect(r.used).toBe(order.length)
      g.step()
    }
  })
})
