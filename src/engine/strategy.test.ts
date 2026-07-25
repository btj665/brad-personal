import { describe, expect, it } from 'vitest'

import { BOT_ROSTER } from '../content/bots'
import { evaluate, makeHand } from './hand'
import { DEFAULT_RULES } from './rules'
import { basicStrategy } from './strategy/basic'
import { botAction, botInsurance } from './strategy/bot'
import { Counter, countDeviation, hiLo, shouldInsure } from './strategy/count'
import type { Card, Rank, RuleSet, Seat } from './types'

let uid = 0
const c = (rank: Rank): Card => ({ uid: uid++, rank, suit: 'S' })

function seat(bankroll = 10_000): Seat {
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

function play(ranks: Rank[], up: Rank, rules: RuleSet = DEFAULT_RULES) {
  const s = seat()
  const hand = makeHand('t', ranks.map(c), 10)
  s.hands = [hand]
  return basicStrategy(hand, c(up), s, rules)
}

const S17: RuleSet = { ...DEFAULT_RULES, dealerHitsSoft17: false }
const H17: RuleSet = { ...DEFAULT_RULES, dealerHitsSoft17: true }
const NO_SURRENDER: RuleSet = { ...S17, surrender: 'none' }
const NO_DAS: RuleSet = { ...S17, doubleAfterSplit: false }

// --- the chart itself ------------------------------------------------------

describe('basic strategy: hard totals', () => {
  it('always hits 8 and below', () => {
    for (const up of ['2', '6', '10', 'A'] as Rank[]) {
      expect(play(['5', '3'], up)).toBe('hit')
    }
  })

  it('doubles 9 against 3 through 6 only', () => {
    expect(play(['5', '4'], '2')).toBe('hit')
    expect(play(['5', '4'], '3')).toBe('double')
    expect(play(['5', '4'], '6')).toBe('double')
    expect(play(['5', '4'], '7')).toBe('hit')
  })

  it('doubles 10 against everything but a ten or an ace', () => {
    expect(play(['6', '4'], '9')).toBe('double')
    expect(play(['6', '4'], '10')).toBe('hit')
    expect(play(['6', '4'], 'A')).toBe('hit')
  })

  it('doubles 11 against a ten, and against an ace only under H17', () => {
    expect(play(['6', '5'], '10')).toBe('double')
    expect(play(['6', '5'], 'A', S17)).toBe('hit')
    expect(play(['6', '5'], 'A', H17)).toBe('double')
  })

  it('stands 12 against 4, 5 and 6 — and only those', () => {
    expect(play(['10', '2'], '2')).toBe('hit')
    expect(play(['10', '2'], '3')).toBe('hit')
    expect(play(['10', '2'], '4')).toBe('stand')
    expect(play(['10', '2'], '6')).toBe('stand')
    expect(play(['10', '2'], '7')).toBe('hit')
  })

  it('stands the stiffs against a bust card and hits them otherwise', () => {
    expect(play(['10', '3'], '6')).toBe('stand')
    expect(play(['10', '3'], '7')).toBe('hit')
    expect(play(['10', '6'], '2')).toBe('stand')
  })

  it('surrenders 16 against 9, 10 and an ace', () => {
    expect(play(['10', '6'], '9')).toBe('surrender')
    expect(play(['10', '6'], '10')).toBe('surrender')
    expect(play(['10', '6'], 'A')).toBe('surrender')
    expect(play(['10', '6'], '8')).toBe('hit')
  })

  it('surrenders 15 against a ten, and against an ace only under H17', () => {
    expect(play(['10', '5'], '10')).toBe('surrender')
    expect(play(['10', '5'], 'A', S17)).toBe('hit')
    expect(play(['10', '5'], 'A', H17)).toBe('surrender')
  })

  it('surrenders 17 against an ace under H17 — the one hand nobody expects', () => {
    expect(play(['10', '7'], 'A', S17)).toBe('stand')
    expect(play(['10', '7'], 'A', H17)).toBe('surrender')
  })

  it('falls back to hitting when the house has no surrender', () => {
    expect(play(['10', '6'], '10', NO_SURRENDER)).toBe('hit')
    expect(play(['10', '7'], 'A', { ...H17, surrender: 'none' })).toBe('stand')
  })

  it('never hits a hard 17 or better', () => {
    for (let total = 17; total <= 20; total++) {
      for (const up of ['2', '7', '10', 'A'] as Rank[]) {
        const action = play(['10', String(total - 10) as Rank], up, NO_SURRENDER)
        expect(action, `hard ${total} v ${up}`).toBe('stand')
      }
    }
  })
})

describe('basic strategy: soft totals', () => {
  it('doubles A,2 and A,3 against 5 and 6 only', () => {
    expect(play(['A', '2'], '4')).toBe('hit')
    expect(play(['A', '2'], '5')).toBe('double')
    expect(play(['A', '3'], '6')).toBe('double')
    expect(play(['A', '3'], '7')).toBe('hit')
  })

  it('doubles A,6 against 3 through 6', () => {
    expect(play(['A', '6'], '2')).toBe('hit')
    expect(play(['A', '6'], '3')).toBe('double')
    expect(play(['A', '6'], '6')).toBe('double')
  })

  it('plays soft 18 the way the chart says, which is not how most people play it', () => {
    expect(play(['A', '7'], '2', S17)).toBe('stand')
    expect(play(['A', '7'], '2', H17)).toBe('double')
    expect(play(['A', '7'], '3')).toBe('double')
    expect(play(['A', '7'], '7')).toBe('stand')
    expect(play(['A', '7'], '9')).toBe('hit') // yes, hit
    expect(play(['A', '7'], 'A')).toBe('hit')
  })

  it('stands soft 18 when it cannot double', () => {
    expect(play(['A', '7'], '3', { ...S17, double: 'none' })).toBe('stand')
  })

  it('doubles soft 19 against a 6 under H17, and stands otherwise', () => {
    expect(play(['A', '8'], '6', S17)).toBe('stand')
    expect(play(['A', '8'], '6', H17)).toBe('double')
    expect(play(['A', '8'], '5', H17)).toBe('stand')
  })

  it('always stands soft 20', () => {
    for (const up of ['2', '6', '10', 'A'] as Rank[]) expect(play(['A', '9'], up)).toBe('stand')
  })
})

describe('basic strategy: pairs', () => {
  it('always splits aces and eights', () => {
    for (const up of ['2', '6', '9', '10'] as Rank[]) {
      expect(play(['A', 'A'], up)).toBe('split')
      expect(play(['8', '8'], up)).toBe('split')
    }
  })

  it('surrenders 8,8 against an ace under H17, but splits it under S17', () => {
    expect(play(['8', '8'], 'A', S17)).toBe('split')
    expect(play(['8', '8'], 'A', H17)).toBe('surrender')
    expect(play(['8', '8'], 'A', { ...H17, surrender: 'none' })).toBe('split')
  })

  it('never splits tens or fives', () => {
    for (const up of ['2', '5', '6', '10'] as Rank[]) {
      expect(play(['10', '10'], up)).toBe('stand')
      expect(play(['K', 'Q'], up)).toBe('stand')
    }
    expect(play(['5', '5'], '6')).toBe('double') // it is a hard 10
    expect(play(['5', '5'], '10')).toBe('hit')
  })

  it('splits 9s against everything except 7, 10 and an ace', () => {
    expect(play(['9', '9'], '6')).toBe('split')
    expect(play(['9', '9'], '7')).toBe('stand')
    expect(play(['9', '9'], '9')).toBe('split')
    expect(play(['9', '9'], '10')).toBe('stand')
    expect(play(['9', '9'], 'A')).toBe('stand')
  })

  it('splits 7s against 2 through 7', () => {
    expect(play(['7', '7'], '7')).toBe('split')
    expect(play(['7', '7'], '8')).toBe('hit')
  })

  it('splits the marginal pairs only when the house allows double-after-split', () => {
    expect(play(['2', '2'], '2', S17)).toBe('split')
    expect(play(['2', '2'], '2', NO_DAS)).toBe('hit')
    expect(play(['4', '4'], '5', S17)).toBe('split')
    expect(play(['4', '4'], '5', NO_DAS)).toBe('hit')
    expect(play(['6', '6'], '2', S17)).toBe('split')
    expect(play(['6', '6'], '2', NO_DAS)).toBe('hit')
  })

  it('plays a pair as a plain total once the table maximum is reached', () => {
    const s = seat()
    const eights = makeHand('t', [c('8'), c('8')], 10)
    s.hands = [eights, eights, eights, eights] // four hands already
    // Hard 16 against a 10 with no more splits available: surrender.
    expect(basicStrategy(eights, c('10'), s, DEFAULT_RULES)).toBe('surrender')
    expect(basicStrategy(eights, c('10'), s, NO_SURRENDER)).toBe('hit')
  })
})

// --- the promise the bots make ---------------------------------------------

describe('the bots play like people you would sit next to', () => {
  const upcards: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A']

  /** Every two-card hand a player can be dealt. */
  function everyHand(): Rank[][] {
    const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10']
    const hands: Rank[][] = []
    for (const a of ranks) for (const b of ranks) hands.push([a, b])
    return hands
  }

  for (const character of BOT_ROSTER) {
    it(`${character.name} never makes a play that would annoy the table`, () => {
      for (const rules of [S17, H17, NO_SURRENDER, NO_DAS]) {
        for (const ranks of everyHand()) {
          for (const up of upcards) {
            for (const trueCount of [-4, 0, 4]) {
              const s = seat()
              const hand = makeHand('t', ranks.map(c), 10)
              s.hands = [hand]

              const action = botAction(character.profile, hand, c(up), s, { rules, trueCount })
              const { total, soft } = evaluate(hand.cards)
              const where = `${character.name}: ${ranks} v ${up} @ TC${trueCount}`

              // Nobody hits a hard 17 or better.
              if (!soft && total >= 17) expect(action, where).not.toBe('hit')
              // Nobody stands on 11 or less — it is a free card.
              if (total <= 11) expect(action, where).not.toBe('stand')
              // Nobody hits a soft 20 or 21.
              if (soft && total >= 20) expect(action, where).toBe('stand')
              // Nobody splits tens. Ever.
              if (total === 20 && !soft) expect(action, where).toBe('stand')
            }
          }
        }
      }
    })
  }

  it('only the counter ever takes insurance, and only at a rich count', () => {
    for (const character of BOT_ROSTER) {
      const counting = character.profile.style === 'counter'
      // Insurance is a losing bet at a neutral shoe, so nobody touches it.
      expect(botInsurance(character.profile, { rules: S17, trueCount: 0 })).toBe(false)
      // At +3 it turns positive, and only the player who knows that takes it.
      expect(botInsurance(character.profile, { rules: S17, trueCount: 3 })).toBe(counting)
    }
  })
})

// --- counting --------------------------------------------------------------

describe('Hi-Lo', () => {
  it('tags low cards +1, middles 0 and tens −1', () => {
    expect(hiLo(c('2'))).toBe(1)
    expect(hiLo(c('6'))).toBe(1)
    expect(hiLo(c('7'))).toBe(0)
    expect(hiLo(c('9'))).toBe(0)
    expect(hiLo(c('10'))).toBe(-1)
    expect(hiLo(c('K'))).toBe(-1)
    expect(hiLo(c('A'))).toBe(-1)
  })

  it('balances to zero over a whole deck', () => {
    const counter = new Counter()
    const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    for (let suit = 0; suit < 4; suit++) for (const r of ranks) counter.see(c(r))
    expect(counter.running).toBe(0)
  })

  it('divides the running count by the decks left to get the true count', () => {
    const counter = new Counter()
    counter.running = 12
    expect(counter.true(6)).toBe(2)
    expect(counter.true(3)).toBe(4)
  })

  it('takes insurance at a true count of +3', () => {
    expect(shouldInsure(2.9)).toBe(false)
    expect(shouldInsure(3)).toBe(true)
  })
})

describe('the Illustrious 18', () => {
  function deviate(ranks: Rank[], up: Rank, trueCount: number) {
    const s = seat()
    const hand = makeHand('t', ranks.map(c), 10)
    s.hands = [hand]
    return countDeviation(hand, c(up), trueCount, s, DEFAULT_RULES)
  }

  it('stands 16 against a ten once the shoe goes positive', () => {
    expect(deviate(['10', '6'], '10', -1)).toBe(null)
    expect(deviate(['10', '6'], '10', 0)).toBe('stand')
  })

  it('stands 12 against a 3 at +2, but not before', () => {
    expect(deviate(['10', '2'], '3', 1)).toBe(null)
    expect(deviate(['10', '2'], '3', 2)).toBe('stand')
  })

  it('hits 13 against a 2 when the shoe goes negative', () => {
    expect(deviate(['10', '3'], '2', 0)).toBe(null)
    expect(deviate(['10', '3'], '2', -1)).toBe('hit')
  })

  it('doubles 11 against an ace at +1', () => {
    expect(deviate(['6', '5'], 'A', 0)).toBe(null)
    expect(deviate(['6', '5'], 'A', 1)).toBe('double')
  })

  it('refuses to split tens at any count, correct though it would be', () => {
    // The textbook says split a pair of tens against a 5 or 6 at a high count.
    // These bots don't, on purpose: see the note in count.ts.
    for (const tc of [0, 4, 6, 10]) {
      expect(deviate(['10', '10'], '5', tc)).toBe(null)
      expect(deviate(['10', '10'], '6', tc)).toBe(null)
    }
  })

  it('will not double a hand that has already drawn', () => {
    expect(deviate(['6', '3', '2'], 'A', 5)).toBe(null) // 11 on three cards
  })
})
