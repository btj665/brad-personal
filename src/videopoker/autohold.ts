// Auto-hold: which cards make up the paying combination on the deal.
//
// This is the "don't throw away a winner" hold, not strategy. It keeps exactly
// the cards that form the paying category — the pair of jacks, the trips, all
// five of a flush — and nothing else. A low pair or four to a royal is not a
// *winner* yet, so this holds nothing on those; the solver's optimal hold
// (engine autoHold = 'optimal') is the one that plays draws.

import { rankValue } from '../poker/eval'
import type { Card } from '../engine/types'
import { classifyDeuces, classifyStandard, type Family } from './classify'

export function winningHold(cards: Card[], family: Family): boolean[] {
  return family === 'deuces' ? deucesHold(cards) : standardHold(cards)
}

const NONE = [false, false, false, false, false]
const ALL = [true, true, true, true, true]

/** Hold every card whose rank appears exactly `n` times. */
function holdRankCount(cards: Card[], n: number): boolean[] {
  const cnt = new Map<number, number>()
  for (const c of cards) {
    const v = rankValue(c.rank)
    cnt.set(v, (cnt.get(v) ?? 0) + 1)
  }
  return cards.map((c) => cnt.get(rankValue(c.rank)) === n)
}

function standardHold(cards: Card[]): boolean[] {
  switch (classifyStandard(cards)) {
    case 'royalFlush':
    case 'straightFlush':
    case 'fullHouse':
    case 'flush':
    case 'straight':
      return [...ALL] // all five cards are the hand
    case 'fourAces':
    case 'fourTwoThruFour':
    case 'fourFiveThruKing':
    case 'fourOfAKind':
      return holdRankCount(cards, 4) // the quads; the kicker redraws free
    case 'threeOfAKind':
      return holdRankCount(cards, 3)
    case 'twoPair':
    case 'jacksOrBetter':
      return holdRankCount(cards, 2) // both pairs, or the one paying pair
    default:
      return [...NONE]
  }
}

function deucesHold(cards: Card[]): boolean[] {
  const wilds = cards.map((c) => c.rank === '2')

  switch (classifyDeuces(cards)) {
    case 'naturalRoyal':
    case 'wildRoyal':
    case 'fiveOfAKind':
    case 'straightFlush':
    case 'fullHouse':
    case 'flush':
    case 'straight':
      return [...ALL]
    case 'fourDeuces':
      return wilds // the fifth card redraws free — still four deuces at worst
    case 'fourOfAKind':
    case 'threeOfAKind': {
      // The deuces plus the natural pair-or-better the hand is built on. When
      // the naturals contribute only a single card (say two deuces beside three
      // unmatched cards), keep just the deuces: alone they still guarantee the
      // category, and no one natural is more "the winner" than another.
      const naturals = cards.filter((c) => c.rank !== '2')
      const cnt = new Map<number, number>()
      for (const c of naturals) {
        const v = rankValue(c.rank)
        cnt.set(v, (cnt.get(v) ?? 0) + 1)
      }
      let bestRank = 0
      let bestCount = 0
      for (const [v, n] of cnt) {
        if (n > bestCount || (n === bestCount && v > bestRank)) {
          bestRank = v
          bestCount = n
        }
      }
      if (bestCount < 2) return wilds
      return cards.map((c, i) => wilds[i] || rankValue(c.rank) === bestRank)
    }
    default:
      return [...NONE]
  }
}
